#!/bin/sh
set -eu

usage() {
  echo "Usage: $0 status|update MODULE CHANGELOG_DIR playsay-app-db|playsay-keyboard-db|playsay-worksheet-import-db release/NN.NNN.NN [EXPECTED_PENDING_FILE]" >&2
  exit 2
}

[ "$#" -ge 5 ] && [ "$#" -le 6 ] || usage

migration_action="$1"
module_name="$2"
changelog_dir="$3"
db_secret="$4"
release_ref="$5"
expected_pending_file="${6:-}"
namespace="playsay-prod"

case "$migration_action" in
  status|update) ;;
  *) usage ;;
esac
case "$module_name" in
  *[!a-z0-9-]*|'') usage ;;
esac
case "$release_ref" in
  release/[0-9][0-9].[0-9][0-9][0-9].[0-9][0-9]) ;;
  *)
    echo "Production migrations require a fixed-width release/NN.NNN.NN ref." >&2
    exit 2
    ;;
esac
case "$module_name:$changelog_dir:$db_secret" in
  api-gateway:backend/api-gateway/src/main/resources/db/changelog:playsay-app-db|registration-service:backend/registration-service/src/main/resources/db/changelog:playsay-app-db|email-service:backend/email-service/src/main/resources/db/changelog:playsay-app-db|ai-tutor-service:backend/ai-tutor-service/src/main/resources/db/changelog:playsay-app-db|vocabulary-service:backend/vocabulary-service/src/main/resources/db/changelog:playsay-app-db|keyboard-service:backend/keyboard-service/src/main/resources/db/changelog:playsay-keyboard-db|worksheet-import-service:backend/worksheet-import-service/src/main/resources/db/changelog:playsay-worksheet-import-db) ;;
  *)
    echo "Module, changelog directory, and database Secret are not an approved production workload." >&2
    exit 2
    ;;
esac
[ -f "$changelog_dir/db.changelog-master.xml" ] || {
  echo "Missing changelog master: $changelog_dir/db.changelog-master.xml" >&2
  exit 2
}

for command_name in kubectl jq git find grep sed sort diff tr cut mktemp; do
  command -v "$command_name" >/dev/null 2>&1 || {
    echo "Missing command: $command_name" >&2
    exit 1
  }
done

release_commit="$(git rev-parse --verify "$release_ref^{commit}")"
checkout_commit="$(git rev-parse HEAD)"
[ "$checkout_commit" = "$release_commit" ] || {
  echo "Checkout HEAD does not match $release_ref; production migration blocked." >&2
  exit 2
}
git diff --quiet "$release_ref" -- "$changelog_dir" || {
  echo "Changelog directory differs from $release_ref; production migration blocked." >&2
  exit 2
}
[ -z "$(git status --porcelain --untracked-files=all -- "$changelog_dir")" ] || {
  echo "Changelog directory contains staged, unstaged, or untracked changes; production migration blocked." >&2
  exit 2
}

if [ "$migration_action" = "update" ]; then
  [ -n "$expected_pending_file" ] && [ -f "$expected_pending_file" ] || {
    echo "Update requires a reviewed EXPECTED_PENDING_FILE." >&2
    exit 2
  }
  [ "${PLAYSAY_PRODUCTION_MIGRATION_CONFIRM:-}" = "APPLY:$release_ref:$module_name" ] || {
    echo "Set PLAYSAY_PRODUCTION_MIGRATION_CONFIRM=APPLY:$release_ref:$module_name to authorize this exact update." >&2
    exit 2
  }
elif [ -n "$expected_pending_file" ]; then
  echo "Status does not accept an expected-pending file." >&2
  exit 2
fi

source_suffix="$(printf '%s' "$release_commit" | cut -c1-8)"
name_suffix="$(printf '%s-%s-%s' "$module_name" "$migration_action" "$source_suffix" | tr -c 'a-z0-9-' '-' | cut -c1-44)"
job_name="playsay-migrate-${name_suffix}"
source_configmap_name="playsay-migration-${name_suffix}-source"
runner_configmap_name="playsay-migration-${name_suffix}-runner"
manifest_dir="$(mktemp -d)"
changelog_list="$manifest_dir/changelog-files"
runner_file="$manifest_dir/run.sh"

