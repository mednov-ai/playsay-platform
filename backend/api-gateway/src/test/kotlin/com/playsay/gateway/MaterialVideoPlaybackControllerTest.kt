package com.playsay.gateway

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.playsay.gateway.controller.MaterialCrudController
import com.playsay.gateway.controller.MaterialVideoPlaybackController
import com.playsay.gateway.dto.LessonMaterialRequest
import com.playsay.gateway.dto.LessonMaterialResponse
import com.playsay.gateway.dto.MaterialVideoPlaybackRequest
import com.playsay.gateway.dto.UpdateUserProfileRequest
import com.playsay.gateway.entity.AssignmentEntity
import com.playsay.gateway.entity.AssignmentRecipientEntity
import com.playsay.gateway.repo.AssignmentRecipientRepo
import com.playsay.gateway.repo.AssignmentRepo
import com.playsay.gateway.repo.LessonMaterialRepo
import com.playsay.gateway.repo.AppUserRepo
import com.playsay.gateway.service.UserProfileStore
import com.playsay.gateway.utils.MetaData
import java.nio.file.Files
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.io.path.writeText
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.TestInstance
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.http.HttpStatus
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.web.server.ResponseStatusException
import javax.sql.DataSource
import liquibase.integration.spring.SpringLiquibase

@SpringBootTest(
    properties = [
        "spring.datasource.url=jdbc:h2:mem:material-video-playback;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.liquibase.enabled=true",
        "playsay.video.youtube.rf-relay.enabled=true",
        "playsay.video.youtube.rf-relay.geo-country-header=X-PlaySay-Geo-Country",
    ],
)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class MaterialVideoPlaybackControllerTest @Autowired constructor(
    private val materialCrudController: MaterialCrudController,
    private val materialVideoPlaybackController: MaterialVideoPlaybackController,
    private val userProfileStore: UserProfileStore,
    private val assignmentRepo: AssignmentRepo,
    private val assignmentRecipientRepo: AssignmentRecipientRepo,
    private val lessonMaterialRepo: LessonMaterialRepo,
    private val appUserRepo: AppUserRepo,
    private val dataSource: DataSource,
) {
    private val objectMapper = jacksonObjectMapper()

    companion object {
        private val ytdlp = Files.createTempFile("playsay-youtube-metadata", ".sh").apply {
            writeText(
                """
                #!/usr/bin/env sh
                printf '%s\n' '5l-fo-d0gt8'
                printf '%s\n' '105'
                printf '%s\n' 'en'
                """.trimIndent(),
            )
            toFile().setExecutable(true)
        }

        @JvmStatic
        @DynamicPropertySource
        fun youtubeMetadataProperties(registry: DynamicPropertyRegistry) {
            registry.add("playsay.video.youtube.rf-relay.ytdlp-path") { ytdlp.toString() }
        }
    }

    @BeforeAll
    fun migrateDatabase() {
        SpringLiquibase().apply {
            this.dataSource = this@MaterialVideoPlaybackControllerTest.dataSource
            changeLog = "classpath:db/changelog/db.changelog-master.xml"
        }.afterPropertiesSet()
    }

    @BeforeEach
    fun cleanDatabase() {
        assignmentRecipientRepo.deleteAllInBatch()
        assignmentRepo.deleteAllInBatch()
        lessonMaterialRepo.deleteAllInBatch()
        appUserRepo.deleteAllInBatch()
    }

    @Test
    fun `returns rf relay session only when profile and ip are both ru`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        userProfileStore.update(teacher, UpdateUserProfileRequest(countryCode = "RU"))
        val material = createYoutubeMaterial(teacher)

        val response = materialVideoPlaybackController.playback(
            teacher,
            material.id,
            MaterialVideoPlaybackRequest(blockId = "video-1"),
            requestWithCountry("RU"),
        )

        assertEquals("RF_RELAY", response.mode)
        assertEquals("5l-fo-d0gt8", response.videoId)
        assertNotNull(response.sessionId)
        assertNotNull(response.relayUrl)
        assertNull(response.reason)
    }

    @Test
    fun `falls back to embed when profile and ip countries conflict`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        userProfileStore.update(teacher, UpdateUserProfileRequest(countryCode = "RU"))
        val material = createYoutubeMaterial(teacher)

        val response = materialVideoPlaybackController.playback(
            teacher,
            material.id,
            MaterialVideoPlaybackRequest(blockId = "video-1"),
            requestWithCountry("NL"),
        )

        assertEquals("EMBED", response.mode)
        assertEquals("PROFILE_IP_COUNTRY_MISMATCH", response.reason)
        assertEquals("https://www.youtube-nocookie.com/embed/5l-fo-d0gt8?rel=0", response.embedUrl)
        assertNull(response.relayUrl)
    }

    @Test
    fun `returns needs review when youtube metadata does not pass policy`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        userProfileStore.update(teacher, UpdateUserProfileRequest(countryCode = "RU"))
        val material = createYoutubeMaterial(teacher, durationSeconds = 421)

        val response = materialVideoPlaybackController.playback(
            teacher,
            material.id,
            MaterialVideoPlaybackRequest(blockId = "video-1"),
            requestWithCountry("RU"),
        )

        assertEquals("NEEDS_REVIEW", response.mode)
        assertEquals("YOUTUBE_DURATION_TOO_LONG", response.reason)
        assertNull(response.relayUrl)
    }

    @Test
    fun `resolves missing youtube metadata on demand before relay decision`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        userProfileStore.update(teacher, UpdateUserProfileRequest(countryCode = "RU"))
        val material = createYoutubeMaterial(
            teacher,
            includeVideoMeta = false,
            url = "https://youtu.be/5l-fo-d0gt8?si=abc",
        )

        val response = materialVideoPlaybackController.playback(
            teacher,
            material.id,
            MaterialVideoPlaybackRequest(blockId = "video-1"),
            requestWithCountry("RU"),
        )

        assertEquals("RF_RELAY", response.mode)
        assertEquals("5l-fo-d0gt8", response.videoId)
        assertNotNull(response.sessionId)
        assertNull(response.reason)
    }

    @Test
    fun `does not expose private material to unrelated student`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val student = authentication(subject = "student-1", username = "student.one", role = "ROLE_STUDENT")
        userProfileStore.update(student, UpdateUserProfileRequest(countryCode = "RU"))
        val material = createYoutubeMaterial(teacher)

        val error = assertFailsWith<ResponseStatusException> {
            materialVideoPlaybackController.playback(
                student,
                material.id,
                MaterialVideoPlaybackRequest(blockId = "video-1"),
                requestWithCountry("RU"),
            )
        }

        assertEquals(HttpStatus.NOT_FOUND, error.statusCode)
    }

    @Test
    fun `allows student playback for private homework material`() {
        val now = java.time.Instant.now()
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val student = authentication(subject = "student-1", username = "student.one", role = "ROLE_STUDENT")
        userProfileStore.update(student, UpdateUserProfileRequest(countryCode = "RU"))
        val studentUserId = userProfileStore.currentUserId(student)
        val material = createYoutubeMaterial(teacher)
        val assignment = assignmentRepo.saveAndFlush(
            AssignmentEntity(
                id = UUID.randomUUID(),
                materialId = material.id,
                title = "Homework video",
                type = MetaData.AssignmentTypes.HOMEWORK,
                status = MetaData.AssignmentStatuses.ACTIVE,
                createdAt = now,
                updatedAt = now,
            ),
        )
        assignmentRecipientRepo.saveAndFlush(
            AssignmentRecipientEntity(
                id = UUID.randomUUID(),
                assignmentId = assignment.id,
                studentUserId = studentUserId,
                assignedAt = now,
                createdAt = now,
                updatedAt = now,
            ),
        )

        val response = materialVideoPlaybackController.playback(
            student,
            material.id,
            MaterialVideoPlaybackRequest(blockId = "video-1"),
            requestWithCountry("RU"),
        )

        assertEquals("RF_RELAY", response.mode)
        assertNotNull(response.sessionId)
    }

    private fun createYoutubeMaterial(
        authentication: JwtAuthenticationToken,
        durationSeconds: Int = 300,
        includeVideoMeta: Boolean = true,
        url: String = "https://www.youtube.com/watch?v=5l-fo-d0gt8",
    ): LessonMaterialResponse {
        val videoMetaJson = if (includeVideoMeta) {
            """
            ,
                          "videoMeta": {
                            "durationSeconds": $durationSeconds,
                            "language": "en"
                          }
            """.trimIndent()
        } else {
            ""
        }
        return materialCrudController.create(
            authentication,
            LessonMaterialRequest(
                title = "YouTube activity",
                status = "PUBLISHED",
                document = objectMapper.readTree(
                    """
                    {
                      "schemaVersion": 1,
                      "pages": [
                        {
                          "id": "page-1",
                          "title": "Video",
                          "layout": "FLOW",
                          "blocks": [
                            {
                              "id": "video-1",
                              "type": "videoEmbed",
                              "title": "Warm-up video",
                              "provider": "YOUTUBE",
                              "url": "$url"$videoMetaJson
                            }
                          ]
                        }
                      ]
                    }
                    """.trimIndent(),
                ),
            ),
        ).body!!
    }

    private fun requestWithCountry(countryCode: String): MockHttpServletRequest =
        MockHttpServletRequest().apply {
            addHeader("X-PlaySay-Geo-Country", countryCode)
            remoteAddr = "203.0.113.10"
        }

    private fun authentication(
        subject: String,
        username: String,
        role: String,
    ): JwtAuthenticationToken {
        val jwt = Jwt.withTokenValue("token-$subject-${UUID.randomUUID()}")
            .header("alg", "none")
            .subject(subject)
            .claim("preferred_username", username)
            .claim("email", "$username@example.com")
            .claim("name", username.replace('.', ' ').replaceFirstChar { it.uppercase() })
            .build()

        return JwtAuthenticationToken(jwt, listOf(SimpleGrantedAuthority(role)))
    }
}
