package com.playsay.gateway.service
import com.playsay.gateway.client.RegistrationGateway

import com.playsay.gateway.dto.ManagedStudentRequest
import com.playsay.gateway.dto.UpdateUserProfileRequest
import com.playsay.gateway.dto.UserProfileResponse
import com.playsay.gateway.dto.ConnectionRoutePreference
import com.playsay.gateway.dto.UpdateConnectionRoutePreferenceRequest
import com.playsay.gateway.entity.AppUserEntity
import com.playsay.gateway.entity.StudentProfileEntity
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.repo.AppUserRepo
import com.playsay.gateway.repo.AppUserIdentityRepository
import com.playsay.gateway.repo.StudentProfileRepo
import com.playsay.gateway.repo.TeacherDelegationRepo
import com.playsay.gateway.utils.MetaData
import com.playsay.gateway.utils.toApplicationRoles
import com.playsay.gateway.utils.toStoredRoles
import java.time.Instant
import java.time.LocalDate
import java.time.Clock
import java.util.UUID
import org.springframework.http.HttpStatus
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional

@Component
class UserProfileStore(
    private val userRepo: AppUserRepo,
    private val identityRepository: AppUserIdentityRepository,
    private val studentProfileRepo: StudentProfileRepo,
    private val registrationGateway: RegistrationGateway,
    private val delegationRepo: TeacherDelegationRepo,
    private val clock: Clock = Clock.systemUTC(),
) {
    @Transactional
    fun current(authentication: JwtAuthenticationToken): UserProfileResponse {
        val identity = authentication.toIdentity()
        val profile = userRepo.findByKeycloakSubject(identity.subject)
            ?.also { existing -> updateIdentity(existing, identity) }
            ?: insertProfile(identity)

        if (profile.deletedAt != null) {
            throw ProjectResponseException.localized(HttpStatus.FORBIDDEN, MetaData.ErrorCodes.USER_DELETED)
        }

        return profile.toResponse(studentProfileRepo.findByUserId(profile.id))
    }

    @Transactional
    fun update(authentication: JwtAuthenticationToken, request: UpdateUserProfileRequest): UserProfileResponse {
        val identity = authentication.toIdentity()
        val profile = userRepo.findByKeycloakSubject(identity.subject) ?: insertProfile(identity)
        val updatedAt = Instant.now()

        profile.username = identity.username
        profile.email = identity.email
        profile.name = identity.name
        updateRolesFromToken(profile, identity)
        profile.displayName = clean(request.displayName, 120)
        profile.locale = clean(request.locale, 16)
        profile.countryCode = cleanCountryCode(request.countryCode) ?: defaultCountryCode
        profile.timezone = clean(request.timezone, 64)
        profile.learningGoal = clean(request.learningGoal, 500)
        request.connectionRoutePreference?.also { preference ->
            profile.connectionRoutePreference = preference.name
        }
        profile.updatedAt = updatedAt

        val studentProfile = updateBirthDate(profile, request.birthDate, updatedAt)

        return saveProfile(profile).toResponse(studentProfile)
    }

    @Transactional
    fun deleteCurrent(authentication: JwtAuthenticationToken) {
        val identity = authentication.toIdentity()
        val profile = userRepo.findByKeycloakSubject(identity.subject) ?: return

        profile.username = identity.username
        profile.email = identity.email
        profile.name = identity.name
        updateRolesFromToken(profile, identity)
        profile.displayName = identity.defaultDisplayName()
        profile.locale = null
        profile.countryCode = defaultCountryCode
        profile.timezone = null
        profile.learningGoal = null
        profile.connectionRoutePreference = ConnectionRoutePreference.AUTO.name
        profile.updatedAt = Instant.now()

        studentProfileRepo.findByUserId(profile.id)?.also { student ->
            student.birthDate = null
            student.updatedAt = profile.updatedAt
            studentProfileRepo.save(student)
        }

        saveProfile(profile)
    }

    @Transactional(readOnly = true)
    fun list(authentication: JwtAuthenticationToken): List<UserProfileResponse> {
        requireAdmin(authentication)
        return listProfiles()
    }

    @Transactional(readOnly = true)
    fun listStudents(authentication: JwtAuthenticationToken): List<UserProfileResponse> {
        requireTeacherOrAdmin(authentication)
        if (authentication.authorities.any { it.authority == MetaData.Authorities.ADMIN }) {
            return listStudentProfiles()
        }
        val actorId = currentUserId(authentication)
        val studentIds = appUserIdsVisibleToTeacher(actorId)
        val profiles = userRepo.findByIdIn(studentIds)
        val studentsByUserId = studentProfileRepo.findByUserIdIn(studentIds).associateBy { it.userId }
        return profiles.map { profile -> profile.toResponse(studentsByUserId[profile.id]) }
    }

    @Transactional
    fun updateStudentConnectionRoutePreference(
        authentication: JwtAuthenticationToken,
        subject: String,
        request: UpdateConnectionRoutePreferenceRequest,
    ): UserProfileResponse {
        requireTeacherOrAdmin(authentication)
        val target = userRepo.findByKeycloakSubject(subject)
            ?.takeIf { profile -> MetaData.Roles.STUDENT in profile.roles.toApplicationRoles() }
            ?: throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.USER_NOT_FOUND)
        if (authentication.authorities.none { it.authority == MetaData.Authorities.ADMIN }) {
            val actorId = currentUserId(authentication)
            if (target.id !in appUserIdsVisibleToTeacher(actorId)) {
                throw ProjectResponseException.localized(HttpStatus.NOT_FOUND, MetaData.ErrorCodes.USER_NOT_FOUND)
            }
        }
        target.connectionRoutePreference = request.connectionRoutePreference.name
        target.updatedAt = Instant.now(clock)
        return saveProfile(target).toResponse(studentProfileRepo.findByUserId(target.id))
    }

    @Transactional
    fun createManagedStudent(authentication: JwtAuthenticationToken, request: ManagedStudentRequest): UserProfileResponse {
        requireTeacherOrAdmin(authentication)
        val teacherUserId = currentUserId(authentication)
        val provisioned = registrationGateway.createManagedStudent(request)
        val now = Instant.now()
        val existing = userRepo.findByKeycloakSubject(provisioned.subject)
        val profile = existing ?: AppUserEntity(
            id = UUID.randomUUID(),
            keycloakSubject = provisioned.subject,
            createdAt = now,
        )

        profile.username = provisioned.username
        profile.email = provisioned.email
        profile.name = provisioned.displayName
        profile.roles = MetaData.Roles.STUDENT
        profile.displayName = clean(provisioned.displayName, 120)
        profile.countryCode = profile.countryCode ?: defaultCountryCode
        val actorIsTeacher = authentication.authorities.any { it.authority == MetaData.Authorities.TEACHER }
        profile.managedByTeacher = actorIsTeacher
        profile.managedByTeacherUserId = teacherUserId.takeIf { actorIsTeacher }
        profile.updatedAt = now

        return saveProfile(profile).toResponse()
    }

    private fun listProfiles(): List<UserProfileResponse> =
        userRepo.findAllOrdered().let { profiles ->
            val studentsByUserId = studentProfileRepo.findByUserIdIn(profiles.map { it.id }).associateBy { it.userId }
            profiles.map { profile -> profile.toResponse(studentsByUserId[profile.id]) }
        }

    private fun listStudentProfiles(): List<UserProfileResponse> =
        userRepo.findByRoleOrdered(MetaData.Roles.STUDENT).let { profiles ->
            val studentsByUserId = studentProfileRepo.findByUserIdIn(profiles.map { it.id }).associateBy { it.userId }
            profiles.map { profile -> profile.toResponse(studentsByUserId[profile.id]) }
        }

    private fun appUserIdsVisibleToTeacher(teacherUserId: UUID): List<UUID> =
        (
            userRepo.findByManagedByTeacherUserIdOrderByDisplayNameAscUsernameAsc(teacherUserId).map(AppUserEntity::id) +
                delegationRepo.findActiveStudentIds(teacherUserId, Instant.now(clock))
            ).distinct()

    fun currentUserId(authentication: JwtAuthenticationToken): UUID {
        val identity = authentication.toIdentity()
        return identityRepository.upsert(
            id = UUID.randomUUID(),
            subject = identity.subject,
            username = identity.username,
            email = identity.email,
            name = identity.name,
            roles = identity.roles.toStoredRoles(),
            displayName = identity.defaultDisplayName(),
            issuedAt = identity.issuedAt,
            now = Instant.now(clock),
        )
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
        updateRolesFromToken(profile, identity)

        saveProfile(profile)
    }

    private fun updateRolesFromToken(profile: AppUserEntity, identity: CurrentIdentity) {
        val rolesChangedAt = profile.rolesChangedAt
        if (rolesChangedAt == null || !identity.issuedAt.isBefore(rolesChangedAt)) {
            profile.roles = identity.roles.toStoredRoles()
            profile.rolesChangedAt = null
        }
    }

    private fun saveProfile(profile: AppUserEntity): AppUserEntity =
        // Other stores still write through legacy SQL during this migration, so FK users must be visible immediately.
        userRepo.saveAndFlush(profile)

    private fun updateBirthDate(profile: AppUserEntity, birthDate: LocalDate?, updatedAt: Instant): StudentProfileEntity? {
        if (MetaData.Roles.STUDENT !in profile.roles.toApplicationRoles()) {
            return null
        }
        val today = LocalDate.now()
        if (birthDate != null && (!birthDate.isBefore(today) || birthDate.isBefore(today.minusYears(120)))) {
            throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.INVALID_BIRTH_DATE)
        }
        val student = studentProfileRepo.findByUserId(profile.id) ?: StudentProfileEntity(
            id = UUID.randomUUID(),
            userId = profile.id,
            createdAt = updatedAt,
        )
        student.birthDate = birthDate
        student.updatedAt = updatedAt
        return studentProfileRepo.save(student)
    }

    private fun requireAdmin(authentication: JwtAuthenticationToken) {
        if (authentication.authorities.none { authority -> authority.authority == MetaData.Authorities.ADMIN }) {
            throw ProjectResponseException.localized(HttpStatus.FORBIDDEN, MetaData.ErrorCodes.ADMIN_ROLE_REQUIRED)
        }
    }

    private fun requireTeacherOrAdmin(authentication: JwtAuthenticationToken) {
        if (authentication.authorities.none { authority ->
            authority.authority == MetaData.Authorities.TEACHER || authority.authority == MetaData.Authorities.ADMIN
        }) {
            throw ProjectResponseException.localized(
                HttpStatus.FORBIDDEN,
                MetaData.ErrorCodes.TEACHER_OR_ADMIN_ROLE_REQUIRED,
            )
        }
    }
}

