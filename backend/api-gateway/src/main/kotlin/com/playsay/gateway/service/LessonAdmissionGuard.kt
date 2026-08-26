package com.playsay.gateway.service

import com.playsay.gateway.repo.LessonAdmissionRepo
import com.playsay.gateway.utils.MetaData
import java.util.UUID
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional

@Component
class LessonAdmissionGuard(private val admissionRepo: LessonAdmissionRepo) {
    @Transactional(readOnly = true)
    fun isKicked(lessonId: UUID, subject: String): Boolean =
        admissionRepo.findByLessonIdAndSubject(lessonId, subject)?.status == LessonAdmissionStatus.KICKED.name

    @Transactional(readOnly = true)
    fun isKicked(lessonId: UUID, authentication: JwtAuthenticationToken): Boolean =
        authentication.authorities.none {
            it.authority == MetaData.Authorities.TEACHER || it.authority == MetaData.Authorities.ADMIN
        } &&
            isKicked(lessonId, authentication.token.subject)
}
