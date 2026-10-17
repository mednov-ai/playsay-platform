package com.playsay.gateway.realtime

import com.playsay.gateway.service.LessonWhiteboardChanged
import org.springframework.stereotype.Component
import org.springframework.transaction.event.TransactionPhase
import org.springframework.transaction.event.TransactionalEventListener

@Component
class LessonWhiteboardEventListener(private val hub: LessonRealtimeHub) {
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    fun changed(event: LessonWhiteboardChanged) = hub.publishWhiteboardChanged(event.lessonId, event.studentSubject)
}
