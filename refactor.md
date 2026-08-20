# План декомпозиции крупных production-файлов Play&Say

Дата подготовки: 2026-07-19
Репозиторий: `playsay-platform`
Базовая ветка: `develop`
Статус: готов к передаче агенту-исполнителю

## 1. Цель и границы

Цель — разбить перечисленные ниже крупные production-файлы на небольшие связные модули без изменения продуктового поведения, API-контрактов, визуального результата, формата сохранённых данных и deployment flow.

Критерий полноты scope: все tracked production-файлы размером **500 строк и больше** на дату подготовки. Порог применяется к поддерживаемому исходному коду, стилям, runtime и CI pipeline; machine-generated артефакты, lock-файлы, статические datasets, исторические документы и тестовые/smoke-файлы перечислены ниже как явные исключения.

В scope входят 33 файла:

- [ ] `frontend/keyboard-app/src/widgets/shell/KeyboardTrainerShell.tsx` — 2170 строк.
- [ ] `frontend/web-app/src/features/courses/ui/CourseWorkspacePanel.tsx` — 1238 строк.
- [ ] `frontend/web-app/src/features/schedule/ui/ScheduleCreateForm.tsx` — 950 строк.
- [ ] `frontend/web-app/src/features/classroom/hooks/useLessonAnnotation.ts` — 853 строки.
- [ ] `frontend/web-app/src/features/materials/ui/MaterialLibraryPanel.tsx` — 851 строка.
- [ ] `backend/api-gateway/src/main/kotlin/com/playsay/gateway/service/MaterialAiDraftService.kt` — 850 строк.
- [ ] `backend/keyboard-service/src/main/kotlin/com/playsay/keyboard/service/TrainingService.kt` — 658 строк.
- [ ] `backend/api-gateway/src/main/kotlin/com/playsay/gateway/service/AssignmentStore.kt` — 608 строк.
- [ ] `backend/api-gateway/src/main/kotlin/com/playsay/gateway/service/MaterialScoringService.kt` — 528 строк.
- [ ] `backend/api-gateway/src/main/kotlin/com/playsay/gateway/repo/ScheduleRepos.kt` — 557 строк.
- [ ] `frontend/web-app/src/app/AppShell.tsx` — 696 строк.
- [ ] `frontend/web-app/src/app/useAppController.ts` — 527 строк.
- [ ] `frontend/web-app/src/features/ai-tutor/ui/AiTutorPanel.tsx` — 736 строк.
- [ ] `frontend/web-app/src/features/chat/ui/GlobalToolsRail.tsx` — 642 строки.
- [ ] `frontend/web-app/src/features/classroom/ui/ClassroomPreJoin.tsx` — 612 строк.
- [ ] `frontend/web-app/src/features/registration/ui/RegistrationPage.tsx` — 549 строк.
- [ ] `frontend/web-app/src/features/materials/ui/MaterialBlockEditor.tsx` — 541 строка.
- [ ] `frontend/web-app/src/features/classroom/model/annotation.ts` — 697 строк.
- [ ] `frontend/web-app/src/features/classroom/ui/AnnotationLayer.tsx` — 540 строк.
- [ ] `frontend/web-app/src/features/classroom/ui/LessonTaskCanvas.tsx` — 516 строк.
- [ ] `frontend/web-app/src/features/classroom/hooks/yjsRuntime.js` — 518 строк.
- [ ] `frontend/keyboard-app/src/styles.css` — 3300 строк.
- [ ] `frontend/web-app/src/styles.css` — 859 строк.
- [ ] `frontend/web-app/src/styles/materials.css` — 3033 строки.
- [ ] `frontend/web-app/src/styles/classroom.css` — 1793 строки.
- [ ] `frontend/web-app/src/styles/schedule.css` — 1527 строк.
- [ ] `frontend/web-app/src/styles/chat.css` — 610 строк.
- [ ] `frontend/web-app/src/styles/responsive.css` — 849 строк.
- [ ] `frontend/web-app/src/shared/i18n/resources/ru.ts` — 1587 строк.
- [ ] `frontend/web-app/src/shared/i18n/resources/en.ts` — 1555 строк.
- [ ] `frontend/web-app/src/shared/i18n/resources/de.ts` — 1555 строк.
- [ ] `frontend/web-app/src/shared/i18n/resources/fr.ts` — 1555 строк.
- [ ] `Jenkinsfile` — 1111 строк.

Не входят в scope декомпозиции:

- тестовые файлы и `scripts/smoke/*`; их можно только точечно дополнять или менять импорты/fixtures вслед за production-кодом;
- `frontend/web-app/src/generated/playsay-api.ts`, `contracts/openapi.yaml`, package lock-файлы и другие generated-артефакты;
- статические datasets: `frontend/keyboard-app/src/entities/chordSets/corpusChordSets.ts` и keyboard CSV corpus/chord data;
- исторические документы в `docs/superpowers/plans/`; их длина не влияет на production architecture;
- продуктовые изменения, редизайн, новые endpoint-ы, миграции БД и изменение схемы JSON.

### Воспроизводимый scope scan

Запускать из корня `playsay-platform`. До refactor команда должна вывести ровно 33 пути из scope; после RF-30 и до ratchets — не вывести ни одного пути.

```bash
git ls-files -z |
while IFS= read -r -d '' tracked_file; do
  test -f "$tracked_file" || continue
  case "$tracked_file" in
    */package-lock.json|contracts/openapi.yaml|*/generated/*|*/src/test/*|*.test.*|*.spec.*|scripts/smoke/*|docs/superpowers/plans/*) continue ;;
    frontend/keyboard-app/src/entities/chordSets/corpusChordSets.ts|backend/keyboard-service/src/main/resources/db/changelog/data/*) continue ;;
  esac
  LC_ALL=C grep -Iq . "$tracked_file" || continue
  tracked_lines=$(wc -l < "$tracked_file" | tr -d ' ')
  if test "$tracked_lines" -ge 500; then
    printf '%6d %s\n' "$tracked_lines" "$tracked_file"
  fi
done | sort -nr
```

## 2. Правила ведения плана

- Выполнять work packages строго по одному. Не смешивать два крупных файла в одном implementation-коммите; единственное исключение — атомарный RF-29, где четыре locale files обязаны двигаться синхронно.
- Перед началом work package отметить его как `[-]` в списке порядка; после всех проверок заменить на `[x]` и отметить соответствующие file-checkboxes в scope. RF-29 закрывает сразу четыре locale files.
- Не отмечать родительскую задачу выполненной, пока не выполнены все вложенные чекбоксы и проверки.
- После каждого work package записывать commit SHA, выполненные команды и отклонения в журнале в конце документа.
- Если для сохранения поведения пришлось отойти от целевой структуры, описать решение в журнале до установки `[x]`.
- Сохранять старую публичную точку импорта как facade/re-export, пока все внешние потребители не переведены и проверки не прошли.
- Один structural split — один коммит. Улучшение алгоритма, переименование UI-текста или изменение дизайна должно идти отдельной задачей вне этого плана.
- Не использовать feature-wide barrel-файлы для внутренних импортов. Внутри feature импортировать конкретный модуль напрямую; совместимый re-export допустим только на существующей публичной границе.
- Не добавлять `memo`, `useMemo` или `useCallback` механически. Применять их только там, где есть измеримая стоимость или нужна стабильность зависимости.
- Не объединять независимые состояния в один глобальный context/store только ради сокращения файла. Разделять hooks по независимым зависимостям.
- Не перемещать repositories, entities, DTO и low-level clients в controllers. Controllers остаются тонкими transport adapters.
- После безопасного извлечения удалить мёртвый код и старые импорты в том же work package.
- Не коммитить `graphify-out/`, `tmp/`, generated build output или локальные screenshots.

## 3. Инварианты, которые нельзя нарушать

### 3.1 Общие

- Публичные URL, OpenAPI, DTO, JSON-поля, error codes и HTTP statuses не меняются.
- Внешние component props, именованные exports и lazy-import paths сохраняются либо получают совместимый re-export.
- i18n keys и видимые/assistive тексты не меняются. Если изменение текста всё же потребуется, применить `play-and-say-frontend-i18n` и обновить `ru/en/de/fr` одновременно.
- CSS class names, `data-*`, `aria-*`, DOM-порядок значимых элементов и keyboard shortcuts сохраняются.
- Порядок CSS-правил сохраняется при первом mechanical split. Консолидация и изменение specificity выполняются только отдельным последующим коммитом.
- `spec.md` не меняется при чистом behavior-preserving refactor. Если поведение всё же изменилось, остановиться, описать изменение и синхронизировать `spec.md` в том же коммите.

### 3.2 React

- Сохранять существующие lazy boundaries в `AppShell`; не заменять их eager barrel-imports.
- Независимые запросы не превращать в waterfall. Существующий `Promise.allSettled`/параллельный запуск сохранять.
- Подписки Zustand оставлять узкими; не подписывать новый shell/controller на весь store.
- Transient pointer/typing values хранить в refs/store, а не переносить в React state, вызывающий лишние renders.
- Не выносить interaction logic из event handlers в effects без необходимости.
- Не создавать компоненты внутри компонентов.

### 3.3 Kotlin/Spring

- `controller/` содержит только controllers; business logic остаётся в `service/` или связном подpackage.
- DTO остаются в `dto/`, entities — в `entity/`, repositories — в `repo/`, нетривиальные преобразования — в `mapper/`.
- Для extracted collaborators использовать осмысленные packages, а не новый общий `utils` dump.
- Сохранять `@Transactional` и `readOnly` границы. Учитывать, что self-invocation внутри одного Spring bean не проходит через proxy.
- Не внедрять repositories или `ObjectMapper` в controllers.
- Не менять JPQL, порядок запросов, flush semantics, idempotency и lock behavior в рамках structural split.
- Цель: facade-файл до 150–250 строк, каждый новый service/collaborator до 450 строк, предпочтительно до 250–300.

### 3.4 i18n resources

- `ru/en/de/fr` разбивать одним work package и одинаковыми slice boundaries.
- Тексты, interpolation/plural keys, вложенность namespace и fallback language не менять.
- Сохранять exports `ru`, `en`, `de`, `fr`, объект `resources` и `AppTranslationResource`.
- Не добавлять hardcoded видимые/assistive строки в TSX как часть переноса.

### 3.5 Jenkins/CI

- Сохранять stage names, условия `AFFECTED_TARGETS`, branch/SHA checkout, build labels, image tags, DB migration order, infra commit и rollout/smoke gates.
- Versioned CI scripts должны получать данные через явные arguments/environment, включать `set -eu`/эквивалент и не печатать credentials.
- Сохранять отдельные Kaniko containers для разных images; не переиспользовать один мутировавший container.
- Перед Jenkins work package повторно прочитать root `spec.md` и `playsay-infra/docs/runbook.md`. Если меняется operational/deployment behavior, синхронизировать оба документа в том же change set.
- Не трогать public nginx, Docker, Amnezia, k3s и unrelated workloads при validation.

## 4. Definition of Done для каждого work package

Work package считается выполненным только если:

- [ ] Исходный крупный файл стал facade/re-export либо уменьшился ниже целевого порога.
- [ ] Каждый extracted module имеет одну описываемую ответственность.
- [ ] Старый публичный API и import path сохранены либо все потребители безопасно обновлены.
- [ ] Узкие тесты work package проходят.
- [ ] Lint/compile/build соответствующего приложения или backend-модуля проходят.
- [ ] `git diff --check` не показывает ошибок.
- [ ] В diff нет generated-файлов, случайных formatting sweeps и unrelated changes.
- [ ] Для UI выполнена визуальная проверка desktop/mobile; для затронутого dark mode — обе темы.
- [ ] В журнале выполнения записаны commit SHA и команды проверок.

## 5. Рекомендуемый порядок

- [ ] RF-00 — зафиксировать baseline.
- [ ] RF-21 — разбить annotation domain model.
- [ ] RF-24 — разбить Yjs runtime.
- [ ] RF-04 — разбить `useLessonAnnotation.ts` поверх новых model/runtime boundaries.
- [ ] RF-22 — разбить `AnnotationLayer.tsx`.
- [ ] RF-23 — разбить `LessonTaskCanvas.tsx`.
- [ ] RF-20 — разбить `MaterialBlockEditor.tsx`.
- [ ] RF-03 — разбить `MaterialLibraryPanel.tsx`.
- [ ] RF-01 — разбить `CourseWorkspacePanel.tsx`.
- [ ] RF-02 — разбить `ScheduleCreateForm.tsx`.
- [ ] RF-16 — разбить `AiTutorPanel.tsx`.
- [ ] RF-17 — разбить `GlobalToolsRail.tsx`.
- [ ] RF-18 — разбить `ClassroomPreJoin.tsx`.
- [ ] RF-19 — разбить `RegistrationPage.tsx`.
- [ ] RF-14 — разбить `AppShell.tsx`.
- [ ] RF-15 — разбить `useAppController.ts`.
- [ ] RF-05 — разбить `KeyboardTrainerShell.tsx`.
- [ ] RF-06 — разбить `MaterialScoringService.kt`.
- [ ] RF-07 — разбить `AssignmentStore.kt`.
- [ ] RF-08 — разбить `MaterialAiDraftService.kt`.
- [ ] RF-09 — разбить `TrainingService.kt`.
- [ ] RF-25 — разбить `ScheduleRepos.kt`.
- [ ] RF-10 — разбить keyboard `styles.css`.
- [ ] RF-11 — разбить `materials.css`.
- [ ] RF-12 — разбить `classroom.css`.
- [ ] RF-13 — разбить `schedule.css`.
- [ ] RF-26 — разбить web-app root `styles.css`.
- [ ] RF-28 — разбить `chat.css`.
- [ ] RF-27 — разбить `responsive.css` после остальных CSS manifests.
- [ ] RF-29 — разбить четыре locale resource-файла синхронно.
- [ ] RF-30 — сократить `Jenkinsfile` через versioned CI scripts.
- [ ] RF-31 — включить ratchets и выполнить финальную проверку.

Ключевые зависимости: RF-21 → RF-04/RF-22/RF-23; RF-24 → RF-04/RF-23; RF-20 → RF-03; RF-14 → RF-15; RF-06 → RF-07. CSS-пакеты выполняются после соответствующих component/model splits; RF-27 идёт последним среди CSS, потому что содержит cross-feature overrides. RF-30 не объединять с продуктовым refactor-коммитом и проверять отдельным реальным Jenkins build.

---

## RF-00. Baseline и защитные проверки

### Цель

Сохранить воспроизводимую точку сравнения до первого structural change.

### Шаги

