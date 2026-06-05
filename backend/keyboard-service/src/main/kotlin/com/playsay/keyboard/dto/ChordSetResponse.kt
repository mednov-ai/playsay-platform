package com.playsay.keyboard.dto

data class ChordSetResponse(
    val id: Long,
    val layout: String,
    val title: String,
    val difficulty: Int,
    val tier: String,
    val chords: List<String>,
)
