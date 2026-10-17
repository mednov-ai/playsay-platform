# Material classification contract

`isLessonMaterial` separates saved lesson results from reusable study materials; it does not change ownership, visibility, assets, document, assignment IDs or provenance.

- Boards always belong to Lesson materials and index the same board record used by lesson history. They are not copied into `lesson_material`, and cannot be assigned as ordinary lesson/homework/course material.
- New image/game lesson copies and empty lesson-created materials are flagged in the creating transaction. New PDF/PPTX materials created through the lesson flow explicitly carry the flag. Using/assigning a prepared material, answering it or annotating it does not reclassify its source.
- Ordinary material create defaults false. An omitted update flag preserves the stored value; explicit true/false is an authorized owner's category choice. The reserved origin metadata of lesson-created/copy materials survives ordinary updates.
- Backfill recognizes only exact `LIVE_LESSON_COPY` provenance with a canonical UUID `sourceLessonId`. Unknown/malformed origins remain study materials. `lesson_material_category_set` records classification/review so retries cannot overwrite a later manual choice. Backfill does not require resurrecting the source lesson or create access links.

The PostgreSQL backfill is SQL in the additive Liquibase changelog, so the normal standalone migration Job needs no application classes. It validates JSON input before parsing, including malformed legacy text. The production engine contract remains PostgreSQL 17; the local disposable-cluster fixture covers migration from the previous schema, repeated execution and preservation of explicit category choices. H2 exercises schema/API behavior but skips this PostgreSQL-specific data step.

`GET /library/items` is a typed `MATERIAL | LESSON_WHITEBOARD` index. It authorizes and filters category/kind/query/level/topic/skill before total and pagination, orders by update time/kind/ID, accepts offset ≥0 and limit 1–200, and never embeds board snapshots. Material-only APIs keep their existing shape and cannot resolve a board ID as an assignable material. Unauthorized records do not contribute to totals.

The library defaults to Study materials, offers Lesson materials / All, marks result cards and lets an ordinary material owner change its checkbox. Category, search and teaching filters survive return within the browser session. Board cards open the same authorized read-only viewer as history. A board has no invented level/topic/skill, so pedagogic filters exclude it. List fetches complete all index pages before client-side combined filtering.

Schedule/classroom/homework/course pickers default to study materials and explicitly offer including lesson materials. A selected ordinary lesson material remains resolvable and displayed when the category filter hides other results. Boards never enter these material-only pickers. All new visible/assistive labels are localized in ru/en/de/fr.
