package com.playsay.vocabulary.service

import com.fasterxml.jackson.core.type.TypeReference
import com.fasterxml.jackson.databind.ObjectMapper
import com.playsay.vocabulary.dto.PracticeDelivery
import com.playsay.vocabulary.dto.VocabularyPracticeSettingsRequest
import com.playsay.vocabulary.entity.VocabularyEntryEntity
import com.playsay.vocabulary.repo.VocabularyEntryRepo
import com.playsay.vocabulary.repo.VocabularyPracticeItemRepo
import java.time.Instant
import java.util.UUID
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.jdbc.core.JdbcTemplate

@SpringBootTest(
    properties = [
        "spring.datasource.url=jdbc:h2:mem:vocabulary-plan;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.liquibase.enabled=false",
        "spring.security.oauth2.resourceserver.jwt.jwk-set-uri=http://localhost/unused-jwks",
    ],
)
class VocabularyPracticePlanIntegrationTest @Autowired constructor(
    private val entries: VocabularyEntryRepo,
    private val items: VocabularyPracticeItemRepo,
    private val jdbc: JdbcTemplate,
    private val objectMapper: ObjectMapper,
    private val practice: VocabularyPracticeService,
) {
    @Test
    fun `published session copies the exact preview snapshot`() {
        jdbc.execute(
            """
                create table if not exists app_user (
                    id uuid primary key,
                    keycloak_subject varchar(255) not null,
                    username varchar(255),
                    display_name varchar(120),
                    locale varchar(16),
                    roles varchar(255),
                    managed_by_teacher_user_id uuid
                )
            """.trimIndent(),
        )
        val owner = "preview-owner-${UUID.randomUUID()}"
        jdbc.update(
            "insert into app_user(id, keycloak_subject, username, display_name) values (?, ?, ?, ?)",
            UUID.randomUUID(),
            owner,
            "preview",
            "Preview learner",
        )
        val entry = entries.save(
            VocabularyEntryEntity(
                ownerSubject = owner,
                sourceText = "steady",
                normalizedSource = "steady",
                translation = "устойчивый",
                createdBySubject = owner,
                createdAt = Instant.parse("2026-07-20T00:00:00Z"),
                updatedAt = Instant.parse("2026-07-20T00:00:00Z"),
            ),
        )
        val preview = practice.preview(
            owner,
            VocabularyPracticeSettingsRequest(
                ownerSubjects = listOf(owner),
                delivery = PracticeDelivery.SELF,
                wordLimit = 1,
            ),
        )
        entry.translation = "изменённый перевод"
        entry.updatedAt = Instant.now()
        entries.save(entry)

        val published = practice.create(
            owner,
            VocabularyPracticeSettingsRequest(
                ownerSubjects = listOf(owner),
                delivery = PracticeDelivery.SELF,
                planId = preview.planId,
                planRevision = preview.revision,
            ),
        )
        val repeatedPublication = practice.create(
            owner,
            VocabularyPracticeSettingsRequest(
                ownerSubjects = listOf(owner),
                delivery = PracticeDelivery.SELF,
                planId = preview.planId,
                planRevision = preview.revision,
            ),
        )
        val sessionItems = items.findAllBySessionIdOrderByPositionAsc(published.sessions.single().id)
        val learnerSession = practice.session(owner, published.sessions.single().id)
        val snapshots = sessionItems.map {
            objectMapper.readValue(it.snapshotJson, object : TypeReference<Map<String, String?>>() {})
        }

        assertEquals("устойчивый", preview.owners.single().entries.single().translation)
        assertEquals(setOf("устойчивый"), snapshots.mapNotNull { it["translation"] }.toSet())
        assertNotEquals(entry.translation, snapshots.first()["translation"])
        assertEquals(published.id, repeatedPublication.id)
        assertNull(learnerSession.currentItem?.translation)
        assertNull(learnerSession.currentItem?.sourceText)
        assertEquals(
            "устойчивый",
            practice.reveal(owner, learnerSession.id, requireNotNull(learnerSession.currentItem).id).expectedAnswer,
        )
    }
}
