package com.playsay.vocabulary.service

import com.fasterxml.jackson.core.type.TypeReference
import com.fasterxml.jackson.databind.ObjectMapper
import com.playsay.vocabulary.dto.PracticeDelivery
import com.playsay.vocabulary.dto.VocabularyPracticeSettingsRequest
import com.playsay.vocabulary.dto.VocabularySelectionCriteriaRequest
import com.playsay.vocabulary.dto.VocabularySelectionRecipeRequest
import com.playsay.vocabulary.dto.VocabularySelectionSource
import com.playsay.vocabulary.entity.VocabularyEntryEntity
import com.playsay.vocabulary.repo.VocabularyEntryRepo
import com.playsay.vocabulary.repo.VocabularyPracticeItemRepo
import java.time.Instant
import java.util.UUID
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.web.server.ResponseStatusException

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

    @Test
    fun `saved recipe resolves dynamically while materialized plans stay immutable and idempotent`() {
        val owner = "recipe-owner-${UUID.randomUUID()}"
        jdbc.update(
            "insert into app_user(id, keycloak_subject, username, display_name) values (?, ?, ?, ?)",
            UUID.randomUUID(), owner, "recipe", "Recipe learner",
        )
        entries.save(
            VocabularyEntryEntity(
                ownerSubject = owner,
                sourceText = "first",
                normalizedSource = "first",
                translation = "первый",
                createdBySubject = owner,
            ),
        )
        val recipe = practice.createRecipe(
            owner,
            VocabularySelectionRecipeRequest(
                name = "All current words",
                selection = VocabularySelectionCriteriaRequest(sources = setOf(VocabularySelectionSource.FULL_DICTIONARY)),
                wordLimit = 10,
            ),
        )
        val firstPreview = practice.preview(
            owner,
            VocabularyPracticeSettingsRequest(recipeId = recipe.id, materializationKey = "recipe-launch-1"),
        )
        val repeatedPreview = practice.preview(
            owner,
            VocabularyPracticeSettingsRequest(recipeId = recipe.id, materializationKey = "recipe-launch-1"),
        )
        entries.save(
            VocabularyEntryEntity(
                ownerSubject = owner,
                sourceText = "second",
                normalizedSource = "second",
                translation = "второй",
                createdBySubject = owner,
            ),
        )
        val refreshedPreview = practice.preview(owner, VocabularyPracticeSettingsRequest(recipeId = recipe.id))
        val launched = practice.create(
            owner,
            VocabularyPracticeSettingsRequest(
                delivery = PracticeDelivery.SELF,
                planId = firstPreview.planId,
                planRevision = firstPreview.revision,
            ),
        )

        assertEquals(firstPreview.planId, repeatedPreview.planId)
        assertEquals(firstPreview.revision, repeatedPreview.revision)
        assertEquals(1, firstPreview.owners.single().selectedCount)
        assertEquals(2, refreshedPreview.owners.single().selectedCount)
        assertEquals(firstPreview.owners.single().estimatedItemCount, launched.sessions.single().totalItems)
        assertEquals(recipe.id, practice.recipe(owner, recipe.id).id)
        assertEquals(1, practice.recipes(owner).size)
        assertThrows(ResponseStatusException::class.java) { practice.recipe("another-learner", recipe.id) }
    }

    @Test
    fun `empty explicit preview is safe and stale preview revisions are rejected`() {
        val owner = "empty-owner-${UUID.randomUUID()}"
        jdbc.update(
            "insert into app_user(id, keycloak_subject, username, display_name) values (?, ?, ?, ?)",
            UUID.randomUUID(), owner, "empty", "Empty learner",
        )
        val foreignId = UUID.randomUUID()
        val empty = practice.preview(
            owner,
            VocabularyPracticeSettingsRequest(
                selection = VocabularySelectionCriteriaRequest(
                    sources = setOf(VocabularySelectionSource.EXPLICIT),
                    explicitEntryIds = listOf(foreignId),
                ),
            ),
        )
        val revised = practice.preview(
            owner,
            VocabularyPracticeSettingsRequest(planId = empty.planId, planRevision = empty.revision),
        )

        assertEquals(0, empty.owners.single().selectedCount)
        assertEquals("NOT_FOUND_OR_UNAUTHORIZED", empty.exclusions.single().reason)
        assertThrows(ResponseStatusException::class.java) {
            practice.preview(
                owner,
                VocabularyPracticeSettingsRequest(planId = empty.planId, planRevision = empty.revision),
            )
        }
        assertEquals(empty.revision + 1, revised.revision)
    }
}
