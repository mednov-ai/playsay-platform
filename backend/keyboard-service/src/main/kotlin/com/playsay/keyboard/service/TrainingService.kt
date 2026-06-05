package com.playsay.keyboard.service

import com.playsay.keyboard.dto.FingerErrorsResponse
import com.playsay.keyboard.dto.ProgressResponse
import com.playsay.keyboard.dto.SubmitResultRequest
import com.playsay.keyboard.dto.TrainingResultResponse
import com.playsay.keyboard.entity.TrainingResultEntity
import com.playsay.keyboard.mapper.toResponse
import com.playsay.keyboard.repo.ChordSetRepo
import com.playsay.keyboard.repo.TrainingResultRepo
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException

@Service
class TrainingService(
    private val chordSetRepo: ChordSetRepo,
    private val trainingResultRepo: TrainingResultRepo,
) {
    @Transactional
    fun submit(subject: String, request: SubmitResultRequest): TrainingResultResponse {
        if (!chordSetRepo.existsById(request.chordSetId)) {
            throw ResponseStatusException(HttpStatus.NOT_FOUND, "Chord set not found.")
        }

        val saved = trainingResultRepo.save(
            TrainingResultEntity(
                keycloakSubject = subject,
                chordSetId = request.chordSetId,
                speedCpm = request.speedCpm,
                accuracy = request.accuracy,
                errors = request.errors,
                durationMs = request.durationMs,
                perFinger = request.perFinger.filterValues { errors -> errors > 0 },
            ),
        )
        return saved.toResponse()
    }

    @Transactional(readOnly = true)
    fun progress(subject: String): ProgressResponse {
        val results = trainingResultRepo.findByKeycloakSubjectOrderByCreatedAtDesc(subject)
        if (results.isEmpty()) {
            return ProgressResponse(
                sessions = 0,
                bestSpeedCpm = 0.0,
                avgSpeedCpm = 0.0,
                avgAccuracy = 0.0,
                weakFingers = emptyList(),
                recent = emptyList(),
            )
        }

        val weakFingers = results
            .flatMap { result -> result.perFinger.entries }
            .groupBy({ entry -> entry.key }, { entry -> entry.value })
            .map { (finger, errors) -> FingerErrorsResponse(finger = finger, errors = errors.sum()) }
            .sortedByDescending { finger -> finger.errors }

        return ProgressResponse(
            sessions = results.size,
            bestSpeedCpm = results.maxOf { result -> result.speedCpm },
            avgSpeedCpm = results.map { result -> result.speedCpm }.average(),
            avgAccuracy = results.map { result -> result.accuracy }.average(),
            weakFingers = weakFingers,
            recent = results.take(10).map { result -> result.toResponse() },
        )
    }
}
