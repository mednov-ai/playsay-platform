package com.playsay.gateway.service

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class LessonAdmissionStateMachineTest {
    @Test
    fun `allowed transitions are table driven`() {
        val cases = listOf(
            Case(null, LessonAdmissionEvent.REQUEST_LOBBY, LessonAdmissionStatus.PENDING),
            Case(null, LessonAdmissionEvent.CONFIRM_IDENTITY, LessonAdmissionStatus.ADMITTED),
            Case(LessonAdmissionStatus.PENDING, LessonAdmissionEvent.APPROVE, LessonAdmissionStatus.ADMITTED),
            Case(LessonAdmissionStatus.PENDING, LessonAdmissionEvent.DENY, LessonAdmissionStatus.DENIED),
            Case(LessonAdmissionStatus.ADMITTED, LessonAdmissionEvent.KICK, LessonAdmissionStatus.KICKED),
            Case(LessonAdmissionStatus.KICKED, LessonAdmissionEvent.REQUEST_REENTRY, LessonAdmissionStatus.KICKED),
            Case(LessonAdmissionStatus.KICKED, LessonAdmissionEvent.READMIT, LessonAdmissionStatus.ADMITTED),
            Case(LessonAdmissionStatus.DENIED, LessonAdmissionEvent.CONFIRM_IDENTITY, LessonAdmissionStatus.ADMITTED),
        )

        cases.forEach { case ->
            assertEquals(case.expected, LessonAdmissionStateMachine.transition(case.current, case.event), case.toString())
        }
    }

    @Test
    fun `email remembered and lobby requests never clear a kick`() {
        assertEquals(
            LessonAdmissionStatus.KICKED,
            LessonAdmissionStateMachine.transition(LessonAdmissionStatus.KICKED, LessonAdmissionEvent.CONFIRM_IDENTITY),
        )
        assertEquals(
            LessonAdmissionStatus.KICKED,
            LessonAdmissionStateMachine.transition(LessonAdmissionStatus.KICKED, LessonAdmissionEvent.REQUEST_LOBBY),
        )
    }

    @Test
    fun `teacher actions fail closed from invalid states`() {
        val cases = listOf(
            Case(null, LessonAdmissionEvent.APPROVE, null),
            Case(LessonAdmissionStatus.ADMITTED, LessonAdmissionEvent.APPROVE, null),
            Case(LessonAdmissionStatus.DENIED, LessonAdmissionEvent.KICK, null),
            Case(LessonAdmissionStatus.PENDING, LessonAdmissionEvent.READMIT, null),
            Case(LessonAdmissionStatus.ADMITTED, LessonAdmissionEvent.REQUEST_REENTRY, null),
        )

        cases.forEach { case ->
            assertFailsWith<InvalidLessonAdmissionTransition>(case.toString()) {
                LessonAdmissionStateMachine.transition(case.current, case.event)
            }
        }
    }

    private data class Case(
        val current: LessonAdmissionStatus?,
        val event: LessonAdmissionEvent,
        val expected: LessonAdmissionStatus?,
    )
}
