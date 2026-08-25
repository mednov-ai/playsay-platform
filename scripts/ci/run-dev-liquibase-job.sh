#!/bin/sh
set -eu

usage() {
  echo "Usage: $0 MODULE CHANGELOG_DIR playsay-app-db|playsay-keyboard-db|playsay-worksheet-import-db" >&2
  exit 2
}

[ "$#" -eq 3 ] || usage

module_name="$1"
changelog_dir="$2"
db_secret="$3"
namespace="playsay-dev"

case "$module_name" in
  *[!a-z0-9-]*|'') usage ;;
esac
case "$db_secret" in
  playsay-app-db|playsay-keyboard-db|playsay-worksheet-import-db) ;;
  *) usage ;;
esac
[ -f "$changelog_dir/db.changelog-master.xml" ] || {
  echo "Missing changelog master: $changelog_dir/db.changelog-master.xml" >&2
  exit 2
}
case "$changelog_dir" in
  /*|*..*)
    echo "CHANGELOG_DIR must be a repository-relative path without '..': $changelog_dir" >&2
    exit 2
    ;;
esac
for command_name in kubectl jq find grep tr cut mktemp; do
  command -v "$command_name" >/dev/null 2>&1 || {
    echo "Missing command: $command_name" >&2
    exit 1
  }
done

build_number="${BUILD_NUMBER:-manual}"
source_suffix="${GIT_COMMIT_SHORT:-${GIT_COMMIT:-local}}"
source_suffix="$(printf '%s' "$source_suffix" | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9' | cut -c1-8)"
[ -n "$source_suffix" ] || source_suffix="local"
name_suffix="$(printf '%s-%s-%s' "$module_name" "$build_number" "$source_suffix" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9-' '-' | cut -c1-44)"
job_name="playsay-migrate-${name_suffix}"
configmap_name="playsay-migration-${name_suffix}"
manifest_dir="$(mktemp -d)"
changelog_list="$manifest_dir/changelog-files"

cleanup() {
  kubectl -n "$namespace" delete job "$job_name" --ignore-not-found --wait=false >/dev/null 2>&1 || true
  kubectl -n "$namespace" delete configmap "$configmap_name" --ignore-not-found --wait=false >/dev/null 2>&1 || true
  rm -rf "$manifest_dir"
}
trap cleanup EXIT HUP INT TERM

cleanup
mkdir -p "$manifest_dir"
find "$changelog_dir" -type f -print | LC_ALL=C sort > "$changelog_list"
[ -s "$changelog_list" ] || {
  echo "No changelog files found below $changelog_dir" >&2
  exit 2
}

set --
configmap_items='[]'
file_index=0
while IFS= read -r changelog_file; do
  relative_path="${changelog_file#"$changelog_dir"/}"
  file_index="$((file_index + 1))"
  configmap_key="$(printf 'file-%04d' "$file_index")"
  set -- "$@" "--from-file=${configmap_key}=${changelog_file}"
  configmap_items="$(
    printf '%s' "$configmap_items" |
      jq -c \
        --arg key "$configmap_key" \
        --arg path "$changelog_dir/$relative_path" \
        '. + [{key: $key, path: $path}]'
  )"
done < "$changelog_list"

kubectl -n "$namespace" create configmap "$configmap_name" "$@" >/dev/null

jq -n \
  --arg namespace "$namespace" \
  --arg jobName "$job_name" \
  --arg configMapName "$configmap_name" \
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
        "app.kubernetes.io/managed-by": "jenkins"
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
            {name: "runner", configMap: {name: "playsay-liquibase-runner", defaultMode: 365}},
            {name: "changelog-source", configMap: {name: $configMapName, items: $configMapItems}},
            {name: "changelog", emptyDir: {}},
            {name: "driver", emptyDir: {}}
          ]
        }
      }
    }
  }' | kubectl create -f - >/dev/null

echo "Running $module_name Liquibase migration as dev Job $job_name"
deadline="$(( $(date +%s) + 660 ))"
while [ "$(date +%s)" -lt "$deadline" ]; do
  succeeded="$(kubectl -n "$namespace" get job "$job_name" -o jsonpath='{.status.succeeded}' 2>/dev/null || true)"
  failed="$(kubectl -n "$namespace" get job "$job_name" -o jsonpath='{.status.failed}' 2>/dev/null || true)"
  if [ "${succeeded:-0}" -ge 1 ]; then
    echo "$module_name database migration completed."
    exit 0
  fi
  if [ "${failed:-0}" -ge 1 ]; then
    if [ "${PLAYSAY_MIGRATION_DEBUG_LOGS:-false}" = "true" ]; then
      kubectl -n "$namespace" logs "job/$job_name" -c postgresql-driver || true
      kubectl -n "$namespace" logs "job/$job_name" -c liquibase || true
    fi
    kubectl -n "$namespace" get pods -l "job-name=$job_name" \
      -o custom-columns=NAME:.metadata.name,PHASE:.status.phase,INIT_REASON:.status.initContainerStatuses[0].state.terminated.reason,LIQUIBASE_REASON:.status.containerStatuses[0].state.terminated.reason || true
    kubectl -n "$namespace" describe job "$job_name" || true
    echo "$module_name database migration failed." >&2
    exit 1
  fi
  sleep 5
done

kubectl -n "$namespace" get pods -l "job-name=$job_name" -o wide || true
kubectl -n "$namespace" describe job "$job_name" || true
echo "Timed out waiting for $module_name database migration." >&2
exit 1
