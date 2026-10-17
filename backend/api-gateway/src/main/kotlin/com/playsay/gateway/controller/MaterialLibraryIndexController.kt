package com.playsay.gateway.controller

import com.playsay.gateway.dto.MaterialLibraryPageResponse
import com.playsay.gateway.dto.MaterialLibraryQuery
import com.playsay.gateway.service.MaterialLibraryIndexService
import io.swagger.v3.oas.annotations.Operation
import org.springdoc.core.annotations.ParameterObject
import org.springframework.http.MediaType
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.ModelAttribute
import org.springframework.web.bind.annotation.RestController

@RestController
class MaterialLibraryIndexController(private val service: MaterialLibraryIndexService) {
    @GetMapping("/library/items", produces = [MediaType.APPLICATION_JSON_VALUE])
    @Operation(operationId = "listMaterialLibraryItems")
    fun list(authentication: JwtAuthenticationToken, @ParameterObject @ModelAttribute query: MaterialLibraryQuery): MaterialLibraryPageResponse =
        service.list(authentication, query)
}