- [ ] Записать текущий commit: `git rev-parse HEAD`.
- [ ] Проверить `git status --short --branch`; не удалять существующие пользовательские изменения.
- [ ] Убедиться, что `graphify-out/` и `tmp/` не попадут в implementation commits.
- [ ] Повторно измерить LOC всех 33 файлов и записать расхождения с числами этого документа.
- [ ] Зафиксировать существующие exports и потребителей через `rg` для каждого файла.
- [ ] Запустить baseline frontend tests, lint и build.
- [ ] Запустить baseline backend tests для `api-gateway` и `keyboard-service`.
- [ ] Снять baseline screenshots затронутых UI в light/dark theme:
  - keyboard intro, running, paused, finished, advanced settings, profile;
  - course board и открытый topic inspector;
  - schedule quick-create и student picker;
  - material library, editor и play preview;
  - classroom pre-join, active lesson task board и collaboration panel.
  - AI tutor setup/active session/allowance admin, chat list/conversation/toast;
  - welcome/authenticated shell и все registration routes.
- [ ] Использовать desktop `1280x720` и mobile `390x844`; screenshots хранить вне Git.
- [ ] Зафиксировать последний зелёный Jenkins build, его параметры, stage list и deploy tags; секреты не печатать и не сохранять.
- [ ] Записать исходные команды и результаты в журнал RF-00.

### Команды

```bash
git status --short --branch
git rev-parse HEAD

cd frontend/web-app
npm test
npm run lint
npm run build

cd ../keyboard-app
npm test
npm run lint
npm run build

cd ../../backend
gradle :api-gateway:test :keyboard-service:test

cd ..
bash -n scripts/ci/*.sh
node --test scripts/ci/*.test.mjs
```

Известный baseline на дату подготовки:

- `bash -n scripts/ci/*.sh` — PASS.
- `node --test scripts/ci/*.test.mjs` — **19/21 PASS, 2 FAIL** в `dispatcher-fanout-limit.test.mjs`.
- Оба failure — stale assertions: test ожидает batching/concurrency `1..9`, а текущий `Jenkinsfile.dispatcher` и infra runbook намеренно фиксируют последовательный запуск с `MAX_PARALLEL_MODULE_JOBS=1` для single-node dev capacity. Не возвращать parallel fan-out ради зелёного теста; исправить assertions отдельным baseline-fix commit в RF-30.

### Exit criteria

- [ ] Baseline зелёный либо все исходные failures явно записаны и не приписываются рефакторингу.
- [ ] Есть screenshots и список публичных contracts для сравнения.

---

## RF-01. `CourseWorkspacePanel.tsx`

### Проблема

Файл содержит board orchestration, level columns, topic cards, inspector, пять форм, lesson composition и pure helpers. Большинство границ уже выражено отдельными top-level components, поэтому это самый безопасный первый split.

### Целевая структура

```text
frontend/web-app/src/features/courses/ui/
├── CourseWorkspacePanel.tsx                  # совместимый re-export/facade
└── course-workspace/
    ├── CourseWorkspacePanel.tsx              # композиция и selection/focus state
    ├── LevelTrackColumn.tsx
    ├── TopicBoardCard.tsx
    ├── TopicInspector.tsx
    ├── CourseCreateForm.tsx
    ├── TopicCreateForm.tsx
    ├── TopicSettingsForm.tsx
    ├── CourseLessonCreateForm.tsx
    ├── LessonComposition.tsx
    ├── LessonCardAddForm.tsx
    ├── courseWorkspaceTypes.ts
    └── courseWorkspaceUtils.ts
```

### Шаги

- [ ] Вынести `CourseFormState`, `TopicFormState`, `LessonFormState`, `LessonCardFormState` в `courseWorkspaceTypes.ts`.
- [ ] Вынести `findTopicCard`, `topicToForm`, `parseTagList`, `normalizeCardOrder`, `moveCard` в `courseWorkspaceUtils.ts`.
- [ ] Добавить/сохранить unit coverage pure helpers до переноса UI.
- [ ] Вынести leaf forms по одному: `CourseCreateForm`, `TopicCreateForm`, `TopicSettingsForm`, `CourseLessonCreateForm`, `LessonCardAddForm`.
- [ ] После каждого leaf extraction запускать targeted test и TypeScript build.
- [ ] Вынести `LessonComposition`; оставить card ordering и callback contracts без изменений.
- [ ] Вынести `TopicBoardCard` и `LevelTrackColumn`; сохранить keys, `aria-pressed`, focus refs и порядок тем.
- [ ] Вынести `TopicInspector`; сохранить `data-testid="curriculum-topic-inspector"`, open/close behavior и возврат фокуса.
- [ ] Оставить selection state, derived board и orchestration в новом `course-workspace/CourseWorkspacePanel.tsx`.
- [ ] Не вводить общий context: передавать узкие props конкретным формам/карточкам.
- [ ] Оставить старый `ui/CourseWorkspacePanel.tsx` как прямой re-export, чтобы `AppShell`, feature index и тесты не меняли публичный import path.
- [ ] Проверить, что lazy import `../features/courses/ui/CourseWorkspacePanel` остаётся статически анализируемым.
- [ ] Удалить перенесённые определения и неиспользуемые imports из facade.

### Контракты

- Props `CourseWorkspacePanel` не меняются.
- Сохраняются `data-testid="curriculum-program"`, `curriculum-board`, `curriculum-topic-inspector`.
- Сохраняются selection/focus semantics при закрытии и удалении topic.
- Сохраняется порядок course/topic/lesson cards и material filters.

### Проверки

```bash
cd frontend/web-app
npm test -- src/features/courses/model/curriculumBoard.test.ts \
  src/features/courses/ui/CourseWorkspacePanel.test.tsx
npm run lint
npm run build
```

- [ ] Сравнить baseline screenshots board/inspector на desktop/mobile.
- [ ] Проверить keyboard navigation и возврат фокуса после закрытия inspector.
- [ ] Цель: facade до 20 строк, основной orchestrator до 300 строк, leaf components до 250 строк.

---

## RF-02. `ScheduleCreateForm.tsx`

### Проблема

В одном файле находятся quick-create form, time/duration, recurrence, advanced/material assignment, searchable student picker и managed-student creation.

### Целевая структура

```text
frontend/web-app/src/features/schedule/
├── model/
│   └── scheduleCreate.ts
└── ui/
    ├── ScheduleCreateForm.tsx                 # совместимый facade/re-exports
    └── schedule-create/
        ├── ScheduleCreateForm.tsx
        ├── ScheduleTimingFields.tsx
        ├── ScheduleRecurrenceFields.tsx
        ├── ScheduleAdvancedFields.tsx
        ├── ParticipantMaterialAssignments.tsx
        ├── ScheduleStudentPickerDialog.tsx
        └── ManagedStudentForm.tsx
```

### Шаги

- [ ] Создать `model/scheduleCreate.ts` и перенести pure logic:
  - `managedStudentInputFromDraft`;
  - `selectedSubjectsAfterManagedStudentCreation`;
  - `filterScheduleStudents`;
  - `studentLabel`;
  - `buildParticipantAssignments`;
  - validation regex/constants.
- [ ] Сохранить совместимые named re-exports pure helpers из старого файла на время перехода.
- [ ] Вынести `ManagedStudentForm` из dialog; оставить локальное состояние draft-полей внутри формы.
- [ ] Вынести `ScheduleStudentPickerDialog`; сохранить публичный export, потому что его импортирует `LessonAssignmentWizard.tsx`.
- [ ] После успешной проверки перевести `LessonAssignmentWizard.tsx` на прямой import нового dialog либо оставить совместимый re-export, если это уменьшает churn.
- [ ] Вынести timing/duration controls в `ScheduleTimingFields`.
- [ ] Вынести recurrence controls в `ScheduleRecurrenceFields`.
- [ ] Вынести advanced work mode/material controls и per-participant assignments.
- [ ] Оставить единый `ScheduleFormState` в orchestrator; не дублировать source of truth между child components.
- [ ] Передавать field-specific setters/callbacks, а не весь component state без необходимости.
- [ ] Сохранить submit payload byte-for-byte по смыслу: ISO dates, duration, work mode, participant assignments, recurrence.
- [ ] Оставить старый `ui/ScheduleCreateForm.tsx` как facade с exports `ScheduleCreateForm`, `ScheduleStudentPickerDialog` и двух pure helpers.

### Контракты

- Сохраняются все form names, `data-schedule-*`, disabled reason и validation messages.
- Student picker остаётся modal dialog с текущими aria attributes и focus behavior.
- Managed-student normalization/validation не меняется.
- Weekly recurrence defaults и per-weekday times не меняются.
- Parallel material assignment не меняет выбор default/participant material.

### Проверки

```bash
cd frontend/web-app
npm test -- src/features/schedule/ui/ScheduleCreateForm.test.tsx \
  src/features/schedule/ui/LessonAssignmentWizard.test.tsx \
  src/features/schedule/ui/SchedulePanel.test.tsx
npm run lint
npm run build
```

- [ ] Проверить quick-create, weekly recurrence, parallel assignments и managed-student creation вручную.
- [ ] Сравнить desktop/mobile screenshots формы и dialog.
- [ ] Цель: facade до 30 строк, orchestrator до 300 строк, каждый section/dialog до 250 строк.

---

## RF-03. `MaterialLibraryPanel.tsx`

### Проблема

UI-компоненты уже частично извлечены, но panel всё ещё владеет editor state, draft generation, URL/image source, сохранением, image generation, asset upload, HTML-game enrichment polling, lesson linking и workspace composition.

### Целевая структура

```text
frontend/web-app/src/features/materials/
├── hooks/
│   ├── useMaterialEditorController.ts
│   ├── useMaterialDraftActions.ts
│   ├── useMaterialPersistence.ts
│   ├── useMaterialAssetActions.ts
│   └── useHtmlGameEnrichment.ts
└── ui/
    ├── MaterialLibraryPanel.tsx               # public composition boundary
    └── MaterialAuthorWorkspace.tsx
```

При необходимости общие types для hooks положить в `model/types.ts` либо новый узкий `model/materialEditorState.ts`; не создавать второй универсальный `materialDocument.ts`.

### Шаги

- [ ] Зафиксировать текущий `MaterialLibraryPanel` props contract отдельным exported type `MaterialLibraryPanelProps`.
- [ ] Сначала вынести pure fingerprint helpers (`materialFormFingerprint`, `normalizeGameTitleSource`) в связный model module и покрыть unit tests.
- [ ] Вынести polling/token/cancellation logic `pollHtmlGameEnrichment` и `startHtmlGameEnrichment` в `useHtmlGameEnrichment`.
- [ ] Сохранить защиту от stale poll results через token refs и cleanup при unmount.
- [ ] Вынести draft prompt/URL/image generation actions в `useMaterialDraftActions`.
- [ ] Не превращать независимые API-вызовы в последовательный waterfall; запускать независимые операции параллельно.
- [ ] Вынести save, autosave/patch persistence, generate-missing-images в `useMaterialPersistence`.
- [ ] Сохранить текущий порядок save → fetch assets → optional generation → sync assets.
- [ ] Вынести upload image/HTML game, tag update и icon regeneration в `useMaterialAssetActions`; переиспользовать существующий `useMaterialAssets`.
- [ ] Вынести form/workspace state и block operations (`add`, `remove`, `move`, `patch`, `duplicate`, `select`, `reset`) в `useMaterialEditorController`.
- [ ] Использовать functional state updates для callbacks, зависящих от предыдущего form state.
- [ ] Не подписывать UI на весь controller object там, где достаточно узких props.
- [ ] Вынести editor/preview composition в `MaterialAuthorWorkspace` без изменения DOM hierarchy и CSS classes.
- [ ] Оставить `MaterialLibraryPanel` владельцем cross-feature props, permission calculation и композиции hooks.
- [ ] Сохранить `onAuthoringStateChange` semantics для dirty/focused state.
- [ ] Удалить `mountedRef`, `formRef` или другие refs только если новый hook полностью заменяет их назначение и тесты подтверждают race safety.

### Контракты

- Props и export path `features/materials/ui/MaterialLibraryPanel` сохраняются.
- Сохраняются library/edit/preview modes, active block, dirty state и save eligibility.
- Draft from prompt/URL/image, accepted-answer suggestions и generated image flow не меняются.
- HTML-game enrichment продолжает корректно переживать polling, repeated request и unmount.
- Asset library sync и limit первых 40 materials не меняются без отдельного решения.

### Проверки

```bash
cd frontend/web-app
npm test -- src/features/materials/ui/MaterialLibraryPanel.test.tsx \
  src/features/materials/ui/MaterialPlayPreviewDialog.test.ts \
  src/features/materials/ui/LessonMaterialDocumentView.test.tsx \
  src/features/materials/ui/blocks/RenderedMaterialBlock.test.tsx
npm run lint
npm run build
```

- [ ] Вручную проверить create/edit/save/duplicate/archive/link lesson.
- [ ] Проверить image upload, HTML-game upload/enrichment и generation progress.
- [ ] Сравнить library/editor/preview screenshots в light/dark и desktop/mobile.
- [ ] Цель: panel до 300 строк, hooks до 250–300 строк каждый.

---

## RF-04. `useLessonAnnotation.ts`

### Проблема

Hook одновременно реализует persistence polling/debounce, local/live synchronization, pointer capture, drawing lifecycle, selection/text editing, undo/redo и mind-map editing/reparenting.

### Целевая структура

```text
frontend/web-app/src/features/classroom/
├── hooks/
│   ├── useLessonAnnotation.ts                # стабильный public facade
│   ├── useAnnotationPersistence.ts
│   ├── useAnnotationHistory.ts
│   ├── useAnnotationPointerInteractions.ts
│   └── useMindMapInteractions.ts
└── model/
    ├── annotationElementFactory.ts
    └── annotationInteraction.ts
```

### Шаги

- [ ] Зафиксировать текущую return shape hook и все потребители в `LessonTaskCanvas.tsx`.
- [ ] Вынести `ActiveInteraction`, `AnnotationHistoryEntry`, constants и shared interaction types в `annotationInteraction.ts`.
- [ ] Вынести pure helpers `boxElementFromPoints`, `normalizeCreatedElement`, element ID/factory и text/sticky defaults в `annotationElementFactory.ts`.
- [ ] Добавить unit tests pure factory/normalization до переноса stateful logic.
- [ ] Вынести undo/redo stacks, `recordHistory`, `applyHistoryElements`, `resetHistory` в `useAnnotationHistory`.
- [ ] Сохранить history limit `50`, порядок before/after и selection cleanup.
- [ ] Вынести fetch/poll/save effects в `useAnnotationPersistence`.
- [ ] Сохранить polling `2000 ms`, save debounce `500 ms`, cancellation и `lastSyncedAnnotationRef` semantics.
- [ ] Сохранить правило: live annotation заполняется persisted content только если live workspace пуст.
- [ ] Вынести mind-map create/add/key navigation/finalize reparent в `useMindMapInteractions`.
- [ ] Сохранить node limit, side/order calculation, subtree history и layout calls.
- [ ] Вынести pointer capture/release и begin/extend/end/move/resize/erase flow в `useAnnotationPointerInteractions`.
- [ ] Transient pointer interaction оставить в refs; не переносить point-by-point drawing в React state сверх существующего behavior.
- [ ] Собрать facade `useLessonAnnotation` с прежними arguments и точной прежней return shape.
- [ ] Не менять Yjs/live synchronization contract и сортировку `compareAnnotationElements`.
- [ ] Проверить dependency arrays новых hooks; независимые effects не объединять.

