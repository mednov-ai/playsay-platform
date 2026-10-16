package com.playsay.gateway.repo.game

import com.playsay.gateway.dto.LessonGameLaunchResponse
import java.sql.Timestamp
import java.time.Instant
import java.util.UUID
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.core.RowMapper
import org.springframework.stereotype.Repository

/** Lesson row locking and monotonic primary presentation writes share the caller transaction. */
@Repository
class LessonGameRepository(private val jdbc: JdbcTemplate) {
    fun launch(lessonId: UUID, launchId: UUID) = jdbc.query("SELECT * FROM lesson_game_launch WHERE id=? AND lesson_id=?", launchMapper, launchId, lessonId)
    fun state(lessonId: UUID) = jdbc.query(
        "SELECT p.revision,p.kind AS primary_kind,l.* FROM lesson_presentation p LEFT JOIN lesson_game_launch l ON l.id=p.game_launch_id AND p.kind='GAME' AND l.status='ACTIVE' WHERE p.lesson_id=?",
        RowMapper { rs, row -> com.playsay.gateway.dto.LessonGameStateResponse(if (rs.getObject("id") == null) null else launchMapper.mapRow(rs, row), rs.getLong("revision"), primaryKind = rs.getString("primary_kind")) }, lessonId,
    )
    fun active(lessonId: UUID) = jdbc.query("SELECT l.* FROM lesson_game_launch l JOIN lesson_presentation p ON p.game_launch_id=l.id AND p.kind='GAME' WHERE l.lesson_id=? AND l.status='ACTIVE'", launchMapper, lessonId)
    fun documentBinding(documentId: UUID, lessonId: UUID) = jdbc.queryForObject("SELECT COUNT(*) FROM collaboration_document d JOIN lesson_game_launch l ON l.id=d.game_launch_id AND l.document_id=d.id WHERE d.id=? AND d.lesson_id=? AND l.lesson_id=d.lesson_id", Long::class.java, documentId, lessonId) ?: 0
    fun lockLesson(id: UUID) { jdbc.queryForList("SELECT id FROM lesson WHERE id=? FOR UPDATE", id) }
    fun command(key: String) = jdbc.queryForList("SELECT id,game_id,revision_id FROM lesson_game_launch WHERE command_key=?", key)
    fun presentation(id: UUID) = jdbc.queryForList("SELECT p.kind,l.return_kind FROM lesson_presentation p LEFT JOIN lesson_game_launch l ON l.id=p.game_launch_id WHERE p.lesson_id=?", id)
    fun stopPrevious(now: Timestamp, lesson: UUID) = jdbc.update("UPDATE lesson_game_launch SET status='STOPPED',stopped_at=? WHERE lesson_id=? AND status='ACTIVE'", now, lesson)
    fun insert(launch: LessonGameLaunchResponse, returnKind: String, initiator: UUID, key: String) = jdbc.update("INSERT INTO lesson_game_launch(id,lesson_id,game_id,revision_id,status,document_id,return_kind,initiator_user_id,command_key,created_at) VALUES(?,?,?,?,'ACTIVE',?,?,?,?,?)", launch.id, launch.lessonId, launch.gameId, launch.revisionId, launch.documentId, returnKind, initiator, key, Timestamp.from(launch.createdAt))
    fun present(launch: UUID, lesson: UUID) = jdbc.update("UPDATE lesson_presentation SET kind='GAME',game_launch_id=?,revision=revision+1 WHERE lesson_id=?", launch, lesson)
    fun insertPresentation(lesson: UUID, launch: UUID) = jdbc.update("INSERT INTO lesson_presentation(lesson_id,kind,game_launch_id,revision) VALUES(?,'GAME',?,1)", lesson, launch)
    fun stop(now: Timestamp, launch: UUID) = jdbc.update("UPDATE lesson_game_launch SET status='STOPPED',stopped_at=? WHERE id=? AND status='ACTIVE'", now, launch)
    fun returnKind(launch: UUID) = jdbc.queryForObject("SELECT return_kind FROM lesson_game_launch WHERE id=?", String::class.java, launch)
    fun restorePresentation(kind: String, lesson: UUID, launch: UUID) = jdbc.update("UPDATE lesson_presentation SET kind=?,game_launch_id=NULL,revision=revision+1 WHERE lesson_id=? AND game_launch_id=?", kind, lesson, launch)
    private val launchMapper = RowMapper { rs, _ -> LessonGameLaunchResponse(rs.getObject("id", UUID::class.java), rs.getObject("lesson_id", UUID::class.java), rs.getObject("game_id", UUID::class.java), rs.getObject("revision_id", UUID::class.java), rs.getString("status"), rs.getObject("document_id", UUID::class.java), rs.getTimestamp("created_at").toInstant()) }
}