cleanup() {
  kubectl -n "$namespace" delete job "$job_name" --ignore-not-found --wait=false >/dev/null 2>&1 || true
  kubectl -n "$namespace" delete configmap "$source_configmap_name" "$runner_configmap_name" --ignore-not-found >/dev/null 2>&1 || true
  case "$manifest_dir" in
    /tmp/*) rm -rf -- "$manifest_dir" ;;
  esac
}
trap cleanup EXIT HUP INT TERM

cleanup
mkdir -p "$manifest_dir"
find "$changelog_dir" -type f -print | LC_ALL=C sort > "$changelog_list"
[ -s "$changelog_list" ] || {
  echo "No changelog files found below $changelog_dir" >&2
  exit 2
}

configmap_items='[]'
configmap_data='{}'
file_index=0
while IFS= read -r changelog_file; do
  relative_path="${changelog_file#"$changelog_dir"/}"
  file_index="$((file_index + 1))"
  configmap_key="$(printf 'file-%04d' "$file_index")"
  configmap_data="$(
    printf '%s' "$configmap_data" |
      jq -c --rawfile value "$changelog_file" --arg key "$configmap_key" '. + {($key): $value}'
  )"
  configmap_items="$(
    printf '%s' "$configmap_items" |
      jq -c \
        --arg key "$configmap_key" \
        --arg path "$changelog_dir/$relative_path" \
        '. + [{key: $key, path: $path}]'
  )"
done < "$changelog_list"
jq -n \
  --arg namespace "$namespace" \
  --arg name "$source_configmap_name" \
  --argjson data "$configmap_data" \
  '{apiVersion: "v1", kind: "ConfigMap", metadata: {namespace: $namespace, name: $name}, data: $data}' |
  kubectl create -f - >/dev/null

if [ "$migration_action" = "status" ]; then
  cat > "$runner_file" <<'EOF'
#!/bin/sh
set -eu
master="$(find /liquibase/changelog -type f -name db.changelog-master.xml -print -quit)"
[ -n "$master" ] || { echo "No reviewed changelog master found." >&2; exit 2; }
changelog_file="${master#/liquibase/changelog/}"
common_args="--search-path=/liquibase/changelog --changelog-file=$changelog_file --classpath=/liquibase/lib/postgresql.jar --url=$PLAYSAY_DB_JDBC_URL --username=$PLAYSAY_DB_USERNAME --password=$PLAYSAY_DB_PASSWORD"
# shellcheck disable=SC2086
liquibase $common_args validate >/tmp/liquibase-validate.log
# shellcheck disable=SC2086
liquibase $common_args status --verbose >/tmp/liquibase-status.log
sed -n 's/^[[:space:]]*\(.*::.*::.*\)$/\1/p' /tmp/liquibase-status.log | LC_ALL=C sort > /tmp/pending.txt
if [ -s /tmp/pending.txt ]; then
  echo "Schema convergence blocked; pending changesets:" >&2
  cat /tmp/pending.txt >&2
  exit 42
fi
echo "Schema converged: 0 pending changesets."
EOF
  jq -n \
    --arg namespace "$namespace" \
    --arg name "$runner_configmap_name" \
    --rawfile run "$runner_file" \
    '{apiVersion: "v1", kind: "ConfigMap", metadata: {namespace: $namespace, name: $name}, data: {"run.sh": $run}}' |
    kubectl create -f - >/dev/null
else
  cp "$expected_pending_file" "$manifest_dir/expected-pending.txt"
  cat > "$runner_file" <<'EOF'
#!/bin/sh
set -eu
master="$(find /liquibase/changelog -type f -name db.changelog-master.xml -print -quit)"
[ -n "$master" ] || { echo "No reviewed changelog master found." >&2; exit 2; }
changelog_file="${master#/liquibase/changelog/}"
common_args="--search-path=/liquibase/changelog --changelog-file=$changelog_file --classpath=/liquibase/lib/postgresql.jar --url=$PLAYSAY_DB_JDBC_URL --username=$PLAYSAY_DB_USERNAME --password=$PLAYSAY_DB_PASSWORD"
# shellcheck disable=SC2086
liquibase $common_args validate >/tmp/liquibase-validate.log
# shellcheck disable=SC2086
liquibase $common_args status --verbose >/tmp/liquibase-status-before.log
sed -n 's/^[[:space:]]*\(.*::.*::.*\)$/\1/p' /tmp/liquibase-status-before.log | LC_ALL=C sort > /tmp/actual-pending.txt
LC_ALL=C sort /runner/expected-pending.txt > /tmp/expected-pending.txt
diff -u /tmp/expected-pending.txt /tmp/actual-pending.txt || {
  echo "Pending changesets differ from the reviewed inventory; update blocked." >&2
  exit 43
}
echo "Reviewed pending inventory matched: $(wc -l < /tmp/actual-pending.txt | tr -d ' ') changesets."
# shellcheck disable=SC2086
liquibase $common_args update
# shellcheck disable=SC2086
liquibase $common_args status --verbose >/tmp/liquibase-status-after.log
sed -n 's/^[[:space:]]*\(.*::.*::.*\)$/\1/p' /tmp/liquibase-status-after.log > /tmp/remaining-pending.txt
[ ! -s /tmp/remaining-pending.txt ] || {
  echo "Pending changesets remain after update; acceptance blocked." >&2
  cat /tmp/remaining-pending.txt >&2
  exit 44
}
echo "Post-update schema status is converged: 0 pending changesets."
EOF
  jq -n \
    --arg namespace "$namespace" \
    --arg name "$runner_configmap_name" \
    --rawfile run "$runner_file" \
    --rawfile expected "$manifest_dir/expected-pending.txt" \
    '{apiVersion: "v1", kind: "ConfigMap", metadata: {namespace: $namespace, name: $name}, data: {"run.sh": $run, "expected-pending.txt": $expected}}' |
    kubectl create -f - >/dev/null
fi

jq -n \
  --arg namespace "$namespace" \
  --arg jobName "$job_name" \
  --arg sourceConfigMapName "$source_configmap_name" \
  --arg runnerConfigMapName "$runner_configmap_name" \
  --arg dbSecret "$db_secret" \
  --arg moduleName "$module_name" \
  --argjson configMapItems "$configmap_items" \
  '{
    apiVersion: "batch/v1",
    kind: "Job",
    metadata: {
      namespace: $namespace,
      name: $jobName,
      labels: {
        "app.kubernetes.io/name": "playsay-db-migration",
        "app.kubernetes.io/component": $moduleName,
        "app.kubernetes.io/managed-by": "operator"
      }
    },
    spec: {
      backoffLimit: 0,
      activeDeadlineSeconds: 600,
      ttlSecondsAfterFinished: 3600,
      template: {
        metadata: {labels: {"app.kubernetes.io/name": "playsay-db-migration", "app.kubernetes.io/component": $moduleName}},
        spec: {
          automountServiceAccountToken: false,
          restartPolicy: "Never",
          securityContext: {fsGroup: 1000, fsGroupChangePolicy: "OnRootMismatch"},
          initContainers: [{
            name: "postgresql-driver",
            image: "curlimages/curl:8.12.1",
            command: ["/bin/sh", "-ec"],
            args: ["cp -RL /changelog-source/backend /changelog/ && curl -fsSL https://repo1.maven.org/maven2/org/postgresql/postgresql/42.7.8/postgresql-42.7.8.jar -o /driver/postgresql.jar"],
            volumeMounts: [
              {name: "changelog-source", mountPath: "/changelog-source", readOnly: true},
              {name: "changelog", mountPath: "/changelog"},
              {name: "driver", mountPath: "/driver"}
            ],
            resources: {requests: {cpu: "10m", memory: "16Mi"}, limits: {cpu: "100m", memory: "64Mi"}},
            securityContext: {allowPrivilegeEscalation: false, capabilities: {drop: ["ALL"]}}
          }],
          containers: [{
            name: "liquibase",
            image: "liquibase/liquibase:5.0.3",
            command: ["/bin/sh", "/runner/run.sh"],
            env: [
              {name: "PLAYSAY_DB_JDBC_URL", valueFrom: {secretKeyRef: {name: $dbSecret, key: "jdbc-uri"}}},
              {name: "PLAYSAY_DB_USERNAME", valueFrom: {secretKeyRef: {name: $dbSecret, key: "username"}}},
              {name: "PLAYSAY_DB_PASSWORD", valueFrom: {secretKeyRef: {name: $dbSecret, key: "password"}}}
            ],
            volumeMounts: [
              {name: "runner", mountPath: "/runner", readOnly: true},
              {name: "changelog", mountPath: "/liquibase/changelog", readOnly: true},
              {name: "driver", mountPath: "/liquibase/lib/postgresql.jar", subPath: "postgresql.jar", readOnly: true}
            ],
            resources: {requests: {cpu: "50m", memory: "128Mi"}, limits: {cpu: "500m", memory: "512Mi"}},
            securityContext: {runAsUser: 1000, runAsGroup: 0, allowPrivilegeEscalation: false, capabilities: {drop: ["ALL"]}}
          }],
          volumes: [
            {name: "runner", configMap: {name: $runnerConfigMapName, defaultMode: 365}},
            {name: "changelog-source", configMap: {name: $sourceConfigMapName, items: $configMapItems}},
            {name: "changelog", emptyDir: {}},
            {name: "driver", emptyDir: {}}
          ]
        }
      }
    }
  }' | kubectl create -f - >/dev/null

echo "Running $module_name production Liquibase $migration_action as bounded Job $job_name"
deadline="$(( $(date +%s) + 660 ))"
while [ "$(date +%s)" -lt "$deadline" ]; do
  succeeded="$(kubectl -n "$namespace" get job "$job_name" -o jsonpath='{.status.succeeded}' 2>/dev/null || true)"
  failed="$(kubectl -n "$namespace" get job "$job_name" -o jsonpath='{.status.failed}' 2>/dev/null || true)"
  if [ "${succeeded:-0}" -ge 1 ]; then
    kubectl -n "$namespace" logs "job/$job_name" -c liquibase
    echo "$module_name production schema $migration_action completed."
    exit 0
  fi
  if [ "${failed:-0}" -ge 1 ]; then
    kubectl -n "$namespace" logs "job/$job_name" -c liquibase || true
    kubectl -n "$namespace" get pods -l "job-name=$job_name" \
      -o custom-columns=NAME:.metadata.name,PHASE:.status.phase,INIT_REASON:.status.initContainerStatuses[0].state.terminated.reason,LIQUIBASE_REASON:.status.containerStatuses[0].state.terminated.reason || true
    echo "$module_name production schema $migration_action failed or found drift." >&2
    exit 1
  fi
  sleep 5
done

kubectl -n "$namespace" get pods -l "job-name=$job_name" -o wide || true
echo "Timed out waiting for $module_name production schema $migration_action." >&2
exit 1
