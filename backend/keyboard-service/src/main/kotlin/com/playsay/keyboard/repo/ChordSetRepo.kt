package com.playsay.keyboard.repo

import com.playsay.keyboard.entity.ChordSetEntity
import org.springframework.data.jpa.repository.JpaRepository

interface ChordSetRepo : JpaRepository<ChordSetEntity, Long> {
    fun findByLayoutOrderByDifficultyAscIdAsc(layout: String): List<ChordSetEntity>

    fun findByLayoutAndDifficultyOrderByDifficultyAscIdAsc(layout: String, difficulty: Int): List<ChordSetEntity>
}
