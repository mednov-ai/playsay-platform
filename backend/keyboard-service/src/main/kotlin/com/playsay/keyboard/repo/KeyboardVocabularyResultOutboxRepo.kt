package com.playsay.keyboard.repo

import com.playsay.keyboard.entity.KeyboardVocabularyResultOutboxEntity
import java.time.Instant
import java.util.UUID
import org.springframework.data.jpa.repository.JpaRepository

interface KeyboardVocabularyResultOutboxRepo : JpaRepository<KeyboardVocabularyResultOutboxEntity, UUID> {
    fun existsByTrainingResultId(trainingResultId: Long): Boolean

    fun findTop50ByStatusAndNextAttemptAtLessThanEqualOrderByCreatedAtAsc(
        status: String,
        nextAttemptAt: Instant,
    ): List<KeyboardVocabularyResultOutboxEntity>

    fun deleteByTrainingResultIdIn(trainingResultIds: Collection<Long>): Long
}
