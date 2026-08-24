package com.playsay.registration.service

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import kotlin.test.Test
import kotlin.test.assertEquals

class PasswordPolicyConformanceTest {
    private val policy = PasswordPolicy()

    @Test
    fun `matches the shared password policy fixtures`() {
        fixtures().forEach { fixture ->
            assertEquals(
                fixture.expectedReasons,
                policy.validate(fixture.resolvedPassword(), fixture.email, fixture.displayName),
                fixture.id,
            )
        }
    }

    private fun fixtures(): List<PolicyFixture> =
        requireNotNull(javaClass.getResourceAsStream("/registration-password-policy.json")) {
            "Missing shared registration password policy fixture"
        }.use { jacksonObjectMapper().readValue(it) }
}

private data class PolicyFixture(
    val id: String,
    val email: String,
    val displayName: String? = null,
    val password: String,
    val padToLength: Int? = null,
    val padCharacter: String = "x",
    val expectedReasons: List<String>,
) {
    fun resolvedPassword(): String {
        val targetLength = padToLength ?: return password
        require(targetLength >= password.length) { "Fixture $id cannot shrink a password" }
        return password + padCharacter.repeat(targetLength - password.length)
    }
}
