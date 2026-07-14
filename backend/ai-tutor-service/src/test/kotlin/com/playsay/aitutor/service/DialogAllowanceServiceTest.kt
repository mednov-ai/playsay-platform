package com.playsay.aitutor.service

import com.playsay.aitutor.dto.DialogAllowanceNextAction
import com.playsay.aitutor.dto.GrantDialogCreditsRequest
import com.playsay.aitutor.entity.DialogCreditAccountEntity
import com.playsay.aitutor.entity.DialogCreditLedgerEntity
import com.playsay.aitutor.entity.ConversationSessionEntity
import com.playsay.aitutor.entity.LearnerAppUserEntity
import com.playsay.aitutor.entity.StoredDialogCreditSource
import com.playsay.aitutor.entity.StoredSessionStatus
import com.playsay.aitutor.repo.ConversationSessionRepository
import com.playsay.aitutor.repo.DialogCreditAccountRepository
import com.playsay.aitutor.repo.DialogCreditLedgerRepository
import com.playsay.aitutor.repo.LearnerAppUserRepository
import com.playsay.aitutor.repo.LearnerTeacherDelegationRepository
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.util.Optional
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import org.mockito.ArgumentCaptor
import org.mockito.Mockito

class DialogAllowanceServiceTest {
    private val users = Mockito.mock(LearnerAppUserRepository::class.java)
    private val delegations = Mockito.mock(LearnerTeacherDelegationRepository::class.java)
    private val accounts = Mockito.mock(DialogCreditAccountRepository::class.java)
    private val ledger = Mockito.mock(DialogCreditLedgerRepository::class.java)
    private val sessions = Mockito.mock(ConversationSessionRepository::class.java)
    private val now = Instant.parse("2026-07-14T12:00:00Z")
    private val service = DialogAllowanceService(
        users,
        delegations,
        accounts,
        ledger,
        sessions,
        Clock.fixed(now, ZoneOffset.UTC),
    )

    @Test
    fun `student without history has one virtual welcome dialog`() {
        val student = student()
        Mockito.`when`(users.findByKeycloakSubject(student.keycloakSubject)).thenReturn(student)
        Mockito.`when`(accounts.findById(student.id)).thenReturn(Optional.empty())
        Mockito.`when`(sessions.existsBySubject(student.keycloakSubject)).thenReturn(false)

        val allowance = service.currentAllowance(student.keycloakSubject)

        assertTrue(allowance.limited)
        assertEquals(1, allowance.remainingDialogs)
        assertTrue(allowance.canStart)
        assertEquals(DialogAllowanceNextAction.NONE, allowance.nextAction)
    }

    @Test
    fun `historic session consumes the virtual welcome dialog`() {
        val student = student()
        Mockito.`when`(users.findByKeycloakSubject(student.keycloakSubject)).thenReturn(student)
        Mockito.`when`(accounts.findById(student.id)).thenReturn(Optional.empty())
        Mockito.`when`(sessions.existsBySubject(student.keycloakSubject)).thenReturn(true)

        val allowance = service.currentAllowance(student.keycloakSubject)

        assertEquals(0, allowance.remainingDialogs)
        assertFalse(allowance.canStart)
        assertEquals(DialogAllowanceNextAction.CONTACT_TEACHER, allowance.nextAction)
    }

    @Test
    fun `session preparation materializes one welcome grant and debit is auditable`() {
        val student = student()
        Mockito.`when`(users.findByKeycloakSubject(student.keycloakSubject)).thenReturn(student)
        Mockito.`when`(users.lockById(student.id)).thenReturn(student)
        Mockito.`when`(accounts.lockByStudentUserId(student.id)).thenReturn(null)
        Mockito.`when`(accounts.save(Mockito.any(DialogCreditAccountEntity::class.java))).thenAnswer { it.arguments[0] }
        Mockito.`when`(ledger.save(Mockito.any(DialogCreditLedgerEntity::class.java))).thenAnswer { it.arguments[0] }
        Mockito.`when`(sessions.existsBySubject(student.keycloakSubject)).thenReturn(false)
        val sessionId = UUID.randomUUID()

        val account = service.prepareForSession(student.keycloakSubject, null).account!!
        service.consume(account, student.keycloakSubject, sessionId)

        assertEquals(0, account.remainingDialogs)
        val captor = ArgumentCaptor.forClass(DialogCreditLedgerEntity::class.java)
        Mockito.verify(ledger, Mockito.times(2)).save(captor.capture())
        assertEquals(listOf(StoredDialogCreditSource.WELCOME, StoredDialogCreditSource.SESSION_DEBIT), captor.allValues.map { it.source })
        assertEquals(listOf(1, -1), captor.allValues.map { it.delta })
        assertEquals(sessionId, captor.allValues.last().sessionId)
    }