### Контракты

- `LessonTaskCanvas` не должен требовать изменения business logic.
- Pointer capture безопасно освобождается после cancel/end/unmount.
- Undo/redo, selection, editing state и mind-map keyboard navigation сохраняются.
- Annotation JSON, page IDs и ordering не меняются.
- Offline/poll failure не блокирует lesson UI.

### Проверки

```bash
cd frontend/web-app
npm test -- src/features/classroom/model/annotation.test.ts \
  src/features/classroom/ui/LessonTaskCanvas.test.ts \
  src/features/classroom/ui/LiveLessonExperience.test.ts
npm run lint
npm run build
```

- [ ] Вручную проверить pen/line/arrow/rectangle/ellipse/text/sticky note/eraser.
- [ ] Проверить pointer cancel, resize/move, undo/redo и смену страниц.
- [ ] Проверить mind map add child/sibling, keyboard navigation, reparent и delete subtree.
- [ ] Проверить два одновременных lesson clients с Yjs/live annotation.
- [ ] Цель: facade до 250–300 строк, каждый extracted hook до 250 строк.

---

## RF-05. `KeyboardTrainerShell.tsx`

### Проблема

Компонент объединяет bootstrap, authenticated/guest progress, anonymous claim/reset, active layout/set, advanced practice, session lifecycle, result submission, adaptive decision, typing strip measurement, shortcuts, prompts, overlays и весь shell UI. В текущем файле около 37 `useState`, 16 effects и 16 callbacks.

### Целевая структура

```text
frontend/keyboard-app/src/widgets/shell/
├── KeyboardTrainerShell.tsx
├── layoutMastery.ts
├── useTrainerBootstrap.ts
├── useTrainerProgress.ts
├── useGuestProfileController.ts
├── useAdvancedPracticeController.ts
├── useTrainerSessionController.ts
├── useTypingStripMetrics.ts
└── ui/
    ├── TrainerHeader.tsx
    ├── TrainerSidePanel.tsx
    ├── TrainerSurface.tsx
    ├── PracticeSessionOverlays.tsx
    ├── AdvancedPracticeDialog.tsx
    ├── GuestProfileDialog.tsx
    ├── ProgressProfileDialog.tsx
    ├── RegistrationPromptDialog.tsx
    └── ProfileProgressSnapshot.tsx
```

Если фактические dependency boundaries требуют другого числа hooks, сохранить перечисленные ответственности, а не искусственно копировать названия.

### Шаги

- [ ] Вынести pure functions `layoutMasteryCpm`, `activeLayoutGamification`, `countCompletedChords`, `displayedMasteryCpm` в `layoutMastery.ts`.
- [ ] Сохранить re-export этих функций из `KeyboardTrainerShell.tsx`, пока `layoutMastery.test.ts` и внешние imports не переведены.
- [ ] Вынести DOM measurement helpers и resize logic в `useTypingStripMetrics`; сохранить измерение реальным Roboto Flex styles.
- [ ] Не возвращаться к char-count approximation и не добавлять rows: typing strip остаётся однострочным.
- [ ] Вынести initial set/progress load, auth claim и owner-key reset в `useTrainerBootstrap`/`useTrainerProgress`.
- [ ] Сохранить параллельность независимых initial requests; не создавать fetch waterfall.
- [ ] Вынести guest display name, registration/name prompt, guest reset и local persistence в `useGuestProfileController`.
- [ ] Вынести advanced mode, language combination, difficulty band, number row и derived code set в `useAdvancedPracticeController`.
- [ ] Вынести countdown/start/restart/pause/resume/finish/submit/adaptive-next в `useTrainerSessionController`.
- [ ] Сохранить reducer `sessionFlowReducer` как единственный источник session phase.
- [ ] Оставить granular Zustand selectors; не заменять их одной подпиской на весь typing store.
- [ ] Сохранить idempotent result submission через `submittedResultRef`/equivalent.
- [ ] Вынести UI от leaf к shell: profile snapshot, dialogs, practice overlays, side panel, surface, header.
- [ ] Каждый dialog должен получать минимальный state/actions contract и не выполнять API-вызовы самостоятельно.
- [ ] Сохранить overlay closing animation state и timer cleanup.
- [ ] Сохранить приоритет `Esc` overlays и гарантии `Space` для countdown/pause/running.
- [ ] Сохранить prompt blocking во время focused practice.
- [ ] Собрать `KeyboardTrainerShell` как композицию controllers + view components; целевой shell не содержит API details и больших dialog JSX blocks.
- [ ] Не добавлять broad context; независимые controllers должны иметь независимые dependencies.

### Контракты

- Props `KeyboardTrainerShell` и импорт из `app/App.tsx` не меняются.
- Anonymous/authenticated progress, claim/reset и owner persistence сохраняются.
- EN/RU mastery, calibration, league и current set не смешиваются.
- Advanced practice context, combined languages и number-row behavior сохраняются.
- Countdown/running/paused/finished transitions и keyboard shortcuts сохраняются.
- Typing strip space markers, measurement, stats, virtual keyboard и metronome DOM order сохраняются.
- Все modal roles, aria labels и translated text остаются прежними.

### Проверки

```bash
cd frontend/keyboard-app
npm test
npm run lint
npm run build
```

- [ ] Отдельно проверить `src/widgets/shell/layoutMastery.test.ts`, `src/widgets/shell/promptFlow.test.ts`, `src/widgets/shell/keyboardShortcuts.test.ts`, `src/trainerFrame.test.ts`.
- [ ] Проверить anonymous → authenticated claim и anonymous reset.
- [ ] Проверить EN/RU switch, normal/advanced, single/combined languages, number row.
- [ ] Проверить intro → countdown → running → pause/resume → finished → next/restart.
- [ ] Сравнить screenshots light/dark на `1280x720`, широком desktop и `390x844`.
- [ ] Проверить reduced motion.
- [ ] Цель: shell до 350 строк, hooks/components до 300 строк.

---

## RF-06. `MaterialScoringService.kt`

### Проблема

Файл смешивает orchestration, JSON traversal, fill/multiple-choice scoring, matching scoring, policy resolution, answer normalization, attempts/hints/teacher overrides и JSON assessment mapping.

### Целевая структура

```text
backend/api-gateway/src/main/kotlin/com/playsay/gateway/
├── service/
│   ├── MaterialScoringService.kt             # public facade/orchestrator
│   └── material/scoring/
│       ├── MaterialScoringModels.kt
│       ├── MaterialAssessmentPolicyResolver.kt
│       ├── MaterialAnswerMatcher.kt
│       ├── ObjectiveAnswerScorer.kt
│       └── MatchingPairsScorer.kt
└── mapper/
    └── MaterialAssessmentMapper.kt
```

### Шаги

- [ ] Зафиксировать public methods `maxScore` и `score` и текущий `MaterialScoringResult` contract.
- [ ] Вынести internal data classes `AssessmentPolicy`, `AnswerValidationPolicy`, `UsedHint`, `AnswerAttempt`, `TeacherOverride`, `ObjectiveItemScore` в `MaterialScoringModels.kt` с `internal` visibility.
- [ ] Вынести field parsing, policy precedence и fill/matching limits в `MaterialAssessmentPolicyResolver`.
- [ ] Сохранить точный precedence item assessment → item → block assessment → block.
- [ ] Вынести normalization/accepted answers/option-ID comparison в `MaterialAnswerMatcher`.
- [ ] Сохранить legacy item key fallback `prompt-index` и word-bank `answerOptionId` semantics.
- [ ] Вынести fillGaps/multipleChoice item scoring в `ObjectiveAnswerScorer`.
- [ ] Вынести matching-pairs global lock/max-errors behavior в `MatchingPairsScorer`.
- [ ] Вынести assessment/item JSON generation в `mapper/MaterialAssessmentMapper.kt`.
- [ ] Оставить `MaterialScoringService` владельцем document traversal, aggregation и final `score = maxScore * earned/total`.
- [ ] Сохранить rounding scale `2` и `HALF_UP`.
- [ ] Не вводить новую persisted JSON schema и не удалять legacy compatibility в этом work package.
- [ ] Добавить focused unit tests extracted policy/matcher/scorers; существующий большой test-файл не дробить.
- [ ] После успеха удалить `service/MaterialScoringService.kt` из `legacyOversizedServices` в `BackendArchitectureTest`.

### Контракты

- Assessment JSON fields, statuses и item order не меняются.
- Fill-gap retry/hint penalties, matching max errors и teacher override не меняются.
- Invalid/unsupported JSON по-прежнему возвращает `null` там, где делал это раньше.
- `AssignmentStore` и `MaterialSubmissionService` продолжают использовать прежний facade.

### Проверки

```bash
cd backend
gradle :api-gateway:test \
  --tests com.playsay.gateway.service.MaterialScoringServiceTest \
  --tests com.playsay.gateway.AssignmentControllerTest \
  --tests com.playsay.gateway.MaterialControllerTest \
  --tests com.playsay.gateway.BackendArchitectureTest
gradle :api-gateway:compileKotlin
```

- [ ] Сравнить representative assessment JSON до/после для fillGaps, multipleChoice, wordBank, matchingPairs.
- [ ] Цель: facade до 150 строк, collaborators до 250 строк.

---

## RF-07. `AssignmentStore.kt`

### Проблема

Store смешивает homework commands, teacher/student queries, submission persistence/scoring, recipient management, access policy, mapping и JSON validation. `AssignmentProgressCalculator` уже существует — не создавать его дубликат.

### Целевая структура

```text
backend/api-gateway/src/main/kotlin/com/playsay/gateway/
├── service/
│   ├── AssignmentStore.kt                    # совместимый facade
│   └── assignment/
│       ├── HomeworkCommandService.kt
│       ├── AssignmentQueryService.kt
│       ├── HomeworkSubmissionService.kt
│       ├── AssignmentRecipientService.kt
│       ├── AssignmentAccessPolicy.kt
│       └── AssignmentInputValidator.kt
└── mapper/
    └── AssignmentResponseMapper.kt
```

### Шаги

- [ ] Зафиксировать восемь public facade methods и controller contract.
- [ ] Вынести `optionalClean` и JSON-size validation в `AssignmentInputValidator`.
- [ ] Вынести auth/role checks и recipient access rules в `AssignmentAccessPolicy`.
- [ ] Политика не должна обращаться к HTTP/controller state кроме переданного `JwtAuthenticationToken` и IDs.
- [ ] Вынести recipient resolution, `ensureRecipients` и lesson-derived recipients в `AssignmentRecipientService`.
- [ ] Сохранить ownership/delegation checks через существующий `StudentAccessPolicy`.
- [ ] Вынести response assembly и entity/row-to-DTO mapping в `AssignmentResponseMapper`.
- [ ] Переиспользовать существующий `AssignmentProgressCalculator`; mapper/query service вызывает его, не копирует formulas.
- [ ] Вынести student material/submission lookup, empty submission creation и save/scoring в `HomeworkSubmissionService`.
- [ ] Сохранить idempotent empty submission creation и JSON size limits.
- [ ] Вынести teacher/student list/detail и material availability filtering в `AssignmentQueryService`.
- [ ] Вынести `createHomework` и `createHomeworkFromLesson` в `HomeworkCommandService`.
- [ ] Избежать circular dependency command → facade → query: command должен вызывать query service или mapper напрямую.
- [ ] Проверить Spring transaction proxy boundaries. Annotate public collaborator methods, а не рассчитывать на self-invocation private methods.
- [ ] Оставить `AssignmentStore` thin facade с прежними methods для `AssignmentController`.
- [ ] Не менять repositories, JPQL, `saveAndFlush`, timestamps, statuses и error codes.
- [ ] После успеха удалить `service/AssignmentStore.kt` из `legacyOversizedServices`.

### Контракты

- Controller и OpenAPI не меняются.
- Teacher/student visibility и authorization сохраняются.
- Homework from lesson остаётся idempotent по существующей записи.
- Recipient due dates, progress colors, average score и submission status сохраняются.
- Archived/unavailable material filtering не меняется.

### Проверки

```bash
cd backend
gradle :api-gateway:test \
  --tests com.playsay.gateway.AssignmentControllerTest \
  --tests com.playsay.gateway.service.AssignmentProgressCalculatorTest \
  --tests com.playsay.gateway.BackendArchitectureTest
gradle :api-gateway:compileKotlin
```

- [ ] Проверить teacher create/list/detail, student list/detail/material/submission.
- [ ] Проверить create from lesson, recipient access и unauthorized actors.
- [ ] Проверить repeated empty submission/save flow и score mapping.
- [ ] Цель: facade до 100 строк, каждый collaborator до 300 строк.

---

## RF-08. `MaterialAiDraftService.kt`

### Проблема

Файл содержит provider switch, deterministic stub, OpenAI request/response client, shared transport, schema, validation, prompt, source metadata, article normalization и stub document factory. `OpenAiResponsesTransport` используется также answer-suggestion и HTML-game AI services.

### Целевая структура

```text
backend/api-gateway/src/main/kotlin/com/playsay/gateway/service/
├── MaterialAiDraftService.kt                 # provider-selection facade
├── MaterialAiDraftInput.kt
├── ai/
│   └── OpenAiResponsesTransport.kt           # interface, Java client, transport exception
└── material/ai/
    ├── StubMaterialAiDraftProvider.kt
    ├── OpenAiMaterialAiDraftProvider.kt
    ├── MaterialAiPromptBuilder.kt
    ├── MaterialAiSchemaProvider.kt
    ├── MaterialDraftValidator.kt
    ├── ArticleAnswerNormalizer.kt
    ├── MaterialDraftSourceMetaMapper.kt
    └── StubMaterialDraftFactory.kt
```

Large schema/default constants можно вынести в узкие `MaterialAiDraftSchema.kt` и `MaterialAiDraftDefaults.kt`, если любой из перечисленных файлов иначе приблизится к 450 строкам.

### Шаги

