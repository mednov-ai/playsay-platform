package com.playsay.gateway.service

import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.repo.MaterialAssetRepo
import com.playsay.gateway.utils.MetaData
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import org.mockito.Mockito.mock
import org.mockito.Mockito.verifyNoInteractions
import org.springframework.http.HttpStatus
import org.springframework.mock.web.MockMultipartFile

class MaterialImageUploadLimitTest {
    private val repo = mock(MaterialAssetRepo::class.java)
    private val storage = mock(MaterialObjectStorage::class.java)
    private val service = MaterialAssetUploadService(repo, storage, MaterialHtmlGameMetadataService())

    @Test
    fun `accepts an image at twenty MiB and rejects one byte more`() {
        val maximum = 20 * 1024 * 1024
        val accepted = MockMultipartFile("file", "image.jpg", "image/jpeg", ByteArray(maximum) { 1 })
        assertEquals(maximum, service.validateImageFile(accepted).bytes.size)

        val oversized = MockMultipartFile("file", "image.jpg", "image/jpeg", ByteArray(maximum + 1) { 1 })
        val error = assertFailsWith<ProjectResponseException> { service.validateImageFile(oversized) }
        assertEquals(HttpStatus.BAD_REQUEST, error.statusCode)
        assertEquals(MetaData.ErrorCodes.MATERIAL_IMAGE_PAGE_TOO_LARGE, error.errorCode)
        assertEquals(20, error.messageArgs.single())
        verifyNoInteractions(repo, storage)
    }
}