    @Test
    fun `teacher grant adds to the balance of a managed student`() {
        val teacher = teacher()
        val student = student(managedBy = teacher.id)
        val account = DialogCreditAccountEntity(student.id, remainingDialogs = 2, createdAt = now, updatedAt = now)
        val request = GrantDialogCreditsRequest(quantity = 5, requestId = UUID.randomUUID())
        Mockito.`when`(users.findByKeycloakSubject(teacher.keycloakSubject)).thenReturn(teacher)
        Mockito.`when`(users.findById(student.id)).thenReturn(Optional.of(student))
        Mockito.`when`(users.lockById(student.id)).thenReturn(student)
        Mockito.`when`(accounts.lockByStudentUserId(student.id)).thenReturn(account)
        Mockito.`when`(accounts.save(Mockito.any(DialogCreditAccountEntity::class.java))).thenAnswer { it.arguments[0] }
        Mockito.`when`(ledger.save(Mockito.any(DialogCreditLedgerEntity::class.java))).thenAnswer { it.arguments[0] }

        val updated = service.grant(teacher.keycloakSubject, student.id, request)

        assertEquals(7, updated.remainingDialogs)
        val captor = ArgumentCaptor.forClass(DialogCreditLedgerEntity::class.java)
        Mockito.verify(ledger).save(captor.capture())
        assertEquals(StoredDialogCreditSource.TEACHER_GRANT, captor.value.source)
        assertEquals(request.requestId, captor.value.sourceReference)
        assertEquals(5, captor.value.delta)
    }

    @Test
    fun `repeated teacher grant request returns the recorded balance without adding twice`() {
        val teacher = teacher()
        val student = student(managedBy = teacher.id)
        val request = GrantDialogCreditsRequest(quantity = 5, requestId = UUID.randomUUID())
        val account = DialogCreditAccountEntity(student.id, remainingDialogs = 7, createdAt = now, updatedAt = now)
        val recorded = DialogCreditLedgerEntity(
            studentUserId = student.id,
            source = StoredDialogCreditSource.TEACHER_GRANT,
            sourceReference = request.requestId,
            actorSubject = teacher.keycloakSubject,
            delta = request.quantity,
            balanceAfter = 7,
            createdAt = now,
        )
        Mockito.`when`(users.findByKeycloakSubject(teacher.keycloakSubject)).thenReturn(teacher)
        Mockito.`when`(users.findById(student.id)).thenReturn(Optional.of(student))
        Mockito.`when`(ledger.findBySourceAndSourceReference(StoredDialogCreditSource.TEACHER_GRANT, request.requestId)).thenReturn(recorded)
        Mockito.`when`(accounts.findById(student.id)).thenReturn(Optional.of(account))

        val updated = service.grant(teacher.keycloakSubject, student.id, request)

        assertEquals(7, updated.remainingDialogs)
        Mockito.verify(accounts, Mockito.never()).save(Mockito.any(DialogCreditAccountEntity::class.java))
        Mockito.verify(ledger, Mockito.never()).save(Mockito.any(DialogCreditLedgerEntity::class.java))
    }

    @Test
    fun `active dialog is rejected after locking the learner`() {
        val student = student()
        val active = session(student.keycloakSubject, now, now.plusSeconds(300))
        Mockito.`when`(users.findByKeycloakSubject(student.keycloakSubject)).thenReturn(student)
        Mockito.`when`(users.lockById(student.id)).thenReturn(student)
        Mockito.`when`(sessions.findFirstBySubjectAndStatusOrderByStartedAtDesc(student.keycloakSubject, StoredSessionStatus.ACTIVE)).thenReturn(active)

        val error = assertFailsWith<AiTutorResponseException> {
            service.prepareForSession(student.keycloakSubject, UUID.randomUUID())
        }

        assertEquals(AiTutorErrorCodes.DIALOG_ALREADY_ACTIVE, error.errorCode)
    }

