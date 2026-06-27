package com.playsay.gateway.service

import com.playsay.gateway.entity.AppUserEntity
import com.playsay.gateway.entity.LessonEmailReminderEntity
import com.playsay.gateway.repo.AppUserRepo
import com.playsay.gateway.repo.LessonEmailReminderRepo
import com.playsay.gateway.repo.LessonParticipantRepo
import com.playsay.gateway.repo.LessonRepo
import com.playsay.gateway.repo.ScheduledLessonRow
import com.playsay.gateway.utils.MetaData
import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale
import java.util.UUID
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional

@Component
class LessonReminderService(
    private val lessonEmailReminderRepo: LessonEmailReminderRepo,
) {
    fun rebuildPendingReminders(
        lessonId: UUID,
        teacherUserId: UUID?,
        participantUserIds: Collection<UUID>,
        scheduledStart: Instant?,
        status: String,
        now: Instant = Instant.now(),
    ) {
        lessonEmailReminderRepo.deleteByLessonIdAndStatusIn(
            lessonId,
            listOf(MetaData.LessonReminderStatuses.PENDING, MetaData.LessonReminderStatuses.FAILED),
        )
        if (teacherUserId == null || scheduledStart == null || status != MetaData.LessonStatuses.SCHEDULED || !scheduledStart.isAfter(now)) {
            return
        }

        val dueAt = scheduledStart.minus(REMINDER_OFFSET).let { reminderAt ->
            if (reminderAt.isBefore(now)) now else reminderAt
        }
        val recipients = buildList {
            add(LessonReminderRecipient(teacherUserId, MetaData.LessonReminderRecipientRoles.TEACHER))
            participantUserIds.distinct().forEach { userId ->
                add(LessonReminderRecipient(userId, MetaData.LessonReminderRecipientRoles.STUDENT))
            }
        }

        val createdAt = now
        val reminders = recipients.mapNotNull { recipient ->
            val idempotencyKey = idempotencyKey(lessonId, recipient.userId, scheduledStart)
            if (lessonEmailReminderRepo.existsByIdempotencyKey(idempotencyKey)) {
                null
            } else {
                LessonEmailReminderEntity(
                    id = UUID.randomUUID(),
                    lessonId = lessonId,
                    recipientUserId = recipient.userId,
                    recipientRole = recipient.role,
                    reminderType = MetaData.LessonReminderTypes.LESSON_START_30M,
                    dueAt = dueAt,
                    status = MetaData.LessonReminderStatuses.PENDING,
                    attempts = 0,
                    idempotencyKey = idempotencyKey,
                    createdAt = createdAt,
                    updatedAt = createdAt,
                )
            }
        }
        if (reminders.isNotEmpty()) {
            lessonEmailReminderRepo.saveAll(reminders)
        }
    }

    fun cancelPendingReminders(lessonId: UUID) {
        val now = Instant.now()
        val pending = lessonEmailReminderRepo.findByLessonIdOrderByRecipientRoleAscRecipientUserIdAsc(lessonId)
            .filter { reminder -> reminder.status == MetaData.LessonReminderStatuses.PENDING || reminder.status == MetaData.LessonReminderStatuses.FAILED }
        pending.forEach { reminder ->
            reminder.status = MetaData.LessonReminderStatuses.CANCELLED
            reminder.updatedAt = now
        }
        if (pending.isNotEmpty()) {
            lessonEmailReminderRepo.saveAll(pending)
        }
    }

    companion object {
        val REMINDER_OFFSET: Duration = Duration.ofMinutes(30)

        fun idempotencyKey(lessonId: UUID, userId: UUID, scheduledStart: Instant): String =
            "lesson-reminder-30m:$lessonId:$userId:$scheduledStart"
    }
}

