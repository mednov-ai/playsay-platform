package com.playsay.gateway.service

import com.playsay.gateway.entity.LessonAccessLinkEntity
import com.playsay.gateway.entity.LessonEntity
import com.playsay.gateway.entity.LessonEntryAttemptEntity
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.repo.LessonAccessLinkRepo
import com.playsay.gateway.repo.LessonEntryAttemptRepo
import com.playsay.gateway.repo.schedule.LessonRepo
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.util.Base64
import java.util.Optional
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotEquals
import org.mockito.ArgumentMatchers.any
import org.mockito.Mockito.mock
import org.mockito.Mockito.verifyNoInteractions
import org.mockito.Mockito.`when`

class LessonAccessLinkServiceTest {
    private val now = Instant.parse("2026-08-30T10:00:00Z")
    private val tokenService = LessonAccessTokenService(
        Base64.getEncoder().encodeToString(ByteArray(32) { 9 }),
        "https://auth.honey-school.ru/realms/playsay",
        4,
    )
    private val originPolicy = LessonAccessOriginPolicy(
        "https://online.honey.school",
        "https://online.honeyschool.ru",
    )

    @Test
    fun `foreign origin fails before compact alias lookup`() {
        val fixture = fixture()

        assertFailsWith<ProjectResponseException> {
            fixture.service.startCompact("abcdefghijklmnop", "https://online.honeyschool.ru.example")
        }

        verifyNoInteractions(fixture.linkRepo)
    }

    @Test
    fun `same active alias starts independent attempts bound to ru and school origins`() {
        val fixture = fixture(withActiveLink = true)
        val alias = tokenService.deriveAlias(fixture.lessonId, 2, 4)

        val ru = fixture.service.startCompact(alias, "https://online.honeyschool.ru")
        val school = fixture.service.startCompact(alias, "https://online.honey.school")

        assertNotEquals(ru.attemptId, school.attemptId)
        assertEquals(
            listOf("https://online.honeyschool.ru", "https://online.honey.school"),
            fixture.savedAttempts.map { it.requestOrigin },
        )
    }

    private fun fixture(withActiveLink: Boolean = false): Fixture {
        val lessonId = UUID.randomUUID()
        val linkRepo = mock(LessonAccessLinkRepo::class.java)
        val attemptRepo = mock(LessonEntryAttemptRepo::class.java)
        val lessonRepo = mock(LessonRepo::class.java)
        val savedAttempts = mutableListOf<LessonEntryAttemptEntity>()
        if (withActiveLink) {
            val alias = tokenService.deriveAlias(lessonId, 2, 4)
            `when`(linkRepo.findFirstByAliasHashAndRevokedAtIsNull(tokenService.hash(alias))).thenReturn(
                LessonAccessLinkEntity(
                    lessonId = lessonId,
                    tokenHash = tokenService.hash(tokenService.derive(lessonId, 2, 4)),
                    aliasHash = tokenService.hash(alias),
                    revision = 2,
                    keyVersion = 4,
                    origin = originPolicy.defaultOrigin,
                    createdBySubject = "teacher",
                    createdAt = now,
                ),
            )
            `when`(lessonRepo.findById(lessonId)).thenReturn(
                Optional.of(
                    LessonEntity(
                        id = lessonId,
                        scheduledStart = now.minusSeconds(60),
                        scheduledEnd = now.plusSeconds(3600),
                        status = "SCHEDULED",
                    ),
                ),
            )
            `when`(attemptRepo.save(any())).thenAnswer { invocation ->
                (invocation.arguments[0] as LessonEntryAttemptEntity).also(savedAttempts::add)
            }
        }
        val service = LessonAccessLinkService(
            linkRepo,
            attemptRepo,
            lessonRepo,
            mock(ScheduledLessonAuthorizationService::class.java),
            tokenService,
            originPolicy,
            mock(LessonAccessAuditService::class.java),
            true,
            900,
            Clock.fixed(now, ZoneOffset.UTC),
        )
        return Fixture(service, lessonId, linkRepo, savedAttempts)
    }

    private data class Fixture(
        val service: LessonAccessLinkService,
        val lessonId: UUID,
        val linkRepo: LessonAccessLinkRepo,
        val savedAttempts: List<LessonEntryAttemptEntity>,
    )
}
