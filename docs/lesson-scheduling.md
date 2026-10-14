# Lesson scheduling

Authorized teachers can directly create a planned lesson for the current minute or any future start, including one to ten minutes ahead. Creation has no minimum positive lead time and does not require creating a later lesson and rescheduling it. The current minute's elapsed seconds do not invalidate the selected start.

Date/time inputs retain the existing browser scheduling timezone. The corresponding UTC instant is sent unchanged and the scheduled end is calculated from the same start and chosen duration; no silent shift to a later slot is allowed. Reloaded lesson detail and the authorized student snapshot retain that interval.

The quick-create form accepts whole-minute durations from 10 through 180, including the default/preset of 45 minutes. The decrease/increase buttons change the current duration by ten minutes within those bounds; values such as 35 and 55 remain valid. Native field validation must accept every supported preset and stepper result before allowing submission.

Creation remains separate from teacher start, student admission and classroom credentials. Existing roster/material authorization, recurrence, reminders, planned-lesson visibility and server-authoritative opening/deadline/extension policies apply. Failed creation preserves the teacher's selections and does not show success.

Regression acceptance includes current-minute start with elapsed seconds, +1/+5/+10 minutes, normal future creation, UTC+03:00 conversion and midnight rollover. Verify actual native form submission in desktop/mobile Chromium and WebKit, plus API persistence, recurrence and the authorized student snapshot. Local component/browser fixtures and H2 checks do not establish DEV or production acceptance.
