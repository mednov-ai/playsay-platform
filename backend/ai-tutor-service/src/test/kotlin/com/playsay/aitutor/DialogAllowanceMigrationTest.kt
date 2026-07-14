package com.playsay.aitutor

import java.sql.DriverManager
import java.time.Instant
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFails
import liquibase.Contexts
import liquibase.LabelExpression
import liquibase.Liquibase
import liquibase.database.DatabaseFactory
import liquibase.database.jvm.JdbcConnection
import liquibase.resource.ClassLoaderResourceAccessor

class DialogAllowanceMigrationTest {
    @Test
    fun `creates nonnegative accounts and idempotent ledger references`() {
        val jdbcUrl = "jdbc:h2:mem:ai-dialog-allowance-migration;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1"
        DriverManager.getConnection(jdbcUrl, "sa", "").use { connection ->
            connection.createStatement().use { statement ->
                statement.execute("create table app_user (id uuid primary key)")
                statement.execute(
                    """
                    create table ai_tutor_sessions (
                        id uuid primary key,
                        keycloak_subject varchar(255) not null,
                        status varchar(16) not null,
                        started_at timestamp with time zone not null
                    )
                    """.trimIndent(),
                )
            }
            val database = DatabaseFactory.getInstance().findCorrectDatabaseImplementation(JdbcConnection(connection))
            Liquibase(
                "db/changelog/2026-07-14-001-dialog-allowances.xml",
                ClassLoaderResourceAccessor(),
                database,
            ).update(Contexts(), LabelExpression())

            val studentId = UUID.randomUUID()
            val secondStudentId = UUID.randomUUID()
            val now = Instant.parse("2026-07-14T12:00:00Z")
            connection.prepareStatement("insert into app_user (id) values (?)").use { statement ->
                statement.setObject(1, studentId)
                statement.executeUpdate()
                statement.setObject(1, secondStudentId)
                statement.executeUpdate()
            }
            connection.prepareStatement(
                "insert into ai_tutor_dialog_accounts (student_user_id, remaining_dialogs, version, created_at, updated_at) values (?, 1, 0, ?, ?)",
            ).use { statement ->
                statement.setObject(1, studentId)
                statement.setObject(2, now)
                statement.setObject(3, now)
                assertEquals(1, statement.executeUpdate())
            }
            assertFails {
                connection.prepareStatement(
                    "insert into ai_tutor_dialog_accounts (student_user_id, remaining_dialogs, version, created_at, updated_at) values (?, -1, 0, ?, ?)",
                ).use { statement ->
                    statement.setObject(1, secondStudentId)
                    statement.setObject(2, now)
                    statement.setObject(3, now)
                    statement.executeUpdate()
                }
            }
        }
    }
}