private data class CurrentIdentity(
    val subject: String,
    val username: String?,
    val email: String?,
    val name: String?,
    val roles: List<String>,
    val issuedAt: Instant,
)

private fun JwtAuthenticationToken.toIdentity(): CurrentIdentity =
    CurrentIdentity(
        subject = token.subject,
        username = token.getClaimAsString("preferred_username"),
        email = token.getClaimAsString("email"),
        name = token.getClaimAsString("name"),
        roles = applicationRoles(),
        issuedAt = token.issuedAt ?: Instant.EPOCH,
    )

private fun JwtAuthenticationToken.applicationRoles(): List<String> =
    authorities
        .mapNotNull { authority -> authority.authority }
        .filter { authority -> authority.startsWith(MetaData.Authorities.PREFIX) }
        .map { authority -> authority.removePrefix(MetaData.Authorities.PREFIX) }
        .sorted()

private fun AppUserEntity.toResponse(studentProfile: StudentProfileEntity? = null): UserProfileResponse =
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
        connectionRoutePreference = runCatching { ConnectionRoutePreference.valueOf(connectionRoutePreference) }
            .getOrDefault(ConnectionRoutePreference.AUTO),
        updatedAt = updatedAt,
        managedByTeacher = managedByTeacher,
        birthDate = studentProfile?.birthDate,
        lessonTranslationAllowed = studentProfile?.lessonTranslationAllowed ?: false,
    )

private fun CurrentIdentity.defaultDisplayName(): String? =
    name ?: username

private const val defaultCountryCode = "RU"
private val countryCodePattern = Regex("^[A-Z]{2}$")
