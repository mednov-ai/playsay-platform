package com.playsay.aitutor.service

import com.playsay.aitutor.dto.DialogAllowanceNextAction
import com.playsay.aitutor.dto.DialogAllowanceResponse
import com.playsay.aitutor.dto.GrantDialogCreditsRequest
import com.playsay.aitutor.dto.StudentDialogAllowanceResponse
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
import java.time.Duration
import java.time.Instant
import java.util.UUID
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Propagation
import org.springframework.transaction.annotation.Transactional

@Service
class DialogAllowanceService(
    private val users: LearnerAppUserRepository,
    private val delegations: LearnerTeacherDelegationRepository,
    private val accounts: DialogCreditAccountRepository,
    private val ledger: DialogCreditLedgerRepository,
    private val sessions: ConversationSessionRepository,
    private val clock: Clock = Clock.systemUTC(),
) {
    @Transactional(readOnly = true)
    fun currentAllowance(subject: String): DialogAllowanceResponse =
        allowanceFor(requireUser(subject))

    @Transactional(readOnly = true)
    fun teacherAllowances(actorSubject: String): List<StudentDialogAllowanceResponse> {
        val actor = requireUser(actorSubject)
        requireTeacherOrAdmin(actor)
        val students = if (actor.hasRole(ADMIN_ROLE)) {
            users.findAllStudentsOrdered()
        } else {
            val relatedIds = buildSet {
                users.findAllByManagedByTeacherUserId(actor.id).forEach { add(it.id) }
                addAll(delegations.findActiveStudentUserIds(actor.id, clock.instant()))
            }
            users.findAllById(relatedIds)
                .sortedBy { it.displayLabel().lowercase() }
        }
        return students
            .filter { it.isQuotaLimitedStudent() }
            .map { student ->
                val account = accounts.findById(student.id).orElse(null)
                StudentDialogAllowanceResponse(
                    studentUserId = student.id,
                    studentSubject = student.keycloakSubject,
                    displayName = student.displayLabel(),
                    remainingDialogs = account?.remainingDialogs ?: virtualBalance(student),
                    updatedAt = account?.updatedAt,
                )
            }
    }

    @Transactional
    fun grant(actorSubject: String, studentUserId: UUID, request: GrantDialogCreditsRequest): StudentDialogAllowanceResponse {
        val actor = requireUser(actorSubject)
        requireTeacherOrAdmin(actor)
        val student = users.findById(studentUserId).orElseThrow {
            accessDenied("Student is unavailable")
        }
        if (!student.isQuotaLimitedStudent() || (!actor.hasRole(ADMIN_ROLE) && !canManage(actor, student))) {
            throw accessDenied("The teacher cannot manage this learner")
        }
        findExistingGrant(student, request.quantity, actorSubject, StoredDialogCreditSource.TEACHER_GRANT, request.requestId)
            ?.let { return it }

        val lockedStudent = users.lockById(student.id) ?: throw accessDenied("Student is unavailable")
        findExistingGrant(lockedStudent, request.quantity, actorSubject, StoredDialogCreditSource.TEACHER_GRANT, request.requestId)
            ?.let { return it }
        return applyGrant(
            student = lockedStudent,
            quantity = request.quantity,
            source = StoredDialogCreditSource.TEACHER_GRANT,
            sourceReference = request.requestId,
            actorSubject = actorSubject,
        )
    }

    /** Internal entitlement seam for a future payment webhook. Controllers currently use TEACHER_GRANT only. */
    @Transactional
    fun grantEntitlement(
        studentUserId: UUID,
        quantity: Int,
        source: StoredDialogCreditSource,
        sourceReference: UUID,
        actorSubject: String? = null,
    ): StudentDialogAllowanceResponse {
        require(source == StoredDialogCreditSource.PAYMENT_GRANT) { "Only payment entitlements may use the internal grant seam" }
        require(quantity in 1..100) { "Grant quantity must be between 1 and 100" }
        val student = users.findById(studentUserId).orElseThrow { accessDenied("Student is unavailable") }
        require(student.isQuotaLimitedStudent()) { "Payment entitlements are available only to students" }
        findExistingGrant(student, quantity, actorSubject, source, sourceReference)?.let { return it }
        val lockedStudent = users.lockById(student.id) ?: throw accessDenied("Student is unavailable")
        findExistingGrant(lockedStudent, quantity, actorSubject, source, sourceReference)?.let { return it }
        return applyGrant(lockedStudent, quantity, source, sourceReference, actorSubject)
    }

    private fun applyGrant(
        student: LearnerAppUserEntity,
        quantity: Int,
        source: StoredDialogCreditSource,
        sourceReference: UUID,
        actorSubject: String?,
    ): StudentDialogAllowanceResponse {
        val account = ensureAccount(student)
        account.remainingDialogs += quantity
        account.updatedAt = clock.instant()
        accounts.save(account)
        ledger.save(
            DialogCreditLedgerEntity(
                studentUserId = student.id,
                source = source,
                sourceReference = sourceReference,
                actorSubject = actorSubject,
                delta = quantity,
                balanceAfter = account.remainingDialogs,
                createdAt = account.updatedAt,
            ),
        )
        return student.toAllowance(account)
    }

    private fun findExistingGrant(
        student: LearnerAppUserEntity,
        quantity: Int,
        actorSubject: String?,
        source: StoredDialogCreditSource,
        sourceReference: UUID,
    ): StudentDialogAllowanceResponse? {
        val existing = ledger.findBySourceAndSourceReference(source, sourceReference) ?: return null
        if (existing.studentUserId != student.id || existing.delta != quantity || existing.actorSubject != actorSubject) {
            throw AiTutorResponseException(
                HttpStatus.CONFLICT,
                AiTutorErrorCodes.DIALOG_GRANT_CONFLICT,
                "The grant request id was already used for a different operation",
            )
        }
        val account = accounts.findById(student.id).orElseThrow()
        return student.toAllowance(account)
    }

    @Transactional(propagation = Propagation.MANDATORY)
    fun prepareForSession(subject: String, clientRequestId: UUID?): DialogSessionPreparation {
        val candidate = requireUser(subject)
        val locked = users.lockById(candidate.id) ?: throw accessDenied("Learner profile is unavailable")
        var idempotentSession: ConversationSessionEntity? = null
        sessions.findFirstBySubjectAndStatusOrderByStartedAtDesc(subject, StoredSessionStatus.ACTIVE)
            ?.let { activeSession ->
                val expiresAt = effectiveExpiry(activeSession.startedAt, activeSession.expiresAt)
                if (expiresAt.isAfter(clock.instant())) {
                    if (clientRequestId != null && activeSession.clientRequestId == clientRequestId) {
                        idempotentSession = activeSession
                    } else {
                        throw AiTutorResponseException(
                            HttpStatus.CONFLICT,
                            AiTutorErrorCodes.DIALOG_ALREADY_ACTIVE,
                            "Finish the active AI dialog before starting another one",
                        )
                    }
                } else {
                    activeSession.status = StoredSessionStatus.EXPIRED
                    activeSession.completedAt = expiresAt
                    activeSession.durationSeconds = Duration.between(activeSession.startedAt, expiresAt).seconds.coerceAtLeast(0)
                    sessions.save(activeSession)
                }
            }
        if (!locked.isQuotaLimitedStudent()) return DialogSessionPreparation(existingSession = idempotentSession)
        val account = ensureAccount(locked)
        if (idempotentSession?.dialogCreditConsumed != true && account.remainingDialogs <= 0) {
            throw AiTutorResponseException(
                HttpStatus.CONFLICT,
                AiTutorErrorCodes.DIALOG_CREDITS_EXHAUSTED,
                "Contact your teacher to continue learning",
            )
        }
        return DialogSessionPreparation(account = account, existingSession = idempotentSession)
    }

    @Transactional(propagation = Propagation.MANDATORY)
    fun consume(account: DialogCreditAccountEntity, subject: String, sessionId: UUID) {
        ledger.findBySourceAndSourceReference(StoredDialogCreditSource.SESSION_DEBIT, sessionId)?.let { return }
        if (account.remainingDialogs <= 0) {
            throw AiTutorResponseException(
                HttpStatus.CONFLICT,
                AiTutorErrorCodes.DIALOG_CREDITS_EXHAUSTED,
                "Contact your teacher to continue learning",
            )
        }
        account.remainingDialogs -= 1
        account.updatedAt = clock.instant()
        accounts.save(account)
        ledger.save(
            DialogCreditLedgerEntity(
                studentUserId = account.studentUserId,
                source = StoredDialogCreditSource.SESSION_DEBIT,
                sourceReference = sessionId,
                actorSubject = subject,
                sessionId = sessionId,
                delta = -1,
                balanceAfter = account.remainingDialogs,
                createdAt = account.updatedAt,
            ),
        )
    }

    private fun allowanceFor(user: LearnerAppUserEntity): DialogAllowanceResponse {
        val limited = user.isQuotaLimitedStudent()
        val remaining = if (limited) {
            accounts.findById(user.id).orElse(null)?.remainingDialogs ?: virtualBalance(user)
        } else {
            null
        }
        val activeSession = sessions.findFirstBySubjectAndStatusOrderByStartedAtDesc(
            user.keycloakSubject,
            StoredSessionStatus.ACTIVE,
        )?.let { session -> effectiveExpiry(session.startedAt, session.expiresAt).isAfter(clock.instant()) } == true
        val canStart = !activeSession && (!limited || remaining.orZero() > 0)
        val nextAction = if (limited && remaining.orZero() <= 0) {
            DialogAllowanceNextAction.CONTACT_TEACHER
        } else {
            DialogAllowanceNextAction.NONE
        }
        val teacherName = user.managedByTeacherUserId
            ?.let { teacherId -> users.findById(teacherId).orElse(null)?.displayLabel() }
        return DialogAllowanceResponse(
            limited = limited,
            remainingDialogs = remaining,
            canStart = canStart,
            maxDurationSeconds = DIALOG_DURATION.seconds,
            nextAction = nextAction,
            teacherDisplayName = teacherName,
        )
    }

    private fun ensureAccount(student: LearnerAppUserEntity): DialogCreditAccountEntity {
        accounts.lockByStudentUserId(student.id)?.let { return it }
        val now = clock.instant()
        val initialBalance = virtualBalance(student)
        val account = accounts.save(
            DialogCreditAccountEntity(
                studentUserId = student.id,
                remainingDialogs = initialBalance,
                createdAt = now,
                updatedAt = now,
            ),
        )
        if (initialBalance == WELCOME_DIALOGS) {
            ledger.save(
                DialogCreditLedgerEntity(
                    studentUserId = student.id,
                    source = StoredDialogCreditSource.WELCOME,
                    sourceReference = student.id,
                    delta = WELCOME_DIALOGS,
                    balanceAfter = WELCOME_DIALOGS,
                    createdAt = now,
                ),
            )
        }
        return account
    }

    private fun virtualBalance(student: LearnerAppUserEntity): Int =
        if (sessions.existsBySubject(student.keycloakSubject)) 0 else WELCOME_DIALOGS

    private fun canManage(actor: LearnerAppUserEntity, student: LearnerAppUserEntity): Boolean =
        student.managedByTeacherUserId == actor.id ||
            delegations.hasActiveAccess(actor.id, student.id, clock.instant())

    private fun requireTeacherOrAdmin(user: LearnerAppUserEntity) {
        if (!user.hasRole(TEACHER_ROLE) && !user.hasRole(ADMIN_ROLE)) {
            throw accessDenied("Teacher or administrator role is required")
        }
    }

    private fun requireUser(subject: String): LearnerAppUserEntity =
        users.findByKeycloakSubject(subject) ?: throw AiTutorResponseException(
            HttpStatus.CONFLICT,
            "AI_TUTOR_PROFILE_REQUIRED",
            "Complete your Honey School profile before starting AI practice",
        )

    private fun accessDenied(message: String) = AiTutorResponseException(
        HttpStatus.FORBIDDEN,
        AiTutorErrorCodes.DIALOG_ACCESS_DENIED,
        message,
    )

    private fun LearnerAppUserEntity.toAllowance(account: DialogCreditAccountEntity) =
        StudentDialogAllowanceResponse(
            studentUserId = id,
            studentSubject = keycloakSubject,
            displayName = displayLabel(),
            remainingDialogs = account.remainingDialogs,
            updatedAt = account.updatedAt,
        )

    private fun LearnerAppUserEntity.displayLabel(): String =
        displayName?.trim()?.takeIf { it.isNotEmpty() }
            ?: username?.trim()?.takeIf { it.isNotEmpty() }
            ?: keycloakSubject

    private fun LearnerAppUserEntity.isQuotaLimitedStudent(): Boolean =
        hasRole(STUDENT_ROLE) && !hasRole(TEACHER_ROLE) && !hasRole(ADMIN_ROLE)

    private fun LearnerAppUserEntity.hasRole(role: String): Boolean =
        roles.orEmpty().split(',').any { it.trim() == role }

    private fun Int?.orZero(): Int = this ?: 0

    companion object {
        val DIALOG_DURATION: Duration = Duration.ofMinutes(10)
        const val WELCOME_DIALOGS = 1
        private const val STUDENT_ROLE = "STUDENT"
        private const val TEACHER_ROLE = "TEACHER"
        private const val ADMIN_ROLE = "ADMIN"

        fun effectiveExpiry(startedAt: Instant, expiresAt: Instant?): Instant =
            expiresAt ?: startedAt.plus(DIALOG_DURATION)
    }
}

data class DialogSessionPreparation(
    val account: DialogCreditAccountEntity? = null,
    val existingSession: ConversationSessionEntity? = null,
)
