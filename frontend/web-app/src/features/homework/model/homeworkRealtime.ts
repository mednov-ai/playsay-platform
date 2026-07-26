export type HomeworkAssignmentChange = {
  assignmentId: string;
  change: "CREATED" | "UPDATED" | "DELETED" | string;
};

const homeworkAssignmentChangedEvent = "playsay:assignment-changed";
const homeworkRealtimeTarget = new EventTarget();

export function publishHomeworkAssignmentChange(change: HomeworkAssignmentChange) {
  homeworkRealtimeTarget.dispatchEvent(new CustomEvent(homeworkAssignmentChangedEvent, { detail: change }));
}

export function subscribeHomeworkAssignmentChanges(listener: (change: HomeworkAssignmentChange) => void) {
  const handler = (event: Event) => listener((event as CustomEvent<HomeworkAssignmentChange>).detail);
  homeworkRealtimeTarget.addEventListener(homeworkAssignmentChangedEvent, handler);
  return () => homeworkRealtimeTarget.removeEventListener(homeworkAssignmentChangedEvent, handler);
}
