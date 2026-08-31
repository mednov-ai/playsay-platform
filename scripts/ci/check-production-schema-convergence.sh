#!/bin/sh
set -eu

[ "$#" -eq 1 ] || {
  echo "Usage: $0 release/NN.NNN.NN" >&2
  exit 2
}

release_ref="$1"
script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
manifest="$script_dir/production-database-workloads.json"
launcher="$script_dir/run-production-liquibase-job.sh"
manifest_rows="$(mktemp)"

cleanup() {
  case "$manifest_rows" in
    /tmp/*) rm -f -- "$manifest_rows" ;;
  esac
}
trap cleanup EXIT HUP INT TERM

for command_name in jq mktemp rm; do
  command -v "$command_name" >/dev/null 2>&1 || { echo "Missing command: $command_name" >&2; exit 1; }
done
[ -f "$manifest" ] && [ -x "$launcher" ] || {
  echo "Production schema convergence tooling is incomplete." >&2
  exit 1
}
[ "$(jq -r '.namespace' "$manifest")" = "playsay-prod" ] || {
  echo "Production workload manifest must target playsay-prod." >&2
  exit 1
}

jq -e '.schemaVersion == 1 and (.workloads | length > 0)' "$manifest" >/dev/null
jq -r '.workloads[] | [.module, .changelogDir, .dbSecret] | @tsv' "$manifest" > "$manifest_rows"
while IFS="$(printf '\t')" read -r module_name changelog_dir db_secret; do
  echo "Checking production schema convergence for $module_name"
  "$launcher" status "$module_name" "$changelog_dir" "$db_secret" "$release_ref" </dev/null
done < "$manifest_rows"

echo "All declared production database workloads are schema-converged for $release_ref."
