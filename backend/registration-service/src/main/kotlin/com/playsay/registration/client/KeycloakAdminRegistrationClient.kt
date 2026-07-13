package com.playsay.registration.client

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.playsay.registration.service.KeycloakRegistrationClient
import com.playsay.registration.service.KeycloakRegistrationUser
import com.playsay.registration.service.KeycloakTokenSet
import com.playsay.registration.service.KeycloakUserCreateCommand
import java.net.URI
import java.net.URLEncoder
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.nio.charset.StandardCharsets

class KeycloakAdminRegistrationClient(
    private val httpClient: HttpClient,
    private val objectMapper: ObjectMapper,
    private val keycloakBaseUrl: String,
    private val realm: String,
    private val clientId: String,
    private val clientSecret: String,
) : KeycloakRegistrationClient {
    override fun createDisabledUser(command: KeycloakUserCreateCommand): Boolean {
        val payload = linkedMapOf<String, Any?>(
            "username" to command.username,
            "firstName" to command.firstName,
            "enabled" to command.enabled,
            "emailVerified" to command.emailVerified,
            "credentials" to listOf(
                mapOf("type" to "password", "value" to command.password, "temporary" to false),
            ),
            "requiredActions" to emptyList<String>(),
        )
        command.email?.let { email -> payload["email"] = email }
        command.lastName?.let { lastName -> payload["lastName"] = lastName }
        if (command.managedStudent) {
            payload["attributes"] = mapOf(managedStudentAttribute to listOf("true"))
        }
        val response = sendAdmin(
            path = "/admin/realms/$realm/users",
            method = "POST",
            body = objectMapper.writeValueAsString(payload),
        )
        if (response.statusCode() == 409) {
            return false
        }
        require(response.statusCode() in 200..299) { "Keycloak user create failed with HTTP ${response.statusCode()}" }
        return true
    }

    override fun findUserByUsername(username: String): KeycloakRegistrationUser? =
        userByUsername(username)?.toRegistrationUser(username)

    override fun findUserByEmail(email: String): KeycloakRegistrationUser? =
        userByEmail(email)?.toRegistrationUser(email)

    override fun enableVerifiedUser(username: String) {
        val id = userIdByUsername(username)
        val payload = mapOf("enabled" to true, "emailVerified" to true)
        val response = sendAdmin(
            path = "/admin/realms/$realm/users/$id",
            method = "PUT",
            body = objectMapper.writeValueAsString(payload),
        )
        require(response.statusCode() in 200..299) { "Keycloak user enable failed with HTTP ${response.statusCode()}" }
    }

    override fun assignRealmRole(username: String, role: String) {
        val id = userIdByUsername(username)
        val roleResponse = sendAdmin(path = "/admin/realms/$realm/roles/${role.urlEncoded()}", method = "GET")
        require(roleResponse.statusCode() in 200..299) { "Keycloak role fetch failed with HTTP ${roleResponse.statusCode()}" }
        val response = sendAdmin(
            path = "/admin/realms/$realm/users/$id/role-mappings/realm",
            method = "POST",
            body = "[${roleResponse.body()}]",
        )
        require(response.statusCode() in 200..299) { "Keycloak role mapping failed with HTTP ${response.statusCode()}" }
    }

    override fun updatePassword(username: String, newPassword: String) {
        val id = userIdByUsername(username)
        val payload = mapOf("type" to "password", "value" to newPassword, "temporary" to false)
        val response = sendAdmin(
            path = "/admin/realms/$realm/users/$id/reset-password",
            method = "PUT",
            body = objectMapper.writeValueAsString(payload),
        )
        require(response.statusCode() in 200..299) { "Keycloak password reset failed with HTTP ${response.statusCode()}" }
    }

    override fun passwordGrant(username: String, password: String, clientId: String): KeycloakTokenSet {
        val body = listOf(
            "grant_type" to "password",
            "client_id" to clientId,
            "username" to username,
            "password" to password,
            "scope" to "openid profile email",
        ).joinToString("&") { (key, value) -> "${key.urlEncoded()}=${value.urlEncoded()}" }
        val request = HttpRequest.newBuilder(URI.create("${keycloakBaseUrl.trimEnd('/')}/realms/$realm/protocol/openid-connect/token"))
            .header("content-type", "application/x-www-form-urlencoded")
            .POST(HttpRequest.BodyPublishers.ofString(body))
            .build()
        val response = httpClient.send(request, HttpResponse.BodyHandlers.ofString())
        require(response.statusCode() in 200..299) { "Keycloak password grant failed with HTTP ${response.statusCode()}" }
        val token = objectMapper.readTree(response.body())
        return KeycloakTokenSet(
            accessToken = token.requiredText("access_token"),
            refreshToken = token.get("refresh_token")?.asText()?.takeIf { it.isNotBlank() },
            idToken = token.get("id_token")?.asText()?.takeIf { it.isNotBlank() },
            expiresIn = token.get("expires_in")?.asLong() ?: 0,
        )
    }

    private fun userIdByUsername(username: String): String {
        return userByUsername(username)?.get("id")?.asText()
            ?: error("Keycloak user not found for registration username.")
    }

    private fun userByUsername(username: String): JsonNode? {
        val response = sendAdmin(
            path = "/admin/realms/$realm/users?username=${username.urlEncoded()}&exact=true&briefRepresentation=false",
            method = "GET",
        )
        require(response.statusCode() in 200..299) { "Keycloak user lookup failed with HTTP ${response.statusCode()}" }
        val users = objectMapper.readTree(response.body())
        return users.firstOrNull()
    }

    private fun userByEmail(email: String): JsonNode? {
        val response = sendAdmin(
            path = "/admin/realms/$realm/users?email=${email.urlEncoded()}&exact=true&briefRepresentation=false",
            method = "GET",
        )
        require(response.statusCode() in 200..299) { "Keycloak user lookup failed with HTTP ${response.statusCode()}" }
        val users = objectMapper.readTree(response.body())
        return users.firstOrNull()
    }

    private fun sendAdmin(path: String, method: String, body: String? = null): HttpResponse<String> {
        val builder = HttpRequest.newBuilder(URI.create("${keycloakBaseUrl.trimEnd('/')}$path"))
            .header("authorization", "Bearer ${accessToken()}")
        if (body == null) {
            builder.method(method, HttpRequest.BodyPublishers.noBody())
        } else {
            builder.header("content-type", "application/json")
                .method(method, HttpRequest.BodyPublishers.ofString(body))
        }
        return httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofString())
    }

    private fun accessToken(): String {
        require(clientSecret.isNotBlank()) { "Keycloak registration client secret must be configured" }
        val body = listOf(
            "grant_type" to "client_credentials",
            "client_id" to clientId,
            "client_secret" to clientSecret,
        ).joinToString("&") { (key, value) -> "${key.urlEncoded()}=${value.urlEncoded()}" }
        val request = HttpRequest.newBuilder(URI.create("${keycloakBaseUrl.trimEnd('/')}/realms/$realm/protocol/openid-connect/token"))
            .header("content-type", "application/x-www-form-urlencoded")
            .POST(HttpRequest.BodyPublishers.ofString(body))
            .build()
        val response = httpClient.send(request, HttpResponse.BodyHandlers.ofString())
        require(response.statusCode() in 200..299) { "Keycloak token request failed with HTTP ${response.statusCode()}" }
        return objectMapper.readTree(response.body()).requiredText("access_token")
    }

    private fun JsonNode.requiredText(field: String): String =
        get(field)?.asText()?.takeIf { it.isNotBlank() } ?: error("Keycloak response missing $field")

    private fun JsonNode.managedStudent(): Boolean =
        get("attributes")
            ?.get(managedStudentAttribute)
            ?.let { values ->
                when {
                    values.isArray -> values.any { value -> value.asText() == "true" }
                    else -> values.asText() == "true"
                }
            }
            ?: false

    private fun JsonNode.toRegistrationUser(fallbackUsername: String): KeycloakRegistrationUser =
        KeycloakRegistrationUser(
            subject = requiredText("id"),
            username = get("username")?.asText()?.takeIf { it.isNotBlank() } ?: fallbackUsername,
            email = get("email")?.asText()?.takeIf { it.isNotBlank() },
            enabled = get("enabled")?.asBoolean(false) ?: false,
            emailVerified = get("emailVerified")?.asBoolean(false) ?: false,
            managedStudent = managedStudent(),
        )

    private fun String.urlEncoded(): String =
        URLEncoder.encode(this, StandardCharsets.UTF_8)

    private companion object {
        const val managedStudentAttribute = "playsay_managed_student"
    }
}
