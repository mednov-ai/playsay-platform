package com.playsay.vocabulary.entity

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.Table
import jakarta.persistence.UniqueConstraint
import java.time.Instant
import java.util.UUID

@Entity
@Table(
    name = "vocabulary_selection_recipes",
    uniqueConstraints = [UniqueConstraint(name = "uq_vocabulary_recipe_owner_name", columnNames = ["owner_subject", "name"])],
)
class VocabularySelectionRecipeEntity(
    @Id var id: UUID = UUID.randomUUID(),
    @Column(name = "owner_subject", nullable = false, length = 255) var ownerSubject: String = "",
    @Column(nullable = false, length = 120) var name: String = "",
    @Column(nullable = false) var revision: Long = 1,
    @Column(name = "filters_json", nullable = false, columnDefinition = "TEXT") var filtersJson: String = "{}",
    @Column(name = "pinned_entry_ids_json", nullable = false, columnDefinition = "TEXT") var pinnedEntryIdsJson: String = "[]",
    @Column(name = "excluded_entry_ids_json", nullable = false, columnDefinition = "TEXT") var excludedEntryIdsJson: String = "[]",
    @Column(name = "settings_json", nullable = false, columnDefinition = "TEXT") var settingsJson: String = "{}",
    @Column(name = "created_at", nullable = false) var createdAt: Instant = Instant.now(),
    @Column(name = "updated_at", nullable = false) var updatedAt: Instant = Instant.now(),
)
