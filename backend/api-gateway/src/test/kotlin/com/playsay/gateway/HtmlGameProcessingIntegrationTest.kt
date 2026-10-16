package com.playsay.gateway

import com.playsay.gateway.controller.HtmlGameLibraryController
import com.playsay.gateway.dto.*
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.service.game.HtmlGameProcessingService
import com.playsay.gateway.client.MaterialGameAdapterClient
import com.playsay.gateway.client.GameAdapterResult
import java.util.UUID
import java.security.MessageDigest
import kotlin.test.*
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.mockito.Mockito.`when`

class HtmlGameProcessingIntegrationTest : MaterialControllerTestFixture() {
    @Autowired private lateinit var games: HtmlGameLibraryController
    @Autowired private lateinit var processing: HtmlGameProcessingService
    @MockitoBean private lateinit var images: com.playsay.gateway.service.MaterialImageGenerationService
    @MockitoBean private lateinit var adapter: MaterialGameAdapterClient

    @Test
    fun `revision bound candidate requires current trust and review and rollback preserves both byte variants`() {
        val teacher = authentication(subject = "teacher-1", role = "ROLE_TEACHER")
        val original = "<html><body><button>Source</button></body></html>"
        val adapted = """<html><head><script type="application/playsay-game+json">{"protocol":"playsay-game-sync/v1","gameId":"test","stateVersion":"1","reducerVersion":"1","buildHash":"test"}</script></head><body><button>Adapted</button></body></html>"""
        val game = games.upload(teacher, htmlFile(content = original), UUID.randomUUID()).body!!
        val hash = MessageDigest.getInstance("SHA-256").digest(original.toByteArray()).joinToString("") { "%02x".format(it) }
        `when`(adapter.adapt(original)).thenReturn(GameAdapterResult(adapted, "Report", "test", "test", hash, "mechanics-v3", true, "{}"))
        val request = HtmlGameProcessingRequest(game.revisionId, UUID.randomUUID(), "ADAPT")
        val job = games.process(teacher, game.id, request)
        assertEquals(job.id, games.process(teacher, game.id, request).id)
        assertFailsWith<ProjectResponseException> { games.applyCandidate(teacher, game.id, job.id, game.version) }
        processing.poll()
        repeat(200) { if (games.processingStatus(teacher, game.id, job.id).status == "RUNNING") Thread.sleep(10) }
        assertEquals("READY_FOR_REVIEW", games.processingStatus(teacher, game.id, job.id).status)
        assertEquals(game.revisionId, games.get(teacher, game.id, null).revisionId)
        assertEquals(adapted, String(games.candidate(teacher, game.id, job.id).body!!))
        val applied = games.applyCandidate(teacher, game.id, job.id, game.version)
        assertNotEquals(game.revisionId, applied.revisionId)
        assertEquals(applied.revisionId, games.applyCandidate(teacher, game.id, job.id, game.version).revisionId)
        assertEquals(original, String(games.content(teacher, game.id, game.revisionId, null).body!!))
        val rolled = games.selectRevision(teacher, game.id, HtmlGameRevisionSelection(game.revisionId, applied.version))
        assertEquals(game.revisionId, rolled.revisionId)
        assertEquals(adapted, String(games.content(teacher, game.id, applied.revisionId, null).body!!))
    }

    @Test
    fun `invalid adapter trust never becomes playable`() {
        val teacher = authentication(subject = "teacher-1", role = "ROLE_TEACHER")
        val html = "<html><body><button>Untrusted</button></body></html>"
        val game = games.upload(teacher, htmlFile(content = html), UUID.randomUUID()).body!!
        `when`(adapter.adapt(html)).thenReturn(GameAdapterResult(html, "", "test", "", "wrong", "old", false, "{}"))
        val job = games.process(teacher, game.id, HtmlGameProcessingRequest(game.revisionId, UUID.randomUUID(), "ADAPT"))
        processing.poll()
        repeat(200) { if (games.processingStatus(teacher, game.id, job.id).status == "RUNNING") Thread.sleep(10) }
        assertEquals("FAILED", games.processingStatus(teacher, game.id, job.id).status)
        assertFailsWith<ProjectResponseException> { games.applyCandidate(teacher, game.id, job.id, game.version) }
        assertEquals(game.revisionId, games.get(teacher, game.id, null).revisionId)
        assertEquals(html, String(games.content(teacher, game.id, game.revisionId, null).body!!))
    }
    @Test
    fun `cover generation failure keeps original bytes and fallback catalog card available`() {
        val teacher = authentication(subject = "teacher-1", role = "ROLE_TEACHER")
        val game = games.upload(teacher, htmlFile(), UUID.randomUUID()).body!!
        org.mockito.Mockito.doThrow(IllegalStateException("synthetic cover failure")).`when`(images).generate(org.mockito.ArgumentMatchers.any<com.playsay.gateway.service.MaterialImageGenerationInput>() ?: com.playsay.gateway.service.MaterialImageGenerationInput(prompt = "", alt = ""))
        // A failed image result is still an enrichment failure; it never changes playable bytes.
        val job = games.process(teacher, game.id, HtmlGameProcessingRequest(game.revisionId, UUID.randomUUID(), "ENRICH"))
        processing.poll()
        repeat(200) { if (games.processingStatus(teacher, game.id, job.id).status == "RUNNING") Thread.sleep(10) }
        assertEquals("FAILED", games.processingStatus(teacher, game.id, job.id).status)
        assertEquals(game.revisionId, games.get(teacher, game.id, null).revisionId)
        assertFalse(games.get(teacher, game.id, null).hasCover)
        assertTrue(games.content(teacher, game.id, game.revisionId, null).body!!.isNotEmpty())
    }

}
