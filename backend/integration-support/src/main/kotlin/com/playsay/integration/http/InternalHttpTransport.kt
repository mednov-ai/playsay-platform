package com.playsay.integration.http

import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration

enum class InternalHttpMethod {
    GET,
    POST,
    DELETE,
}

sealed interface InternalHttpResult

data class InternalHttpResponse(
    val statusCode: Int,
    val body: String,
) : InternalHttpResult

sealed interface InternalHttpFailure : InternalHttpResult {
    val integration: String
    val path: String
}

data class InternalHttpConfigurationFailure(
    override val integration: String,
    override val path: String,
    val reason: String,
) : InternalHttpFailure

data class InternalHttpTransportFailure(
    override val integration: String,
    override val path: String,
    val cause: Throwable,
) : InternalHttpFailure

enum class InternalHttpOutcome {
    RESPONSE,
    CONFIGURATION_FAILURE,
    TRANSPORT_FAILURE,
}

data class InternalHttpObservation(
    val integration: String,
    val method: InternalHttpMethod,
    val path: String,
    val outcome: InternalHttpOutcome,
    val statusCode: Int?,
    val elapsed: Duration,
)

fun interface InternalHttpObserver {
    fun observe(observation: InternalHttpObservation)

    companion object {
        val NOOP = InternalHttpObserver { }
    }
}

class InternalHttpTransport(
    private val integration: String,
    baseUrl: String,
    private val serviceTokenHeader: String,
    serviceToken: String,
    private val httpClient: HttpClient,
    private val observer: InternalHttpObserver = InternalHttpObserver.NOOP,
    private val nanoTime: () -> Long = System::nanoTime,
) {
    private val normalizedBaseUrl = baseUrl.trimEnd('/')
    private val normalizedServiceToken = serviceToken.trim()

    fun exchange(
        method: InternalHttpMethod,
        path: String,
        body: String? = null,
        contentType: String? = null,
        timeout: Duration = Duration.ofSeconds(20),
    ): InternalHttpResult {
        val startedAt = nanoTime()
        if (normalizedServiceToken.isEmpty()) {
            return InternalHttpConfigurationFailure(integration, path, "service token is missing")
                .also { observe(method, path, InternalHttpOutcome.CONFIGURATION_FAILURE, null, startedAt) }
        }
        require(path.startsWith('/')) { "Internal HTTP path must start with '/'" }
        require(!timeout.isNegative && !timeout.isZero) { "timeout must be positive" }

        val builder = HttpRequest.newBuilder(URI.create(normalizedBaseUrl + path))
            .timeout(timeout)
            .header("Accept", "application/json")
            .header(serviceTokenHeader, normalizedServiceToken)
        if (contentType != null) {
            builder.header("Content-Type", contentType)
        }
        val publisher = body?.let(HttpRequest.BodyPublishers::ofString) ?: HttpRequest.BodyPublishers.noBody()
        when (method) {
            InternalHttpMethod.GET -> builder.GET()
            InternalHttpMethod.POST -> builder.POST(publisher)
            InternalHttpMethod.DELETE -> builder.DELETE()
        }

        return runCatching {
            httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofString())
        }.fold(
            onSuccess = { response ->
                InternalHttpResponse(response.statusCode(), response.body())
                    .also { observe(method, path, InternalHttpOutcome.RESPONSE, response.statusCode(), startedAt) }
            },
            onFailure = { cause ->
                InternalHttpTransportFailure(integration, path, cause)
                    .also { observe(method, path, InternalHttpOutcome.TRANSPORT_FAILURE, null, startedAt) }
            },
        )
    }

    private fun observe(
        method: InternalHttpMethod,
        path: String,
        outcome: InternalHttpOutcome,
        statusCode: Int?,
        startedAt: Long,
    ) {
        observer.observe(
            InternalHttpObservation(
                integration = integration,
                method = method,
                path = path.substringBefore('?'),
                outcome = outcome,
                statusCode = statusCode,
                elapsed = Duration.ofNanos((nanoTime() - startedAt).coerceAtLeast(0)),
            ),
        )
    }
}
