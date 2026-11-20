package com.playsay.gateway.repo

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.playsay.gateway.dto.MaterialLibraryItemResponse
import com.playsay.gateway.dto.MaterialLibraryPageResponse
import com.playsay.gateway.dto.MaterialLibraryQuery
import java.sql.ResultSet
import java.sql.Timestamp
import java.time.Instant
import java.util.UUID
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate
import org.springframework.stereotype.Repository

data class LibraryViewer(val id: UUID?, val admin: Boolean, val teacher: Boolean, val boardAdmin: Boolean, val boardTeacher: Boolean)

@Repository
class MaterialLibraryPageRepo(private val jdbc: NamedParameterJdbcTemplate) {
    private val postgres by lazy {
        jdbc.jdbcTemplate.execute(org.springframework.jdbc.core.ConnectionCallback { it.metaData.databaseProductName == "PostgreSQL" }) == true
    }

    fun list(viewer: LibraryViewer, query: MaterialLibraryQuery, now: Instant): MaterialLibraryPageResponse {
        val sources = buildList {
            if (query.kind != "LESSON_WHITEBOARD") add(materials)
            if (query.kind != "MATERIAL" && query.category != "STUDY") add(boards)
        }
        if (sources.isEmpty()) return MaterialLibraryPageResponse(emptyList(), 0, query.offset, query.limit)
        val filters = filters(query)
        val from = "from (${sources.joinToString(" union all ")}) items" +
            if (filters.isEmpty()) "" else filters.joinToString(" and ", " where ")
        val params = mapOf(
            "id" to viewer.id, "admin" to viewer.admin, "teacher" to viewer.teacher, "boardAdmin" to viewer.boardAdmin,
            "boardTeacher" to viewer.boardTeacher, "now" to Timestamp.from(now), "isLesson" to (query.category == "LESSON"),
            "level" to query.level, "query" to query.query, "topic" to query.topic, "skill" to query.skill,
            "limit" to query.limit, "offset" to query.offset,
        )
        val total = jdbc.queryForObject("select count(*) $from", params, Int::class.java) ?: 0
        val items = if (query.offset >= total) emptyList() else jdbc.query(
            "select * $from order by updated_at desc, kind, $uuidOrder limit :limit offset :offset", params,
        ) { row, _ -> summary(row) }
        return MaterialLibraryPageResponse(items, total, query.offset, query.limit)
    }

    private fun folded(expression: String) =
        if (postgres) """lower(cast($expression as text) collate "unicode")""" else "lower($expression)"

    private fun filters(query: MaterialLibraryQuery) = buildList {
        if (query.category != "ALL") add("is_lesson_material = :isLesson")
        if (!query.level.isNullOrBlank()) add("${folded("cefr_level")} = ${folded(":level")}")
        if (!query.query.isNullOrBlank()) add("position(${folded(":query")} in ${folded("coalesce(title, '')")}) > 0")
        if (!query.topic.isNullOrBlank()) add(tagFilter("topic_tags", "topic"))
        if (!query.skill.isNullOrBlank()) add(tagFilter("skill_tags", "skill"))
    }

    private fun tagFilter(column: String, parameter: String): String = if (postgres) {
        """exists (select 1 from jsonb_array_elements_text(
               case when $column is json array then cast($column as jsonb) else cast('[]' as jsonb) end
           ) tag(value) where position(${folded(":$parameter")} in ${folded("tag.value")}) > 0)"""
    } else {
        "playsay_library_tag_matches($column, :$parameter)"
    }

    private fun summary(row: ResultSet) = MaterialLibraryItemResponse(
        id = row.getObject("id", UUID::class.java), kind = row.getString("kind"), title = row.getString("title"),
        isLessonMaterial = row.getBoolean("is_lesson_material"), updatedAt = row.getTimestamp("updated_at").toInstant(),
        lessonId = row.getObject("lesson_id", UUID::class.java), createdAt = row.getTimestamp("created_at").toInstant(),
        cefrLevel = row.getString("cefr_level"), topicTags = libraryTags(row.getString("topic_tags")),
        skillTags = libraryTags(row.getString("skill_tags")), ageBand = row.getString("age_band"),
        estimatedDurationMin = row.getObject("estimated_duration_min") as Int?, status = row.getString("status"),
    )

