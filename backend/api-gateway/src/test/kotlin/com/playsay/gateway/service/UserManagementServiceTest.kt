package com.playsay.gateway.service
import com.playsay.gateway.client.RegistrationGateway

import com.fasterxml.jackson.databind.ObjectMapper
import com.playsay.contract.registration.model.InternalUpdateRolesRequest
import com.playsay.gateway.dto.UpdateUserRolesRequest
import com.playsay.gateway.entity.AppUserEntity
import com.playsay.gateway.entity.UserDeletionOperationEntity
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.entity.StudentProfileEntity
import com.playsay.gateway.repo.AppUserRepo
import com.playsay.gateway.repo.StudentProfileRepo
import com.playsay.gateway.repo.TeacherDelegationRepo
import com.playsay.gateway.repo.UserDeletionOperationRepo
import com.playsay.gateway.repo.UserManagementAuditRepo
import com.playsay.gateway.utils.MetaData
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import org.mockito.ArgumentMatchers.any
import org.mockito.Mockito.mock
import org.mockito.Mockito.times
import org.mockito.Mockito.verify
import org.mockito.Mockito.`when`
import org.springframework.context.ApplicationEventPublisher
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken

class UserManagementServiceTest {
    private val appUserRepo = mock(AppUserRepo::class.java)
    private val delegationRepo = mock(TeacherDelegationRepo::class.java)
    private val operationRepo = mock(UserDeletionOperationRepo::class.java)
    private val studentProfileRepo = mock(StudentProfileRepo::class.java)
    private val auditRepo = mock(UserManagementAuditRepo::class.java)
    private val registrationGateway = mock(RegistrationGateway::class.java)
    private val userProfileStore = mock(UserProfileStore::class.java)
    private val ownershipService = mock(UserOwnershipTransferService::class.java)
    private val eventPublisher = mock(ApplicationEventPublisher::class.java)
    private val now = Instant.parse("2026-07-18T07:00:00Z")
    private val clock = Clock.fixed(now, ZoneOffset.UTC)
    private val service = UserManagementService(
        appUserRepo,
        delegationRepo,
        operationRepo,
        studentProfileRepo,
        auditRepo,
        registrationGateway,
        userProfileStore,
        ownershipService,
        eventPublisher,
        ObjectMapper(),
        clock,
    )

    @Test
    fun `removing student role clears lesson translation permission`() {
        val actorId = UUID.randomUUID()
        val student = AppUserEntity(
            id = UUID.randomUUID(),
            keycloakSubject = "student",
            roles = MetaData.Roles.STUDENT,
            createdAt = now,
            updatedAt = now,
        )
        val profile = StudentProfileEntity(
            id = UUID.randomUUID(),
            userId = student.id,
            lessonTranslationAllowed = true,
            createdAt = now,
            updatedAt = now,
        )
        val authentication = authentication("admin", MetaData.Authorities.ADMIN)
        `when`(userProfileStore.currentUserId(authentication)).thenReturn(actorId)
        `when`(appUserRepo.findByKeycloakSubject(student.keycloakSubject)).thenReturn(student)
        `when`(studentProfileRepo.findByUserId(student.id)).thenReturn(profile)
        `when`(appUserRepo.saveAndFlush(student)).thenReturn(student)
        `when`(delegationRepo.findActiveForStudent(student.id, now)).thenReturn(emptyList())

        service.updateRoles(
            authentication,
            student.keycloakSubject,
            UpdateUserRolesRequest(roles = setOf(MetaData.Roles.TEACHER)),
        )

        assertFalse(profile.lessonTranslationAllowed)
        verify(studentProfileRepo).save(profile)
        verify(registrationGateway).updateRoles(
            student.keycloakSubject,
            InternalUpdateRolesRequest(setOf(MetaData.Roles.TEACHER)),
        )
    }

    @Test
    fun `admin teacher can list users and request deletion of another account`() {
        val actorId = UUID.randomUUID()
        val actor = AppUserEntity(
            id = actorId,
            keycloakSubject = "maria",
            roles = "ADMIN,TEACHER",
            displayName = "Maria",
            createdAt = now,
            updatedAt = now,
        )
        val target = AppUserEntity(
            id = UUID.randomUUID(),
            keycloakSubject = "unused-student",
            roles = MetaData.Roles.STUDENT,
            displayName = "Unused student",
            createdAt = now,
            updatedAt = now,
        )
        val authentication = authentication("maria", MetaData.Authorities.ADMIN, MetaData.Authorities.TEACHER)
        `when`(userProfileStore.currentUserId(authentication)).thenReturn(actorId)
        `when`(appUserRepo.findAll()).thenReturn(listOf(actor, target))
        listOf(actor, target).forEach { user ->
            `when`(delegationRepo.findActiveForStudent(user.id, now)).thenReturn(emptyList())
            `when`(studentProfileRepo.findByUserId(user.id)).thenReturn(null)
        }
        `when`(operationRepo.findFirstByTargetSubjectOrderByCreatedAtDesc(target.keycloakSubject)).thenReturn(null)
        `when`(appUserRepo.findByKeycloakSubject(target.keycloakSubject)).thenReturn(target)
        `when`(operationRepo.saveAndFlush(any(UserDeletionOperationEntity::class.java))).thenAnswer { it.arguments[0] }

        val listed = service.list(authentication, null, null, "ACTIVE")
        val deletion = service.requestDeletion(authentication, target.keycloakSubject, null)

        assertEquals(setOf("maria", "unused-student"), listed.map { it.subject }.toSet())
        assertEquals("PENDING", deletion.status)
        assertEquals(target.keycloakSubject, deletion.targetSubject)
        verify(eventPublisher).publishEvent(any(UserDeletionRequestedEvent::class.java))
        verify(auditRepo).save(any())
    }

