package com.playsay.keyboard.entity

import jakarta.persistence.CollectionTable
import jakarta.persistence.Column
import jakarta.persistence.ElementCollection
import jakarta.persistence.Entity
import jakarta.persistence.FetchType
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.JoinColumn
import jakarta.persistence.OrderColumn
import jakarta.persistence.Table

@Entity
@Table(name = "keyboard_chord_sets")
class ChordSetEntity(
    @Column(nullable = false, length = 8)
    var layout: String,

    @Column(nullable = false, length = 255)
    var title: String,

    @Column(nullable = false)
    var difficulty: Int,

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "keyboard_chords", joinColumns = [JoinColumn(name = "chord_set_id")])
    @OrderColumn(name = "position")
    @Column(name = "chord_value", nullable = false, length = 16)
    var chords: MutableList<String> = mutableListOf(),

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long = 0,
)
