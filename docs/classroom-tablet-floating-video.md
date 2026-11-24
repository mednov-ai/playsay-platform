# Tablet classroom floating video

When a learner uses a supported touch tablet viewport with lesson material, the material is the primary workspace and a compact in-page floating window shows the assigned teacher and the learner's own camera preview. Individual lessons retain their usual desktop, teacher, no-material, screen-share and external-activity views. This is a classroom window and does not promise system Picture-in-Picture outside the page.

Dragging the window docks it to the nearest available corner with an inset. A separate, always-visible striped grip on the horizontal edge facing the workspace centre changes its size: drag upward to enlarge in a bottom corner, or downward in a top corner; the reverse movement shrinks it. Resizing retains the selected corner and aspect ratio. The window stays within the available workspace when the viewport changes. Activating the grip opens localized corner and size controls without dragging or a separate three-dot button; Escape closes them and returns focus to the grip. Other lesson and drawing controls remain accessible, and input outside the window reaches the material.

When the standalone whiteboard is active, its visible drawing surface defines the docking area so the floating window does not cover board tabs or controls. While the drawing surface is loading, outside the visible workbench, or too small for the minimum window, a temporary reserved video row keeps the teacher visible without covering board controls. Screen share retains its existing presentation priority and the board remains available through the existing whiteboard state. A non-minimized library game keeps its established video layout.

The initial primary video is selected using the lesson's assigned `teacherSubject`, not the order in which remote participants arrive. When a substitute or another participant needs to be shown, the learner can select that participant by name from the participant list; this is a local display choice and does not assert a teacher role. A missing or disabled camera retains its corresponding presence state. Position, size and participant selection do not change the lesson, media tracks or another participant's layout.

The production baseline used by this hotfix does not include the standalone whiteboard introduced later in develop. The integration into that branch must preserve the floating layout for the presented board and verify board gestures, state and media continuity separately.

На групповом уроке автоматический выбор камеры привязан к учителю урока. При явном выборе другого участника учитель остаётся в миниатюре. При потере соединения его место занимает карточка состояния.

## Adaptive group placement

On desktop the teacher sees full-width learner cards in one column when the whole roster fits at its normal proportions. Reserved learner slots take part in the height calculation before cameras connect. A shorter panel uses equal grid cells.

During group material work, tablet teachers can dock and resize the whole roster together, with a separate self-preview. On phones the same window carries the roster for a teacher and the pinned teacher for a learner. Placement is evaluated again on rotation and when controls change. If the roster or controls leave no suitable corner, video uses a separate row and the roster can scroll. Screen sharing and external activities keep their presentation priority.
