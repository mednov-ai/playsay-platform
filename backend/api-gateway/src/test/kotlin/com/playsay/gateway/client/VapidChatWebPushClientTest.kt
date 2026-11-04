package com.playsay.gateway.client

import com.playsay.gateway.config.ChatPushProperties
import com.sun.net.httpserver.HttpServer
import java.net.InetSocketAddress
import java.security.KeyPairGenerator
import java.security.Security
import java.security.spec.ECGenParameterSpec
import java.util.Base64
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicReference
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue
import nl.martijndwars.webpush.Utils
import org.bouncycastle.jce.interfaces.ECPrivateKey
import org.bouncycastle.jce.interfaces.ECPublicKey
import org.bouncycastle.jce.provider.BouncyCastleProvider

class VapidChatWebPushClientTest {
    @Test
    fun `sends encrypted notification and handles an expired subscription`() {
        if (Security.getProvider(BouncyCastleProvider.PROVIDER_NAME) == null) {
            Security.addProvider(BouncyCastleProvider())
        }
        val generator = KeyPairGenerator.getInstance("ECDH", BouncyCastleProvider.PROVIDER_NAME).apply {
            initialize(ECGenParameterSpec("secp256r1"))
        }
        val applicationKeys = generator.generateKeyPair()
        val subscriptionKeys = generator.generateKeyPair()
        val encoder = Base64.getUrlEncoder().withoutPadding()
        val responseStatus = AtomicInteger(201)
        val received = AtomicReference<Pair<String?, ByteArray>>()
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0).apply {
            createContext("/push") { exchange ->
                received.set(exchange.requestHeaders.getFirst("Authorization") to exchange.requestBody.readAllBytes())
                exchange.sendResponseHeaders(responseStatus.get(), -1)
                exchange.close()
            }
            start()
        }
        try {
            val client = VapidChatWebPushClient(
                ChatPushProperties(
                    enabled = true,
                    publicKey = encoder.encodeToString(Utils.encode(applicationKeys.public as ECPublicKey)),
                    privateKey = encoder.encodeToString(Utils.encode(applicationKeys.private as ECPrivateKey)),
                    subject = "mailto:testing@example.invalid",
                ),
            )
            val command = ChatWebPushCommand(
                endpoint = "http://127.0.0.1:${server.address.port}/push",
                p256dh = encoder.encodeToString(Utils.encode(subscriptionKeys.public as ECPublicKey)),
                auth = encoder.encodeToString(ByteArray(16) { it.toByte() }),
                payload = "local push test",
            )
            assertEquals(ChatWebPushResult.Success, client.send(command))
            val (authorization, body) = assertNotNull(received.get())
            assertTrue(authorization?.startsWith("WebPush ", ignoreCase = true) == true)
            assertTrue(body.isNotEmpty())
            assertTrue(!body.toString(Charsets.UTF_8).contains(command.payload))

            responseStatus.set(410)
            assertEquals(ChatWebPushResult.PermanentFailure(410), client.send(command))
        } finally {
            server.stop(0)
        }
    }
}
