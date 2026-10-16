package com.playsay.gateway.service.game

import com.playsay.gateway.dto.LessonGameLaunchResponse
import com.playsay.gateway.repo.game.HtmlGameRepository
import com.playsay.gateway.repo.schedule.LessonRepo
import com.playsay.gateway.service.LessonAdmissionGuard
import com.playsay.gateway.service.ScheduledLessonAuthorizationService
import com.playsay.gateway.service.ScheduledLessonStore
import com.playsay.gateway.service.isLessonInsideAccessWindow
import java.time.Instant
import java.util.UUID
import org.springframework.http.HttpStatus
import org.springframework.jdbc.core.RowMapper
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.stereotype.Service

@Service
class LessonGameAccessService(
    private val lessons: ScheduledLessonStore,
    private val lessonRepo: LessonRepo,
    private val authorization: ScheduledLessonAuthorizationService,
    private val admissions: LessonAdmissionGuard,
    private val repository: HtmlGameRepository,
    private val compatibility: GameProtocolCompatibilityService,
) {
    fun canManage(auth: JwtAuthenticationToken, lessonId: UUID): Boolean = authorization.canManageLesson(auth, lessonId)
    fun protocolReady(lessonId: UUID): Boolean = compatibility.ready(lessonId)

    fun requireAccess(auth: JwtAuthenticationToken, lessonId: UUID, manager: Boolean = false) {
        val lesson = lessons.get(auth, lessonId)
        if (admissions.isKicked(lessonId, auth) || !lesson.accessAllowed || lesson.status != "IN_PROGRESS" || lesson.workMode != "SHARED") gameError(HttpStatus.FORBIDDEN, "GAME_LESSON_ACCESS_DENIED")
        if (manager && !authorization.canManageLesson(auth, lessonId)) gameError(HttpStatus.FORBIDDEN, "GAME_LESSON_ACCESS_DENIED")
        if (!authorization.canManageLesson(auth, lessonId) && lesson.participants.none { it.subject == auth.token.subject }) gameError(HttpStatus.FORBIDDEN, "GAME_LESSON_ACCESS_DENIED")
    }

    fun launch(lessonId: UUID, launchId: UUID): LessonGameLaunchResponse = repository.jdbc.query("SELECT * FROM lesson_game_launch WHERE id=? AND lesson_id=?", launchMapper, launchId, lessonId).firstOrNull() ?: gameError(HttpStatus.NOT_FOUND, "GAME_LAUNCH_NOT_FOUND")

    fun state(lessonId: UUID): com.playsay.gateway.dto.LessonGameStateResponse = repository.jdbc.query(
        "SELECT p.revision,p.kind AS primary_kind,l.* FROM lesson_presentation p LEFT JOIN lesson_game_launch l ON l.id=p.game_launch_id AND p.kind='GAME' AND l.status='ACTIVE' WHERE p.lesson_id=?",
        RowMapper { rs, row -> com.playsay.gateway.dto.LessonGameStateResponse(if (rs.getObject("id") == null) null else launchMapper.mapRow(rs, row), rs.getLong("revision"), primaryKind = rs.getString("primary_kind")) }, lessonId,
    ).firstOrNull() ?: com.playsay.gateway.dto.LessonGameStateResponse(null, 0, primaryKind = "MATERIAL")

    fun active(lessonId: UUID): LessonGameLaunchResponse? = repository.jdbc.query("SELECT l.* FROM lesson_game_launch l JOIN lesson_presentation p ON p.game_launch_id=l.id AND p.kind='GAME' WHERE l.lesson_id=? AND l.status='ACTIVE'", launchMapper, lessonId).firstOrNull()

    fun requireActiveDocument(lessonId: UUID, documentId: UUID) {
        if (!compatibility.ready(lessonId)) gameError(HttpStatus.CONFLICT, "GAME_CLIENT_UPDATE_REQUIRED")
        val launch = active(lessonId)
        val binding = repository.jdbc.queryForObject("SELECT COUNT(*) FROM collaboration_document d JOIN lesson_game_launch l ON l.id=d.game_launch_id AND l.document_id=d.id WHERE d.id=? AND d.lesson_id=? AND l.lesson_id=d.lesson_id", Long::class.java, documentId, lessonId) ?: 0
        if (binding != 1L || launch?.documentId != documentId) gameError(HttpStatus.FORBIDDEN, "GAME_LAUNCH_NOT_ACTIVE")
        val lesson = lessonRepo.findScheduledMaterialLookup(lessonId) ?: gameError(HttpStatus.NOT_FOUND, "GAME_LESSON_NOT_FOUND")
        if (lesson.workMode != "SHARED" || lesson.status != "IN_PROGRESS" || !isLessonInsideAccessWindow(status = lesson.status, scheduledStart = lesson.scheduledStart, scheduledEnd = lesson.scheduledEnd, accessExtensionSeconds = lesson.accessExtensionSeconds, now = Instant.now(), closedStatuses = setOf("COMPLETED", "CANCELLED"))) gameError(HttpStatus.FORBIDDEN, "GAME_LESSON_ACCESS_DENIED")
    }

    private val launchMapper = RowMapper { rs, _ -> LessonGameLaunchResponse(rs.getObject("id", UUID::class.java), rs.getObject("lesson_id", UUID::class.java), rs.getObject("game_id", UUID::class.java), rs.getObject("revision_id", UUID::class.java), rs.getString("status"), rs.getObject("document_id", UUID::class.java), rs.getTimestamp("created_at").toInstant()) }
}
