package com.playsay.gateway.service

import com.playsay.gateway.entity.AppUserEntity
import com.playsay.gateway.entity.TeacherDelegationEntity
import com.playsay.gateway.entity.TeacherDelegationStudentEntity
import com.playsay.gateway.repo.AppUserRepo
import com.playsay.gateway.repo.TeacherDelegationRepo
import com.playsay.gateway.repo.TeacherDelegationStudentRepo
import java.time.Instant
import java.util.UUID
import javax.sql.DataSource
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import liquibase.integration.spring.SpringLiquibase
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.TestInstance
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken

@SpringBootTest(
    properties = [
        "spring.datasource.url=jdbc:h2:mem:student-access-policy;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.liquibase.enabled=true",
    ],
)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class StudentAccessPolicyTest @Autowired constructor(
    private val policy: StudentAccessPolicy,
    private val users: AppUserRepo,
    private val delegations: TeacherDelegationRepo,
    private val selectedStudents: TeacherDelegationStudentRepo,
    private val dataSource: DataSource,
) {
    @BeforeAll
    fun migrateDatabase() {
        SpringLiquibase().apply {
            this.dataSource = this@StudentAccessPolicyTest.dataSource
            changeLog = "classpath:db/changelog/db.changelog-master.xml"
        }.afterPropertiesSet()
    }

    @BeforeEach
    fun cleanDatabase() {
        selectedStudents.deleteAllInBatch()
        delegations.deleteAllInBatch()
        users.deleteAllInBatch()
    }

    @Test
    fun `primary teacher and only an active delegate can access student`() {
        val at = Instant.parse("2026-07-14T10:00:00Z")
        val primary = user("primary", "TEACHER")
        val delegate = user("delegate", "TEACHER")
        val outsider = user("outsider", "TEACHER")
        val student = user("student", "STUDENT", primary.id)
        val active = delegation(primary, delegate, at.minusSeconds(60), at.plusSeconds(60))
        selectedStudents.saveAndFlush(
            TeacherDelegationStudentEntity(
                delegationId = active.id,
                studentUserId = student.id,
                createdAt = at.minusSeconds(60),
            ),
        )

        assertEquals(StudentAccessDecision.PRIMARY_TEACHER, policy.evaluate(primary.id, student.id, at))
        assertEquals(StudentAccessDecision.ACTIVE_DELEGATE, policy.evaluate(delegate.id, student.id, at))
        assertEquals(StudentAccessDecision.DENIED, policy.evaluate(delegate.id, student.id, active.endsAt))
        assertEquals(StudentAccessDecision.DENIED, policy.evaluate(outsider.id, student.id, at))
    }

    @Test
    fun `revocation and partial group coverage deny delegated access`() {
        val at = Instant.parse("2026-07-14T10:00:00Z")
        val primary = user("primary", "TEACHER")
        val delegate = user("delegate", "TEACHER")
        val selected = user("student-selected", "STUDENT", primary.id)
        val notSelected = user("student-not-selected", "STUDENT", primary.id)
        val revoked = delegation(primary, delegate, at.minusSeconds(60), at.plusSeconds(60)).also {
            it.revokedAt = at.minusSeconds(1)
            delegations.saveAndFlush(it)
        }
        selectedStudents.saveAndFlush(
            TeacherDelegationStudentEntity(
                delegationId = revoked.id,
                studentUserId = selected.id,
                createdAt = at.minusSeconds(60),
            ),
        )

        assertEquals(StudentAccessDecision.DENIED, policy.evaluate(delegate.id, selected.id, at))
        assertFalse(policy.canAccessEveryStudent(delegate.id, listOf(selected.id, notSelected.id), at))
        assertTrue(policy.canAccessEveryStudent(primary.id, listOf(selected.id, notSelected.id), at))
    }

    @Test
    fun `administrator receives explicit override decision`() {
        assertEquals(
            StudentAccessDecision.ADMIN,
            policy.evaluate(authentication("admin", "ROLE_ADMIN"), "unknown-student"),
        )
    }

    private fun user(subject: String, role: String, primaryTeacherId: UUID? = null): AppUserEntity {
        val now = Instant.parse("2026-07-14T09:00:00Z")
        return users.saveAndFlush(
            AppUserEntity(
                keycloakSubject = subject,
                username = subject,
                roles = role,
                managedByTeacher = primaryTeacherId != null,
                managedByTeacherUserId = primaryTeacherId,
                createdAt = now,
                updatedAt = now,
            ),
        )
    }

    private fun delegation(
        primary: AppUserEntity,
        delegate: AppUserEntity,
        startsAt: Instant,
        endsAt: Instant,
    ): TeacherDelegationEntity = delegations.saveAndFlush(
        TeacherDelegationEntity(
            primaryTeacherUserId = primary.id,
            delegateTeacherUserId = delegate.id,
            startsAt = startsAt,
            endsAt = endsAt,
            createdByUserId = primary.id,
            createdAt = startsAt,
        ),
    )

    private fun authentication(subject: String, role: String): JwtAuthenticationToken {
        val issuedAt = Instant.parse("2026-07-14T09:00:00Z")
        val jwt = Jwt.withTokenValue("token")
            .header("alg", "none")
            .subject(subject)
            .issuedAt(issuedAt)
            .expiresAt(issuedAt.plusSeconds(3600))
            .build()
        return JwtAuthenticationToken(jwt, listOf(SimpleGrantedAuthority(role)))
    }
}
