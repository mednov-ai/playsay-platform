package com.playsay.gateway

import com.playsay.gateway.controller.AdminDelegationController
import com.playsay.gateway.controller.TeacherManagementController
import com.playsay.gateway.dto.CreateDelegationRequest
import com.playsay.gateway.entity.AppUserEntity
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.repo.AppUserRepo
import com.playsay.gateway.repo.TeacherDelegationRepo
import com.playsay.gateway.repo.TeacherDelegationStudentRepo
import com.playsay.gateway.repo.UserManagementAuditRepo
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import javax.sql.DataSource
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotNull
import liquibase.integration.spring.SpringLiquibase
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.TestInstance
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.http.HttpStatus
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken

@SpringBootTest(
    properties = [
        "spring.datasource.url=jdbc:h2:mem:teacher-delegation-controller;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.liquibase.enabled=true",
    ],
)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class TeacherDelegationControllerTest @Autowired constructor(
    private val teacherController: TeacherManagementController,
    private val adminController: AdminDelegationController,
    private val users: AppUserRepo,
    private val delegations: TeacherDelegationRepo,
    private val selectedStudents: TeacherDelegationStudentRepo,
    private val audits: UserManagementAuditRepo,
    private val dataSource: DataSource,
) {
    @BeforeAll
    fun migrateDatabase() {
        SpringLiquibase().apply {
            this.dataSource = this@TeacherDelegationControllerTest.dataSource
            changeLog = "classpath:db/changelog/db.changelog-master.xml"
        }.afterPropertiesSet()
    }

    @BeforeEach
    fun cleanDatabase() {
        selectedStudents.deleteAllInBatch()
        delegations.deleteAllInBatch()
        audits.deleteAllInBatch()
        users.deleteAllInBatch()
    }

    @Test
    fun `teacher delegates own students to several substitutes with inclusive local dates`() {
        val primary = user("primary", "TEACHER", timezone = "Europe/Berlin")
        val delegateOne = user("delegate-one", "TEACHER")
        val delegateTwo = user("delegate-two", "ADMIN,TEACHER")
        val studentOne = user("student-one", "STUDENT", primaryTeacher = primary)
        val studentTwo = user("student-two", "STUDENT", primaryTeacher = primary)
        val start = LocalDate.now(ZoneId.of("Europe/Berlin"))
        val end = start.plusDays(2)

        val created = teacherController.createDelegation(
            authentication(primary.keycloakSubject, "ROLE_TEACHER"),
            CreateDelegationRequest(
                delegateTeacherSubjects = setOf(delegateOne.keycloakSubject, delegateTwo.keycloakSubject),
                studentSubjects = setOf(studentOne.keycloakSubject, studentTwo.keycloakSubject),
                startsAt = start,
                endsAt = end,
            ),
        )

        assertEquals(setOf("delegate-one", "delegate-two"), created.map { it.delegateTeacher.subject }.toSet())
        assertEquals(setOf("student-one", "student-two"), created.first().students.map { it.subject }.toSet())
        assertEquals(start.atStartOfDay(ZoneId.of("Europe/Berlin")).toInstant(), created.first().startsAt)
        assertEquals(end.plusDays(1).atStartOfDay(ZoneId.of("Europe/Berlin")).toInstant(), created.first().endsAt)
        assertEquals(2, teacherController.students(authentication(delegateOne.keycloakSubject, "ROLE_TEACHER")).size)
    }

    @Test
    fun `teacher cannot delegate another teachers student but admin can act for primary teacher`() {
        val primary = user("primary", "TEACHER")
        val anotherPrimary = user("another-primary", "TEACHER")
        val delegate = user("delegate", "TEACHER")
        val foreignStudent = user("foreign-student", "STUDENT", primaryTeacher = anotherPrimary)
        val admin = user("admin", "ADMIN")
        val today = LocalDate.now(ZoneId.of("Europe/Moscow"))
        val request = CreateDelegationRequest(
            delegateTeacherSubjects = setOf(delegate.keycloakSubject),
            studentSubjects = setOf(foreignStudent.keycloakSubject),
            startsAt = today,
            endsAt = today,
        )

        val denied = assertFailsWith<ProjectResponseException> {
            teacherController.createDelegation(authentication(primary.keycloakSubject, "ROLE_TEACHER"), request)
        }
        assertEquals(HttpStatus.BAD_REQUEST, denied.statusCode)

        val created = adminController.createDelegation(
            authentication(admin.keycloakSubject, "ROLE_ADMIN"),
            request.copy(primaryTeacherSubject = anotherPrimary.keycloakSubject),
        ).single()

        assertEquals(anotherPrimary.keycloakSubject, created.primaryTeacher.subject)
        assertEquals(admin.keycloakSubject, created.createdBySubject)
        assertNotNull(audits.findAll().singleOrNull { it.action == "DELEGATION_CREATED" })
    }

    private fun user(
        subject: String,
        roles: String,
        primaryTeacher: AppUserEntity? = null,
        timezone: String? = null,
    ): AppUserEntity {
        val now = Instant.now()
        return users.saveAndFlush(
            AppUserEntity(
                keycloakSubject = subject,
                username = subject,
                displayName = subject,
                roles = roles,
                timezone = timezone,
                managedByTeacher = primaryTeacher != null,
                managedByTeacherUserId = primaryTeacher?.id,
                createdAt = now,
                updatedAt = now,
            ),
        )
    }

    private fun authentication(subject: String, vararg roles: String): JwtAuthenticationToken {
        val issuedAt = Instant.now().minusSeconds(5)
        val jwt = Jwt.withTokenValue("token")
            .header("alg", "none")
            .subject(subject)
            .claim("preferred_username", subject)
            .issuedAt(issuedAt)
            .expiresAt(issuedAt.plusSeconds(3600))
            .build()
        return JwtAuthenticationToken(jwt, roles.map(::SimpleGrantedAuthority))
    }
}
