package com.playsay.gateway.service

import com.playsay.gateway.dto.UpdateUserProfileRequest
import com.playsay.gateway.dto.UserProfileResponse
import com.playsay.gateway.entity.AppUserEntity
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.repo.AppUserRepo
import com.playsay.gateway.utils.MetaData
import java.time.Instant
import java.util.UUID
import org.springframework.http.HttpStatus
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional

@Component
class UserProfileStore(
    private val userRepo: AppUserRepo,
) {
    @Transactional
    fun current(authentication: JwtAuthenticationToken): UserProfileResponse {
        val identity = authentication.toIdentity()
        val profile = userRepo.findByKeycloakSubject(identity.subject)
            ?.also { existing -> updateIdentity(existing, identity) }
            ?: insertProfile(identity)

        return profile.toResponse()
    }

    @Transactional
    fun update(authentication: JwtAuthenticationToken, request: UpdateUserProfileRequest): UserProfileResponse {
        val identity = authentication.toIdentity()
        val profile = userRepo.findByKeycloakSubject(identity.subject) ?: insertProfile(identity)
        val updatedAt = Instant.now()

        profile.username = identity.username
        profile.email = identity.email
        profile.name = identity.name
        profile.roles = identity.roles.toStoredRoles()
        profile.displayName = clean(request.displayName, 120)
        profile.locale = clean(request.locale, 16)
        profile.countryCode = cleanCountryCode(request.countryCode) ?: defaultCountryCode
        profile.timezone = clean(request.timezone, 64)
        profile.learningGoal = clean(request.learningGoal, 500)
        profile.updatedAt = updatedAt

        return saveProfile(profile).toResponse()
    }

    @Transactional
    fun deleteCurrent(authentication: JwtAuthenticationToken) {
        val identity = authentication.toIdentity()
        val profile = userRepo.findByKeycloakSubject(identity.subject) ?: return

        profile.username = identity.username
        profile.email = identity.email
        profile.name = identity.name
        profile.roles = identity.roles.toStoredRoles()
        profile.displayName = identity.defaultDisplayName()
        profile.locale = null
        profile.countryCode = defaultCountryCode
        profile.timezone = null
        profile.learningGoal = null
        profile.updatedAt = Instant.now()

        saveProfile(profile)
    }

    @Transactional(readOnly = true)
    fun list(): List<UserProfileResponse> =
        userRepo.findAllOrdered()
            .map { profile -> profile.toResponse() }

    @Transactional(readOnly = true)
    fun listStudents(): List<UserProfileResponse> =
        userRepo.findByRoleOrdered(MetaData.Roles.STUDENT)
            .map { profile -> profile.toResponse() }

    @Transactional
    fun currentUserId(authentication: JwtAuthenticationToken): UUID {
        val identity = authentication.toIdentity()
        val existing = userRepo.findByKeycloakSubject(identity.subject)
        if (existing == null) {
            return insertProfile(identity).id
        }

        updateIdentity(existing, identity)
        return existing.id
    }

    private fun clean(value: String?, maxLength: Int): String? {
        val cleaned = value?.trim()?.takeIf { it.isNotEmpty() }
        if (cleaned != null && cleaned.length > maxLength) {
            throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.FIELD_TOO_LONG, "profile field", maxLength)
        }
        return cleaned
    }

    private fun cleanCountryCode(value: String?): String? {
        val cleaned = value?.trim()?.uppercase()?.takeIf { it.isNotEmpty() } ?: return null
        if (!countryCodePattern.matches(cleaned)) {
            throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.INVALID_COUNTRY_CODE)
        }
        return cleaned
    }

    private fun insertProfile(identity: CurrentIdentity): AppUserEntity {
        val now = Instant.now()
        val profile = AppUserEntity(
            id = UUID.randomUUID(),
            keycloakSubject = identity.subject,
            username = identity.username,
            email = identity.email,
            name = identity.name,
            roles = identity.roles.toStoredRoles(),
            displayName = identity.defaultDisplayName(),
            locale = null,
            countryCode = defaultCountryCode,
            timezone = null,
            learningGoal = null,
            createdAt = now,
            updatedAt = now,
        )

        return saveProfile(profile)
    }

    private fun updateIdentity(profile: AppUserEntity, identity: CurrentIdentity) {
        profile.username = identity.username
        profile.email = identity.email
        profile.name = identity.name
        profile.roles = identity.roles.toStoredRoles()

        saveProfile(profile)
    }

    private fun saveProfile(profile: AppUserEntity): AppUserEntity =
        // Other stores still write through legacy SQL during this migration, so FK users must be visible immediately.
        userRepo.saveAndFlush(profile)
}

private data class CurrentIdentity(
    val subject: String,
    val username: String?,
    val email: String?,
    val name: String?,
    val roles: List<String>,
)

private fun JwtAuthenticationToken.toIdentity(): CurrentIdentity =
    CurrentIdentity(
        subject = token.subject,
        username = token.getClaimAsString("preferred_username"),
        email = token.getClaimAsString("email"),
        name = token.getClaimAsString("name"),
        roles = applicationRoles(),
    )

private fun JwtAuthenticationToken.applicationRoles(): List<String> =
    authorities
        .mapNotNull { authority -> authority.authority }
        .filter { authority -> authority.startsWith(MetaData.Authorities.PREFIX) }
        .map { authority -> authority.removePrefix(MetaData.Authorities.PREFIX) }
        .sorted()

private fun AppUserEntity.toResponse(): UserProfileResponse =
    UserProfileResponse(
        subject = keycloakSubject,
        username = username,
        email = email,
        name = name,
        roles = roles.toApplicationRoles(),
        displayName = displayName,
        locale = locale,
        countryCode = countryCode,
        timezone = timezone,
        learningGoal = learningGoal,
        updatedAt = updatedAt,
    )

private fun CurrentIdentity.defaultDisplayName(): String? =
    name ?: username

private fun List<String>.toStoredRoles(): String =
    joinToString(",")

private fun String?.toApplicationRoles(): List<String> =
    this
        ?.split(",")
        ?.mapNotNull { role -> role.trim().takeIf { it.isNotEmpty() } }
        ?.sorted()
        ?: emptyList()

private const val defaultCountryCode = "RU"
private val countryCodePattern = Regex("^[A-Z]{2}$")