- [ ] Сначала вынести shared `OpenAiResponsesTransport`, `JavaOpenAiResponsesTransport`, `OpenAiTransportException` в `service/ai`.
- [ ] Обновить imports в `MaterialAnswerSuggestionService`, `MaterialHtmlGameAiService`, `MaterialImageGenerationService` и их тестах без изменения поведения.
- [ ] Запустить все AI-related tests до продолжения.
- [ ] Вынести `MaterialAiDraftInput` в отдельный файл, сохранив package/API для `LessonMaterialAuthoringService` либо обновив только internal import.
- [ ] Вынести system/user prompt construction в `MaterialAiPromptBuilder`.
- [ ] Вынести JSON schema constant/lazy compile/request format в `MaterialAiSchemaProvider`.
- [ ] Вынести schema/domain validation в `MaterialDraftValidator`; сохранить все error codes и HTTP mapping.
- [ ] Вынести a/an normalization и словари в `ArticleAnswerNormalizer`.
- [ ] Вынести source metadata normalization в `MaterialDraftSourceMetaMapper`.
- [ ] Вынести deterministic fallback document/rubric/block factories в `StubMaterialDraftFactory`.
- [ ] Оставить `StubMaterialAiDraftProvider` тонким adapter над factory + `MessageProvider`.
- [ ] Оставить `OpenAiMaterialAiDraftProvider` orchestrator: validate config → build request → transport → parse → validate → normalize → map meta.
- [ ] Оставить `MaterialAiDraftService` только provider switch и unknown-provider error.
- [ ] Не менять default model, base URL, timeouts, `max_output_tokens`, image detail и prompt contents в structural commit.
- [ ] Добавить unit tests prompt/schema/validator/normalizer/factory; существующие тестовые файлы не дробить.
- [ ] После успеха удалить `service/MaterialAiDraftService.kt` из `legacyOversizedServices`.

### Контракты

- Stub output остаётся deterministic.
- OpenAI request JSON, strict schema и response parsing не меняются.
- Source metadata и title/language/CEFR normalization сохраняются.
- Invalid key/provider/HTTP/JSON/schema получают прежние statuses/error codes.
- Shared transport продолжает обслуживать другие material AI services.

### Проверки

```bash
cd backend
gradle :api-gateway:test \
  --tests com.playsay.gateway.MaterialAiDraftServiceTest \
  --tests com.playsay.gateway.MaterialAnswerSuggestionServiceTest \
  --tests com.playsay.gateway.MaterialHtmlGameAiServiceTest \
  --tests com.playsay.gateway.MaterialImageGenerationServiceTest \
  --tests com.playsay.gateway.BackendArchitectureTest
gradle :api-gateway:compileKotlin
```

- [ ] Сравнить serialized stub document/rubric до/после.
- [ ] Сравнить OpenAI request body fixture до/после.
- [ ] Цель: facade до 80 строк, provider до 200 строк, остальные collaborators до 250 строк.

---

## RF-09. `TrainingService.kt`

### Проблема

Service объединяет authenticated/anonymous submission, anonymous profile lifecycle, claim, progress, gamification/mastery coordination, response mapping, focus lesson generation и request sanitization.

### Целевая структура

```text
backend/keyboard-service/src/main/kotlin/com/playsay/keyboard/
├── service/
│   ├── TrainingService.kt                    # controller-facing facade
│   └── training/
│       ├── AuthenticatedTrainingSubmissionService.kt
│       ├── AnonymousTrainingService.kt
│       ├── TrainingProgressService.kt
│       ├── FocusLessonService.kt
│       └── TrainingRequestSanitizer.kt
└── mapper/
    └── TrainingResponseMapper.kt
```

### Шаги

- [ ] Зафиксировать public methods facade: `submit`, `resolveAnonymousProfile`, `updateAnonymousProfile`, `resetAnonymousProfile`, `submitAnonymous`, `claimAnonymous`, `progress`.
- [ ] Вынести normalization/sanitization JSON/timezone/date/client IDs в `TrainingRequestSanitizer` как pure collaborator.
- [ ] Вынести `resultResponses`, anonymous/profile DTO mapping и common submit response mapping в `TrainingResponseMapper`.
- [ ] Вынести severe/moderate problem detection, focus chord support ranking и repeat logic в `FocusLessonService`.
- [ ] Добавить focused unit tests для deterministic focus selection и sanitization.
- [ ] Вынести authenticated `submit` orchestration в `AuthenticatedTrainingSubmissionService`.
- [ ] Сохранить idempotency lookup до mastery/gamification update и ровно один save/event pass.
- [ ] Вынести anonymous resolve/update/reset/submit/claim в `AnonymousTrainingService`.
- [ ] Сохранить fingerprint validation, claim-once behavior и cascade deletion/reset.
- [ ] Вынести progress aggregation и profile/layout loading в `TrainingProgressService`.
- [ ] Сохранить отдельные EN/RU mastery profiles и глобальные streak/achievements.
- [ ] Проверить transaction boundaries каждого command. Facade может делегировать, но transaction должна быть на proxied public collaborator method либо сохранена на facade.
- [ ] Оставить `TrainingService` thin facade для `TrainingController` и `AnonymousController`; controllers не должны знать новые collaborators.
- [ ] Не менять persistence JSON, rounding, default locale и DTO shape.
- [ ] Добавить keyboard-service architecture size ratchet для новых service files; не создавать allowlist для новых collaborators.

### Контракты

- Authenticated и anonymous idempotency сохраняются.
- Anonymous claim/reset и display-name normalization сохраняются.
- Mastery, gamification events, local training date/timezone и technique advice сохраняются.
- Focus lesson severe/moderate thresholds и chord order сохраняются.
- DTO order/fields и HTTP behavior controllers не меняются.

### Проверки

```bash
cd backend
gradle :keyboard-service:test --tests com.playsay.keyboard.KeyboardApiTest
gradle :keyboard-service:test
gradle :keyboard-service:compileKotlin
```

- [ ] Проверить duplicate `clientResultId` не обновляет mastery/events второй раз.
- [ ] Проверить anonymous claim дважды, reset дважды и locale-specific advice.
- [ ] Проверить EN/RU independence, calibration, streak и focus lesson generation.
- [ ] Цель: facade до 100 строк, collaborators до 300 строк.

---

## RF-10. `frontend/keyboard-app/src/styles.css`

### Проблема

Один stylesheet содержит tokens/theme, shell, advanced mode, gamification, trainer surface, stats, typing, virtual keyboard, dialogs, motion и responsive overrides. `trainerFrame.test.ts` читает файл напрямую, поэтому test loader нужно адаптировать к imports.

### Целевая структура

```text
frontend/keyboard-app/src/
├── styles.css                                # только ordered @imports
└── styles/
    ├── 00-tokens.css
    ├── 10-shell.css
    ├── 20-advanced-and-gamification.css
    ├── 30-trainer-surface.css
    ├── 40-stats.css
    ├── 50-typing-and-overlays.css
    ├── 60-virtual-keyboard.css
    ├── 70-dialogs.css
    ├── 80-motion.css
    └── 90-responsive.css
```

Числовые prefixes обязательны: они делают cascade order явным.

### Mechanical split anchors

- `00-tokens.css`: fonts, `:root`, `.dark`, reset/base variables.
- `10-shell.css`: app/header/layout/sidebar and shared controls до advanced/gamification modules.
- `20-advanced-and-gamification.css`: advanced controls, gamification/profile blocks.
- `30-trainer-surface.css`: `.trainer-surface*`, intro/reveal/practice workspace.
- `40-stats.css`: `.stats-panel*`, `.stat*` и их dark variants.
- `50-typing-and-overlays.css`: typing stage/strip, result card, `.practice-overlay*`.
- `60-virtual-keyboard.css`: `.virtual-keyboard*`, keys и target states.
- `70-dialogs.css`: registration/profile/advanced dialogs и modal backdrop.
- `80-motion.css`: все `@keyframes` и non-responsive animation bindings, сохраняя order.
- `90-responsive.css`: media queries и reduced-motion overrides.

### Шаги

- [ ] Перед переносом сохранить ordered список top-level selectors/keyframes.
- [ ] Выполнить первый commit как чистый move блоков без изменения declarations, specificity или selector order.
- [ ] Оставить `styles.css` manifest с `@import` в точном порядке `00`…`90`.
- [ ] Убедиться, что все `@import` идут до любых иных CSS rules.
- [ ] Не объединять duplicate selectors в mechanical split commit.
- [ ] Адаптировать `trainerFrame.test.ts`: читать manifest и рекурсивно конкатенировать только локальные CSS imports в том же порядке либо читать нужные partials через общий test helper.
- [ ] Не дробить сам test-файл в рамках этой задачи.
- [ ] Проверить, что каждый selector/keyframe находится ровно в одном partial и ничего не потеряно.
- [ ] После зелёного mechanical split отдельным optional commit можно объединить дубли только при наличии visual proof; это не условие завершения RF-10.

### Проверки

```bash
cd frontend/keyboard-app
npm test -- src/trainerFrame.test.ts
npm test
npm run lint
npm run build
```

- [ ] Сравнить light/dark screenshots intro/running/paused/finished/advanced/profile.
- [ ] Проверить `1280x720`, wide desktop, `390x844`, reduced motion.
- [ ] Проверить отсутствие horizontal/page overflow и footer overlap.
- [ ] Цель: каждый partial меньше 500 строк; manifest до 20 строк.

---

## RF-11. `frontend/web-app/src/styles/materials.css`

### Проблема

Stylesheet смешивает material authoring, reader/play preview, rendered blocks, HTML games, media relay, exercises/answers, annotation/mind-map, dark theme и responsive overrides.

### Целевая структура

```text
frontend/web-app/src/styles/
├── materials.css                             # ordered manifest
└── materials/
    ├── 10-authoring.css
    ├── 20-preview-and-reader.css
    ├── 30-rendered-blocks-and-games.css
    ├── 40-media.css
    ├── 50-exercises-and-answers.css
    ├── 60-annotations.css
    └── 90-theme-and-responsive.css
```

### Mechanical split anchors

- `10-authoring.css`: от `.playsay-material-author-shell` через palette/editor/details blocks.
- `20-preview-and-reader.css`: material preview/play dialog/reader surface.
- `30-rendered-blocks-and-games.css`: rendered material/block/image/HTML-game presentation.
- `40-media.css`: `.playsay-relay-player*`, video relay states, media keyframes/hover rules.
- `50-exercises-and-answers.css`: matching, choices, inline answers, word bank, fill exercise, hints/feedback.
- `60-annotations.css`: `.playsay-annotation-layer*`, annotation elements/selection, mind-map controls.
- `90-theme-and-responsive.css`: trailing dark overrides и media queries.

Если блоки в исходнике interleaved, при первом split делить по contiguous source ranges и сохранять order, даже если временно получится два partials одной темы. Семантическую перегруппировку делать только вторым коммитом после visual checks.

### Шаги

- [ ] Сохранить ordered inventory selectors/keyframes и количество occurrences.
- [ ] Выполнить mechanical extraction без изменения declarations.
- [ ] Превратить `styles/materials.css` в ordered `@import` manifest; импорт в `main.tsx` оставить прежним.
- [ ] Не переносить classroom-specific selectors в `classroom.css` в этом work package: cross-file cascade менять нельзя одновременно.
- [ ] Проверить все dark overrides после базовых module rules.
- [ ] Проверить media queries и keyframes после сборки Vite/PostCSS.
- [ ] Проверить отсутствие duplicate/missing selectors.

### Проверки

```bash
cd frontend/web-app
npm test -- src/features/materials/ui/MaterialLibraryPanel.test.tsx \
  src/features/materials/ui/LessonMaterialDocumentView.test.tsx \
  src/features/materials/ui/MaterialPlayPreviewDialog.test.ts \
  src/features/materials/ui/blocks/RenderedMaterialBlock.test.tsx
npm run lint
npm run build
```

- [ ] Visual matrix: library, editor, preview, fillGaps, multipleChoice, wordBank, matchingPairs, HTML game, image focus, video relay, annotation overlay.
- [ ] Проверить light/dark, desktop/mobile, hover-disabled touch viewport.
- [ ] Цель: partials меньше 500 строк; manifest до 20 строк. Если тематический блок не помещается, делить его на последовательные numbered partials без перестановки rules.

---

## RF-12. `frontend/web-app/src/styles/classroom.css`

### Проблема

Stylesheet смешивает pre-join/device checks, LiveKit video layouts, assignments/submission health, main task board, collaboration UI и dark overrides.

### Целевая структура

```text
frontend/web-app/src/styles/
├── classroom.css                             # ordered manifest
└── classroom/
    ├── 10-prejoin.css
    ├── 20-video.css
    ├── 30-assignments-and-health.css
    ├── 40-task-board.css
    ├── 50-collaboration.css
    └── 90-theme-and-responsive.css
```

### Mechanical split anchors

- `10-prejoin.css`: `.playsay-prejoin*` до начала video rail.
- `20-video.css`: `.playsay-video-*`, LiveKit tile overrides, low-height desktop media query.
- `30-assignments-and-health.css`: assignment strip/cards, submission monitor, student health.
- `40-task-board.css`: task board/document/footer, presentation modes, teacher/student workspace.
- `50-collaboration.css`: collaboration panel/group/recent/student states.
- `90-theme-and-responsive.css`: trailing dark/responsive overrides.

### Шаги

- [ ] Снять ordered selector inventory.
- [ ] Выполнить чистое перемещение contiguous rules без изменения specificity/order.
- [ ] Оставить `styles/classroom.css` manifest; импорт в `main.tsx` не менять.
- [ ] Сохранить LiveKit vendor override order относительно общих web styles.
- [ ] Сохранить cross-file order: `schedule.css` → `classroom.css` → `chat.css` → `materials.css` → `responsive.css`.
- [ ] Проверить duplicate/missing selectors и dark rules.

### Проверки

```bash
cd frontend/web-app
npm test -- src/features/classroom/ui/ClassroomPreJoin.test.tsx \
  src/features/classroom/ui/ClassroomVideoStage.test.ts \
  src/features/classroom/ui/LessonTaskCanvas.test.ts \
  src/features/classroom/ui/MaterialSubmissionsMonitor.test.ts \
  src/features/classroom/ui/LiveLessonExperience.test.ts
npm run lint
npm run build
```

- [ ] Visual matrix: pre-join permissions/device error, single/group video, screen share, teacher/student task board, submission health states, collaboration panel.
- [ ] Проверить `1280x720`, wide desktop, mobile, light/dark.
- [ ] Проверить отсутствие page scroll/overlap в active classroom.
- [ ] Цель: partials меньше 500 строк; manifest до 20 строк.

---

## RF-13. `frontend/web-app/src/styles/schedule.css`