@Component
class LessonReminderScheduler(
    private val lessonEmailReminderRepo: LessonEmailReminderRepo,
    private val lessonRepo: LessonRepo,
    private val lessonParticipantRepo: LessonParticipantRepo,
    private val appUserRepo: AppUserRepo,
    private val emailClient: LessonReminderEmailClient,
    @param:Value("\${playsay.public-app-url:https://online.play-and-say.ru}")
    private val publicAppUrl: String,
) {
    @Scheduled(fixedDelayString = "\${playsay.lesson-reminders.poll-delay-ms:60000}")
    @Transactional
    fun dispatchDueReminders() {
        dispatchDueReminders(Instant.now())
    }

    @Transactional
    fun dispatchDueReminders(now: Instant) {
        lessonEmailReminderRepo.findDue(MetaData.LessonReminderStatuses.PENDING, now)
            .forEach { reminder -> dispatch(reminder, now) }
    }

    private fun dispatch(reminder: LessonEmailReminderEntity, now: Instant) {
        val lesson = lessonRepo.findById(reminder.lessonId).orElse(null)
        if (lesson == null || lesson.status != MetaData.LessonStatuses.SCHEDULED || lesson.scheduledStart == null || !lesson.scheduledStart!!.isAfter(now)) {
            mark(reminder, MetaData.LessonReminderStatuses.SKIPPED, now)
            return
        }

        val recipient = appUserRepo.findById(reminder.recipientUserId).orElse(null)
        val to = recipient?.email?.trim().orEmpty()
        if (recipient == null || to.isBlank()) {
            mark(reminder, MetaData.LessonReminderStatuses.SKIPPED, now)
            return
        }

        val scheduleRow = lessonRepo.findScheduleRowById(reminder.lessonId)
        val participants = lessonParticipantRepo.findParticipantRowsByLessonIds(listOf(reminder.lessonId))
        val command = LessonReminderEmailCommand(
            to = to,
            templateKey = "lesson-reminder-30m",
            locale = recipient.locale,
            idempotencyKey = reminder.idempotencyKey,
            model = reminderModel(recipient, scheduleRow, participants.mapNotNull { it.displayName ?: it.username ?: it.subject }),
        )

        reminder.attempts += 1
        runCatching { emailClient.send(command) }
            .onSuccess {
                reminder.status = MetaData.LessonReminderStatuses.SENT
                reminder.sentAt = now
                reminder.lastError = null
            }
            .onFailure { error ->
                logger.warn("lesson reminder email failed reminderId={} lessonId={}", reminder.id, reminder.lessonId, error)
                reminder.status = MetaData.LessonReminderStatuses.FAILED
                reminder.lastError = error.message?.take(1000)
            }
        reminder.updatedAt = now
        lessonEmailReminderRepo.save(reminder)
    }

    private fun reminderModel(
        recipient: AppUserEntity,
        lesson: ScheduledLessonRow?,
        studentNames: List<String>,
    ): Map<String, String?> {
        val locale = recipient.locale?.takeIf { it.isNotBlank() } ?: "ru"
        val zoneId = zoneId(recipient.timezone)
        val startsAt = lesson?.scheduledStart?.let { start ->
            DateTimeFormatter.ofLocalizedDateTime(FormatStyle.MEDIUM, FormatStyle.SHORT)
                .withLocale(Locale.forLanguageTag(locale))
                .withZone(zoneId)
                .format(start)
        }

        return mapOf(
            "displayName" to recipient.displayName(),
            "lessonTitle" to (lesson?.lessonTitle ?: lesson?.courseTitle ?: lesson?.materialTitle ?: "Play&Say lesson"),
            "startsAt" to startsAt,
            "teacherName" to lesson?.teacherName,
            "studentNames" to studentNames.joinToString(", "),
            "lessonUrl" to "${publicAppUrl.trimEnd('/')}/lessons/${lesson?.id}/classroom",
        )
    }

    private fun mark(reminder: LessonEmailReminderEntity, status: String, now: Instant) {
        reminder.status = status
        reminder.updatedAt = now
        lessonEmailReminderRepo.save(reminder)
    }

    private fun zoneId(value: String?): ZoneId =
        runCatching { value?.takeIf { it.isNotBlank() }?.let(ZoneId::of) }.getOrNull() ?: ZoneId.of("Europe/Moscow")

    private fun AppUserEntity.displayName(): String =
        displayName ?: name ?: username ?: keycloakSubject

    private companion object {
        private val logger = LoggerFactory.getLogger(LessonReminderScheduler::class.java)
    }
}

private data class LessonReminderRecipient(
    val userId: UUID,
    val role: String,
)
