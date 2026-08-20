package com.playsay.gateway

import com.playsay.gateway.controller.*
import com.playsay.gateway.dto.*
import com.playsay.gateway.repo.*
import com.playsay.gateway.repo.schedule.*
import com.playsay.gateway.service.*
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.utils.MetaData
import com.fasterxml.jackson.databind.node.ObjectNode
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import java.math.BigDecimal
import java.time.Instant
import java.util.UUID
import java.util.concurrent.Callable
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertTrue
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.TestInstance
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.http.HttpStatus
import org.springframework.mock.web.MockMultipartFile
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException
import javax.sql.DataSource
import liquibase.integration.spring.SpringLiquibase

@SpringBootTest(
    properties = [
        "spring.datasource.url=jdbc:h2:mem:material-controller;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.liquibase.enabled=true",
        "playsay.storage.provider=memory",
        "playsay.ai.html-game-enrichment.enabled=false",
    ],
)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
abstract class MaterialControllerTestFixture {
    @Autowired protected lateinit var materialCrudController: MaterialCrudController
    @Autowired protected lateinit var scheduledMaterialController: ScheduledMaterialController
    @Autowired protected lateinit var materialAiController: MaterialAiController
    @Autowired protected lateinit var materialAssetController: MaterialAssetController
    @Autowired protected lateinit var materialImagePageController: MaterialImagePageController
    @Autowired protected lateinit var courseController: CourseController
    @Autowired protected lateinit var scheduleController: ScheduledLessonController
    @Autowired protected lateinit var userProfileStore: UserProfileStore
    @Autowired protected lateinit var lessonMaterialAnnotationRepo: LessonMaterialAnnotationRepo
    @Autowired protected lateinit var materialAssetRepo: MaterialAssetRepo
    @Autowired protected lateinit var materialHtmlGameEnrichmentRepo: MaterialHtmlGameEnrichmentRepo
    @Autowired protected lateinit var materialHtmlGameEnrichmentService: MaterialHtmlGameEnrichmentService
    @Autowired protected lateinit var submissionRepo: SubmissionRepo
    @Autowired protected lateinit var assignmentRepo: AssignmentRepo
    @Autowired protected lateinit var lessonParticipantRepo: LessonParticipantRepo
    @Autowired protected lateinit var lessonRepo: LessonRepo
    @Autowired protected lateinit var lessonTemplateRepo: LessonTemplateRepo
    @Autowired protected lateinit var courseRepo: CourseRepo
    @Autowired protected lateinit var lessonMaterialRepo: LessonMaterialRepo
    @Autowired protected lateinit var appUserRepo: AppUserRepo
    @Autowired protected lateinit var dataSource: DataSource

    protected val objectMapper = jacksonObjectMapper()
    protected fun activeLessonStart(): Instant = Instant.now().minusSeconds(300)
    protected fun activeLessonEnd(): Instant = Instant.now().plusSeconds(2_400)

    @BeforeAll
    fun migrateDatabase() {
        synchronized(migrationLock) {
            if (!databaseMigrated) {
                SpringLiquibase().apply {
                    this.dataSource = this@MaterialControllerTestFixture.dataSource
                    changeLog = "classpath:db/changelog/db.changelog-master.xml"
                }.afterPropertiesSet()
                databaseMigrated = true
            }
        }
    }

    @BeforeEach
    fun cleanDatabase() {
        lessonMaterialAnnotationRepo.deleteAllInBatch()
        materialHtmlGameEnrichmentRepo.deleteAllInBatch()
        materialAssetRepo.deleteAllInBatch()
        submissionRepo.deleteAllInBatch()
        assignmentRepo.deleteAllInBatch()
        lessonParticipantRepo.deleteAllInBatch()
        lessonRepo.deleteAllInBatch()
        lessonTemplateRepo.deleteAllInBatch()
        courseRepo.deleteAllInBatch()
        lessonMaterialRepo.deleteAllInBatch()
        appUserRepo.deleteAllInBatch()
        appUserRepo.seedPrimaryTeacherWithStudents()
    }

    protected fun imageFile(
        name: String,
        contentType: String,
        bytes: ByteArray = byteArrayOf(1, 2, 3, 4),
    ): MockMultipartFile =
        MockMultipartFile("file", name, contentType, bytes)

    protected fun htmlFile(
        name: String = "game.html",
        content: String = "<html><head><title>Memory game</title></head><body><button id=\"start\">Start</button><script>document.querySelector('#start').addEventListener('click', () => document.body.dataset.started = 'true')</script></body></html>",
    ): MockMultipartFile =
        MockMultipartFile("file", name, "text/html", content.toByteArray(Charsets.UTF_8))

    protected fun authentication(
        subject: String = UUID.randomUUID().toString(),
        username: String = "teacher.one",
        role: String,
    ): JwtAuthenticationToken {
        val jwt = Jwt.withTokenValue("token-$subject")
            .header("alg", "none")
            .subject(subject)
            .claim("preferred_username", username)
            .claim("email", "$username@example.com")
            .claim("name", username.replace('.', ' ').replaceFirstChar { char -> char.uppercase() })
            .build()

        return JwtAuthenticationToken(jwt, listOf(SimpleGrantedAuthority(role)))
    }

    private companion object {
        val migrationLock = Any()
        var databaseMigrated = false
    }
}
