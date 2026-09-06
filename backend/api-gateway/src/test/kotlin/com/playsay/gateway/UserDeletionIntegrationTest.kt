package com.playsay.gateway

import com.playsay.gateway.client.RegistrationGateway
import com.playsay.gateway.client.UserDataPurgeClient
import com.playsay.gateway.entity.AppUserEntity
import com.playsay.gateway.entity.LessonEntity
import com.playsay.gateway.entity.LessonParticipantEntity
import com.playsay.gateway.repo.schedule.LessonRepo
import com.playsay.gateway.repo.schedule.LessonParticipantRepo
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.dto.UpdateUserRolesRequest
import com.playsay.gateway.dto.CreateDelegationRequest
import com.playsay.gateway.repo.TeacherDelegationRepo
import com.playsay.gateway.repo.TeacherDelegationStudentRepo
import com.playsay.gateway.service.TeacherDelegationService
import java.time.LocalDate
import com.playsay.gateway.repo.AppUserRepo
import com.playsay.gateway.repo.UserDeletionOperationRepo
import com.playsay.gateway.repo.UserManagementAuditRepo
import com.playsay.gateway.service.UserDeletionProcessor
import com.playsay.gateway.service.UserDeletionSteps
import com.playsay.gateway.service.UserManagementService
import com.playsay.gateway.service.UserProfileStore
import java.time.Instant
import java.util.concurrent.Callable
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import javax.sql.DataSource
import kotlin.test.*
import liquibase.integration.spring.SpringLiquibase
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.TestInstance
import org.mockito.Mockito.*
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.test.context.bean.override.mockito.MockitoBean

