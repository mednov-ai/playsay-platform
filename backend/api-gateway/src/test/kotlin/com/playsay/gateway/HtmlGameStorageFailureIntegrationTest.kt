package com.playsay.gateway

import com.playsay.gateway.controller.HtmlGameLibraryController
import com.playsay.gateway.service.MaterialObjectStorage
import com.playsay.gateway.error.ProjectResponseException
import java.util.UUID
import kotlin.test.*
import org.mockito.Mockito.*
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean
import org.springframework.jdbc.core.JdbcTemplate

class HtmlGameStorageFailureIntegrationTest : MaterialControllerTestFixture() {
    @Autowired private lateinit var games: HtmlGameLibraryController
    @MockitoSpyBean private lateinit var jdbc: JdbcTemplate
    @MockitoSpyBean private lateinit var objects: MaterialObjectStorage

    @Test
    fun `failed read after PUT rolls back visible game and removes staged object`() {
        val teacher = authentication(subject = "teacher-1", role = "ROLE_TEACHER")
        val before = jdbc.queryForObject("SELECT COUNT(*) FROM html_game", Long::class.java)
        val command = UUID.randomUUID()
        doThrow(IllegalStateException("synthetic object verification failure")).`when`(objects).getObject(anyString())
        try {
            val error = assertFailsWith<ProjectResponseException> { games.upload(teacher, htmlFile(), command) }
            assertEquals("GAME_STORAGE_UNAVAILABLE", error.errorCode)
            assertEquals(before, jdbc.queryForObject("SELECT COUNT(*) FROM html_game", Long::class.java))
            verify(objects, atLeastOnce()).deleteObject(anyString())
        } finally { reset(objects) }
        doAnswer { call -> (call.callRealMethod() as com.playsay.gateway.service.MaterialObjectContent).copy(bytes = "corrupted after PUT".toByteArray()) }.`when`(objects).getObject(anyString())
        try {
            assertEquals("GAME_CONTENT_INVALID", assertFailsWith<ProjectResponseException> { games.upload(teacher, htmlFile(), command) }.errorCode)
            assertEquals(before, jdbc.queryForObject("SELECT COUNT(*) FROM html_game", Long::class.java))
        } finally { reset(objects) }
        val saved = games.upload(teacher, htmlFile(), command).body!!
        assertEquals(saved.id, games.upload(teacher, htmlFile(), command).body!!.id)
        assertEquals(before!! + 1, jdbc.queryForObject("SELECT COUNT(*) FROM html_game", Long::class.java))
    }
    @Test
    fun `database command commit failure rolls back catalog revision and staged private object`() {
        val teacher = authentication(subject = "teacher-1", role = "ROLE_TEACHER")
        val before = jdbc.queryForObject("SELECT COUNT(*) FROM html_game", Long::class.java)
        val sql = "INSERT INTO html_game_command(command_key,payload_hash,game_id,revision_id) VALUES(?,?,?,?)"
        doThrow(IllegalStateException("synthetic database failure")).`when`(jdbc).update(eq(sql) ?: sql, anyString(), anyString(), any(), any())
        try {
            val failure = assertFailsWith<org.springframework.dao.InvalidDataAccessApiUsageException> { games.upload(teacher, htmlFile(), UUID.randomUUID()) }
            assertEquals("synthetic database failure", failure.mostSpecificCause.message)
            assertEquals(before, jdbc.queryForObject("SELECT COUNT(*) FROM html_game", Long::class.java))
            verify(objects, atLeastOnce()).deleteObject(anyString())
        } finally { reset(jdbc); clearInvocations(objects) }
    }

}
