package com.playsay.keyboard.service

import com.playsay.keyboard.dto.ChordSetResponse
import com.playsay.keyboard.mapper.toResponse
import com.playsay.keyboard.repo.ChordSetRepo
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException

@Service
class ChordSetService(
    private val chordSetRepo: ChordSetRepo,
) {
    @Transactional(readOnly = true)
    fun list(layout: String, difficulty: Int?): List<ChordSetResponse> {
        val normalizedLayout = normalizeLayout(layout)
        val sets = if (difficulty == null) {
            chordSetRepo.findByLayoutOrderByDifficultyAscIdAsc(normalizedLayout)
        } else {
            chordSetRepo.findByLayoutAndDifficultyOrderByDifficultyAscIdAsc(normalizedLayout, difficulty)
        }
        return sets.map { set -> set.toResponse() }
    }

    @Transactional(readOnly = true)
    fun get(id: Long): ChordSetResponse =
        chordSetRepo.findById(id)
            .map { set -> set.toResponse() }
            .orElseThrow { ResponseStatusException(HttpStatus.NOT_FOUND, "Chord set not found.") }

    private fun normalizeLayout(layout: String): String {
        val normalized = layout.trim().uppercase()
        if (normalized !in supportedLayouts) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported keyboard layout.")
        }
        return normalized
    }

    private companion object {
        val supportedLayouts = setOf("EN", "RU")
    }
}
