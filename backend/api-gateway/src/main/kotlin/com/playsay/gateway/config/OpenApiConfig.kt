package com.playsay.gateway.config

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
            .servers(listOf(Server().url("/api").description("Honey School web-app API proxy")))
            .info(
                Info()
                    .title("Honey School API Gateway")
                    .version("0.1.0")
                    .description("Public contract for the Honey School API Gateway."),
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
