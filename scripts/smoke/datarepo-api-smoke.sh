#!/usr/bin/env bash
set -euo pipefail

require() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required env var: ${name}" >&2
    exit 2
  fi
}

require PLAY_SAY_API_BASE_URL
require PLAY_SAY_TEACHER_TOKEN
require PLAY_SAY_STUDENT_TOKEN
require PLAY_SAY_OTHER_STUDENT_TOKEN
require PLAY_SAY_ADMIN_TOKEN

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required for this smoke script" >&2
  exit 2
fi

api_base="${PLAY_SAY_API_BASE_URL%/}"
run_id="repo-smoke-$(date +%Y%m%d%H%M%S)"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT

token_for_role() {
  case "$1" in
    teacher) printf '%s' "${PLAY_SAY_TEACHER_TOKEN}" ;;
    student) printf '%s' "${PLAY_SAY_STUDENT_TOKEN}" ;;
    other-student) printf '%s' "${PLAY_SAY_OTHER_STUDENT_TOKEN}" ;;
    admin) printf '%s' "${PLAY_SAY_ADMIN_TOKEN}" ;;
    *) echo "Unknown role: $1" >&2; exit 2 ;;
  esac
}

request() {
  local role="$1"
  local method="$2"
  local path="$3"
  local expected_status="$4"
  local body="${5:-}"
  local output="${tmp_dir}/response.json"
  local status

  if [[ -n "${body}" ]]; then
    status="$(
      curl -sS -o "${output}" -w '%{http_code}' \
        -X "${method}" \
        -H "Authorization: Bearer $(token_for_role "${role}")" \
        -H "Content-Type: application/json" \
        -H "Accept: application/json" \
        --data "${body}" \
        "${api_base}${path}"
    )"
  else
    status="$(
      curl -sS -o "${output}" -w '%{http_code}' \
        -X "${method}" \
        -H "Authorization: Bearer $(token_for_role "${role}")" \
        -H "Accept: application/json" \
        "${api_base}${path}"
    )"
  fi

  if [[ "${status}" != "${expected_status}" ]]; then
    echo "Unexpected status for ${method} ${path} as ${role}: expected ${expected_status}, got ${status}" >&2
    cat "${output}" >&2 || true
    exit 1
  fi

  cat "${output}"
}

future_start="$(date -u -v+45M '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || date -u -d '+45 minutes' '+%Y-%m-%dT%H:%M:%SZ')"
future_end="$(date -u -v+90M '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || date -u -d '+90 minutes' '+%Y-%m-%dT%H:%M:%SZ')"

echo "DataRepo API smoke: ${run_id}"

request teacher GET /users/me/profile 200 >/dev/null
student_profile="$(request student GET /users/me/profile 200)"
request other-student GET /users/me/profile 200 >/dev/null
request admin GET /users/me/profile 200 >/dev/null
student_subject="$(jq -r '.subject' <<<"${student_profile}")"
request teacher GET /users/students 200 >/dev/null
request admin GET /admin/users 200 >/dev/null

private_material="$(
  request teacher POST /materials 201 "$(
    jq -n --arg title "${run_id} private material" '{
      title: $title,
      status: "PUBLISHED",
      visibility: "PRIVATE",
      document: {
        schemaVersion: 1,
        pages: [{
          id: "page-1",
          title: "Smoke",
          layout: "FLOW",
          blocks: [{
            id: "warmup",
            type: "fillGaps",
            title: "Articles",
            items: [{
              prompt: "It is ___ apple.",
              answer: "an",
              options: ["a", "an", "-"]
            }]
          }]
        }]
      },
      scoringRubric: { maxScore: 10 }
    }'
  )"
)"
private_material_id="$(jq -r '.id' <<<"${private_material}")"

public_material="$(
  request teacher POST /materials 201 "$(
    jq -n --arg title "${run_id} public material" '{
      title: $title,
      status: "PUBLISHED",
      visibility: "PUBLIC"
    }'
  )"
)"
public_material_id="$(jq -r '.id' <<<"${public_material}")"

request teacher GET /materials 200 | jq -e --arg id "${private_material_id}" 'map(.id) | index($id) != null' >/dev/null
request student GET /materials 200 | jq -e --arg id "${public_material_id}" 'map(.id) | index($id) != null' >/dev/null
request student GET "/materials/${private_material_id}" 404 >/dev/null

