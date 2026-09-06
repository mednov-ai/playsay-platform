package com.playsay.gateway.service

import com.playsay.gateway.client.RegistrationGateway
import com.playsay.gateway.client.UserDataPurgeClient
import com.playsay.gateway.entity.AppUserEntity
import com.playsay.gateway.entity.UserDeletionOperationEntity
import com.playsay.gateway.repo.AppUserRepo
import com.playsay.gateway.repo.UserDeletionOperationRepo
import java.time.Clock
import java.util.Optional
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertFailsWith
import org.mockito.Mockito.*

class UserDeletionStepsTest {
    private val operations = mock(UserDeletionOperationRepo::class.java)
    private val users = mock(AppUserRepo::class.java)
    private val ownership = mock(UserOwnershipTransferService::class.java)
    private val teacherCleanup = mock(UserTeacherDeletionCleanup::class.java)
    private val studentCleanup = mock(UserStudentDeletionCleanup::class.java)
    private val purge = mock(UserDataPurgeClient::class.java)
    private val registration = mock(RegistrationGateway::class.java)
    private val steps = UserDeletionSteps(operations, users, ownership, teacherCleanup, studentCleanup, purge, registration, Clock.systemUTC())
    private val operation = UserDeletionOperationEntity(targetSubject = "disposable-user")

    @Test
    fun `suspends before cleanup then deletes identity and completes`() {
        `when`(operations.lockById(operation.id)).thenReturn(operation)
        `when`(users.findById(operation.targetUserId)).thenReturn(Optional.of(AppUserEntity(id = operation.targetUserId)))
        repeat(5) { steps.advance(operation.id) }
        val order = inOrder(registration, ownership, teacherCleanup, studentCleanup, purge)
        order.verify(registration).suspendUser(operation.targetSubject)
        order.verify(teacherCleanup).detachDeletedTeacher(operation.targetUserId)
        order.verify(ownership).revokeTeacherDelegations(operation.targetUserId, operation.requestedByUserId)
        order.verify(studentCleanup).removeFutureStudentAssignments(operation.targetUserId)
        order.verify(purge).purge(operation.targetSubject)
        order.verify(registration).deleteUser(operation.targetSubject)
        order.verify(studentCleanup).clearProfiles(operation.targetUserId)
        assertEquals("COMPLETED", operation.status)
        assertFalse(steps.advance(operation.id))
        verify(registration, times(1)).deleteUser(operation.targetSubject)
    }

    @Test
    fun `suspension failure cannot start cleanup and retains checkpoint`() {
        `when`(operations.lockById(operation.id)).thenReturn(operation)
        doThrow(IllegalStateException()).`when`(registration).suspendUser(operation.targetSubject)
        assertFailsWith<IllegalStateException> { steps.advance(operation.id) }
        steps.fail(operation.id)
        assertEquals("REQUESTED", operation.stage)
        assertEquals("FAILED", operation.status)
        verifyNoInteractions(ownership, teacherCleanup, studentCleanup, purge)
        verify(registration, never()).deleteUser(operation.targetSubject)
    }

    @Test
    fun `resume after identity deletion only finalizes local state`() {
        operation.stage = "IDENTITY_DELETED"
        `when`(operations.lockById(operation.id)).thenReturn(operation)
        `when`(users.findById(operation.targetUserId)).thenReturn(Optional.of(AppUserEntity(id = operation.targetUserId)))
        assertFalse(steps.advance(operation.id))
        assertEquals("COMPLETED", operation.status)
        verifyNoInteractions(registration, purge)
    }
}