### Проблема

Stylesheet смешивает schedule dashboard/list/cards, reschedule/wizard, lesson preparation, quick-create details, student picker/managed-student form и theme/responsive overrides.

### Целевая структура

```text
frontend/web-app/src/styles/
├── schedule.css                              # ordered manifest
└── schedule/
    ├── 10-overview-and-cards.css
    ├── 20-wizard-and-reschedule.css
    ├── 30-lesson-preparation.css
    ├── 40-quick-create.css
    ├── 50-student-picker.css
    └── 90-theme-and-responsive.css
```

### Mechanical split anchors

- `10-overview-and-cards.css`: начало файла до wizard backdrop; включает ранние quick-create base rules.
- `20-wizard-and-reschedule.css`: wizard/reschedule blocks до preparation shell.
- `30-lesson-preparation.css`: preparation shell/main/sidebar.
- `40-quick-create.css`: поздний подробный quick-create block начиная со второго `.playsay-schedule-create-form` section.
- `50-student-picker.css`: student dialog, search, managed-student form/list/actions.
- `90-theme-and-responsive.css`: trailing dark и responsive rules.

Не объединять ранние и поздние quick-create rules в первом commit: их относительный cascade является частью текущего поведения.

### Шаги

- [ ] Снять ordered selector/keyframe inventory.
- [ ] Выполнить mechanical extraction с сохранением исходного порядка.
- [ ] Оставить `styles/schedule.css` manifest; импорт в `main.tsx` не менять.
- [ ] Сохранить reduced-motion keyframes/media behavior.
- [ ] Сохранить wizard/preparation/quick-create cascade и responsive order.
- [ ] Проверить duplicate/missing selectors.

### Проверки

```bash
cd frontend/web-app
npm test -- src/features/schedule/ui/ScheduleCreateForm.test.tsx \
  src/features/schedule/ui/SchedulePanel.test.tsx \
  src/features/schedule/ui/ScheduledLessonCard.test.tsx \
  src/features/schedule/ui/LessonAssignmentWizard.test.tsx
npm run lint
npm run build
```

- [ ] Visual matrix: dashboard/list, quick create, recurrence, student picker, wizard steps, reschedule dialog, preparation page.
- [ ] Проверить light/dark, desktop/mobile и reduced motion.
- [ ] Цель: partials меньше 500 строк; manifest до 20 строк.

---

## RF-14. `frontend/web-app/src/app/AppShell.tsx`

### Проблема

Файл одновременно задаёт 14 lazy boundaries, гигантский `AppShellProps`, route precedence, authenticated header, workspace navigation, panel routing, material-authoring focus mode и public welcome screen.

### Целевая структура

```text
frontend/web-app/src/app/
├── AppShell.tsx                              # композиция и совместимый export
├── AppShellProps.ts
├── lazyWorkspacePanels.ts
└── shell/
    ├── AuthenticatedShellHeader.tsx
    ├── AppRouteContent.tsx
    ├── WorkspacePanelRouter.tsx
    ├── WelcomeLanding.tsx
    └── PlaySayAnimatedLogo.tsx
```

### Шаги

- [ ] Снять inventory всех полей `AppShellProps`, lazy imports и ветвей верхнеуровневого render.
- [ ] Вынести `AppShellProps` без переименования полей; перевести `useAppController` на type-only import из нового файла, чтобы он больше не зависел от UI-модуля.
- [ ] Вынести `WelcomeLanding` и `PlaySayAnimatedLogo`; сохранить exports из `AppShell.tsx` для существующих тестов/потребителей.
- [ ] Вынести authenticated header с brand/profile/theme/language/login/logout actions; сохранить role-dependent CTA и lesson shortcut.
- [ ] Вынести lazy declarations в `lazyWorkspacePanels.ts`; каждый `import()` должен остаться прямым и статически анализируемым, без feature-wide barrel.
- [ ] Вынести workspace tab router; передавать каждому panel только нужный slice props.
- [ ] Вынести route-level precedence в `AppRouteContent`: loading/auth callback → active room → classroom pre-join → welcome → profile → lesson preparation → workspace.
- [ ] Сохранить `Suspense` boundaries и fallback placement; не оборачивать все panels одним eager import.
- [ ] Сохранить `materialAuthoringState` и скрытие workspace tabs при focused editor.
- [ ] Оставить `AppShell` владельцем layout-level state (`materialAuthoringState`) и обработчиков выбора tab/navigation.
- [ ] Проверить отсутствие циклов `AppShell` ↔ `useAppController` и duplicate imports тяжёлых panels.

### Контракты

- `AppShellProps`, `AppShell` и `WelcomeLanding` остаются доступны по прежнему пути.
- Route precedence, lazy chunk boundaries и workspace tab visibility не меняются.
- Header actions, next-lesson CTA, profile/back links и material focus mode сохраняются.
- Public welcome DOM, animation, login/register URLs и theme/language controls не меняются.

### Проверки

```bash
cd frontend/web-app
npm test -- src/app/AppShell.test.tsx \
  src/app/AppShellWelcome.test.tsx \
  src/app/AppShellTeacherHeader.test.tsx \
  src/app/model/useAppShellUiStore.test.ts
npm run lint
npm run build
```

- [ ] Проверить Vite output: все прежние workspace panels остаются отдельными async chunks.
- [ ] Сравнить welcome/authenticated shell desktop/mobile, light/dark и переходы profile/preparation/classroom.
- [ ] Цель: `AppShell.tsx` до 250 строк, route/router components до 300 строк, остальные leaf components до 200 строк.

---

## RF-15. `frontend/web-app/src/app/useAppController.ts`

### Проблема

Root hook смешивает OIDC boot/callback/silent login, параллельную загрузку пяти domain datasets, language/profile synchronization, browser history, route clocks, classroom access и сборку всех `AppShellProps`, хотя domain actions уже частично вынесены.

### Целевая структура

```text
frontend/web-app/src/app/
├── useAppController.ts                       # composition root
└── controller/
    ├── appBootstrapLoader.ts
    ├── useAppSessionBootstrap.ts
    ├── useAppRouting.ts
    ├── useLessonAccessClock.ts
    ├── appSessionErrors.ts
    └── appShellPropsMapper.ts
```

Существующие `useLessonRealtime`, `useMaterialActions`, `useProfileActions`, `useScheduleActions` не дублировать и не переименовывать без необходимости.

### Шаги

- [ ] Зафиксировать точный набор и identity-sensitive callbacks возвращаемого `AppShellProps`.
- [ ] Вынести pure `canAccessClassroomPreJoin`, `userProfileInputWithLanguage` и error normalization в узкие modules.
- [ ] Вынести browser pathname/history subscription, `open/closeProfile`, lesson-preparation navigation и return path в `useAppRouting`.
- [ ] Вынести `nowMs` interval и join-window derivation в `useLessonAccessClock`; не держать timer при отсутствии релевантного lesson route.
- [ ] Вынести auth callback, token read/clear, silent-login fallback и language resolution в `useAppSessionBootstrap`.
- [ ] Сохранить единственный bootstrap `Promise.all` для profile/admin/materials/schedule/students; не превращать его в последовательные effects или пять повторных запросов.
- [ ] Вынести сам параллельный loader в `appBootstrapLoader.ts`, чтобы race/cancellation можно было тестировать отдельно.
- [ ] Сохранить правило stale/cancelled boot: размонтированный hook не пишет state и не меняет route.
- [ ] Оставить domain action hooks владельцами своих mutations; composition root передаёт им state setters и session-error callback.
- [ ] Собрать итоговый props object через `appShellPropsMapper` только если mapper остаётся pure; callbacks не заворачивать в новый object без причины.
- [ ] Сохранить узкие Zustand selectors и `resetShellUi`; не заменять их подпиской на весь store.
- [ ] Проверить dependency arrays и отсутствие повторного boot при смене переводной функции.

### Контракты

- OIDC callback, silent-login skip, logout и session-expired behavior не меняются.
- Initial domain requests остаются параллельными и выполняются один раз на session boot.
- Browser back/forward, profile return path, preparation/classroom URLs сохраняются.
- `AppShell` получает прежние props и callback semantics.

### Проверки

```bash
cd frontend/web-app
npm test -- src/app/AppShell.test.tsx \
  src/app/profile-routes.test.ts \
  src/app/registration-routes.test.ts \
  src/app/model/useAppShellUiStore.test.ts
npm run lint
npm run build
```

- [ ] В DevTools проверить число initial requests и отсутствие waterfall/duplicates.
- [ ] Smoke: logged out → silent login/callback → workspace → profile → back → preparation → pre-join → logout.
- [ ] Цель: root hook до 220 строк, каждый hook/loader/mapper до 250 строк.

---

## RF-16. `frontend/web-app/src/features/ai-tutor/ui/AiTutorPanel.tsx`

### Проблема

Файл объединяет catalog/allowance loading, OpenAI Realtime lifecycle, `AudioContext`, session idempotency/error recovery, teacher grants, timer/age policy и все setup/active/summary/admin views.

### Целевая структура

```text
frontend/web-app/src/features/ai-tutor/
├── hooks/
│   ├── useAiTutorCatalog.ts
│   ├── useAiTutorRealtimeSession.ts
│   └── useTeacherDialogAllowances.ts
├── model/
│   ├── agePolicy.ts
│   └── dialogTimer.ts
└── ui/
    ├── AiTutorPanel.tsx                      # composition + compatibility exports
    └── ai-tutor/
        ├── TutorAvatar.tsx
        ├── ProfileRequired.tsx
        ├── ActiveSession.tsx
        ├── SessionSetup.tsx
        ├── DialogAllowanceCard.tsx
        ├── TutorPersonaPicker.tsx
        ├── TeacherDialogAllowancesPanel.tsx
        └── SessionSummary.tsx
```

### Шаги

- [ ] Вынести `agePolicyFromBirthDate`, `dialogRemainingSeconds`, formatting и expiry hook в model/hook modules; сохранить re-exports из старого файла.
- [ ] Вынести catalog/persona/scenario/allowance loading и default selection в `useAiTutorCatalog`.
- [ ] Сохранить очистку catalog state при missing profile/birth date и cancellation после unmount.
- [ ] Вынести teacher allowance list/refresh/grant state в `useTeacherDialogAllowances`; сохранить permission gate и optimistic scope только обновлённой строки.
- [ ] Вынести realtime start/finish/repeat, `AudioContext`, remote stream, evaluation и summary в `useAiTutorRealtimeSession`.
- [ ] Сохранить `pendingStartRequestId` между retry, очистку только после определённого исхода и idempotent `clientRequestId`.
- [ ] Сохранить cleanup realtime/audio на unmount и при partial failure после созданной server session.
- [ ] Сохранить отдельную обработку `AI_DIALOG_CREDITS_EXHAUSTED` и `AI_DIALOG_ALREADY_ACTIVE`.
- [ ] Вынести leaf views, сохранив текущие named exports, `tutorAccentTranslationKeys`, DOM/classes и aria.
- [ ] Оставить `AiTutorPanel` владельцем role/profile gates и композицией трёх hooks.

### Контракты

- Realtime connection, evaluation persistence, repeat/finish и session summary не меняются.
- Birth-date age policy, student allowance и teacher credit grants сохраняются.
- API request order и fallback demo notice остаются прежними.
- Все существующие named exports из `AiTutorPanel.tsx` продолжают работать через re-export.

### Проверки

```bash
cd frontend/web-app
npm test -- src/features/ai-tutor/ui/AiTutorPanel.test.ts \
  src/features/ai-tutor/ui/AiTutorAvatarStage.test.tsx
npm run lint
npm run build
```

- [ ] Вручную проверить no-birth-date, exhausted/active-elsewhere, demo и realtime sessions.
- [ ] Проверить start retry с тем же request ID, finish после connection failure и cleanup media resources.
- [ ] Проверить teacher refresh/grant и countdown expiry.
- [ ] Цель: panel до 180 строк, hooks до 250 строк, leaf views до 180 строк.

---

## RF-17. `frontend/web-app/src/features/chat/ui/GlobalToolsRail.tsx`

### Проблема

Один component владеет contacts/conversations/messages, cursor pagination, WebSocket reconnect и receipts, read marking, deep-link consumption, toast, focus trap, search и двумя крупными views.

### Целевая структура

```text
frontend/web-app/src/features/chat/
├── hooks/
│   ├── useChatConversations.ts
│   ├── useChatRealtime.ts
│   └── useChatRailDialog.ts
├── model/
│   ├── chatMessageState.ts
│   └── chatFormatting.ts
└── ui/
    ├── GlobalToolsRail.tsx                   # composition + compatibility exports
    └── global-tools-rail/
        ├── ChatRailTrigger.tsx
        ├── ChatConversationList.tsx
        ├── ChatConversationView.tsx
        ├── ChatComposer.tsx
        └── ChatToast.tsx
```

### Шаги

- [ ] Вынести `mergeMessages`, `messageStatus`, upsert/sort helpers и empty state factory в `chatMessageState.ts`; сохранить named re-exports.
- [ ] Вынести time/count formatting в `chatFormatting.ts`, передавая locale явно.
- [ ] Вынести initial parallel contacts/conversations load, message pages, send/create/select и mark-read в `useChatConversations`.
- [ ] Сохранить per-conversation loading/cursor state и merge ordering без duplicate message IDs.
- [ ] Вынести socket lifecycle в `useChatRealtime`; передавать узкие event reducers/callbacks, не копировать message state внутрь socket hook.
- [ ] Сохранить reconnect delay `2000 ms`, cleanup timer/socket и refresh после reconnect.
- [ ] Сохранить delivery/read receipt rules, unread badge и toast только для невидимого incoming conversation.
- [ ] Вынести deep-link open, Escape, focus entry/restore и Tab trap в `useChatRailDialog`.
- [ ] Сохранить одноразовое `consumePendingChatTarget` и auto-open единственного conversation.
- [ ] Вынести list/conversation/composer/toast leaves, сохранив data/aria/classes и scroll-to-end behavior.
- [ ] Не добавлять feature-wide context; rail остаётся единственным state owner.

### Контракты

- `GlobalToolsRail` props/export path не меняются.
- WebSocket messages, delivery/read transitions, pagination и reconnect сохраняются.
- Deep links, focus trap/return, Escape, unread count и 5-second toast сохраняются.
- Search locale semantics и message timestamps не меняются.

### Проверки

```bash
cd frontend/web-app
npm test -- src/features/chat/ui/GlobalToolsRail.test.ts
npm run lint
npm run build
```

- [ ] Проверить два клиента: send/delivered/read, offline reconnect и unread toast.
- [ ] Проверить deep link, older pagination, search, Escape/Tab и возврат фокуса.
- [ ] Сравнить list/conversation/toast desktop/mobile, light/dark.
- [ ] Цель: rail до 180 строк, hooks до 260 строк, leaves до 220 строк.

