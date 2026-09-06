package com.playsay.gateway.service

import com.playsay.gateway.client.RegistrationGateway
import com.playsay.gateway.repo.AppUserIdentityRepository
import com.playsay.gateway.repo.AppUserRepo
import com.playsay.gateway.repo.StudentProfileRepo
import com.playsay.gateway.repo.TeacherDelegationRepo
import java.time.Instant
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import org.mockito.Mockito.mock
import org.mockito.Mockito.verifyNoInteractions
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken

class UserIdentityConnectionTest {
    @Test
    fun `identity lookup does not acquire an outer connection before the atomic upsert`() {
        val userId = UUID.randomUUID()
        val users = mock(AppUserRepo::class.java)
        val identities = mock(AppUserIdentityRepository::class.java) { userId }
        val profiles = UserProfileStore(
            users, identities, mock(StudentProfileRepo::class.java),
            mock(RegistrationGateway::class.java), mock(TeacherDelegationRepo::class.java),
        )
        val token = Jwt.withTokenValue("synthetic")
            .header("alg", "none").subject("synthetic-user")
            .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(60)).build()

        assertEquals(userId, profiles.currentUserId(JwtAuthenticationToken(token)))
        // The REQUIRES_NEW upsert itself rejects deletion intent atomically.
        // A read here would retain the caller's connection while waiting for a second one.
        verifyNoInteractions(users)
    }
}
