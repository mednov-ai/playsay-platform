package com.playsay.gateway

import com.playsay.gateway.controller.AdminDelegationController
import com.playsay.gateway.controller.TeacherManagementController
import com.playsay.gateway.dto.CreateDelegationRequest
import com.playsay.gateway.dto.UpdateStudentLessonTranslationPermissionRequest
import com.playsay.gateway.entity.AppUserEntity
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.repo.AppUserRepo
import com.playsay.gateway.repo.StudentProfileRepo
import com.playsay.gateway.repo.TeacherDelegationRepo
import com.playsay.gateway.repo.TeacherDelegationStudentRepo
import com.playsay.gateway.repo.UserManagementAuditRepo
import com.playsay.gateway.utils.MetaData
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import javax.sql.DataSource
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertTrue
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
        "spring.liquibase.enabled=false",
    ],
)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class TeacherDelegationControllerTest @Autowired constructor(
    private val teacherController: TeacherManagementController,
    private val adminController: AdminDelegationController,
    private val users: AppUserRepo,
    private val delegations: TeacherDelegationRepo,
    private val selectedStudents: TeacherDelegationStudentRepo,
    private val studentProfiles: StudentProfileRepo,
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
        studentProfiles.deleteAllInBatch()
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

    @Test
    fun `primary delegate and admin can update translation permission idempotently`() {
        val primary = user("primary", "TEACHER")
        val delegate = user("delegate", "TEACHER")
        val admin = user("admin", "ADMIN")
        val student = user("student", "STUDENT", primaryTeacher = primary)
        val today = LocalDate.now(ZoneId.of("Europe/Moscow"))
        teacherController.createDelegation(
            authentication(primary.keycloakSubject, "ROLE_TEACHER"),
            CreateDelegationRequest(
                delegateTeacherSubjects = setOf(delegate.keycloakSubject),
                studentSubjects = setOf(student.keycloakSubject),
                startsAt = today,
                endsAt = today,
            ),
        )

        assertFalse(teacherController.students(authentication(primary.keycloakSubject, "ROLE_TEACHER")).single().student.lessonTranslationAllowed)
        val enabled = teacherController.updateLessonTranslationPermission(
            authentication(primary.keycloakSubject, "ROLE_TEACHER"),
            student.keycloakSubject,
            UpdateStudentLessonTranslationPermissionRequest(true),
        )
        teacherController.updateLessonTranslationPermission(
            authentication(primary.keycloakSubject, "ROLE_TEACHER"),
            student.keycloakSubject,
            UpdateStudentLessonTranslationPermissionRequest(true),
        )
        val disabledByDelegate = teacherController.updateLessonTranslationPermission(
            authentication(delegate.keycloakSubject, "ROLE_TEACHER"),
            student.keycloakSubject,
            UpdateStudentLessonTranslationPermissionRequest(false),
        )
        val enabledByAdmin = teacherController.updateLessonTranslationPermission(
            authentication(admin.keycloakSubject, "ROLE_ADMIN"),
            student.keycloakSubject,
            UpdateStudentLessonTranslationPermissionRequest(true),
        )

        assertTrue(enabled.student.lessonTranslationAllowed)
        assertEquals("PRIMARY_TEACHER", enabled.access)
        assertFalse(disabledByDelegate.student.lessonTranslationAllowed)
        assertEquals("ACTIVE_DELEGATE", disabledByDelegate.access)
        assertTrue(enabledByAdmin.student.lessonTranslationAllowed)
        assertEquals("ADMIN", enabledByAdmin.access)
        assertEquals(3, audits.findAll().count { it.action == "STUDENT_LESSON_TRANSLATION_PERMISSION_CHANGED" })
    }

    @Test
    fun `student and unrelated teacher cannot update translation permission`() {
        val primary = user("primary", "TEACHER")
        val unrelated = user("unrelated", "TEACHER")
        val student = user("student", "STUDENT", primaryTeacher = primary)
        val request = UpdateStudentLessonTranslationPermissionRequest(true)

        val unrelatedError = assertFailsWith<ProjectResponseException> {
            teacherController.updateLessonTranslationPermission(
                authentication(unrelated.keycloakSubject, "ROLE_TEACHER"),
                student.keycloakSubject,
                request,
            )
        }
        val studentError = assertFailsWith<ProjectResponseException> {
            teacherController.updateLessonTranslationPermission(
                authentication(student.keycloakSubject, "ROLE_STUDENT"),
                student.keycloakSubject,
                request,
            )
        }

        assertEquals(HttpStatus.FORBIDDEN, unrelatedError.statusCode)
        assertEquals(MetaData.ErrorCodes.STUDENT_ACCESS_DENIED, unrelatedError.errorCode)
        assertEquals(HttpStatus.FORBIDDEN, studentError.statusCode)
        assertEquals(MetaData.ErrorCodes.TEACHER_OR_ADMIN_ROLE_REQUIRED, studentError.errorCode)
    }

    @Test
    fun `admin teacher appears in directory and can assign self as primary teacher`() {
        val maria = user("maria", "ADMIN,TEACHER")
        val student = user("student", "STUDENT")
        val authentication = authentication(maria.keycloakSubject, "ROLE_ADMIN", "ROLE_TEACHER")

        val directory = teacherController.directory(authentication)
        val assigned = adminController.assignTeacher(
            authentication,
            student.keycloakSubject,
            com.playsay.gateway.dto.AssignPrimaryTeacherRequest(maria.keycloakSubject),
        )
        val assignedAgain = adminController.assignTeacher(
            authentication,
            student.keycloakSubject,
            com.playsay.gateway.dto.AssignPrimaryTeacherRequest(maria.keycloakSubject),
        )

        assertTrue(directory.any { it.subject == maria.keycloakSubject })
        assertEquals(maria.keycloakSubject, assigned.student.primaryTeacher?.subject)
        assertEquals(maria.keycloakSubject, assignedAgain.student.primaryTeacher?.subject)
        assertEquals(2, audits.findAll().count { it.action == "PRIMARY_TEACHER_ASSIGNED" })
    }

    @Test
    fun `pure admin is not a teacher candidate and cannot be assigned`() {
        val admin = user("admin", "ADMIN")
        val student = user("student", "STUDENT")
        val authentication = authentication(admin.keycloakSubject, "ROLE_ADMIN")

        val directory = teacherController.directory(authentication)
        val error = assertFailsWith<ProjectResponseException> {
            adminController.assignTeacher(
                authentication,
                student.keycloakSubject,
                com.playsay.gateway.dto.AssignPrimaryTeacherRequest(admin.keycloakSubject),
            )
        }

        assertFalse(directory.any { it.subject == admin.keycloakSubject })
        assertEquals(MetaData.ErrorCodes.DELEGATION_TEACHER_INVALID, error.errorCode)
        assertEquals(null, users.findByKeycloakSubject(student.keycloakSubject)?.managedByTeacherUserId)
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