---

## RF-18. `frontend/web-app/src/features/classroom/ui/ClassroomPreJoin.tsx`

### Проблема

Component смешивает LiveKit preview tracks, persistent device choices, camera/microphone/output selection, recorder/playback/blob lifecycle, validation warning и весь pre-join UI.

### Целевая структура

```text
frontend/web-app/src/features/classroom/
├── hooks/
│   ├── usePreJoinMediaPreview.ts
│   ├── useMicrophoneCheck.ts
│   └── useAudioOutputDevice.ts
└── ui/
    ├── ClassroomPreJoin.tsx                  # composition + compatibility exports
    └── pre-join/
        ├── PreJoinHeader.tsx
        ├── CameraPreview.tsx
        ├── DeviceControls.tsx
        ├── DeviceCheckCard.tsx
        ├── DeviceSelect.tsx
        └── PreJoinWarningDialog.tsx
```

### Шаги

- [ ] Вынести pure `preJoinWarnings`, `supportsAudioOutputSelection`, `normalizedMicrophoneLevel` и storage helpers; сохранить публичные re-exports.
- [ ] Вынести LiveKit `usePreviewTracks`, device enumeration, selected input persistence и video element attachment в `usePreJoinMediaPreview`.
- [ ] Сохранить exact audio constraints, `VideoPresets`, disabled state while joining и preview-error mapping.
- [ ] Вынести speaker device persistence/`setSinkId` capability в `useAudioOutputDevice`; unsupported browser остаётся graceful.
- [ ] Вынести MediaRecorder state machine в `useMicrophoneCheck`.
- [ ] Сохранить min recording `300 ms`, max `5000 ms`, generation guard, timer cancellation, playback stop и `URL.revokeObjectURL`.
- [ ] Вынести UI leaf components без изменения labels, `data-testid`, device option values и footer DOM order.
- [ ] Оставить facade владельцем warning gate и итогового `ClassroomMediaChoices` payload.
- [ ] Проверить StrictMode mount/unmount: tracks, recorder, timers и audio objects освобождаются один раз.

### Контракты

- `ClassroomPreJoin`, `PreJoinWarning` и pure helper exports сохраняются.
- Persistent input/output choice keys и join payload не меняются.
- Camera, microphone, speaker checks и explicit second-click warning сохраняются.
- Permission/device errors остаются нефатальными до явного решения пользователя.

### Проверки

```bash
cd frontend/web-app
npm test -- src/features/classroom/ui/ClassroomPreJoin.test.tsx \
  src/features/classroom/ui/LiveLessonExperience.test.ts
npm run lint
npm run build
```

- [ ] Вручную проверить granted/denied/missing devices и браузер без `setSinkId`/`MediaRecorder`.
- [ ] Проверить record → play → confirm/retry, too-short, auto-stop и navigation cleanup.
- [ ] Сравнить desktop/mobile pre-join light/dark.
- [ ] Цель: facade до 180 строк, hooks до 230 строк, leaves до 180 строк.

---

## RF-19. `frontend/web-app/src/features/registration/ui/RegistrationPage.tsx`

### Проблема

Файл содержит controller пяти registration routes, query-param parsing, password-policy state, confirm effect, четыре submit flow, page shell, success/rate-limit dialogs и form helpers.

### Целевая структура

```text
frontend/web-app/src/features/registration/
├── hooks/
│   └── useRegistrationController.ts
├── model/
│   └── registrationQuery.ts
└── ui/
    ├── RegistrationPage.tsx                  # route composition + compatibility exports
    └── registration/
        ├── RegistrationShell.tsx
        ├── RegistrationStartForm.tsx
        ├── RegistrationConfirmView.tsx
        ├── ForgotPasswordForm.tsx
        ├── ResetPasswordForm.tsx
        ├── RegistrationStartSuccessDialog.tsx
        ├── RegistrationConfirmActions.tsx
        ├── RegistrationRateLimitDialog.tsx
        └── PasswordHints.tsx
```

### Шаги

- [ ] Зафиксировать route/query matrix: `email`, `code`, `token`, `returnTo` и confirmed `continueUrl`.
- [ ] Вынести безопасный query parsing/URL construction в `registrationQuery.ts`; не декодировать и не доверять return path иначе, чем сейчас.
- [ ] Вынести API orchestration и form state в `useRegistrationController`; сохранить один controller, если разделение по route создаёт дублирующиеся email/message/loading sources.
- [ ] Сохранить confirm request cancellation при route change/unmount.
- [ ] Сохранить password checks и несовпадение confirmation до API call.
- [ ] Сохранить rate-limit detection для start/resend/forgot/reset и прежние message keys.
- [ ] Вынести route-specific forms от leaves к shell; формы получают только нужные fields/actions.
- [ ] Вынести существующие exported dialogs/actions и сохранить re-exports из `RegistrationPage.tsx`.
- [ ] Сохранить BrandMark/public-site/login/theme/language shell без изменения DOM и URL.
- [ ] Не менять тексты/i18n keys в structural commit.

### Контракты

- Все `RegistrationRoute` варианты и query parameters работают по-прежнему.
- API payloads, locale, return/continue URLs и rate-limit behavior не меняются.
- Password hints/policy и loading/disabled semantics сохраняются.
- Existing named exports dialogs/actions остаются доступны.

### Проверки

```bash
cd frontend/web-app
npm test -- src/features/registration/ui/RegistrationPage.test.tsx \
  src/app/registration-routes.test.ts
npm run lint
npm run build
```

- [ ] Smoke всех пяти routes, missing/expired token, rate limit, mismatched/weak password.
- [ ] Проверить theme/language switch и safe return URL.
- [ ] Сравнить desktop/mobile формы и dialogs.
- [ ] Цель: page до 160 строк, controller до 250 строк, route views до 180 строк.

---

## RF-20. `frontend/web-app/src/features/materials/ui/MaterialBlockEditor.tsx`

### Проблема

Component содержит общий block chrome и редакторы video, image/generated image, HTML game, flashcards, objective policy, text/free writing/speaking и drawing, а также локальные text drafts/upload state и summary switch.

### Целевая структура

```text
frontend/web-app/src/features/materials/ui/
├── MaterialBlockEditor.tsx                  # composition + compatibility export
└── material-block-editor/
    ├── MaterialBlockEditorHeader.tsx
    ├── VideoBlockFields.tsx
    ├── ImageBlockFields.tsx
    ├── HtmlGameBlockFields.tsx
    ├── FlashcardsBlockFields.tsx
    ├── ObjectiveAssessmentFields.tsx
    ├── TextPromptFields.tsx
    ├── DrawingAreaFields.tsx
    ├── useMaterialBlockDrafts.ts
    ├── materialBlockEditorTypes.ts
    └── materialBlockSummary.ts
```

### Шаги

- [ ] Вынести inline props contract в exported `MaterialBlockEditorProps`.
- [ ] Вынести `materialBlockSummary`/`compactSummary` в pure module и добавить coverage в существующий material test suite.
- [ ] Вынести flashcard source, video start/end source и reset-on-block-change в `useMaterialBlockDrafts`.
- [ ] Сохранить commit-on-blur/parsing semantics video clip и flashcards; не обновлять document на каждый символ, если раньше этого не было.
- [ ] Вынести shared header/collapse/move/preview/delete controls; сохранить activation/focus и button order.
- [ ] Вынести field groups по discriminated `block.type`; child props должны быть narrowed, без `as any`.
- [ ] Сохранить generated-image prompt vs image URL, asset-library select и upload callbacks.
- [ ] Сохранить HTML-game user title source, English-title validation, enrichment state, preview и icon regeneration.
- [ ] Переиспользовать существующие `ExerciseItemsEditor` и `MatchingPairsEditor`; не копировать их logic.
- [ ] Сохранить default objective policy, accepted-answer suggestion gate и assessment patches.
- [ ] Оставить facade владельцем upload busy state, если один upload lock должен блокировать весь card.
- [ ] Не менять block JSON schema, defaults, labels/classes и callback ordering.

### Контракты

- `MaterialBlockEditor` props/export path не меняются.
- Все block types редактируют тот же `MaterialEditorBlock` shape.
- Preview/upload/enrichment/accepted-answer flows и collapsed summary сохраняются.
- `onUpdate`, move/remove/activate callback timing не меняется.

### Проверки

```bash
cd frontend/web-app
npm test -- src/features/materials/ui/MaterialLibraryPanel.test.tsx \
  src/features/materials/model/materialDocument.test.ts \
  src/features/materials/ui/blocks/RenderedMaterialBlock.test.tsx
npm run lint
npm run build
```

- [ ] Вручную открыть и изменить каждый block type, затем save/reload/preview.
- [ ] Проверить video time invalid/empty values, HTML upload/title, flashcards и objective policy.
- [ ] Сравнить expanded/collapsed/active/error states desktop/mobile.
- [ ] Цель: facade до 180 строк, field groups до 200 строк, hook/helpers до 180 строк.

---

## RF-21. `frontend/web-app/src/features/classroom/model/annotation.ts`

### Проблема

Domain module смешивает types/constants, pointer conversion, erasing/hit testing, content serialization, legacy JSON parsing, element geometry/move/resize и mind-map tree/layout/size logic.

### Целевая структура

```text
frontend/web-app/src/features/classroom/model/
├── annotation.ts                            # public re-export facade
└── annotation/
    ├── annotationTypes.ts
    ├── annotationConstants.ts
    ├── annotationContent.ts
    ├── annotationSerialization.ts
    ├── annotationGeometry.ts
    ├── annotationHitTesting.ts
    └── mindMapLayout.ts
```

### Шаги

- [ ] Зафиксировать все exports и потребителей `model/annotation`; старый path оставить facade.
- [ ] Вынести unions/types и public presets/limits в `annotationTypes.ts`/`annotationConstants.ts`.
- [ ] Вынести empty/content/page selection и element ordering в `annotationContent.ts`.
- [ ] Вынести JSON parse/serialize, value guards и legacy stroke fallback в `annotationSerialization.ts`.
- [ ] Сохранить неизвестные/malformed element filtering и default color/page/fill/font behavior.
- [ ] Вынести bounds, SVG path, move/resize, coordinate rounding/clamping и `svgPointFromEvent` в `annotationGeometry.ts`.
- [ ] Вынести eraser distance-to-stroke/segment logic в `annotationHitTesting.ts`.
- [ ] Вынести mind-map nodes/subtree/reparent/layout/text sizing в `mindMapLayout.ts`.
- [ ] Не создавать circular imports: types/constants не импортируют behavior modules; serialization зависит от types/constants, facade только re-export.
- [ ] Сохранить export names и order-independent runtime semantics; internal helpers сделать non-exported, если нет потребителей.
- [ ] Расширить существующий `annotation.test.ts`, но сам test-файл не дробить.

### Контракты

- Annotation JSON/schemaVersion/page IDs/order и legacy compatibility не меняются.
- Coordinate range `0..1000`, minimum sizes, stroke/font presets и defaults сохраняются.
- Mind-map layout, node limit `50`, text limit `500`, reparent guards и subtree delete сохраняются.
- Все импорты из `../model/annotation` продолжают компилироваться.

### Проверки

```bash
cd frontend/web-app
npm test -- src/features/classroom/model/annotation.test.ts \
  src/features/classroom/hooks/yjsRuntime.test.ts \
  src/features/classroom/ui/LessonTaskCanvas.test.ts
npm run lint
npm run build
```

- [ ] Сравнить serialized fixtures до/после и round-trip каждого element kind.
- [ ] Проверить move/resize/clamp/hit testing и mind-map layout/reparent edge cases.
- [ ] Цель: facade до 40 строк, каждый domain module до 250 строк.

---

## RF-22. `frontend/web-app/src/features/classroom/ui/AnnotationLayer.tsx`

### Проблема

Один SVG component содержит global keyboard shortcuts, root pointer surface, rendering всех element kinds, arrow markers, mind-map connectors/handles, selection outline, resize handles и text editing.

### Целевая структура

```text
frontend/web-app/src/features/classroom/ui/
├── AnnotationLayer.tsx                      # public facade/re-export
└── annotation-layer/
    ├── AnnotationLayer.tsx
    ├── AnnotationElementView.tsx
    ├── MindMapConnector.tsx
    ├── MindMapAddHandles.tsx
    ├── SelectionOutline.tsx
    ├── ResizeHandle.tsx
    ├── useAnnotationKeyboardShortcuts.ts
    └── annotationLayerTypes.ts
```

### Шаги

- [ ] Вынести `AnnotationLayerBounds` и full props contract в `annotationLayerTypes.ts`; re-export bounds из старого файла.
- [ ] Вынести keyboard listener в hook; сохранить editable-target guard, Cmd/Ctrl+Z, Shift+Z, Y, Delete/Backspace и cleanup.
- [ ] Вынести `AnnotationElementView` как memoized component с прежним discriminated rendering.
- [ ] Вынести connector, selection outline, add handles и resize handle без изменения SVG nesting/order.
- [ ] Сохранить один `markerId` на root layer и передавать его стрелкам; не генерировать marker на element.
- [ ] Сохранить anchored/pending style semantics и root pointer handlers.
- [ ] Сохранить pointer propagation/capture boundaries на move/resize/add controls.
- [ ] Сохранить text editor focus/blur/keyboard behavior и aria/test IDs.
- [ ] Сохранить сортировку/connector-before-node order для mind map.
- [ ] Не добавлять custom comparator к `memo`, пока профилирование не показывает необходимость.

### Контракты

- `AnnotationLayer` props и `AnnotationLayerBounds` export path сохраняются.
- SVG DOM/z-order, marker IDs, selectors/classes и pointer/keyboard behavior не меняются.
- Selection, text editing, mind-map add/reparent и resize handles сохраняются.

### Проверки

```bash
cd frontend/web-app
npm test -- src/features/classroom/ui/LessonTaskCanvas.test.ts \
  src/features/classroom/model/annotation.test.ts
npm run lint
npm run build
```

- [ ] Вручную проверить каждый element kind, selection/move/resize, inline text edit и keyboard undo/delete.
- [ ] Проверить SVG connector/arrow rendering и pointer events на desktop/touch.
- [ ] Цель: facade до 20 строк, root layer до 180 строк, leaf renderers до 220 строк.

---

## RF-23. `frontend/web-app/src/features/classroom/ui/LessonTaskCanvas.tsx`

### Проблема

Component объединяет material/answer state, annotation controller integration, presentation mode, static-image anchor measurement, cursor presence, большую annotation toolbar, material surface и submit footer.

### Целевая структура

