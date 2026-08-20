#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)
BACKEND_ROOT="$REPO_ROOT/backend"
CLONE_ALLOWLIST=${BACKEND_CLONE_ALLOWLIST:-"$BACKEND_ROOT/config/architecture/exact-clone-allowlist.tsv"}
VERIFY_CLONES=false

case "${1:-}" in
  "") ;;
  --verify-clones) VERIFY_CLONES=true ;;
  *)
    printf 'Usage: %s [--verify-clones]\n' "$0" >&2
    exit 2
    ;;
esac

main_sources() {
  find "$BACKEND_ROOT" \
    -path '*/src/main/kotlin/*' \
    -type f \
    -name '*.kt' \
    ! -path '*/build/*' \
    | sort
}

test_sources() {
  find "$BACKEND_ROOT" \
    -path '*/src/test/kotlin/*' \
    -type f \
    -name '*.kt' \
    ! -path '*/build/*' \
    | sort
}

source_stats() {
  source_kind=$1
  source_function=$2
  printf '\n%s Kotlin by module\n' "$source_kind"
  printf 'module\tfiles\tlines\tmax_file_lines\n'
  for module_dir in "$BACKEND_ROOT"/*; do
    [ -d "$module_dir" ] || continue
    module=$(basename "$module_dir")
    if [ "$source_function" = main_sources ]; then
      source_root="$module_dir/src/main/kotlin"
    else
      source_root="$module_dir/src/test/kotlin"
    fi
    [ -d "$source_root" ] || continue
    find "$source_root" -type f -name '*.kt' ! -path '*/build/*' -exec wc -l {} \; \
      | awk -v module="$module" '
          { files += 1; lines += $1; if ($1 > max) max = $1 }
          END { printf "%s\t%d\t%d\t%d\n", module, files, lines, max }
        '
  done | sort -t '	' -k3,3nr
}

print_hotspots() {
  printf '\nProduction hotspots\n'
  printf 'lines\tfile\n'
  main_sources \
    | while IFS= read -r source_file; do
        wc -l "$source_file"
      done \
    | sort -nr \
    | head -n 30 \
    | awk -v root="$REPO_ROOT/" '{ lines=$1; $1=""; sub(/^ /, ""); sub("^" root, ""); printf "%d\t%s\n", lines, $0 }'
}

print_constructor_fan_in() {
  printf '\nConstructor fan-in hotspots\n'
  printf 'injected_properties\tfile:line\tclass\n'
  main_sources \
    | while IFS= read -r source_file; do
        case "$source_file" in
          */service/*|*/client/*|*/controller/*|*/config/*|*/realtime/*) ;;
          *) continue ;;
        esac
        awk -v file="$source_file" -v root="$REPO_ROOT/" '
          function paren_count(value, token, copy) {
            copy = value
            return gsub(token, "", copy)
          }
          !in_constructor && $0 ~ /^(open[[:space:]]+|abstract[[:space:]]+|data[[:space:]]+)?class[[:space:]]+[A-Za-z_][A-Za-z0-9_]*[[:space:]]*\(/ {
            declaration = $0
            sub(/^.*class[[:space:]]+/, "", declaration)
            sub(/[[:space:](<].*$/, "", declaration)
            class_name = declaration
            start_line = NR
            in_constructor = 1
            depth = 0
            fan_in = 0
          }
          in_constructor {
            if ($0 ~ /^[[:space:]]*(private|protected|internal|public)?[[:space:]]*(val|var)[[:space:]]+[A-Za-z_][A-Za-z0-9_]*/) {
              fan_in += 1
            }
            depth += paren_count($0, "\\(")
            depth -= paren_count($0, "\\)")
            if (depth <= 0) {
              relative = file
              sub("^" root, "", relative)
              printf "%d\t%s:%d\t%s\n", fan_in, relative, start_line, class_name
              in_constructor = 0
            }
          }
        ' "$source_file"
      done \
    | sort -t '	' -k1,1nr -k2,2 \
    | head -n 30
}

