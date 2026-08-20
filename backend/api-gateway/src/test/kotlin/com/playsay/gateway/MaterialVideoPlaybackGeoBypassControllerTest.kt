package com.playsay.gateway

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.playsay.gateway.controller.MaterialCrudController
import com.playsay.gateway.controller.MaterialVideoPlaybackController
import com.playsay.gateway.dto.LessonMaterialRequest
import com.playsay.gateway.dto.MaterialVideoPlaybackRequest
import com.playsay.gateway.dto.UpdateUserProfileRequest
import com.playsay.gateway.repo.AppUserRepo
import com.playsay.gateway.repo.AssignmentRecipientRepo
import com.playsay.gateway.repo.AssignmentRepo
import com.playsay.gateway.repo.LessonMaterialRepo
import com.playsay.gateway.client.YoutubeMediaClient
import com.playsay.gateway.service.UserProfileStore
import java.util.UUID
import javax.sql.DataSource
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import liquibase.integration.spring.SpringLiquibase
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.TestInstance
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Primary
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken

@SpringBootTest(
    properties = [
        "spring.datasource.url=jdbc:h2:mem:material-video-playback-geo-bypass;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.liquibase.enabled=true",
        "playsay.video.youtube.rf-relay.enabled=true",
        "playsay.video.youtube.rf-relay.geo-country-header=X-PlaySay-Geo-Country",
        "playsay.video.youtube.rf-relay.require-geo-country=false",
    ],
)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class MaterialVideoPlaybackGeoBypassControllerTest @Autowired constructor(
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

    @TestConfiguration
    class MediaClientConfig {
        @Bean
        @Primary
        fun youtubeMediaClient(): YoutubeMediaClient = TestYoutubeMediaClient()
    }

    @BeforeAll
    fun migrateDatabase() {
        SpringLiquibase().apply {
            this.dataSource = this@MaterialVideoPlaybackGeoBypassControllerTest.dataSource
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
    fun `allows rf relay without geo header when geo requirement is disabled`() {
        val teacher = authentication(subject = "teacher-geo-bypass", username = "teacher.geo", role = "ROLE_TEACHER")
        userProfileStore.update(teacher, UpdateUserProfileRequest(countryCode = "RU"))
        val material = createYoutubeMaterial(teacher)

        val response = materialVideoPlaybackController.playback(
            teacher,
            material.id,
            MaterialVideoPlaybackRequest(blockId = "video-1"),
            MockHttpServletRequest(),
        )

        assertEquals("RF_RELAY", response.mode)
        assertNotNull(response.sessionId)
        assertNotNull(response.relayUrl)
    }

    private fun createYoutubeMaterial(authentication: JwtAuthenticationToken) = materialCrudController.create(
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
                          "url": "https://www.youtube.com/watch?v=5l-fo-d0gt8",
                          "videoMeta": {
                            "durationSeconds": 300,
                            "language": "en"
                          }
                        }
                      ]
                    }
                  ]
                }
                """.trimIndent(),
            ),
        ),
    ).body!!

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
