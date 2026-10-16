package com.playsay.gateway.service.game

import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import org.springframework.stereotype.Service

/** A version claim is accepted only after the websocket's lesson subscription was authorized. */
@Service
class GameProtocolCompatibilityService {
    private val versions = ConcurrentHashMap<UUID, ConcurrentHashMap<String, Int>>()
    fun subscribe(sessionId: String, lessonId: UUID, version: Int?) { versions.compute(lessonId) { _, current -> (current ?: ConcurrentHashMap()).apply { put(sessionId, version ?: 0) } } }
    fun unregister(sessionId: String): Set<UUID> {
        val changed = mutableSetOf<UUID>()
        versions.keys.forEach { lesson -> versions.computeIfPresent(lesson) { _, current ->
            if (current.remove(sessionId) != null) changed += lesson
            current.takeIf { it.isNotEmpty() }
        } }
        return changed
    }
    fun ready(lessonId: UUID): Boolean = versions[lessonId].orEmpty().values.all { it == 1 }
}
