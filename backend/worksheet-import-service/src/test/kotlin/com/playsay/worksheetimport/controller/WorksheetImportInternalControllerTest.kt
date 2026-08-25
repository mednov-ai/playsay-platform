package com.playsay.worksheetimport.controller

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.playsay.worksheetimport.config.WORKSHEET_SERVICE_TOKEN_HEADER
import com.playsay.worksheetimport.config.WorksheetImportProperties
import com.playsay.worksheetimport.config.WorksheetServiceTokenFilter
import com.playsay.worksheetimport.domain.WorksheetImportSession
import com.playsay.worksheetimport.domain.WorksheetImportStatus
import com.playsay.worksheetimport.domain.WorksheetReview
import com.playsay.worksheetimport.service.WorksheetImportSessionService
import com.playsay.worksheetimport.service.WorksheetMaterializationBundleService
import com.playsay.worksheetimport.service.WorksheetPacketIntake
import com.playsay.worksheetimport.service.WorksheetPacketNormalizer
import com.playsay.worksheetimport.service.WorksheetPagePreviewService
import com.playsay.worksheetimport.service.WorksheetRevisionConflictException
import com.playsay.worksheetimport.service.WorksheetSessionCleanupService
import com.playsay.worksheetimport.service.WorksheetSessionNotFoundException
import java.time.Instant
import java.util.UUID
import org.junit.jupiter.api.Test
import org.mockito.Mockito.mock
import org.mockito.Mockito.`when`
import org.springframework.http.MediaType
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.put
import org.springframework.test.web.servlet.setup.MockMvcBuilders

class WorksheetImportInternalControllerTest {
    private val properties = WorksheetImportProperties(enabled = true, serviceToken = "service-secret")
    private val sessions = mock(WorksheetImportSessionService::class.java)
    private val previews = mock(WorksheetPagePreviewService::class.java)
    private val cleanup = mock(WorksheetSessionCleanupService::class.java)
    private val materialization = mock(WorksheetMaterializationBundleService::class.java)
    private val mvc: MockMvc = MockMvcBuilders.standaloneSetup(
        WorksheetImportInternalController(
            properties,
            mock(WorksheetPacketIntake::class.java),
            mock(WorksheetPacketNormalizer::class.java),
            sessions,
            previews,
            cleanup,
            materialization,
        ),
    ).setControllerAdvice(WorksheetImportExceptionHandler())
        .addFilters<org.springframework.test.web.servlet.setup.StandaloneMockMvcBuilder>(WorksheetServiceTokenFilter(properties))
        .build()

    @Test
    fun `requires service credential while preserving the forwarded teacher identity`() {
        val id = UUID.randomUUID()
        val authentication = authentication("teacher-owner", "TEACHER")
        `when`(sessions.getAuthorized(id, authentication)).thenReturn(session(id, "teacher-owner"))

        mvc.get("/internal/worksheet-imports/$id") { principal = authentication }
            .andExpect { status { isUnauthorized() } }

        mvc.get("/internal/worksheet-imports/$id") {
            principal = authentication
            header(WORKSHEET_SERVICE_TOKEN_HEADER, "service-secret")
        }.andExpect {
            status { isOk() }
            jsonPath("$.ownerSubject") { doesNotExist() }
            jsonPath("$.id") { value(id.toString()) }
            jsonPath("$.status") { value("REVIEW_REQUIRED") }
        }
    }

    @Test
    fun `maps stale revisions and guessed private sessions to sanitized responses`() {
        val id = UUID.randomUUID()
        val authentication = authentication("teacher-owner", "TEACHER")
        val current = session(id, "teacher-owner")
        val staleReview = WorksheetReview(emptyList())
        `when`(sessions.getAuthorized(id, authentication)).thenReturn(current)
        `when`(sessions.replaceReview(id, 1L, staleReview))
            .thenThrow(WorksheetRevisionConflictException(2, WorksheetImportStatus.REVIEW_REQUIRED))

        mvc.put("/internal/worksheet-imports/$id/review") {
            principal = authentication
            header(WORKSHEET_SERVICE_TOKEN_HEADER, "service-secret")
            header("If-Match", 1)
            contentType = MediaType.APPLICATION_JSON
            content = jacksonObjectMapper().writeValueAsBytes(staleReview)
        }.andExpect {
            status { isConflict() }
            jsonPath("$.currentRevision") { value(2) }
            jsonPath("$.currentStatus") { value("REVIEW_REQUIRED") }
            jsonPath("$.review") { doesNotExist() }
        }

        val guessed = UUID.randomUUID()
        `when`(sessions.getAuthorized(guessed, authentication)).thenThrow(WorksheetSessionNotFoundException())
        mvc.get("/internal/worksheet-imports/$guessed") {
            principal = authentication
            header(WORKSHEET_SERVICE_TOKEN_HEADER, "service-secret")
        }.andExpect {
            status { isNotFound() }
            jsonPath("$.code") { value("WORKSHEET_IMPORT_NOT_FOUND") }
        }
    }

    private fun session(id: UUID, owner: String) = WorksheetImportSession(
        id = id,
        ownerSubject = owner,
        status = WorksheetImportStatus.REVIEW_REQUIRED,
        revision = 2,
        title = "Synthetic worksheet",
        language = "en",
        cefrLevel = "A1",
        sources = emptyList(),
        pages = emptyList(),
        createdAt = Instant.parse("2026-08-25T00:00:00Z"),
        updatedAt = Instant.parse("2026-08-25T00:00:01Z"),
        expiresAt = Instant.parse("2026-08-26T00:00:00Z"),
    )

    private fun authentication(subject: String, role: String): JwtAuthenticationToken {
        val jwt = Jwt.withTokenValue("forwarded-user-jwt")
            .header("alg", "none")
            .subject(subject)
            .issuedAt(Instant.parse("2026-08-25T00:00:00Z"))
            .expiresAt(Instant.parse("2026-08-26T00:00:00Z"))
            .build()
        return JwtAuthenticationToken(jwt, listOf(SimpleGrantedAuthority("ROLE_$role")))
    }
}
