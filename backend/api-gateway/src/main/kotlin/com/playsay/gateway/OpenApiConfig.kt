package com.playsay.gateway

import io.swagger.v3.oas.models.Components
import io.swagger.v3.oas.models.OpenAPI
import io.swagger.v3.oas.models.info.Info
import io.swagger.v3.oas.models.security.SecurityScheme
import io.swagger.v3.oas.models.servers.Server
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration

@Configuration
class OpenApiConfig {
    @Bean
    fun playsayOpenApi(): OpenAPI =
        OpenAPI()
            .servers(listOf(Server().url("/api").description("Play&Say web-app API proxy")))
            .info(
                Info()
                    .title("Play&Say API Gateway")
                    .version("0.1.0")
                    .description("Public contract for the Play&Say API Gateway."),
            )
            .components(
                Components()
                    .addSecuritySchemes(
                        "bearerAuth",
                        SecurityScheme()
                            .type(SecurityScheme.Type.HTTP)
                            .scheme("bearer")
                            .bearerFormat("JWT"),
                    ),
            )
}
