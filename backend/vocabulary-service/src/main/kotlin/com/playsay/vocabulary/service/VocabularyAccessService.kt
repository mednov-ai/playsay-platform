package com.playsay.vocabulary.service

import com.playsay.vocabulary.repo.VocabularyLessonAccessRepo
import com.playsay.vocabulary.repo.VocabularyLessonParticipantRepo
import com.playsay.vocabulary.repo.VocabularyUserRepo
import java.util.UUID
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException

@Service
class VocabularyAccessService(
    private val users: VocabularyUserRepo,
    private val participants: VocabularyLessonParticipantRepo,
    private val lessons: VocabularyLessonAccessRepo,
) {
    @Transactional(readOnly = true)
    fun requireOwnerAccess(actorSubject: String, ownerSubject: String, lessonId: UUID?): String {
        if (actorSubject == ownerSubject) return ownerSubject
        if (lessonId == null) {
            if (!users.canManageVocabulary(actorSubject, ownerSubject)) {
                throw ResponseStatusException(HttpStatus.FORBIDDEN)
            }
            return ownerSubject
        }
        val validLessonId = lessonId
        val actor = users.findByKeycloakSubject(actorSubject)
            ?: throw ResponseStatusException(HttpStatus.FORBIDDEN)
        val owner = users.findByKeycloakSubject(ownerSubject)
            ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)
        if (!participants.existsByLessonIdAndStudentUserId(validLessonId, owner.id)) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN)
        }
        if (!lessons.canTeacherAccessLessonStudent(validLessonId, actor.id, owner.id)) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN)
        }
        return ownerSubject
    }

    @Transactional(readOnly = true)
    fun canAccessOwner(actorSubject: String, ownerSubject: String): Boolean =
        actorSubject == ownerSubject || users.canManageVocabulary(actorSubject, ownerSubject)

    @Transactional(readOnly = true)
    fun requireLessonOwnerAccess(actorSubject: String, ownerSubject: String, lessonId: UUID): String {
        if (actorSubject == ownerSubject) throw ResponseStatusException(HttpStatus.FORBIDDEN)
        val actor = users.findByKeycloakSubject(actorSubject)
            ?: throw ResponseStatusException(HttpStatus.FORBIDDEN)
        val owner = users.findByKeycloakSubject(ownerSubject)
            ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)
        if (
            !participants.existsByLessonIdAndStudentUserId(lessonId, owner.id) ||
            !lessons.canTeacherAccessLessonStudent(lessonId, actor.id, owner.id)
        ) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN)
        }
        return ownerSubject
    }

    @Transactional(readOnly = true)
    fun manageableLearners(actorSubject: String) = users.findManageableLearners(actorSubject)

    @Transactional
    fun lockLesson(lessonId: UUID) {
        if (lessons.lockById(lessonId) == null) {
            throw ResponseStatusException(HttpStatus.NOT_FOUND)
        }
    }
}
