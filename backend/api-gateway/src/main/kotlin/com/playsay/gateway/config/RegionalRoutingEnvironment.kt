package com.playsay.gateway.config

internal data class RegionalRoutingEnvironment(
    val origin: String,
    val issuer: String,
    val signalingUrl: String,
    val collaborationUrl: String,
    val directCollaborationUrl: String,
    val relayUrls: List<String>,
) {
    companion object {
        fun forName(environment: String): RegionalRoutingEnvironment? = when (environment) {
            "prod" -> RegionalRoutingEnvironment(
                origin = "https://online.honeyschool.ru",
                issuer = "https://ops.honey.school/keycloak/realms/playsay",
                signalingUrl = "wss://online.honeyschool.ru/livekit",
                collaborationUrl = "wss://online.honeyschool.ru/collab/ws",
                directCollaborationUrl = "wss://online.honey.school/collab/ws",
                relayUrls = listOf(
                    "turn:turn.honeyschool.ru:3478?transport=udp",
                    "turn:turn.honeyschool.ru:3478?transport=tcp",
                    "turns:turn.honeyschool.ru:5349?transport=tcp",
                ),
            )
            "dev" -> RegionalRoutingEnvironment(
                origin = "https://dev.online.honeyschool.ru",
                issuer = "https://dev.ops.honey.school/keycloak/realms/playsay",
                signalingUrl = "wss://dev.online.honeyschool.ru/livekit",
                collaborationUrl = "wss://dev.online.honeyschool.ru/collab/ws",
                directCollaborationUrl = "wss://dev.online.honey.school/collab/ws",
                relayUrls = listOf(
                    "turn:dev.turn.honeyschool.ru:3479?transport=udp",
                    "turn:dev.turn.honeyschool.ru:3479?transport=tcp",
                    "turns:dev.turn.honeyschool.ru:5350?transport=tcp",
                ),
            )
            else -> null
        }
    }
}