print_root_package_violations() {
  printf '\nRoot-package violations\n'
  violations=0
  find "$BACKEND_ROOT" -path '*/src/main/kotlin/*Application.kt' -type f ! -path '*/build/*' | sort \
    | while IFS= read -r application_file; do
        package_root=$(dirname "$application_file")
        find "$package_root" -maxdepth 1 -type f -name '*.kt' ! -name '*Application.kt' -print
      done \
    | while IFS= read -r misplaced_file; do
        violations=1
        relative=${misplaced_file#"$REPO_ROOT/"}
        printf '%s\n' "$relative"
      done
  if ! find "$BACKEND_ROOT" -path '*/src/main/kotlin/*Application.kt' -type f ! -path '*/build/*' \
    -exec sh -c '
      for application_file do
        package_root=$(dirname "$application_file")
        find "$package_root" -maxdepth 1 -type f -name "*.kt" ! -name "*Application.kt" -print
      done
    ' sh {} + | grep -q .; then
    printf 'none\n'
  fi
}

hash_stream() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum | awk '{ print $1 }'
  else
    shasum -a 256 | awk '{ print $1 }'
  fi
}

clone_records() {
  main_sources \
    | while IFS= read -r source_file; do
        relative=${source_file#"$REPO_ROOT/"}
        module=${relative#backend/}
        module=${module%%/*}
        hash=$(sed '/^package[[:space:]]/d' "$source_file" | hash_stream)
        printf '%s\t%s\t%s\n' "$hash" "$module" "$relative"
      done \
    | sort -t '	' -k1,1 -k2,2 -k3,3
}

print_exact_cross_module_clones() {
  printf '\nExact cross-module Kotlin files (package declaration ignored)\n'
  clone_records \
    | awk -F '	' '
        FNR == NR {
          if ($0 !~ /^[[:space:]]*(#|$)/) classification[$2] = $1
          next
        }
        function reset_group(    key) {
          hash = ""
          paths = ""
          group_classification = ""
          classification_mismatch = 0
          module_count = 0
          for (key in modules) delete modules[key]
        }
        function flush_group() {
          if (module_count > 1) {
            label = group_classification
            if (label == "" || classification_mismatch) label = "UNCLASSIFIED"
            printf "hash=%s classification=%s\n%s", hash, label, paths
          }
          reset_group()
        }
        $1 != hash {
          if (hash != "") flush_group()
          hash = $1
        }
        {
          if (!($2 in modules)) {
            modules[$2] = 1
            module_count += 1
          }
          path_classification = classification[$3]
          if (group_classification == "") group_classification = path_classification
          else if (path_classification != group_classification) classification_mismatch = 1
          paths = paths sprintf("  %s\n", $3)
        }
        END { if (hash != "") flush_group() }
      ' "$CLONE_ALLOWLIST" -
}

verify_exact_cross_module_clones() {
  clone_records \
    | awk -F '	' '
        FNR == NR {
          if ($0 !~ /^[[:space:]]*(#|$)/) {
            classification[$2] = $1
            allowlisted[$2] = 1
          }
          next
        }
        function reset_group(    key) {
          hash = ""
          path_count = 0
          module_count = 0
          for (key in modules) delete modules[key]
          for (key in paths) delete paths[key]
        }
        function flush_group(    i, path, label) {
          if (module_count > 1) {
            label = ""
            for (i = 1; i <= path_count; i += 1) {
              path = paths[i]
              actual_clone[path] = 1
              if (!(path in classification)) {
                printf "Unclassified exact cross-module clone: %s\n", path > "/dev/stderr"
                failed = 1
              } else if (label == "") {
                label = classification[path]
              } else if (classification[path] != label) {
                printf "Clone group has mixed classifications: %s\n", hash > "/dev/stderr"
                failed = 1
              }
            }
          }
          reset_group()
        }
        $1 != hash {
          if (hash != "") flush_group()
          hash = $1
        }
        {
          if (!($2 in modules)) {
            modules[$2] = 1
            module_count += 1
          }
          path_count += 1
          paths[path_count] = $3
        }
        END {
          if (hash != "") flush_group()
          for (path in allowlisted) {
            if (!(path in actual_clone)) {
              printf "Stale exact-clone allowlist entry: %s\n", path > "/dev/stderr"
              failed = 1
            }
          }
          exit failed
        }
      ' "$CLONE_ALLOWLIST" -
}

printf 'Honey School backend architecture report\n'
printf 'repository=%s\n' "$REPO_ROOT"
source_stats Production main_sources
source_stats Test test_sources
print_hotspots
print_constructor_fan_in
print_root_package_violations
print_exact_cross_module_clones
if [ "$VERIFY_CLONES" = true ]; then
  verify_exact_cross_module_clones
fi
