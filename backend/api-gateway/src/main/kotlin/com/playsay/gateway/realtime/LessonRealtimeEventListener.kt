package com.playsay.gateway.realtime

import org.springframework.stereotype.Component
import org.springframework.transaction.event.TransactionPhase
import org.springframework.transaction.event.TransactionalEventListener

@Component
class LessonRealtimeEventListener(
    private val hub: LessonRealtimeHub,
) {
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    fun onLessonChanged(event: LessonChangedEvent) {
        hub.publishLessonUpdated(event.lesson)
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    fun onLessonDeleted(event: LessonDeletedEvent) {
        hub.publishLessonDeleted(event.lessonId)
    }
}