@SpringBootTest(properties = [
    "spring.datasource.url=jdbc:h2:mem:user-deletion;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1;LOCK_TIMEOUT=5000",
    "spring.datasource.username=sa", "spring.datasource.password=",
    "spring.datasource.driver-class-name=org.h2.Driver", "spring.liquibase.enabled=false",
])
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class UserDeletionIntegrationTest @Autowired constructor(
    private val service: UserManagementService,
    private val steps: UserDeletionSteps,
    private val profiles: UserProfileStore,
    private val users: AppUserRepo,
    private val operations: UserDeletionOperationRepo,
    private val audits: UserManagementAuditRepo,
    private val lessons: LessonRepo,
    private val participants: LessonParticipantRepo,
    private val delegations: TeacherDelegationRepo,
    private val delegatedStudents: TeacherDelegationStudentRepo,
    private val delegationService: TeacherDelegationService,
    private val dataSource: DataSource,
) {
    @MockitoBean lateinit var registration: RegistrationGateway
    @MockitoBean lateinit var purge: UserDataPurgeClient
    // Advance explicitly so every assertion observes a committed checkpoint.
    @MockitoBean lateinit var processor: UserDeletionProcessor

    @BeforeAll fun migrate() {
        SpringLiquibase().apply {
            dataSource = this@UserDeletionIntegrationTest.dataSource
            changeLog = "classpath:db/changelog/db.changelog-master.xml"
        }.afterPropertiesSet()
    }

    @BeforeEach fun clean() {
        operations.deleteAllInBatch()
        audits.deleteAllInBatch()
        delegatedStudents.deleteAllInBatch()
        delegations.deleteAllInBatch()
        participants.deleteAllInBatch()
        lessons.deleteAllInBatch()
        users.deleteAllInBatch()
    }

    @Test fun `all admin role combinations delete every other account type without replacement`() {
        for (actorRoles in listOf("ADMIN", "ADMIN,TEACHER")) {
            for (targetRoles in listOf("STUDENT", "TEACHER", "ADMIN", "ADMIN,TEACHER")) {
                val actor = user("actor-$actorRoles-$targetRoles", actorRoles)
                val target = user("target-$actorRoles-$targetRoles", targetRoles)
                val accepted = service.requestDeletion(auth(actor), target.keycloakSubject, "ignored-legacy-value")
                val operation = operations.findById(accepted.operationId).orElseThrow()
                assertNull(operation.replacementTeacherUserId)
                assertTrue(users.hasDeletionIntent(target.keycloakSubject))
                assertFailsWith<ProjectResponseException> { profiles.currentUserId(auth(target)) }
                repeat(5) { steps.advance(operation.id) }
                assertEquals("COMPLETED", operations.findById(operation.id).orElseThrow().status)
                assertNotNull(users.findById(target.id).orElseThrow().deletedAt)
                assertNull(users.findById(actor.id).orElseThrow().deletedAt)
            }
        }
    }

    @Test fun `committed suspension survives downstream failure and explicit retry reuses operation`() {
        val actor = user("actor", "ADMIN,TEACHER")
        val target = user("target", "STUDENT")
        val operation = service.requestDeletion(auth(actor), target.keycloakSubject, null)
        steps.advance(operation.operationId)
        steps.advance(operation.operationId)
        doThrow(IllegalStateException("synthetic failure")).`when`(purge).purge(target.keycloakSubject)
        assertFailsWith<IllegalStateException> { steps.advance(operation.operationId) }
        steps.fail(operation.operationId)
        assertEquals("LOCAL_CLEANED", operations.findById(operation.operationId).orElseThrow().stage)
        assertTrue(users.hasDeletionIntent(target.keycloakSubject))
        assertFailsWith<ProjectResponseException> { profiles.current(auth(target)) }
        val retry = service.requestDeletion(auth(actor), target.keycloakSubject, null)
        assertEquals(operation.operationId, retry.operationId)
        doNothing().`when`(purge).purge(target.keycloakSubject)
        repeat(3) { steps.advance(retry.operationId) }
        assertEquals("COMPLETED", operations.findById(retry.operationId).orElseThrow().status)
        verify(registration, times(1)).suspendUser(target.keycloakSubject)
    }

    @Test fun `concurrent admins cannot delete each other leaving no administrator`() {
        val first = user("first", "ADMIN")
        val second = user("second", "ADMIN,TEACHER")
        val executor = Executors.newFixedThreadPool(2)
        try {
            val results = executor.invokeAll(listOf(
                Callable { runCatching { service.requestDeletion(auth(first), second.keycloakSubject, null) } },
                Callable { runCatching { service.requestDeletion(auth(second), first.keycloakSubject, null) } },
            ), 15, TimeUnit.SECONDS).map { it.get() }
            assertEquals(1, results.count { it.isSuccess })
            assertEquals(1L, users.countAdministratorsWithoutDeletion())
            assertEquals(1L, operations.count())
        } finally { executor.shutdownNow() }
    }

    @Test fun `active lesson refuses both student and teacher without changing links`() {
        val actor = user("actor", "ADMIN,TEACHER")
        val teacher = user("teacher", "TEACHER")
        val student = user("student", "STUDENT")
        val lesson = lessons.saveAndFlush(LessonEntity(teacherUserId = teacher.id, status = "IN_PROGRESS", type = "INDIVIDUAL"))
        participants.saveAndFlush(LessonParticipantEntity(lessonId = lesson.id, studentUserId = student.id))
        for (target in listOf(teacher, student)) {
            assertFailsWith<ProjectResponseException> { service.requestDeletion(auth(actor), target.keycloakSubject, null) }
            assertFalse(users.hasDeletionIntent(target.keycloakSubject))
        }
        assertEquals("IN_PROGRESS", lessons.findById(lesson.id).orElseThrow().status)
        assertEquals(1L, participants.count())
        assertEquals(0L, operations.count())
        verifyNoInteractions(registration, purge)
    }

    @Test fun `teacher without admin cannot delete any account`() {
        val teacher = user("teacher", "TEACHER")
        val target = user("target", "STUDENT")
        val error = assertFailsWith<ProjectResponseException> { service.requestDeletion(auth(teacher), target.keycloakSubject, null) }
        assertEquals(403, error.statusCode.value())
        assertEquals(0L, operations.count())
        verifyNoInteractions(registration, purge)
    }

    @Test fun `concurrent deletion and role removal retain an available administrator`() {
        val first = user("first", "ADMIN")
        val second = user("second", "ADMIN,TEACHER")
        val firstAuth = auth(first)
        val secondAuth = auth(second)
        val executor = Executors.newFixedThreadPool(2)
        try {
            val results = executor.invokeAll(listOf(
                Callable { runCatching { service.updateRoles(firstAuth, second.keycloakSubject, UpdateUserRolesRequest(setOf("TEACHER"))) } },
                Callable { runCatching { service.requestDeletion(secondAuth, first.keycloakSubject, null) } },
            ), 15, TimeUnit.SECONDS).map { it.get() }
            assertEquals(1, results.count { it.isSuccess })
            assertEquals(1L, users.countAdministratorsWithoutDeletion())
        } finally { executor.shutdownNow() }
    }

    @Test fun `deleting teacher detaches students and cancels only future teacher lessons`() {
        val actor = user("actor", "ADMIN")
        val teacher = user("teacher", "TEACHER")
        val student = user("student", "STUDENT").also {
            it.managedByTeacher = true
            it.managedByTeacherUserId = teacher.id
            users.saveAndFlush(it)
        }
        val lesson = lessons.saveAndFlush(LessonEntity(teacherUserId = teacher.id, status = "SCHEDULED", type = "INDIVIDUAL"))
        val operation = service.requestDeletion(auth(actor), teacher.keycloakSubject, null)
        assertTrue(lessons.hasDeletingParticipant(lesson.id))
        repeat(5) { steps.advance(operation.operationId) }
        val remaining = users.findById(student.id).orElseThrow()
        assertNull(remaining.deletedAt)
        assertNull(remaining.managedByTeacherUserId)
        assertFalse(remaining.managedByTeacher)
        assertEquals("CANCELLED", lessons.findById(lesson.id).orElseThrow().status)
    }

    @Test fun `deleting one delegated student keeps the other students grant and accounts`() {
        val actor = user("actor", "ADMIN,TEACHER")
        val teacher = user("teacher", "TEACHER")
        val delegate = user("delegate", "TEACHER")
        val students = listOf(user("target", "STUDENT"), user("other", "STUDENT"))
        students.forEach {
            it.managedByTeacher = true
            it.managedByTeacherUserId = teacher.id
            users.saveAndFlush(it)
        }
        val grant = delegationService.create(auth(actor), CreateDelegationRequest(
            primaryTeacherSubject = teacher.keycloakSubject,
            delegateTeacherSubjects = setOf(delegate.keycloakSubject),
            studentSubjects = students.map { it.keycloakSubject }.toSet(),
            startsAt = LocalDate.now(), endsAt = LocalDate.now().plusDays(1),
        )).single()
        val deletion = service.requestDeletion(auth(actor), students.first().keycloakSubject, null)
        repeat(5) { steps.advance(deletion.operationId) }
        assertEquals(listOf(students.last().id), delegatedStudents.findByDelegationId(grant.id).map { it.studentUserId })
        assertNull(delegations.findById(grant.id).orElseThrow().revokedAt)
        for (remaining in listOf(actor, teacher, delegate, students.last())) {
            assertNull(users.findById(remaining.id).orElseThrow().deletedAt)
        }
    }

    private fun user(subject: String, roles: String) = users.saveAndFlush(
        AppUserEntity(keycloakSubject = subject, username = subject, roles = roles),
    )

    private fun auth(user: AppUserEntity): JwtAuthenticationToken {
        val now = Instant.now()
        return JwtAuthenticationToken(
            Jwt.withTokenValue("test-token").header("alg", "none").subject(user.keycloakSubject)
                .issuedAt(now).expiresAt(now.plusSeconds(600)).build(),
            user.roles!!.split(',').map { SimpleGrantedAuthority("ROLE_$it") },
        )
    }
}
