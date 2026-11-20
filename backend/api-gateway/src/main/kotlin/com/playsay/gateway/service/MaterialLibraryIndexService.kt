package com.playsay.gateway.service

import com.playsay.gateway.dto.MaterialLibraryPageResponse
import com.playsay.gateway.dto.MaterialLibraryQuery
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.repo.AppUserRepo
import com.playsay.gateway.repo.LibraryViewer
import com.playsay.gateway.repo.MaterialLibraryPageRepo
import com.playsay.gateway.utils.MetaData
import com.playsay.gateway.utils.requireSubject
import com.playsay.gateway.utils.toApplicationRoles
import java.time.Clock
import org.springframework.http.HttpStatus
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Isolation
import org.springframework.transaction.annotation.Transactional

@Service
class MaterialLibraryIndexService(
    private val pages: MaterialLibraryPageRepo,
    private val profiles: UserProfileStore,
    private val users: AppUserRepo,
    private val clock: Clock,
) {
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    fun list(authentication: JwtAuthenticationToken, query: MaterialLibraryQuery): MaterialLibraryPageResponse {
        validate(query)
        val admin = authentication.authorities.any { it.authority == MetaData.Authorities.ADMIN }
        val teacher = authentication.authorities.any { it.authority == MetaData.Authorities.TEACHER }
        if (query.kind != "LESSON_WHITEBOARD" && teacher && !admin) profiles.currentUserId(authentication)
        val actor = users.findByKeycloakSubject(authentication.token.requireSubject())
        val roles = actor?.roles.toApplicationRoles()
        val viewer = LibraryViewer(actor?.id, admin, teacher, admin && "ADMIN" in roles, teacher && "TEACHER" in roles)
        return pages.list(viewer, query, clock.instant())
    }

    private fun validate(query: MaterialLibraryQuery) {
        if (query.category !in setOf("STUDY", "LESSON", "ALL") || query.kind !in setOf(null, "MATERIAL", "LESSON_WHITEBOARD") ||
            query.offset < 0 || query.limit !in 1..200 || query.query.orEmpty().length > 200) {
            throw ProjectResponseException.localized(HttpStatus.BAD_REQUEST, MetaData.ErrorCodes.COLLABORATION_SCOPE_INVALID)
        }
    }
}