```text
frontend/web-app/src/features/classroom/ui/
├── LessonTaskCanvas.tsx                     # public composition boundary
└── lesson-task-canvas/
    ├── AnnotationToolbar.tsx
    ├── LessonMaterialSurface.tsx
    ├── LessonTaskFooter.tsx
    ├── UnassignedLessonMaterial.tsx
    ├── useLessonAnswerState.ts
    ├── useAnnotationAnchorBounds.ts
    ├── usePresenceCursor.ts
    └── lessonTaskCanvasTypes.ts
```

### Шаги

- [ ] Вынести inline props, `LiveAnnotationSync` и `LessonPresentationMode` в types; сохранить public re-export режима.
- [ ] Вынести submission → answer hydration, answer updates, dirty/live score и submit document assembly в `useLessonAnswerState`.
- [ ] Сохранить reset dependencies `material.id/submission.id/updatedAt` и JSON payload `schemaVersion/materialId/answers`.
- [ ] Вынести `useAnnotationAnchorBounds` со всеми ResizeObserver/scroll/layout cleanup и exact bounds comparison.
- [ ] Вынести normalized cursor calculation/clear в `usePresenceCursor`; transient pointer values не переносить в state.
- [ ] Вынести annotation toolbar; передавать derived selected/font/stroke state и actions, не весь annotation hook object.
- [ ] Вынести material surface; сохранить DOM order `document → AnnotationLayer → limit status → PresenceCursorLayer`.
- [ ] Вынести footer/unassigned state без изменения collaboration-controls precedence.
- [ ] Оставить root владельцем `useLessonAnnotation`, active page/presentation composition и cross-child wiring.
- [ ] Сохранить live page sync и cleanup `onPresentationModeChange("default")`.

### Контракты

- `LessonTaskCanvas` props и `LessonPresentationMode` сохраняются.
- Answer hydration/scoring/submit, annotation and Yjs sync не меняются.
- Static-image annotation anchor и focus presentation modes сохраняются.
- Toolbar order, test IDs, cursor clipping и footer controls не меняются.

### Проверки

```bash
cd frontend/web-app
npm test -- src/features/classroom/ui/LessonTaskCanvas.test.ts \
  src/features/classroom/hooks/yjsRuntime.test.ts \
  src/features/materials/ui/LessonMaterialDocumentView.test.tsx
npm run lint
npm run build
```

- [ ] Проверить material switch/submission reload, dirty live score и submit payload.
- [ ] Проверить static-image resize/scroll anchor, image/html-game focus и cursor presence.
- [ ] Проверить teacher collaboration controls и student answer footer.
- [ ] Цель: root до 220 строк, toolbar/surface до 220 строк, hooks до 180 строк.

---

## RF-24. `frontend/web-app/src/features/classroom/hooks/yjsRuntime.js`

### Проблема

Runtime смешивает Y.Doc collection wiring, public adapter, annotation codec, awareness participant mapping, websocket sync protocol, persisted snapshot/base64 и generic value guards. Публичный JS module сопровождается отдельным `.d.ts` и используется через стабильный import path.

### Целевая структура

```text
frontend/web-app/src/features/classroom/hooks/
├── yjsRuntime.js                             # public facade/re-exports
├── yjsRuntime.d.ts                           # public declarations
└── yjs-runtime/
    ├── createWorkspaceRuntime.js
    ├── annotationCodec.js
    ├── awarenessState.js
    ├── syncProtocol.js
    ├── snapshotCodec.js
    └── valueGuards.js
```

### Шаги

- [ ] Зафиксировать public runtime object methods, callback timing и `.d.ts` contract.
- [ ] Вынести `asObject/asString/asNumber/asFiniteNumber`, clamp и string-record normalization в `valueGuards.js`.
- [ ] Вынести annotation map normalization, legacy points fallback, defaults, mind-map size и sort в `annotationCodec.js`.
- [ ] Не импортировать TS annotation model из JS, если это создаёт runtime cycle; parity constants проверять тестами.
- [ ] Вынести message encode/decode, sync step/update и socket-open guard в `syncProtocol.js`.
- [ ] Вынести awareness encode/update, participants mapping и legacy authority migration в `awarenessState.js`.
- [ ] Вынести snapshot apply/base64 encode/decode в `snapshotCodec.js`; malformed snapshot остаётся ignored.
- [ ] Оставить Y.Doc/maps/arrays observers, transact calls, limits и returned adapter в `createWorkspaceRuntime.js`.
- [ ] Сохранить local-origin vs socket-origin guard и observer registration/teardown order.
- [ ] Сохранить array limits: effects `120`, inputs `200`; schema/encoding `1`/`yjs-update-v1`.
- [ ] Оставить `yjsRuntime.js` facade с exports `createYjsWorkspaceRuntime`, `updateHtmlGameAuthorityRuns`.
- [ ] Обновить `.d.ts` только если внутреннее перемещение требует type-only re-export; публичная сигнатура не меняется.

### Контракты

- `useYjsWorkspace.ts` и тесты продолжают импортировать прежний module path.
- Snapshot bytes, websocket protocol types `0/1`, awareness fields и participant mapping сохраняются.
- Annotation normalization/order, HTML-game authority and bounded event history не меняются.
- `destroy()` прекращает callbacks, освобождает awareness/doc и очищает participants.

### Проверки

```bash
cd frontend/web-app
npm test -- src/features/classroom/hooks/yjsRuntime.test.ts \
  src/features/classroom/model/annotation.test.ts \
  src/features/classroom/ui/LessonTaskCanvas.test.ts
npm run lint
npm run build
```

- [ ] Сравнить snapshot base64 и restored state для одинаковых deterministic updates.
- [ ] Проверить sync/awareness messages, malformed snapshot, reconnect и destroy.
- [ ] Цель: facade до 20 строк, runtime adapter до 220 строк, codecs/protocol modules до 180 строк.

---

## RF-25. `backend/api-gateway/src/main/kotlin/com/playsay/gateway/repo/ScheduleRepos.kt`

### Проблема

Файл содержит три projection row и три независимых Spring Data repository interfaces; большая часть LOC — JPQL. Разделение по contract не должно менять package или constructor expressions.

### Целевая структура

```text
backend/api-gateway/src/main/kotlin/com/playsay/gateway/repo/
├── ScheduledLessonRow.kt
├── LessonParticipantRow.kt
├── ScheduledMaterialLookupRow.kt
├── LessonRepo.kt
├── LessonParticipantRepo.kt
└── LessonEmailReminderRepo.kt
```

После успешного переноса `ScheduleRepos.kt` удалить; совместимый facade здесь не нужен, потому что Kotlin symbols остаются в том же package.

### Шаги

- [ ] Зафиксировать все repository methods, annotations, JPQL strings и external imports.
- [ ] Вынести projection data classes по одному, не меняя package, constructor parameter order/types/names.
- [ ] Вынести `LessonRepo`, `LessonParticipantRepo`, `LessonEmailReminderRepo` в отдельные files с тем же package.
- [ ] Переносить query text byte-for-byte, включая whitespace-insensitive JPQL, joins, case/coalesce, order and lock annotations.
- [ ] Не менять `@Lock`, `@Modifying(clearAutomatically/flushAutomatically)`, return types и derived method names.
- [ ] Проверить все JPQL constructor FQCN: `com.playsay.gateway.repo.*Row` остаются прежними.
- [ ] Обновить `BackendArchitectureTest` expected repository file set: заменить aggregate bundle на шесть новых contracts; сам test-файл не дробить.
- [ ] Добавить repository line-size ratchet ≤450 без allowlist для новых files.
- [ ] Удалить старый файл только после compile и Spring context/query tests.

### Контракты

- Bean names/interfaces и injection points не меняются.
- JPQL result shape/order, locks, modifying flush semantics и derived queries сохраняются.
- DTO/projection package names не меняются; consumers не требуют logic changes.

### Проверки

```bash
cd backend
gradle :api-gateway:test \
  --tests com.playsay.gateway.repo.RepositoryQueryCoverageTest \
  --tests com.playsay.gateway.ScheduledLessonControllerTest \
  --tests com.playsay.gateway.BackendArchitectureTest
gradle :api-gateway:compileKotlin
```

- [ ] Запустить application context/query validation, чтобы invalid JPQL обнаруживался до runtime.
- [ ] Сравнить method inventory до/после; ни один query method не потерян.
- [ ] Цель: projection files до 80 строк, repositories до 450 строк; предпочтительно `LessonRepo` до 380.

---

## RF-26. `frontend/web-app/src/styles.css`

### Проблема

Root stylesheet содержит Tailwind directives, tokens/base, shared inputs, welcome/auth screen, decorative motion, AI avatar и global dark utilities. Из-за `@tailwind` нельзя без проверки превращать его в обычный late-`@import` manifest.

### Целевая структура

```text
frontend/web-app/src/
├── styles.css                                # только @tailwind directives
└── styles/base/
    ├── 00-tokens-and-document.css
    ├── 10-form-controls.css
    ├── 20-welcome-layout.css
    ├── 30-welcome-actions.css
    ├── 40-welcome-decoration.css
    ├── 50-ai-avatar.css
    ├── 80-motion.css
    └── 90-theme-and-responsive.css
```

`main.tsx` импортирует partials сразу после `styles.css` в порядке `00`…`90`, до `workspace.css`; это сохраняет generated Tailwind layers перед текущими custom rules.

### Mechanical split anchors

- `styles.css`: только существующие `@tailwind base/components/utilities`.
- `00`: `:root`, `html`, `.dark` tokens, `body`/document base.
- `10`: `.playsay-input`, file input и draft image preview.
- `20`–`40`: welcome scene/content/preferences, CTA и decorative balls/handprints contiguous ranges.
- `50`: AI avatar portrait/layers/glow.
- `80`: keyframes и non-responsive animation bindings в исходном порядке.
- `90`: reduced-motion/mobile blocks и trailing global dark utility overrides.

### Шаги

- [ ] Зафиксировать compiled CSS order и inventory selectors/keyframes.
- [ ] Сначала перенести contiguous ranges без изменения declarations/selectors/specificity.
- [ ] Оставить Tailwind directives в `styles.css`; не ставить native `@import` после `@tailwind`.
- [ ] Добавить явные ordered imports partials в `main.tsx` строго между `./styles.css` и `./styles/workspace.css`.
- [ ] Сохранить dark tokens до component rules и trailing dark utility overrides после responsive blocks.
- [ ] Не объединять keyframes/duplicate selectors в mechanical commit.
- [ ] Проверить Vite/PostCSS output: Tailwind base precedes custom tokens/forms как до split.
- [ ] Проверить selector/keyframe occurrence inventory и отсутствие потерь.

### Проверки

```bash
cd frontend/web-app
npm test -- src/app/AppShellWelcome.test.tsx \
  src/features/ai-tutor/ui/AiTutorAvatarStage.test.tsx
npm run lint
npm run build
```

- [ ] Сравнить compiled selector order для representative Tailwind reset, `.playsay-input`, welcome и avatar selectors.
- [ ] Visual: welcome/login/register, theme/language, AI avatar — desktop/mobile, light/dark, reduced motion.
- [ ] Цель: `styles.css` до 10 строк, partials до 300 строк.

---

## RF-27. `frontend/web-app/src/styles/responsive.css`

### Проблема

Файл является cross-feature responsive tail: tablet shell/pre-join, большой mobile block для classroom/materials/homework/collaboration и expanded-video overrides. Семантическая перегруппировка легко меняет cascade.

### Целевая структура

```text
frontend/web-app/src/styles/
├── responsive.css                            # ordered manifest
└── responsive/
    ├── 00-live-room.css
    ├── 10-tablet-shell.css
    ├── 20-mobile-prejoin.css
    ├── 30-mobile-classroom-video.css
    ├── 40-mobile-task-board.css
    ├── 50-mobile-materials.css
    ├── 60-mobile-homework-and-collaboration.css
    └── 70-expanded-video.css
```

### Шаги

- [ ] Выполнять RF-27 только после RF-11/RF-12/RF-13/RF-26/RF-28, чтобы cross-file order больше не менялся.
- [ ] Снять ordered inventory media queries/selectors и computed-style baseline на ключевых viewports.
- [ ] Делить огромный `@media (max-width: 640px)` только по contiguous ranges; каждый partial повторяет media wrapper.
- [ ] Сохранить исходный порядок imports/ranges; не объединять одинаковые media queries в первом commit.
- [ ] Оставить `responsive.css` manifest на прежнем последнем месте в `main.tsx`.
- [ ] Сохранить orientation query и `body.playsay-classroom-video-expanded` blocks в самом последнем partial.
- [ ] Не переносить rules обратно в feature styles в этом work package.
- [ ] Проверить duplicate/missing selectors и exact media conditions.

### Проверки

```bash
cd frontend/web-app
npm test -- src/features/classroom/ui/ClassroomPreJoin.test.tsx \
  src/features/classroom/ui/LessonTaskCanvas.test.ts \
  src/features/materials/ui/LessonMaterialDocumentView.test.tsx \
  src/features/schedule/ui/SchedulePanel.test.tsx
npm run lint
npm run build
```

- [ ] Visual matrix: widths `390`, `640`, `641`, `980`, `981`, `1280`; portrait/landscape.
- [ ] Проверить pre-join, classroom video collapsed/expanded, task board, materials exercises, homework и collaboration.
- [ ] Проверить no-overflow и computed styles на boundary widths.
- [ ] Цель: partials до 300 строк, manifest до 20 строк.

---

## RF-28. `frontend/web-app/src/styles/chat.css`

### Проблема

Stylesheet смешивает tools rail/trigger, panel/header, conversation/contact list, messages/composer, empty/loading states, toast, mobile и reduced-motion overrides.

### Целевая структура

```text
frontend/web-app/src/styles/
├── chat.css                                  # ordered manifest
└── chat/
    ├── 10-rail-and-panel.css
    ├── 20-list-and-search.css
    ├── 30-messages-and-composer.css
    ├── 40-empty-and-loading.css
    ├── 50-toast.css
    └── 90-responsive-and-motion.css
```

### Шаги

- [ ] Снять selector inventory и screenshots list/conversation/toast.
- [ ] Перенести contiguous ranges без изменения declarations, order или specificity.
- [ ] Оставить `chat.css` ordered `@import` manifest на прежнем месте между classroom и materials CSS.
- [ ] Сохранить dark error rule рядом с базовым error либо его исходное относительное место.
- [ ] Сохранить mobile panel geometry и toast positioning.
- [ ] Сохранить reduced-motion overrides последними.
- [ ] Проверить каждый selector ровно в одном partial и отсутствие потерянных keyframes.

### Проверки

