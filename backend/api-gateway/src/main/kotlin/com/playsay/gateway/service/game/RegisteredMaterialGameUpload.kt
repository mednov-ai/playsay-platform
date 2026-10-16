package com.playsay.gateway.service.game

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.playsay.gateway.dto.MaterialAssetResponse
import com.playsay.gateway.service.MaterialAssetService
import java.util.UUID
import org.springframework.http.HttpStatus
import org.springframework.web.multipart.MultipartFile

/** Keeps the legacy editor upload response pinned to the independently registered revision. */
internal fun uploadRegisteredMaterialGame(
    materialId: UUID,
    file: MultipartFile,
    commandId: UUID?,
    materialAssetService: MaterialAssetService,
    gameRegistration: HtmlGameLegacyRegistrationService?,
    gameUploadCommands: LegacyGameUploadCommandService?,
): MaterialAssetResponse {
    val result = gameUploadCommands?.run("material", materialId, commandId, file) {
        val asset = materialAssetService.uploadHtmlGameAsset(materialId, file)
        gameRegistration?.register(asset.id)
        jacksonObjectMapper().createObjectNode().put("assetId", asset.id.toString())
    }
    if (result != null) {
        val asset = materialAssetService.list(materialId).firstOrNull { it.id.toString() == result.path("assetId").asText() }
        ?: gameError(HttpStatus.CONFLICT, "GAME_SOURCE_NOT_FOUND")
        return gameRegistration?.withReference(asset) ?: asset
    }
    val asset = materialAssetService.uploadHtmlGameAsset(materialId, file)
    gameRegistration?.register(asset.id)
    return gameRegistration?.withReference(asset) ?: asset
}
