package com.playsay.gateway.service

import com.playsay.gateway.entity.MaterialSourceAttachmentEntity
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.repo.LessonMaterialRepo
import com.playsay.gateway.repo.LessonMaterialRow
import com.playsay.gateway.repo.MaterialSourceAttachmentRepository
import java.nio.file.Files
import java.time.Instant
import java.util.UUID
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.mockito.Mockito.mock
import org.mockito.Mockito.`when`
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken

class MaterialSourceAttachmentServiceTest {
    private val attachments = mock(MaterialSourceAttachmentRepository::class.java)
    private val materials = mock(LessonMaterialRepo::class.java)
    private val storage = InMemoryMaterialObjectStorage()
    private val service = MaterialSourceAttachmentService(attachments, materials, storage)
    private val materialId = UUID.randomUUID()
    private val attachment = MaterialSourceAttachmentEntity(
        id = UUID.randomUUID(), materialId = materialId, importSessionId = UUID.randomUUID(), sourceId = UUID.randomUUID(),
        kind = "ORIGINAL_SOURCE", fileName = "source.pdf", mimeType = "application/pdf", byteSize = 3,
        checksumSha256 = "a".repeat(64), storageKey = "private-source", metadata = "{}", createdAt = Instant.EPOCH,
    )

    @Test
    fun `owner teacher and admin can read original provenance`() {
        `when`(materials.findRowById(materialId)).thenReturn(row("teacher-a"))
        `when`(attachments.findByIdAndMaterialId(attachment.id, materialId)).thenReturn(attachment)
        val path = Files.createTempFile("source-attachment-", ".pdf").also { Files.write(it, byteArrayOf(1, 2, 3)) }
        storage.putObject("private-source", Files.readAllBytes(path), "application/pdf")

        assertContentEquals(byteArrayOf(1, 2, 3), service.contentAuthorized(auth("teacher-a", "TEACHER"), materialId, attachment.id).bytes)
        assertContentEquals(byteArrayOf(1, 2, 3), service.contentAuthorized(auth("admin", "ADMIN"), materialId, attachment.id).bytes)
        Files.deleteIfExists(path)
    }

    @Test
    fun `student unrelated teacher guessed id and missing id share not found outcome`() {
        `when`(materials.findRowById(materialId)).thenReturn(row("teacher-a"))
        listOf(auth("teacher-a", "STUDENT"), auth("teacher-b", "TEACHER")).forEach { authentication ->
            val exception = assertThrows<ProjectResponseException> { service.contentAuthorized(authentication, materialId, attachment.id) }
            assertEquals(404, exception.statusCode.value())
        }
        val missing = UUID.randomUUID()
        `when`(materials.findRowById(missing)).thenReturn(null)
        val missingException = assertThrows<ProjectResponseException> { service.contentAuthorized(auth("teacher-b", "TEACHER"), missing, attachment.id) }
        assertEquals(404, missingException.statusCode.value())
    }

    private fun row(owner: String) = LessonMaterialRow(
        id = materialId, ownerTeacherUserId = UUID.randomUUID(), ownerTeacherSubject = owner, ownerTeacherName = "Teacher",
        title = "Worksheet", description = null, language = "en", cefrLevel = "A1", visibility = "PRIVATE", status = "DRAFT",
        document = "{}", sourceMeta = "{}", scoringRubric = "{}", topicTags = "[]", skillTags = "[]", ageBand = null,
        estimatedDurationMin = null, createdAt = Instant.EPOCH, updatedAt = Instant.EPOCH,
    )

    private fun auth(subject: String, role: String): JwtAuthenticationToken {
        val jwt = Jwt.withTokenValue("test").header("alg", "none").subject(subject).issuedAt(Instant.EPOCH).expiresAt(Instant.MAX).build()
        return JwtAuthenticationToken(jwt, listOf(SimpleGrantedAuthority("ROLE_$role")))
    }
}