course="$(
  request teacher POST /courses 201 "$(
    jq -n --arg title "${run_id} course" '{
      title: $title,
      isPublished: true
    }'
  )"
)"
course_id="$(jq -r '.id' <<<"${course}")"

lesson_template="$(
  request teacher POST "/courses/${course_id}/lessons" 201 "$(
    jq -n --arg title "${run_id} lesson template" --arg materialId "${private_material_id}" '{
      title: $title,
      orderIndex: 1,
      plannedDurationMin: 45,
      materialId: $materialId
    }'
  )"
)"
lesson_template_id="$(jq -r '.id' <<<"${lesson_template}")"

request student GET /courses 200 | jq -e --arg id "${course_id}" 'map(.id) | index($id) != null' >/dev/null
request teacher GET "/courses/${course_id}/lessons" 200 | jq -e --arg id "${lesson_template_id}" 'map(.id) | index($id) != null' >/dev/null

lesson="$(
  request teacher POST /schedule/lessons 201 "$(
    jq -n \
      --arg lessonTemplateId "${lesson_template_id}" \
      --arg start "${future_start}" \
      --arg end "${future_end}" \
      --arg studentSubject "${student_subject}" '{
        lessonTemplateId: $lessonTemplateId,
        scheduledStart: $start,
        scheduledEnd: $end,
        participantSubjects: [$studentSubject]
      }'
  )"
)"
lesson_id="$(jq -r '.id' <<<"${lesson}")"

request teacher GET /schedule/lessons 200 | jq -e --arg id "${lesson_id}" 'map(.id) | index($id) != null' >/dev/null
request student GET /schedule/lessons 200 | jq -e --arg id "${lesson_id}" 'map(.id) | index($id) != null' >/dev/null
request other-student GET /schedule/lessons 200 | jq -e --arg id "${lesson_id}" 'map(.id) | index($id) == null' >/dev/null
request student GET "/schedule/lessons/${lesson_id}/material" 200 | jq -e --arg id "${private_material_id}" '.id == $id' >/dev/null
request other-student GET "/schedule/lessons/${lesson_id}/material" 404 >/dev/null

request student GET "/schedule/lessons/${lesson_id}/material-submission" 200 >/dev/null
submission="$(
  request student PUT "/schedule/lessons/${lesson_id}/material-submission" 200 "$(
    jq -n --arg materialId "${private_material_id}" '{
      submitted: true,
      content: {
        schemaVersion: 1,
        materialId: $materialId,
        answers: {
          warmup: {
            type: "fillGaps",
            items: {
              "It is ___ apple.-0": "an"
            }
          }
        }
      }
    }'
  )"
)"
submission_id="$(jq -r '.id' <<<"${submission}")"

request teacher GET "/schedule/lessons/${lesson_id}/material-submissions" 200 | jq -e --arg id "${submission_id}" 'map(.id) | index($id) != null' >/dev/null
request student GET "/schedule/lessons/${lesson_id}/material-submissions" 403 >/dev/null

annotation="$(
  request student PUT "/schedule/lessons/${lesson_id}/material-annotation" 200 '{
    "content": {
      "schemaVersion": 1,
      "strokes": [{
        "id": "smoke-stroke",
        "color": "#ff5c00",
        "points": [{"x": 10, "y": 10}, {"x": 20, "y": 20}]
      }]
    }
  }'
)"
annotation_id="$(jq -r '.id' <<<"${annotation}")"
request teacher GET "/schedule/lessons/${lesson_id}/material-annotation" 200 | jq -e --arg id "${annotation_id}" '.id == $id' >/dev/null

request teacher POST "/schedule/lessons/${lesson_id}/room-token" 200 >/dev/null
request student POST "/schedule/lessons/${lesson_id}/room-token" 200 >/dev/null

request teacher PUT "/schedule/lessons/${lesson_id}" 200 "$(
  jq -n \
    --arg lessonTemplateId "${lesson_template_id}" \
    --arg start "${future_start}" \
    --arg end "${future_end}" \
    --arg studentSubject "${student_subject}" '{
      lessonTemplateId: $lessonTemplateId,
      scheduledStart: $start,
      scheduledEnd: $end,
      status: "CANCELLED",
      participantSubjects: [$studentSubject]
    }'
)" >/dev/null
request student POST "/schedule/lessons/${lesson_id}/room-token" 404 >/dev/null

echo "DataRepo API smoke passed: ${run_id}"
