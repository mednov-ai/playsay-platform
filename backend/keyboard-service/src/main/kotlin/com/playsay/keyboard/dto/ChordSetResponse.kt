package com.playsay.keyboard.dto

data class ChordSetResponse(
    val id: Long,
    val layout: String,
    val title: String,
    val difficulty: Int,
    val chords: List<String>,
)
