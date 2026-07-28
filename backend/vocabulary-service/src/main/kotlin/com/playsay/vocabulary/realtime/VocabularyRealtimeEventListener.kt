package com.playsay.vocabulary.realtime

import org.springframework.stereotype.Component
import org.springframework.transaction.event.TransactionPhase
import org.springframework.transaction.event.TransactionalEventListener

@Component
class VocabularyRealtimeEventListener(
    private val hub: VocabularyRealtimeHub,
) {
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    fun onEntryChanged(event: VocabularyEntryChangedEvent) {
        hub.publish(event)
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    fun onPracticeChanged(event: VocabularyPracticeChangedEvent) {
        hub.publish(event)
    }
}