    @Test
    fun `admin teacher deletion request is idempotent`() {
        val authentication = authentication("maria", MetaData.Authorities.ADMIN, MetaData.Authorities.TEACHER)
        val existing = UserDeletionOperationEntity(
            id = UUID.randomUUID(),
            targetUserId = UUID.randomUUID(),
            targetSubject = "unused-student",
            requestedByUserId = UUID.randomUUID(),
            status = "RUNNING",
            createdAt = now,
            updatedAt = now,
        )
        `when`(operationRepo.findFirstByTargetSubjectOrderByCreatedAtDesc(existing.targetSubject)).thenReturn(existing)

        val first = service.requestDeletion(authentication, existing.targetSubject, null)
        val second = service.requestDeletion(authentication, existing.targetSubject, null)

        assertEquals(existing.id, first.operationId)
        assertEquals(existing.id, second.operationId)
        verify(operationRepo, times(2)).findFirstByTargetSubjectOrderByCreatedAtDesc(existing.targetSubject)
        verify(eventPublisher, times(0)).publishEvent(any())
    }

    @Test
    fun `protected deletion cases remain rejected for admin teacher`() {
        val actorId = UUID.randomUUID()
        val actor = AppUserEntity(
            id = actorId,
            keycloakSubject = "maria",
            roles = "ADMIN,TEACHER",
            createdAt = now,
            updatedAt = now,
        )
        val authentication = authentication("maria", MetaData.Authorities.ADMIN, MetaData.Authorities.TEACHER)
        `when`(userProfileStore.currentUserId(authentication)).thenReturn(actorId)
        `when`(operationRepo.findFirstByTargetSubjectOrderByCreatedAtDesc(actor.keycloakSubject)).thenReturn(null)
        `when`(appUserRepo.findByKeycloakSubject(actor.keycloakSubject)).thenReturn(actor)

        val selfDelete = assertFailsWith<ProjectResponseException> {
            service.requestDeletion(authentication, actor.keycloakSubject, null)
        }

        assertEquals(MetaData.ErrorCodes.USER_SELF_ADMIN_CHANGE_FORBIDDEN, selfDelete.errorCode)

        val lastAdmin = AppUserEntity(
            id = UUID.randomUUID(),
            keycloakSubject = "other-admin",
            roles = "ADMIN,TEACHER",
            createdAt = now,
            updatedAt = now,
        )
        `when`(operationRepo.findFirstByTargetSubjectOrderByCreatedAtDesc(lastAdmin.keycloakSubject)).thenReturn(null)
        `when`(appUserRepo.findByKeycloakSubject(lastAdmin.keycloakSubject)).thenReturn(lastAdmin)
        `when`(appUserRepo.countByRolesContainingAndDeletedAtIsNull(MetaData.Roles.ADMIN)).thenReturn(1)

        val lastAdminDelete = assertFailsWith<ProjectResponseException> {
            service.requestDeletion(authentication, lastAdmin.keycloakSubject, null)
        }

        assertEquals(MetaData.ErrorCodes.LAST_ADMIN_REQUIRED, lastAdminDelete.errorCode)
    }

    @Test
    fun `teacher deletion requires a valid different replacement when dependencies exist`() {
        val actorId = UUID.randomUUID()
        val target = AppUserEntity(
            id = UUID.randomUUID(),
            keycloakSubject = "departing-teacher",
            roles = MetaData.Roles.TEACHER,
            createdAt = now,
            updatedAt = now,
        )
        val authentication = authentication("maria", MetaData.Authorities.ADMIN, MetaData.Authorities.TEACHER)
        `when`(userProfileStore.currentUserId(authentication)).thenReturn(actorId)
        `when`(operationRepo.findFirstByTargetSubjectOrderByCreatedAtDesc(target.keycloakSubject)).thenReturn(null)
        `when`(appUserRepo.findByKeycloakSubject(target.keycloakSubject)).thenReturn(target)
        `when`(ownershipService.hasInProgressLesson(target.id)).thenReturn(true)
        `when`(ownershipService.hasTeacherDependencies(target.id)).thenReturn(true)

        val inProgressLesson = assertFailsWith<ProjectResponseException> {
            service.requestDeletion(authentication, target.keycloakSubject, null)
        }
        assertEquals(MetaData.ErrorCodes.USER_DELETE_IN_PROGRESS_LESSON, inProgressLesson.errorCode)

        `when`(ownershipService.hasInProgressLesson(target.id)).thenReturn(false)

        val missingReplacement = assertFailsWith<ProjectResponseException> {
            service.requestDeletion(authentication, target.keycloakSubject, null)
        }
        assertEquals(MetaData.ErrorCodes.USER_DELETE_REPLACEMENT_REQUIRED, missingReplacement.errorCode)

        val invalidReplacement = assertFailsWith<ProjectResponseException> {
            service.requestDeletion(authentication, target.keycloakSubject, target.keycloakSubject)
        }
        assertEquals(MetaData.ErrorCodes.DELEGATION_TEACHER_INVALID, invalidReplacement.errorCode)
        assertTrue(target.deletedAt == null)
    }

    private fun authentication(subject: String, vararg authorities: String): JwtAuthenticationToken {
        val jwt = Jwt.withTokenValue("token")
            .header("alg", "none")
            .subject(subject)
            .issuedAt(now.minusSeconds(5))
            .expiresAt(now.plusSeconds(3600))
            .build()
        return JwtAuthenticationToken(jwt, authorities.map(::SimpleGrantedAuthority))
    }
}