```bash
cd frontend/web-app
npm test -- src/features/chat/ui/GlobalToolsRail.test.ts
npm run lint
npm run build
```

- [ ] Visual: closed badge, list/search/contacts, conversation statuses/composer, errors/empty/loading, toast.
- [ ] Проверить desktop/mobile, light/dark, reduced motion и focus-visible.
- [ ] Цель: partials до 180 строк, manifest до 20 строк.

---

## RF-29. Четыре i18n resource-файла

### Файлы

- `frontend/web-app/src/shared/i18n/resources/ru.ts`
- `frontend/web-app/src/shared/i18n/resources/en.ts`
- `frontend/web-app/src/shared/i18n/resources/de.ts`
- `frontend/web-app/src/shared/i18n/resources/fr.ts`

### Проблема

Каждый locale хранит весь product tree в одном файле. Структуры синхронны, но изменения одного feature требуют навигации по четырём файлам по 1555–1587 строк. Разбиение должно перемещать значения, а не редактировать переводы.

### Целевая структура

```text
frontend/web-app/src/shared/i18n/resources/
├── ru.ts                                     # composition facade
├── en.ts
├── de.ts
├── fr.ts
├── ru/
│   ├── core.ts
│   ├── registration-and-ai.ts
│   ├── schedule-and-homework.ts
│   ├── courses.ts
│   ├── materials.ts
│   ├── classroom.ts
│   └── admin-and-payments.ts
├── en/                                       # те же семь slice names
├── de/                                       # те же семь slice names
└── fr/                                       # те же семь slice names
```

Slice boundaries одинаковы для четырёх locales:

- `core`: `common`, `auth`, `welcome`, `chat`, `shell`, `profile`, `workspace`, `vocabulary`;
- `registration-and-ai`: `registration`, `aiTutor`;
- `schedule-and-homework`: `schedule`, `homework`;
- `courses`: `courses`;
- `materials`: `materials`;
- `classroom`: `classroom`;
- `admin-and-payments`: `userManagement`, `payments`, `errors`.

### Шаги

- [ ] Применить `play-and-say-frontend-i18n`; зафиксировать leaf-key count и `key → exact string/value` map для каждого locale до переноса.
- [ ] Создать одинаковые directories/slice files для `ru/en/de/fr`.
- [ ] Переносить один slice сразу во всех четырёх locales; не делать locale-by-locale commits.
- [ ] Каждый slice экспортирует объект только со своими top-level namespaces; composition facade spreads slices в прежнем top-level order.
- [ ] Сохранить `export const ru/en/de/fr = ... as const`, imports в `resources/index.ts`, `resources` и `AppTranslationResource`.
- [ ] Проверить отсутствие duplicate top-level namespaces при composition; дополнить существующий `integrity.test.ts`, но не дробить его.
- [ ] Сравнить полный leaf-key/value map до/после: допускается ноль добавленных, удалённых или изменённых values.
- [ ] Сохранить plural/interpolation keys и exact punctuation/whitespace.
- [ ] Не менять UI-тексты, fallback language или i18next config в structural commit.
- [ ] Проверить Cyrillic/hardcoded-string searches из i18n skill; новые исключения не добавлять.

### Контракты

- `resources`, `AppTranslationResource` и locale exports/import paths сохраняются.
- Все leaf keys и значения побайтно эквивалентны до/после переноса.
- `ru/en/de/fr` имеют одинаковую normalized structure; dynamic key families остаются покрыты.

### Проверки

```bash
cd frontend/web-app
npm test -- src/shared/i18n/config.test.ts \
  src/shared/i18n/integrity.test.ts
npm run lint
npm run build

cd ../..
rg -n "[А-Яа-яЁё]" frontend/web-app/src --glob '!**/generated/**'
rg -n 'aria-label="|title="|placeholder="|>[A-ZА-Я][^<{]{2,}<' frontend/web-app/src --glob '!**/generated/**'
```

- [ ] Проверить все четыре языка на welcome, registration, schedule, materials, classroom и settings screens.
- [ ] Цель: locale facades до 40 строк, каждый slice до 450 строк.

---

## RF-30. `Jenkinsfile`

### Проблема

Pipeline содержит Kubernetes pod template, validation/checkout metadata, build/test/package, Liquibase, семь повторяющихся Kaniko image builds, source tagging, infra update, rollout и smoke orchestration. Многие shell bodies уже имеют counterparts в `scripts/ci`, но Jenkinsfile остаётся 1111 строк.

### Целевая структура

```text
Jenkinsfile                                   # declarative stages/conditions/post only
scripts/ci/
├── validate-platform-build.sh
├── run-backend-validation.sh
├── run-frontend-build.sh
├── run-collaboration-build.sh
├── run-liquibase-migration.sh
├── build-kaniko-image.sh
├── tag-source-commit.sh                      # existing
├── update-dev-image-tag.sh                   # existing
├── wait-for-argocd-rollout.sh                # existing
├── run-ui-smoke.sh                           # existing
└── manage-build-capacity.sh                  # existing
```

Pod YAML оставлять inline на первом проходе. Выносить его в `ci/jenkins/agent-pod.yaml` только если Jenkins Kubernetes plugin принимает trusted SCM content до agent allocation и это подтверждено validator + реальным build; иначе не рисковать bootstrap boundary.

### Шаги

- [ ] Перед началом перечитать root `spec.md`, infra runbook и текущие Jenkins разделы; записать stage/condition/environment inventory.
- [ ] Отдельным первым commit привести `dispatcher-fanout-limit.test.mjs` к действующему sequential contract (`MAX_PARALLEL_MODULE_JOBS=1`, `jobs.eachWithIndex`, aggregate failure reporting); production dispatcher не менять. После этого `node --test scripts/ci/*.test.mjs` должен стать зелёным.
- [ ] Зафиксировать baseline build parameters, display name, tags, stage names, `AFFECTED_TARGETS` matrix и `post always` capacity restore.
- [ ] Сначала переиспользовать существующие `scripts/ci/*`, удаляя duplicated shell bodies из Jenkinsfile без изменения arguments/env.
- [ ] Вынести validation/build/migration/Kaniko shell logic в versioned scripts; каждый script получает target/module/image/context явно и валидирует allowlisted values.
- [ ] В `build-kaniko-image.sh` параметризовать только повторяющуюся command assembly; отдельный Jenkins `container('kaniko-*')` для каждого image сохранить.
- [ ] Не объединять семь image stages в один Kaniko container и не менять parallel/sequential execution.
- [ ] Сохранить exact checkout SHA logic (`GITHUB_AFTER`), deployable branch rules, changelog-diff migration gate и fail-safe behavior.
- [ ] Сохранить build label во display name, Git tag, GHCR tag, Helm value и pod metadata.
- [ ] Сохранить capacity acquire/guard/restore и `post always`; не сокращать safety timeouts/thresholds в refactor.
- [ ] Сохранить порядок test/package → DB migrate → image → source tag → infra tag update → rollout → capacity restore/readiness → smoke.
- [ ] Не выводить secrets; включить shell tracing только для безопасных values, credentials masking сохранить.
- [ ] Добавить unit tests для pure target/argument validation в существующие `scripts/ci/*.test.mjs`; тестовые файлы не дробить.
- [ ] Выполнить `bash -n`/ShellCheck при наличии и Jenkins declarative validator.
- [ ] Запустить реальный module job с теми же `BRANCH_NAME/GITHUB_BEFORE/GITHUB_AFTER`, затем проверить tags, infra commit, ArgoCD rollout и smoke.
- [ ] Обновить infra runbook с новыми source-of-truth script paths. Если изменился flow/behavior — синхронизировать и root `spec.md`; при чистом переносе явно записать «behavior unchanged».

### Контракты

- Parameters, stage names, conditions, credentials IDs, resource limits and pod containers не меняются.
- Build artifacts/images/tags/infra commits эквивалентны baseline.
- Capacity protection, migration gates, rollout and smoke остаются fail-closed в прежних местах.
- Public site, Docker, Amnezia, nginx, k3s и unrelated workloads не затрагиваются.

### Проверки

```bash
bash -n scripts/ci/*.sh
node --test scripts/ci/*.test.mjs
git diff --check
```

- [ ] Jenkins declarative validator принимает pipeline.
- [ ] Dry/manual non-deployable branch проходит validation/build, но не push/deploy stages.
- [ ] Один deployable module build проходит полный путь до `SUCCESS` с прежними stage names/tags.
- [ ] ArgoCD `Synced/Healthy`, pods Ready и public endpoints отвечают согласно runbook.
- [ ] Секреты отсутствуют в console log и artifacts.
- [ ] Цель: `Jenkinsfile` меньше 500 строк, предпочтительно до 450; каждый новый script до 250 строк.

---

## RF-31. Ratchets, full verification и завершение

### Size/architecture ratchets

- [ ] Удалить из `BackendArchitectureTest.legacyOversizedServices` только фактически устранённые entries:
  - `service/AssignmentStore.kt`;
  - `service/MaterialAiDraftService.kt`;
  - `service/MaterialScoringService.kt`.
- [ ] Не удалять unrelated legacy entries без отдельной проверки соответствующего файла.
- [ ] Добавить frontend `max-lines` ESLint overrides для refactored TS/TSX/JS и i18n slice paths с `skipBlankLines` и `skipComments`, порогом 450 и явным исключением tests/generated/corpus data.
- [ ] Если глобальное правило задевает файлы вне scope, использовать path-specific rule, а не новый бессрочный allowlist.
- [ ] Добавить keyboard-service architecture test/ratchet: новые service files ≤450 строк; старый `TrainingService.kt` после split не требует allowlist.
- [ ] Обновить API-gateway repository architecture rule на отдельные schedule repository files и порог ≤450 без legacy allowlist.
- [ ] Добавить простой CI-check, что CSS manifests содержат только comments/`@import`, а специальный root `styles.css` — только `@tailwind`; каждый CSS partial должен быть меньше 500 строк.
- [ ] Добавить CI ratchet: `Jenkinsfile` меньше 500 строк, новые non-test `scripts/ci` меньше 300 строк.

### Full verification

- [ ] Запустить все frontend tests/lint/build.
- [ ] Запустить все backend tests для `api-gateway` и `keyboard-service`.
- [ ] Запустить OpenAPI generation и убедиться, что generated contract не изменился.
- [ ] Выполнить `git diff --check`.
- [ ] Проверить `git status`; исключить build output, screenshots и `graphify-out`.
- [ ] Повторно измерить LOC исходных facade/manifests и новых modules.
- [ ] Повторить scope scan: ни один поддерживаемый tracked production-файл не остаётся на уровне ≥500 строк вне явных generated/lock/dataset/docs/test исключений.
- [ ] Проверить, что ни один новый TS/TSX/JS/Kotlin production-файл не превышает 450 строк.
- [ ] Проверить, что ни один CSS partial не достигает 500 строк и соблюдает более строгий порог своего work package.
- [ ] Проверить i18n leaf-key/value equivalence и одинаковые slice boundaries `ru/en/de/fr`.
- [ ] Проверить Jenkins validator, CI unit/shell checks и один реальный deployable module build.
- [ ] Сравнить все baseline screenshots с финальными в light/dark desktop/mobile.
- [ ] Провести keyboard-only smoke по всем session phases.
- [ ] Провести web-app smoke: login shell → registration/profile → AI tutor/chat → schedule → materials → course → classroom.
- [ ] Убедиться, что `spec.md` и infra runbook соответствуют фактическому поведению/операционным путям; не оставлять behavioral/operational drift.

### Команды

```bash
cd frontend/web-app
npm test
npm run lint
npm run build

cd ../keyboard-app
npm test
npm run lint
npm run build

cd ../../backend
gradle :api-gateway:test :keyboard-service:test
gradle :api-gateway:exportOpenApi

cd ..
bash -n scripts/ci/*.sh
node --test scripts/ci/*.test.mjs
git diff --check
git status --short --branch
```

### Финальный handoff

- [ ] Обновить сводные чекбоксы RF-00…RF-31.
- [ ] Заполнить журнал выполнения для каждого work package.
- [ ] Кратко перечислить сохранённые public facades и compatibility re-exports.
- [ ] Приложить список новых files и итоговые LOC.
- [ ] Приложить команды проверок и их результаты.
- [ ] Отдельно перечислить сознательно оставшийся technical debt; не маскировать его как выполненный.

---

## 6. Журнал выполнения

Заполнять одну строку после завершения каждого work package.

| WP | Статус | Commit SHA | Дата | Выполненные проверки | Примечания/отклонения |
|---|---|---|---|---|---|
| RF-00 | `[ ]` | — | — | — | — |
| RF-01 | `[ ]` | — | — | — | — |
| RF-02 | `[ ]` | — | — | — | — |
| RF-03 | `[ ]` | — | — | — | — |
| RF-04 | `[ ]` | — | — | — | — |
| RF-05 | `[ ]` | — | — | — | — |
| RF-06 | `[ ]` | — | — | — | — |
| RF-07 | `[ ]` | — | — | — | — |
| RF-08 | `[ ]` | — | — | — | — |
| RF-09 | `[ ]` | — | — | — | — |
| RF-10 | `[ ]` | — | — | — | — |
| RF-11 | `[ ]` | — | — | — | — |
| RF-12 | `[ ]` | — | — | — | — |
| RF-13 | `[ ]` | — | — | — | — |
| RF-14 | `[ ]` | — | — | — | — |
| RF-15 | `[ ]` | — | — | — | — |
| RF-16 | `[ ]` | — | — | — | — |
| RF-17 | `[ ]` | — | — | — | — |
| RF-18 | `[ ]` | — | — | — | — |
| RF-19 | `[ ]` | — | — | — | — |
| RF-20 | `[ ]` | — | — | — | — |
| RF-21 | `[ ]` | — | — | — | — |
| RF-22 | `[ ]` | — | — | — | — |
| RF-23 | `[ ]` | — | — | — | — |
| RF-24 | `[ ]` | — | — | — | — |
| RF-25 | `[ ]` | — | — | — | — |
| RF-26 | `[ ]` | — | — | — | — |
| RF-27 | `[ ]` | — | — | — | — |
| RF-28 | `[ ]` | — | — | — | — |
| RF-29 | `[ ]` | — | — | — | — |
| RF-30 | `[ ]` | — | — | — | — |
| RF-31 | `[ ]` | — | — | — | — |

## 7. Шаблон записи для агента

```markdown
### RF-XX — <название>

- Статус: `[x]`
- Commit: `<sha>`
- Новые/перемещённые файлы:
  - `<path>`
- Проверки:
  - `<command>` — PASS
- LOC после:
  - `<path>` — `<n>`
- Сохранённые compatibility boundaries:
  - `<export/facade>`
- Отклонения от плана:
  - `<none или описание>`
```
