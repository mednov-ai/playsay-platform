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
import com.playsay.gateway.repo.MaterialAssetRepo
import com.playsay.gateway.service.MaterialAssetService
import com.playsay.gateway.service.UserProfileStore
import com.playsay.gateway.service.YoutubeMediaClient
import com.playsay.gateway.service.YoutubeMediaPlaybackSessionCommand
import com.playsay.gateway.service.YoutubeMediaPlaybackSessionResult
import com.playsay.gateway.service.YoutubeVideoMeta
import com.playsay.gateway.utils.MetaData
import java.time.Instant
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.TestInstance
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Primary
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
    private val materialAssetRepo: MaterialAssetRepo,
    private val materialAssetService: MaterialAssetService,
    private val appUserRepo: AppUserRepo,
    private val dataSource: DataSource,
    private val testYoutubeMediaClient: TestYoutubeMediaClient,
) {
    private val objectMapper = jacksonObjectMapper()

    @TestConfiguration
    class MediaClientTestConfig {
        @Bean
        @Primary
        fun youtubeMediaClient(): TestYoutubeMediaClient = TestYoutubeMediaClient()
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
        testYoutubeMediaClient.reset()
        materialAssetRepo.deleteAllInBatch()
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
        assertEquals("MEDIUM", response.requestedQuality)
        assertEquals("MEDIUM", response.selectedQuality)
        assertEquals(720, response.selectedHeight)
        assertNotNull(response.sessionId)
        assertNotNull(response.relayUrl)
        assertEquals("/api/media/video-playback-sessions/${response.sessionId}/stream", response.relayUrl)
        assertNull(response.reason)
    }

    @Test
    fun `passes requested playback quality to media service`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        userProfileStore.update(teacher, UpdateUserProfileRequest(countryCode = "RU"))
        val material = createYoutubeMaterial(teacher)

        val response = materialVideoPlaybackController.playback(
            teacher,
            material.id,
            MaterialVideoPlaybackRequest(blockId = "video-1", quality = "HIGH"),
            requestWithCountry("RU"),
        )

        assertEquals("RF_RELAY", response.mode)
        assertEquals("HIGH", response.requestedQuality)
        assertEquals("HIGH", response.selectedQuality)
        assertEquals(1080, response.selectedHeight)
    }

    @Test
    fun `normalizes unknown playback quality to medium`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        userProfileStore.update(teacher, UpdateUserProfileRequest(countryCode = "RU"))
        val material = createYoutubeMaterial(teacher)

        val response = materialVideoPlaybackController.playback(
            teacher,
            material.id,
            MaterialVideoPlaybackRequest(blockId = "video-1", quality = "GIANT"),
            requestWithCountry("RU"),
        )

        assertEquals("RF_RELAY", response.mode)
        assertEquals("MEDIUM", response.requestedQuality)
        assertEquals("MEDIUM", response.selectedQuality)
        assertEquals(720, response.selectedHeight)
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

    @Test
    fun `creates youtube thumbnail asset when media service stores thumbnail`() {
        testYoutubeMediaClient.thumbnailStored = true
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        userProfileStore.update(teacher, UpdateUserProfileRequest(countryCode = "RU"))
        val material = createYoutubeMaterial(teacher)

        val response = materialVideoPlaybackController.playback(
            teacher,
            material.id,
            MaterialVideoPlaybackRequest(blockId = "video-1"),
            requestWithCountry("RU"),
        )

        val thumbnailAssetId = assertNotNull(response.thumbnailAssetId)
        assertEquals("/api/materials/${material.id}/assets/$thumbnailAssetId/content", response.thumbnailUrl)
        val assets = materialAssetService.list(material.id)
        assertEquals(1, assets.size)
        assertEquals("VIDEO_THUMBNAIL", assets.single().kind)
        assertEquals("YOUTUBE", assets.single().provider)
        assertEquals("video-1", assets.single().metadata.path("blockId").asText())
        assertEquals("5l-fo-d0gt8", assets.single().metadata.path("videoId").asText())
        assertEquals("material-assets/${material.id}/$thumbnailAssetId.youtube-thumbnail", assets.single().storageKey)
    }

    @Test
    fun `reuses existing youtube thumbnail asset for repeated playback decisions`() {
        testYoutubeMediaClient.thumbnailStored = true
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        userProfileStore.update(teacher, UpdateUserProfileRequest(countryCode = "RU"))
        val material = createYoutubeMaterial(teacher)

        val first = materialVideoPlaybackController.playback(
            teacher,
            material.id,
            MaterialVideoPlaybackRequest(blockId = "video-1"),
            requestWithCountry("RU"),
        )
        val second = materialVideoPlaybackController.playback(
            teacher,
            material.id,
            MaterialVideoPlaybackRequest(blockId = "video-1"),
            requestWithCountry("RU"),
        )

        assertEquals(first.thumbnailAssetId, second.thumbnailAssetId)
        assertEquals(first.thumbnailUrl, second.thumbnailUrl)
        assertNotNull(testYoutubeMediaClient.sessionRequests.first().thumbnailStorageKey)
        assertNull(testYoutubeMediaClient.sessionRequests.last().thumbnailStorageKey)
        assertEquals(1, materialAssetService.list(material.id).size)
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

class TestYoutubeMediaClient : YoutubeMediaClient {
    val sessionRequests = mutableListOf<YoutubeMediaPlaybackSessionCommand>()
    var thumbnailStored: Boolean = false

    fun reset() {
        sessionRequests.clear()
        thumbnailStored = false
    }

    override fun resolveMetadata(videoId: String): YoutubeVideoMeta? =
        YoutubeVideoMeta(
            videoId = videoId,
            durationSeconds = 105,
            language = "en",
            thumbnailUrl = "https://img.youtube.com/vi/$videoId/maxresdefault.jpg",
        )

    override fun createPlaybackSession(command: YoutubeMediaPlaybackSessionCommand): YoutubeMediaPlaybackSessionResult {
        sessionRequests.add(command)
        val height = when (command.requestedQuality) {
            "LOW" -> 480
            "HIGH" -> 1080
            else -> 720
        }
        val selectedQuality = when (height) {
            in 0..480 -> "LOW"
            in 481..720 -> "MEDIUM"
            else -> "HIGH"
        }
        return YoutubeMediaPlaybackSessionResult(
            sessionId = UUID.randomUUID(),
            expiresAt = Instant.now().plusSeconds(900),
            requestedQuality = command.requestedQuality,
            selectedQuality = selectedQuality,
            selectedHeight = height,
            thumbnailSourceUrl = "https://img.youtube.com/vi/${command.videoId}/maxresdefault.jpg",
            thumbnailStored = thumbnailStored && command.thumbnailStorageKey != null,
            thumbnailContentType = if (thumbnailStored && command.thumbnailStorageKey != null) "image/jpeg" else null,
            thumbnailByteSize = if (thumbnailStored && command.thumbnailStorageKey != null) 12345 else null,
        )
    }
}
