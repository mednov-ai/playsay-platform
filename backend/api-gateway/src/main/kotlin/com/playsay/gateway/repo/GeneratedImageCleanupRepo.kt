package com.playsay.gateway.repo

import java.sql.Timestamp
import java.time.Instant
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import org.springframework.transaction.annotation.Transactional

@Repository
class GeneratedImageCleanupRepo(private val jdbc: JdbcTemplate) {
    fun register(key: String, at: Instant) {
        jdbc.update("insert into material_image_object_cleanup(storage_key, eligible_at) values (?, ?)", key, Timestamp.from(at))
    }

    fun retire(key: String, at: Instant) {
        jdbc.update(
            """insert into material_image_object_cleanup(storage_key, eligible_at)
               select ?, ? where not exists (select 1 from material_image_object_cleanup where storage_key = ?)""",
            key, Timestamp.from(at), key,
        )
    }

    fun releaseForPublication(key: String): Boolean = jdbc.update(
        "delete from material_image_object_cleanup where storage_key = ? and collecting = false", key,
    ) == 1

    fun due(at: Instant): List<String> = jdbc.queryForList(
        "select storage_key from material_image_object_cleanup where eligible_at <= ? order by eligible_at limit 50",
        String::class.java, Timestamp.from(at),
    ).filterNotNull()

    @Transactional
    fun claim(key: String, now: Instant): Boolean {
        val updated = jdbc.update(
            "update material_image_object_cleanup set collecting = true where storage_key = ? and eligible_at <= ?",
            key, Timestamp.from(now),
        )
        if (updated == 0) return false
        val inUse = jdbc.queryForObject(
            """select case when exists (select 1 from material_asset where storage_key = ? or position(? in metadata) > 0)
               or exists (select 1 from html_game_blob where storage_key = ?) then 1 else 0 end""",
            Int::class.java, key, key, key,
        ) == 1
        if (inUse) jdbc.update(
            "update material_image_object_cleanup set eligible_at = ? where storage_key = ?",
            Timestamp.from(now.plusSeconds(3600)), key,
        )
        return !inUse
    }

    fun complete(key: String) {
        jdbc.update("delete from material_image_object_cleanup where storage_key = ? and collecting = true", key)
    }
}
