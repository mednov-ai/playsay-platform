package com.playsay.registration.service

import com.playsay.registration.repo.ManagedStudentInviteRepo
import kotlin.test.Test
import kotlin.test.assertFailsWith
import org.mockito.Mockito.*

class UserSuspensionTest {
    @Test
    fun `disables identity before revoking sessions without deleting data`() {
        val keycloak = mock(KeycloakRegistrationClient::class.java)
        val invites = mock(ManagedStudentInviteRepo::class.java)
        KeycloakUserManagementService(keycloak, invites).suspend("exact-subject")
        val order = inOrder(keycloak)
        order.verify(keycloak).disableUser("exact-subject")
        order.verify(keycloak).revokeAllSessions("exact-subject")
        verifyNoMoreInteractions(keycloak)
        verifyNoInteractions(invites)
    }

    @Test
    fun `failed disable does not report success`() {
        val keycloak = mock(KeycloakRegistrationClient::class.java)
        doThrow(IllegalStateException()).`when`(keycloak).disableUser("exact-subject")
        assertFailsWith<IllegalStateException> {
            KeycloakUserManagementService(keycloak, mock(ManagedStudentInviteRepo::class.java)).suspend("exact-subject")
        }
        verify(keycloak, never()).revokeAllSessions("exact-subject")
    }
}
