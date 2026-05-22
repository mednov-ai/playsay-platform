# ADR 0001: Product Shape for MVP

## Status

Accepted

## Context

The MVP must support online English lessons for children with video, a collaborative assignment area, and teacher intervention in real time.

Several details were clarified before Sprint 0 implementation:

- The frontend is one SPA with role-based routing, not separate student/teacher/admin apps.
- UI is built with shadcn/ui-style primitives on Tailwind because lesson UI can become complex.
- The first assignment/editor scope is text input, including list/select-style answers.
- Teachers need a human-friendly editor for preparing assignments.
- Teacher edits during a lesson become part of the student's answer.
- Dev usage target is up to 10 parallel students and one teacher.

## Decision

Start with one React SPA in `frontend/web-app` and keep reusable components in `frontend/shared-ui` only when reuse appears.

The first assignment model will be editor-first:

- free text input
- fill/select-from-list input
- later TipTap/Yjs collaborative editing

Teacher corrections are stored in the shared document itself for the MVP. Separate feedback/audit layers can be added later when grading and history requirements are clearer.

## Consequences

- The MVP avoids early duplication across three frontends.
- The assignment editor needs careful domain design before Sprint 4.
- Audit/history of teacher intervention is intentionally deferred.

