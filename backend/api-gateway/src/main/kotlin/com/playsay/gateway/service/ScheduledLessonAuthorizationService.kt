package com.playsay.gateway.service

import com.playsay.gateway.repo.schedule.LessonParticipantRepo
import com.playsay.gateway.repo.schedule.LessonRepo
import com.playsay.gateway.utils.MetaData
import java.util.UUID
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
class ScheduledLessonAuthorizationService(
    private val lessonRepo: LessonRepo,
    private val lessonParticipantRepo: LessonParticipantRepo,
    private val userProfileStore: UserProfileStore,
    private val studentAccessPolicy: StudentAccessPolicy,
) {
    @Transactional(readOnly = true)
    fun canManageLesson(authentication: JwtAuthenticationToken, lessonId: UUID): Boolean {
        if (authentication.authorities.any { it.authority == MetaData.Authorities.ADMIN }) return true
        val actorId = userProfileStore.currentUserId(authentication)
        val lesson = lessonRepo.findById(lessonId).orElse(null) ?: return false
        if (lesson.teacherUserId == actorId) return true
        val studentIds = lessonParticipantRepo.findByLessonId(lessonId).map { it.studentUserId }
        return studentAccessPolicy.canAccessEveryStudent(actorId, studentIds)
    }

    @Transactional(readOnly = true)
    fun canManageStudents(authentication: JwtAuthenticationToken, studentUserIds: Collection<UUID>): Boolean {
        if (authentication.authorities.any { it.authority == MetaData.Authorities.ADMIN }) return true
        return studentAccessPolicy.canAccessEveryStudent(
            userProfileStore.currentUserId(authentication),
            studentUserIds,
        )
    }
}
