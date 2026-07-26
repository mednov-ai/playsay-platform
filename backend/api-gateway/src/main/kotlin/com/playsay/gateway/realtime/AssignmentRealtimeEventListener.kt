package com.playsay.gateway.realtime

import org.springframework.stereotype.Component
import org.springframework.transaction.event.TransactionPhase
import org.springframework.transaction.event.TransactionalEventListener

@Component
class AssignmentRealtimeEventListener(
    private val realtimeHub: LessonRealtimeHub,
) {
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    fun onAssignmentChanged(event: AssignmentChangedEvent) {
        realtimeHub.publishAssignmentChanged(
            assignmentId = event.assignmentId,
            visibleSubjects = event.visibleSubjects,
            change = event.change,
        )
    }
}
