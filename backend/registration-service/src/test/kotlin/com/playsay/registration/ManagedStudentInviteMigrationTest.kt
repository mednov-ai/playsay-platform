package com.playsay.registration

import java.sql.DriverManager
import java.time.Instant
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import liquibase.Contexts
import liquibase.LabelExpression
import liquibase.Liquibase
import liquibase.database.Database
import liquibase.database.DatabaseFactory
import liquibase.database.jvm.JdbcConnection
import liquibase.resource.ClassLoaderResourceAccessor

class ManagedStudentInviteMigrationTest {
    @Test
    fun `backfills legacy email login and makes email optional`() {
        val jdbcUrl = "jdbc:h2:mem:managed-student-invite-migration;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1"
        DriverManager.getConnection(jdbcUrl, "sa", "").use { connection ->
            val database = DatabaseFactory.getInstance()
                .findCorrectDatabaseImplementation(JdbcConnection(connection))
            connection.createStatement().use { statement ->
                statement.execute(
                    """
                    create table managed_student_invites (
                        id uuid primary key,
                        token_hash varchar(64) not null unique,
                        keycloak_subject varchar(255) not null,
                        email_normalized varchar(320) not null,
                        display_name varchar(120),
                        lesson_id uuid not null,
                        continue_url varchar(1024) not null,
                        status varchar(32) not null,
                        expires_at timestamp with time zone not null,
                        consumed_at timestamp with time zone,
                        created_at timestamp with time zone not null,
                        updated_at timestamp with time zone not null
                    )
                    """.trimIndent(),
                )
            }
            val inviteId = UUID.randomUUID()
            val lessonId = UUID.randomUUID()
            val now = Instant.parse("2026-07-13T08:00:00Z")
            connection.prepareStatement(
                """
                insert into managed_student_invites (
                    id, token_hash, keycloak_subject, email_normalized, display_name, lesson_id,
                    continue_url, status, expires_at, created_at, updated_at
                ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """.trimIndent(),
            ).use { statement ->
                statement.setObject(1, inviteId)
                statement.setString(2, "a".repeat(64))
                statement.setString(3, "legacy-subject")
                statement.setString(4, "Legacy.Student@Example.com")
                statement.setString(5, "Legacy Student")
                statement.setObject(6, lessonId)
                statement.setString(7, "https://online.play-and-say.ru/lessons/$lessonId/classroom")
                statement.setString(8, "PENDING")
                statement.setObject(9, now.plusSeconds(3_600))
                statement.setObject(10, now)
                statement.setObject(11, now)
                statement.executeUpdate()
            }

            migrate(database, "db/changelog/2026-07-13-001-managed-student-username.xml")

            connection.prepareStatement(
                "select username_normalized, email_normalized from managed_student_invites where id = ?",
            ).use { statement ->
                statement.setObject(1, inviteId)
                statement.executeQuery().use { rows ->
                    rows.next()
                    assertEquals("legacy.student@example.com", rows.getString("username_normalized"))
                    assertEquals("Legacy.Student@Example.com", rows.getString("email_normalized"))
                }
            }
            connection.prepareStatement(
                """
                insert into managed_student_invites (
                    id, token_hash, keycloak_subject, username_normalized, email_normalized,
                    lesson_id, continue_url, status, expires_at, created_at, updated_at
                ) values (?, ?, ?, ?, null, ?, ?, ?, ?, ?, ?)
                """.trimIndent(),
            ).use { statement ->
                statement.setObject(1, UUID.randomUUID())
                statement.setString(2, "b".repeat(64))
                statement.setString(3, "new-subject")
                statement.setString(4, "new.student")
                statement.setObject(5, UUID.randomUUID())
                statement.setString(6, "https://online.play-and-say.ru/")
                statement.setString(7, "PENDING")
                statement.setObject(8, now.plusSeconds(3_600))
                statement.setObject(9, now)
                statement.setObject(10, now)
                assertEquals(1, statement.executeUpdate())
            }
        }
    }

    private fun migrate(database: Database, changeLog: String) =
        Liquibase(changeLog, ClassLoaderResourceAccessor(), database).update(Contexts(), LabelExpression())
}
