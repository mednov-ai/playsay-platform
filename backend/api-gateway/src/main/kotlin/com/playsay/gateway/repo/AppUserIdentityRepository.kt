package com.playsay.gateway.repo

import java.sql.Timestamp
import java.time.Instant
import java.util.UUID
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import org.springframework.transaction.annotation.Propagation
import org.springframework.transaction.annotation.Transactional

@Repository
class AppUserIdentityRepository(
    private val jdbcTemplate: JdbcTemplate,
) {
    @Suppress("LongParameterList")
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    fun upsert(
        id: UUID,
        subject: String,
        username: String?,
        email: String?,
        name: String?,
        roles: String?,
        displayName: String?,
        issuedAt: Instant,
        now: Instant,
    ): UUID = if (isH2()) {
        upsertH2(id, subject, username, email, name, roles, displayName, now)
    } else requireNotNull(
        jdbcTemplate.queryForObject(
            UPSERT_SQL,
            UUID::class.java,
            id,
            subject,
            username,
            email,
            name,
            roles,
            displayName,
            Timestamp.from(now),
            Timestamp.from(now),
            Timestamp.from(issuedAt),
            Timestamp.from(issuedAt),
        ),
    )

    @Suppress("LongParameterList")
    private fun upsertH2(
        id: UUID,
        subject: String,
        username: String?,
        email: String?,
        name: String?,
        roles: String?,
        displayName: String?,
        now: Instant,
    ): UUID {
        val existingId = jdbcTemplate.query(
            "select id from app_user where keycloak_subject = ?",
            { result, _ -> result.getObject("id", UUID::class.java) },
            subject,
        ).firstOrNull()
        if (existingId != null) {
            jdbcTemplate.update(
                "update app_user set username = ?, email = ?, name = ?, roles = ?, updated_at = ? where id = ?",
                username, email, name, roles, Timestamp.from(now), existingId,
            )
            return existingId
        }
        jdbcTemplate.update(
            H2_INSERT_SQL,
            id, subject, username, email, name, roles, displayName, Timestamp.from(now), Timestamp.from(now),
        )
        return id
    }

    private fun isH2(): Boolean = jdbcTemplate.dataSource?.connection?.use { connection ->
        connection.metaData.databaseProductName.equals("H2", ignoreCase = true)
    } ?: false

    private companion object {
        val UPSERT_SQL = """
            insert into app_user (
                id, keycloak_subject, username, email, name, roles, display_name,
                country_code, managed_by_teacher, created_at, updated_at
            ) values (?, ?, ?, ?, ?, ?, ?, 'RU', false, ?, ?)
            on conflict (keycloak_subject) do update set
                username = excluded.username,
                email = excluded.email,
                name = excluded.name,
                display_name = coalesce(app_user.display_name, excluded.display_name),
                roles = case
                    when app_user.roles_changed_at is null or ? >= app_user.roles_changed_at then excluded.roles
                    else app_user.roles
                end,
                roles_changed_at = case
                    when app_user.roles_changed_at is null or ? >= app_user.roles_changed_at then null
                    else app_user.roles_changed_at
                end,
                updated_at = excluded.updated_at
            returning id
        """.trimIndent()

        val H2_INSERT_SQL = """
            insert into app_user (
                id, keycloak_subject, username, email, name, roles, display_name,
                country_code, managed_by_teacher, created_at, updated_at
            ) values (?, ?, ?, ?, ?, ?, ?, 'RU', false, ?, ?)
        """.trimIndent()
    }
}
