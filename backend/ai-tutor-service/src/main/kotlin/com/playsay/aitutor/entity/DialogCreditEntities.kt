package com.playsay.aitutor.entity

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.EnumType
import jakarta.persistence.Enumerated
import jakarta.persistence.Id
import jakarta.persistence.Table
import jakarta.persistence.Version
import org.hibernate.annotations.Immutable
import java.time.Instant
import java.util.UUID

@Entity
@Table(name = "ai_tutor_dialog_accounts")
class DialogCreditAccountEntity(
    @Id
    @Column(name = "student_user_id", nullable = false)
    var studentUserId: UUID,
    @Column(name = "remaining_dialogs", nullable = false)
    var remainingDialogs: Int = 0,
    @Version
    @Column(name = "version", nullable = false)
    var version: Long = 0,
    @Column(name = "created_at", nullable = false)
    var createdAt: Instant = Instant.EPOCH,
    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant = Instant.EPOCH,
)

@Entity
@Table(name = "ai_tutor_dialog_ledger")
@Immutable
class DialogCreditLedgerEntity(
    @Id var id: UUID = UUID.randomUUID(),
    @Column(name = "student_user_id", nullable = false) var studentUserId: UUID,
    @Enumerated(EnumType.STRING)
    @Column(name = "source", nullable = false, length = 32)
    var source: StoredDialogCreditSource,
    @Column(name = "source_reference", nullable = false)
    var sourceReference: UUID,
    @Column(name = "actor_subject", length = 255)
    var actorSubject: String? = null,
    @Column(name = "session_id")
    var sessionId: UUID? = null,
    @Column(name = "delta", nullable = false)
    var delta: Int,
    @Column(name = "balance_after", nullable = false)
    var balanceAfter: Int,
    @Column(name = "created_at", nullable = false)
    var createdAt: Instant = Instant.EPOCH,
)

enum class StoredDialogCreditSource {
    WELCOME,
    TEACHER_GRANT,
    PAYMENT_GRANT,
    SESSION_DEBIT,
}
