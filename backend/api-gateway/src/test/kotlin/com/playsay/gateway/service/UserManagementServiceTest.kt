package com.playsay.gateway.service

import com.fasterxml.jackson.databind.ObjectMapper
import com.playsay.gateway.dto.RegistrationRolesRequest
import com.playsay.gateway.dto.UpdateUserRolesRequest
import com.playsay.gateway.entity.AppUserEntity
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
import kotlin.test.assertFalse
import org.mockito.Mockito.mock
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
            RegistrationRolesRequest(setOf(MetaData.Roles.TEACHER)),
        )
    }

    private fun authentication(subject: String, authority: String): JwtAuthenticationToken {
        val jwt = Jwt.withTokenValue("token")
            .header("alg", "none")
            .subject(subject)
            .issuedAt(now.minusSeconds(5))
            .expiresAt(now.plusSeconds(3600))
            .build()
        return JwtAuthenticationToken(jwt, listOf(SimpleGrantedAuthority(authority)))
    }
}
