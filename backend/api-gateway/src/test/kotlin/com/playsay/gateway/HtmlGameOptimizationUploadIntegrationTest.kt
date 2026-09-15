package com.playsay.gateway

import com.playsay.gateway.client.HtmlGameOptimizerClientException
import com.playsay.gateway.client.MaterialHtmlGameOptimizerClient
import com.playsay.gateway.dto.HtmlGameOptimizationResult
import com.playsay.gateway.dto.LessonMaterialRequest
import com.playsay.gateway.dto.ScheduledLessonRequest
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.utils.MetaData
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue
import org.mockito.Mockito.`when`
import org.springframework.test.context.bean.override.mockito.MockitoBean

class HtmlGameOptimizationUploadIntegrationTest : MaterialControllerTestFixture() {
    @MockitoBean
    private lateinit var optimizerClient: MaterialHtmlGameOptimizerClient

    @Test
    fun `reusable and active lesson uploads store one revalidated optimized asset`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val source = largeGame()
        val optimized = "<html><head><title>Donut game</title></head><body><script>const donut='data:image/webp;base64,UklGRg=='</script></body></html>"
        `when`(optimizerClient.optimize(source)).thenReturn(success(source, optimized))
        val material = materialCrudController.create(
            teacher,
            LessonMaterialRequest(title = "Optimized game", status = "PUBLISHED"),
        ).body!!

        val reusable = materialAssetController.uploadHtmlGameAsset(
            teacher,
            material.id,
            htmlFile(content = source),
        ).body!!

        assertEquals("OPTIMIZED", reusable.metadata["imageOptimizationStatus"].asText())
        assertEquals(source.toByteArray().size, reusable.metadata["imageOptimizationInputBytes"].asInt())
        assertEquals(optimized.toByteArray().size, reusable.metadata["imageOptimizationOutputBytes"].asInt())
        assertEquals(1, materialAssetController.listAssets(teacher, material.id).size)
        assertEquals(
            optimized,
            materialAssetController.assetContent(teacher, material.id, reusable.id).body!!.decodeToString(),
        )
        materialCrudController.update(
            teacher,
            material.id,
            LessonMaterialRequest(
                title = material.title,
                status = "PUBLISHED",
                document = objectMapper.readTree(
                    """{"schemaVersion":1,"pages":[{"id":"page-source","title":"Donut","layout":"FLOW","blocks":[{"id":"game-source","type":"htmlGame","title":"Donut game","url":"material-asset:${reusable.id}","height":640}]}]}""",
                ),
            ),
        )

        val lesson = scheduleController.create(
            teacher,
            ScheduledLessonRequest(
                materialId = material.id,
                scheduledStart = activeLessonStart(),
                scheduledEnd = activeLessonEnd(),
                participantSubjects = listOf("student-1"),
            ),
        ).body!!
        val live = materialImagePageController.appendLiveLessonHtmlGamePage(
            teacher,
            lesson.id,
            htmlFile(content = source),
        ).body!!
        val liveAssets = materialAssetController.listAssets(teacher, live.material.id)
        assertEquals(2, liveAssets.size)
        assertTrue(liveAssets.all { it.metadata["imageOptimizationStatus"].asText() == "OPTIMIZED" })
        liveAssets.forEach { copiedOrUploaded ->
            assertEquals(
                optimized,
                materialAssetController.assetContent(teacher, live.material.id, copiedOrUploaded.id).body!!.decodeToString(),
            )
        }
    }

    @Test
    fun `required processor failure leaves reusable material and active lesson unchanged`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val source = largeGame()
        `when`(optimizerClient.optimize(source)).thenThrow(HtmlGameOptimizerClientException(invalidImage = false))
        val material = materialCrudController.create(
            teacher,
            LessonMaterialRequest(title = "Stable material", status = "PUBLISHED"),
        ).body!!
        val beforeDocument = materialCrudController.get(teacher, material.id).document.toString()
        val lesson = scheduleController.create(
            teacher,
            ScheduledLessonRequest(
                materialId = material.id,
                scheduledStart = activeLessonStart(),
                scheduledEnd = activeLessonEnd(),
                participantSubjects = listOf("student-1"),
            ),
        ).body!!

        val reusableFailure = assertFailsWith<ProjectResponseException> {
            materialAssetController.uploadHtmlGameAsset(teacher, material.id, htmlFile(content = source))
        }
        val liveFailure = assertFailsWith<ProjectResponseException> {
            materialImagePageController.appendLiveLessonHtmlGamePage(teacher, lesson.id, htmlFile(content = source))
        }

        assertEquals(MetaData.ErrorCodes.MATERIAL_HTML_GAME_OPTIMIZATION_UNAVAILABLE, reusableFailure.errorCode)
        assertEquals(MetaData.ErrorCodes.MATERIAL_HTML_GAME_OPTIMIZATION_UNAVAILABLE, liveFailure.errorCode)
        assertTrue(materialAssetController.listAssets(teacher, material.id).isEmpty())
        assertEquals(beforeDocument, materialCrudController.get(teacher, material.id).document.toString())
        assertEquals(material.id, scheduleController.get(teacher, lesson.id).materialId)
    }

    private fun largeGame(): String =
        "<html><head><title>Donut game</title></head><body><script>const donut='data:image/webp;base64,${"A".repeat(300_000)}'</script></body></html>"

    private fun success(source: String, optimized: String): HtmlGameOptimizationResult =
        HtmlGameOptimizationResult(
            html = optimized,
            policy = "embedded-raster-v1",
            status = "OPTIMIZED",
            inputBytes = source.toByteArray().size,
            outputBytes = optimized.toByteArray().size,
            eligibleCount = 1,
            replacedCount = 1,
            bytesSaved = source.toByteArray().size - optimized.toByteArray().size,
            durationMs = 12,
        )
}
