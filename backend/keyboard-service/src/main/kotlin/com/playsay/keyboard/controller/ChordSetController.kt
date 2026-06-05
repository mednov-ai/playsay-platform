package com.playsay.keyboard.controller

import com.playsay.keyboard.dto.ChordSetResponse
import com.playsay.keyboard.service.ChordSetService
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/chord-sets")
class ChordSetController(
    private val chordSetService: ChordSetService,
) {
    @GetMapping
    fun list(
        @RequestParam layout: String,
        @RequestParam(required = false) difficulty: Int?,
    ): List<ChordSetResponse> =
        chordSetService.list(layout, difficulty)

    @GetMapping("/{id}")
    fun get(@PathVariable id: Long): ChordSetResponse =
        chordSetService.get(id)
}