    @Test
    fun `expired dialog is closed before preparing the next credit`() {
        val student = student()
        val expired = session(student.keycloakSubject, now.minusSeconds(700), now.minusSeconds(100))
        val account = DialogCreditAccountEntity(student.id, remainingDialogs = 1, createdAt = now, updatedAt = now)
        Mockito.`when`(users.findByKeycloakSubject(student.keycloakSubject)).thenReturn(student)
        Mockito.`when`(users.lockById(student.id)).thenReturn(student)
        Mockito.`when`(sessions.findFirstBySubjectAndStatusOrderByStartedAtDesc(student.keycloakSubject, StoredSessionStatus.ACTIVE)).thenReturn(expired)
        Mockito.`when`(sessions.save(expired)).thenReturn(expired)
        Mockito.`when`(accounts.lockByStudentUserId(student.id)).thenReturn(account)

        val preparation = service.prepareForSession(student.keycloakSubject, UUID.randomUUID())

        assertEquals(account, preparation.account)
        assertEquals(StoredSessionStatus.EXPIRED, expired.status)
        assertEquals(now.minusSeconds(100), expired.completedAt)
        Mockito.verify(sessions).save(expired)
    }

    @Test
    fun `same active request is idempotent even after its last credit was consumed`() {
        val student = student()
        val requestId = UUID.randomUUID()
        val active = session(student.keycloakSubject, now, now.plusSeconds(300)).also {
            it.clientRequestId = requestId
            it.dialogCreditConsumed = true
        }
        val account = DialogCreditAccountEntity(student.id, remainingDialogs = 0, createdAt = now, updatedAt = now)
        Mockito.`when`(users.findByKeycloakSubject(student.keycloakSubject)).thenReturn(student)
        Mockito.`when`(users.lockById(student.id)).thenReturn(student)
        Mockito.`when`(sessions.findFirstBySubjectAndStatusOrderByStartedAtDesc(student.keycloakSubject, StoredSessionStatus.ACTIVE)).thenReturn(active)
        Mockito.`when`(accounts.lockByStudentUserId(student.id)).thenReturn(account)

        val preparation = service.prepareForSession(student.keycloakSubject, requestId)

        assertEquals(active, preparation.existingSession)
        assertEquals(account, preparation.account)
    }

    @Test
    fun `teacher cannot grant dialogs to an unrelated student`() {
        val teacher = teacher()
        val student = student()
        Mockito.`when`(users.findByKeycloakSubject(teacher.keycloakSubject)).thenReturn(teacher)
        Mockito.`when`(users.findById(student.id)).thenReturn(Optional.of(student))
        Mockito.`when`(delegations.hasActiveAccess(teacher.id, student.id, now)).thenReturn(false)

        val error = assertFailsWith<AiTutorResponseException> {
            service.grant(teacher.keycloakSubject, student.id, GrantDialogCreditsRequest(1, UUID.randomUUID()))
        }

        assertEquals(403, error.statusCode.value())
        assertEquals(AiTutorErrorCodes.DIALOG_ACCESS_DENIED, error.errorCode)
    }

    private fun student(managedBy: UUID? = null) = LearnerAppUserEntity(
        id = UUID.randomUUID(),
        keycloakSubject = "student-${UUID.randomUUID()}",
        roles = "STUDENT",
        username = "student",
        displayName = "Student",
        managedByTeacherUserId = managedBy,
    )

    private fun teacher() = LearnerAppUserEntity(
        id = UUID.randomUUID(),
        keycloakSubject = "teacher-${UUID.randomUUID()}",
        roles = "TEACHER",
        username = "teacher",
        displayName = "Teacher",
    )

    private fun session(subject: String, startedAt: Instant, expiresAt: Instant) = ConversationSessionEntity(
        subject = subject,
        personaId = "maya",
        scenarioId = "meet-someone",
        feedbackMode = "SIGNIFICANT",
        agePolicy = "ADULT",
        startedAt = startedAt,
        expiresAt = expiresAt,
    )
}
