package com.playsay.gateway.controller

import com.playsay.gateway.dto.WorksheetSourceAttachmentResponse
import com.playsay.gateway.service.MaterialSourceAttachmentService
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.security.SecurityRequirement
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.util.UUID
import org.springframework.http.HttpHeaders
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RestController

@RestController
class MaterialSourceAttachmentController(
    private val service: MaterialSourceAttachmentService,
) {
    @GetMapping("/materials/{materialId}/source-attachments", produces = [MediaType.APPLICATION_JSON_VALUE])
    @Operation(summary = "List teacher-only worksheet source attachments", security = [SecurityRequirement(name = "bearerAuth")])
    fun list(authentication: JwtAuthenticationToken, @PathVariable materialId: UUID): List<WorksheetSourceAttachmentResponse> =
        service.listAuthorized(authentication, materialId)

    @GetMapping("/materials/{materialId}/source-attachments/{attachmentId}/content")
    @Operation(summary = "Read a teacher-only worksheet source attachment", security = [SecurityRequirement(name = "bearerAuth")])
    fun content(
        authentication: JwtAuthenticationToken,
        @PathVariable materialId: UUID,
        @PathVariable attachmentId: UUID,
    ): ResponseEntity<ByteArray> {
        val content = service.contentAuthorized(authentication, materialId, attachmentId)
        val encoded = URLEncoder.encode(content.fileName, StandardCharsets.UTF_8).replace("+", "%20")
        return ResponseEntity.ok()
            .contentType(MediaType.parseMediaType(content.mimeType))
            .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename*=UTF-8''$encoded")
            .body(content.bytes)
    }
}
