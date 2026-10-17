package com.playsay.gateway.service

import com.playsay.gateway.entity.AppUserEntity
import com.playsay.gateway.entity.LessonParticipantEntity
import com.playsay.gateway.entity.LessonEntity
import com.playsay.gateway.entity.LessonWhiteboardEntity
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.repo.AppUserRepo
import com.playsay.gateway.repo.LessonWhiteboardRepo
import com.playsay.gateway.repo.schedule.LessonParticipantRepo
import com.playsay.gateway.repo.schedule.LessonRepo
import com.playsay.gateway.utils.MetaData
import com.playsay.gateway.utils.toApplicationRoles
import java.time.Clock
import java.util.UUID
import org.springframework.http.HttpStatus
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
class WhiteboardAccessService(
    private val lessons: LessonRepo,
    private val participants: LessonParticipantRepo,
    private val users: AppUserRepo,
    private val boards: LessonWhiteboardRepo,
    private val authorization: ScheduledLessonAuthorizationService,
    private val admission: LessonAdmissionGuard,
    private val clock: Clock,
    private val studentAccessPolicy: StudentAccessPolicy,
) {
    fun canManage(authentication: JwtAuthenticationToken, lessonId: UUID): Boolean {
        val lesson = lessons.findById(lessonId).orElse(null) ?: return false
        val user = users.findByKeycloakSubject(authentication.token.subject) ?: return false
        if (user.deletedAt != null || users.hasDeletionIntent(user.keycloakSubject)) return false
        val roles = user.roles.toApplicationRoles()
        if ("ADMIN" in roles && authentication.authorities.any { it.authority == MetaData.Authorities.ADMIN }) return true
        if ("TEACHER" !in roles || authentication.authorities.none { it.authority == MetaData.Authorities.TEACHER }) return false
        return lesson.teacherUserId == user.id ||
            (participants.findByLessonId(lessonId).isNotEmpty() && authorization.canManageLesson(authentication, lessonId))
    }

    @Transactional(readOnly = true, noRollbackFor = [ProjectResponseException::class])
    fun context(authentication: JwtAuthenticationToken, lessonId: UUID, studentSubject: String?): Pair<LessonEntity, UUID?> {
        val lesson = lessons.findById(lessonId).orElse(null) ?: missing()
        val user = users.findByKeycloakSubject(authentication.token.subject) ?: denied()
        if (user.deletedAt != null || users.hasDeletionIntent(user.keycloakSubject)) denied()
        val roster = participants.findByLessonId(lessonId)
        val manager = canManage(authentication, lessonId)
        if (!manager && (roster.none { it.studentUserId == user.id } || (isActive(lesson) && admission.isKicked(lessonId, user.keycloakSubject)))) denied()
        return lesson to studentContext(lesson.workMode, manager, user, roster, studentSubject)
    }

    private fun studentContext(mode: String, manager: Boolean, user: AppUserEntity, roster: List<LessonParticipantEntity>, subject: String?): UUID? {
        if (mode != "PARALLEL") {
            if (subject != null) denied()
            return null
        }
        if (manager) {
            val target = subject?.let(users::findByKeycloakSubject) ?: denied()
            if (roster.none { it.studentUserId == target.id }) denied()
            return target.id
        }
        if (subject != null && subject != user.keycloakSubject) denied()
        return user.id
    }

    fun now() = clock.instant()

    @Transactional(readOnly = true, noRollbackFor = [ProjectResponseException::class])
    fun requireRead(authentication: JwtAuthenticationToken, lessonId: UUID, board: LessonWhiteboardEntity) {
        if (board.lessonId != lessonId) missing()
        val subject = board.studentUserId?.let { users.findById(it).orElse(null)?.keycloakSubject }
        val (_, studentId) = context(authentication, lessonId, subject)
        if (studentId != board.studentUserId) denied()
        if (lessons.findById(lessonId).orElse(null)?.let(::isActive) == true && admission.isKicked(lessonId, authentication)) denied()
    }

    fun isActive(lesson: LessonEntity): Boolean = lesson.status == MetaData.LessonStatuses.IN_PROGRESS &&
        lesson.actualEnd == null && lessonAccessDeadline(lesson.scheduledEnd, lesson.accessExtensionSeconds)?.isAfter(clock.instant()) == true

    fun requireActive(authentication: JwtAuthenticationToken, lesson: LessonEntity) {
        if (!isActive(lesson) || admission.isKicked(lesson.id, authentication)) denied()
    }

    @Transactional(readOnly = true, noRollbackFor = [ProjectResponseException::class])
    fun boardForDocument(authentication: JwtAuthenticationToken, lessonId: UUID, documentId: UUID, active: Boolean): LessonWhiteboardEntity {
        val board = boards.findByDocumentId(documentId) ?: missing()
        requireRead(authentication, lessonId, board)
        if (active) requireActive(authentication, lessons.findById(lessonId).orElse(null) ?: missing())
        return board
    }

    fun denied(): Nothing = throw ProjectResponseException.localized(HttpStatus.FORBIDDEN, MetaData.ErrorCodes.COLLABORATION_ACCESS_DENIED)
    fun missing(): Nothing = throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.COLLABORATION_DOCUMENT_NOT_FOUND)

    @Transactional(readOnly = true, noRollbackFor = [ProjectResponseException::class])
    fun requireSubjectWrite(subject: String, board: LessonWhiteboardEntity): Boolean {
        val user = users.findByKeycloakSubject(subject) ?: denied()
        val lesson = lessons.findById(board.lessonId).orElse(null) ?: missing()
        if (user.deletedAt != null || users.hasDeletionIntent(subject) || !isActive(lesson)) denied()
        val roles = user.roles.toApplicationRoles()
        val roster = participants.findByLessonId(lesson.id)
        val manager = "ADMIN" in roles || ("TEACHER" in roles && (lesson.teacherUserId == user.id ||
            (roster.isNotEmpty() && studentAccessPolicy.canAccessEveryStudent(user.id, roster.map { it.studentUserId }))))
        if (!manager && (admission.isKicked(lesson.id, subject) || roster.none { it.studentUserId == user.id } ||
            (board.studentUserId != null && board.studentUserId != user.id))) denied()
        return manager
    }
}
