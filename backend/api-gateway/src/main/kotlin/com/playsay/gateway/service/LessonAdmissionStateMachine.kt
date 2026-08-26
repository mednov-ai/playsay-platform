package com.playsay.gateway.service

enum class LessonAdmissionStatus { PENDING, ADMITTED, KICKED, DENIED }

enum class LessonAdmissionEvent {
    REQUEST_LOBBY,
    CONFIRM_IDENTITY,
    APPROVE,
    DENY,
    KICK,
    REQUEST_REENTRY,
    READMIT,
}

class InvalidLessonAdmissionTransition(
    val current: LessonAdmissionStatus?,
    val event: LessonAdmissionEvent,
) : IllegalStateException("Lesson admission transition is not allowed")

object LessonAdmissionStateMachine {
    fun transition(current: LessonAdmissionStatus?, event: LessonAdmissionEvent): LessonAdmissionStatus =
        when (event) {
            LessonAdmissionEvent.REQUEST_LOBBY -> when (current) {
                null, LessonAdmissionStatus.DENIED -> LessonAdmissionStatus.PENDING
                LessonAdmissionStatus.PENDING -> LessonAdmissionStatus.PENDING
                LessonAdmissionStatus.ADMITTED -> LessonAdmissionStatus.ADMITTED
                LessonAdmissionStatus.KICKED -> LessonAdmissionStatus.KICKED
            }
            LessonAdmissionEvent.CONFIRM_IDENTITY -> when (current) {
                null, LessonAdmissionStatus.PENDING, LessonAdmissionStatus.DENIED -> LessonAdmissionStatus.ADMITTED
                LessonAdmissionStatus.ADMITTED -> LessonAdmissionStatus.ADMITTED
                LessonAdmissionStatus.KICKED -> LessonAdmissionStatus.KICKED
            }
            LessonAdmissionEvent.APPROVE -> when (current) {
                LessonAdmissionStatus.PENDING -> LessonAdmissionStatus.ADMITTED
                else -> invalid(current, event)
            }
            LessonAdmissionEvent.DENY -> when (current) {
                LessonAdmissionStatus.PENDING -> LessonAdmissionStatus.DENIED
                else -> invalid(current, event)
            }
            LessonAdmissionEvent.KICK -> when (current) {
                LessonAdmissionStatus.ADMITTED, LessonAdmissionStatus.PENDING -> LessonAdmissionStatus.KICKED
                LessonAdmissionStatus.KICKED -> LessonAdmissionStatus.KICKED
                else -> invalid(current, event)
            }
            LessonAdmissionEvent.REQUEST_REENTRY -> when (current) {
                LessonAdmissionStatus.KICKED -> LessonAdmissionStatus.KICKED
                else -> invalid(current, event)
            }
            LessonAdmissionEvent.READMIT -> when (current) {
                LessonAdmissionStatus.KICKED -> LessonAdmissionStatus.ADMITTED
                else -> invalid(current, event)
            }
        }

    private fun invalid(current: LessonAdmissionStatus?, event: LessonAdmissionEvent): Nothing =
        throw InvalidLessonAdmissionTransition(current, event)
}