    private companion object {
        // Java UUID.compareTo orders both 64-bit words as signed values.
        val uuidOrder = listOf(1, 20).joinToString(", ") { start ->
            "case when substring(cast(id as varchar), $start, 1) >= '8' then 0 else 1 end, " +
                "substring(cast(id as varchar), $start, ${if (start == 1) 18 else 17})"
        }
        const val materials = """select m.id, 'MATERIAL' as kind, m.title, m.is_lesson_material, m.updated_at,
            cast(null as uuid) as lesson_id, m.created_at, m.cefr_level, m.topic_tags, m.skill_tags, m.age_band,
            m.estimated_duration_min, m.status from lesson_material m
            where m.status <> 'ARCHIVED' and (:admin or (:teacher and m.owner_teacher_user_id = :id)
            or (m.visibility = 'PUBLIC' and m.status = 'PUBLISHED'))"""

        const val boardManager = """(:boardAdmin or (:boardTeacher and (l.teacher_user_id = :id or (
            exists(select 1 from lesson_participant p where p.lesson_id = l.id)
            and (:admin or not exists (
                select 1 from lesson_participant p join app_user u on u.id = p.student_user_id where p.lesson_id = l.id
                and (u.deleted_at is not null or (u.managed_by_teacher_user_id is distinct from :id and not exists (
                    select 1 from teacher_delegation d join teacher_delegation_student ds on ds.delegation_id = d.id
                    where ds.student_user_id = u.id and d.delegate_teacher_user_id = :id and d.revoked_at is null
                    and d.starts_at <= :now and d.ends_at > :now
                )))
            ))
        ))))"""

        const val boards = """select b.id, 'LESSON_WHITEBOARD' as kind, t.title, true as is_lesson_material,
            greatest(b.updated_at, coalesce(doc.updated_at, b.updated_at)) as updated_at, b.lesson_id,
            b.created_at, cast(null as varchar) as cefr_level, '[]' as topic_tags, '[]' as skill_tags,
            cast(null as varchar) as age_band, cast(null as integer) as estimated_duration_min, cast(null as varchar) as status
            from lesson_whiteboard b join lesson l on l.id = b.lesson_id
            join app_user actor on actor.id = :id and actor.deleted_at is null
            left join lesson_template t on t.id = l.lesson_template_id
            left join collaboration_document doc on doc.id = b.document_id
            where not exists(select 1 from user_deletion_operation del where del.target_subject = actor.keycloak_subject
                and (del.stage <> 'LEGACY' or del.status in ('PENDING','RUNNING','COMPLETED')))
            and ((l.work_mode <> 'PARALLEL' and b.student_user_id is null) or
                 (l.work_mode = 'PARALLEL' and exists(select 1 from lesson_participant p
                    where p.lesson_id = l.id and p.student_user_id = b.student_user_id)))
            and ($boardManager or ((b.student_user_id is null or b.student_user_id = :id)
                and exists(select 1 from lesson_participant p where p.lesson_id = l.id and p.student_user_id = :id)
                and not exists(select 1 from lesson_admission a where a.lesson_id = l.id and a.subject = actor.keycloak_subject
                    and a.status = 'KICKED' and l.status = 'IN_PROGRESS' and l.actual_end is null
                    and l.scheduled_end + (600 + l.access_extension_seconds) * interval '1' second > :now)))"""
    }
}

private val tagMapper = jacksonObjectMapper()

private fun libraryTags(value: String?): List<String> {
    val node = value?.let { runCatching { tagMapper.readTree(it) }.getOrNull() } ?: return emptyList()
    return if (node.isArray) node.mapNotNull { it.asText(null)?.takeIf(String::isNotBlank) } else emptyList()
}

// H2 lacks PostgreSQL's set-returning JSON array function.
fun libraryTagMatches(value: String?, filter: String): Boolean =
    libraryTags(value).any { it.contains(filter, ignoreCase = true) }
