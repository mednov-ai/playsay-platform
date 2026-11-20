package com.playsay.gateway

import com.fasterxml.jackson.databind.node.ObjectNode
import com.playsay.gateway.dto.LessonMaterialRequest
import com.playsay.gateway.dto.MaterialGenerateImagesRequest
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.service.*
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import kotlin.test.*
import org.mockito.Mockito.*
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean
import org.springframework.transaction.support.TransactionSynchronizationManager

class MaterialImagePublicationTest : MaterialControllerTestFixture() {
    @MockitoSpyBean private lateinit var provider: StubMaterialImageGenerationProvider
    @MockitoSpyBean private lateinit var objects: MaterialObjectStorage
    @Autowired private lateinit var cleanup: GeneratedImageObjects
    @MockitoSpyBean private lateinit var cleanupRepo: com.playsay.gateway.repo.GeneratedImageCleanupRepo
    private val teacher get() = authentication("teacher-1", role = "ROLE_TEACHER")

    private fun material() = materialCrudController.create(teacher, LessonMaterialRequest(title = "Pictures",
        document = objectMapper.readTree("""{"schemaVersion":1,"pages":[{"id":"page","blocks":[
            {"id":"a","type":"generatedImage","prompt":"first image"},
            {"id":"b","type":"generatedImage","prompt":"second image"}]}]}"""))).body!!

    private fun intercept(fn: (MaterialImageGenerationInput) -> Unit) {
        doAnswer { call ->
            assertFalse(TransactionSynchronizationManager.isActualTransactionActive())
            val input = call.getArgument<MaterialImageGenerationInput>(0)
            fn(input)
            (call.callRealMethod() as GeneratedMaterialImage).copy(bytes = java.util.UUID.randomUUID().toString().toByteArray())
        }.`when`(provider).generate(any(MaterialImageGenerationInput::class.java) ?: MaterialImageGenerationInput("", ""))
    }

    @Test fun `slow provider allows unrelated edit and stable targets follow a reorder`() {
        val material = material()
        val waiting = CountDownLatch(1)
        val proceed = CountDownLatch(1)
        intercept { waiting.countDown(); assertTrue(proceed.await(10, TimeUnit.SECONDS)) }
        val worker = Executors.newSingleThreadExecutor()
        try {
            val result = worker.submit(java.util.concurrent.Callable {
                materialAiController.generateImages(teacher, material.id, MaterialGenerateImagesRequest(blockId = "a", maxImages = 1))
            })
            assertTrue(waiting.await(10, TimeUnit.SECONDS))
            val doc = material.document.deepCopy<ObjectNode>()
            val blocks = doc["pages"][0]["blocks"] as com.fasterxml.jackson.databind.node.ArrayNode
            (blocks[1] as ObjectNode).put("caption", "Edited during generation")
            blocks.add(blocks.remove(0))
            materialCrudController.update(teacher, material.id, LessonMaterialRequest(title = "New title", document = doc))
            proceed.countDown()
            val saved = result.get(15, TimeUnit.SECONDS)
            assertEquals("New title", saved.title)
            val after = saved.document["pages"][0]["blocks"]
            assertEquals("Edited during generation", after[0]["caption"].asText())
            assertFalse(after[0].has("url"))
            assertTrue(after[1]["url"].asText().startsWith("material-asset:"))
        } finally { proceed.countDown(); worker.shutdownNow() }
    }

    @Test fun `changed removed and unauthorized targets keep the whole batch private`() {
        for (change in listOf("prompt", "remove", "access")) {
            val material = material()
            val doc = material.document.deepCopy<ObjectNode>()
            val blocks = doc["pages"][0]["blocks"] as com.fasterxml.jackson.databind.node.ArrayNode
            val count = AtomicInteger()
            intercept {
                if (count.incrementAndGet() == 2) {
                    when (change) {
                        "prompt" -> (blocks[1] as ObjectNode).put("prompt", "new prompt")
                        "remove" -> blocks.remove(1)
                        else -> JdbcTemplate(dataSource).update("update lesson_material set owner_teacher_user_id = null where id = ?", material.id)
                    }
                    if (change != "access") materialCrudController.update(teacher, material.id, LessonMaterialRequest(title = "Edited", document = doc))
                }
            }
            val error = assertFailsWith<ProjectResponseException> {
                materialAiController.generateImages(teacher, material.id, MaterialGenerateImagesRequest())
            }
            assertEquals(if (change == "access") 403 else 409, error.statusCode.value())
            assertEquals(0, materialAssetRepo.findAll().count { it.materialId == material.id })
            assertFalse(objectMapper.readTree(lessonMaterialRepo.findRowById(material.id)!!.document)["pages"][0]["blocks"][0].has("url"))
            reset(provider)
        }
    }

    @Test fun `uncertain upload and failed batch keep previous bytes and retry cleanup safely`() {
        val material = material()
        val cmd = MaterialGenerateImagesRequest(maxImages = 1)
        materialAiController.generateImages(teacher, material.id, cmd)
        val original = materialAssetController.listAssets(teacher, material.id).single()
        val key = requireNotNull(original.storageKey)
        val bytes = objects.getObject(key).bytes
        val count = AtomicInteger()
        doAnswer { call ->
            assertFalse(TransactionSynchronizationManager.isActualTransactionActive())
            call.callRealMethod()
            if (count.incrementAndGet() == 2) throw MaterialObjectStorageException("uncertain upload result")
            null
        }.`when`(objects).putObject(anyString(), any(ByteArray::class.java) ?: byteArrayOf(), anyString())
        assertFailsWith<ProjectResponseException> {
            materialAiController.generateImages(teacher, material.id, MaterialGenerateImagesRequest(regenerate = true))
        }
        val jdbc = JdbcTemplate(dataSource)
        val owned = "material-assets/${material.id}/%"
        val staged = jdbc.queryForList("select storage_key from material_image_object_cleanup where storage_key like ?", String::class.java, owned)
        assertEquals(2, staged.size)
        assertContentEquals(bytes, objects.getObject(key).bytes)
        assertEquals(original.id, materialAssetController.listAssets(teacher, material.id).single().id)
        jdbc.update("update material_image_object_cleanup set eligible_at = current_timestamp where storage_key like ?", owned)
        cleanup.collect()
        cleanup.collect()
        for (abandoned in staged.filterNotNull()) assertFailsWith<MaterialObjectNotFoundException> { objects.getObject(abandoned) }
        assertContentEquals(bytes, objects.getObject(key).bytes)
    }

    @Test fun `rollback before commit or lost acknowledgement after commit preserve the visible object`() {
        val material = material()
        val cmd = MaterialGenerateImagesRequest(blockId = "a", regenerate = true)
        materialAiController.generateImages(teacher, material.id, cmd)
        var current = materialAssetController.listAssets(teacher, material.id).single()
        val jdbc = JdbcTemplate(dataSource)
        for (afterCommit in listOf(false, true)) {
            doAnswer { call ->
                val result = call.callRealMethod()
                TransactionSynchronizationManager.registerSynchronization(object : org.springframework.transaction.support.TransactionSynchronization {
                    override fun beforeCommit(readOnly: Boolean) { if (!afterCommit) error("synthetic rollback") }
                    override fun afterCommit() { if (afterCommit) error("synthetic lost acknowledgement") }
                })
                result
            }.`when`(cleanupRepo).releaseForPublication(anyString())
            assertFails { materialAiController.generateImages(teacher, material.id, cmd) }
            reset(cleanupRepo)
            val visible = materialAssetController.listAssets(teacher, material.id).single()
            assertEquals(current.id, visible.id)
            assertEquals(afterCommit, visible.storageKey != current.storageKey)
            jdbc.update("update material_image_object_cleanup set eligible_at = current_timestamp where storage_key like ?", "material-assets/${material.id}/%")
            // A new worker instance can continue solely from the committed database state.
            GeneratedImageObjects(objects, cleanupRepo, java.time.Clock.systemUTC()).collect()
            assertTrue(objects.getObject(requireNotNull(visible.storageKey)).bytes.isNotEmpty())
            current = visible
        }
    }

    @Test fun `legacy positional targets respect block filter limit and repeated generation`() {
        val doc = objectMapper.readTree("""{"schemaVersion":1,"pages":[{"blocks":[{"type":"matchingPairs","pairs":[
            {"left":"owl","right":"bird","imagePrompt":"owl image"},{"left":"cat","right":"pet","imagePrompt":"cat image"}]}]}]}""")
        val material = materialCrudController.create(teacher, LessonMaterialRequest(title = "Legacy", document = doc)).body!!
        val none = materialAiController.generateImages(teacher, material.id, MaterialGenerateImagesRequest(blockId = "other"))
        assertEquals(material.document, none.document)
        val cmd = MaterialGenerateImagesRequest(blockId = "matchingPairs", maxImages = 1)
        repeat(3) { materialAiController.generateImages(teacher, material.id, cmd) }
        val assets = materialAssetController.listAssets(teacher, material.id)
        assertEquals(2, assets.size)
        assertEquals(2, assets.map { it.id }.distinct().size)
    }

    @Test fun `competing regeneration cannot overwrite a winning public asset`() {
        val material = material()
        val cmd = MaterialGenerateImagesRequest(regenerate = true, blockId = "a")
        materialAiController.generateImages(teacher, material.id, cmd)
        val before = materialAssetController.listAssets(teacher, material.id).single()
        val arrivals = CountDownLatch(2)
        intercept { arrivals.countDown(); assertTrue(arrivals.await(10, TimeUnit.SECONDS)) }
        val workers = Executors.newFixedThreadPool(2)
        try {
            val results = List(2) { workers.submit<Int> {
                try { materialAiController.generateImages(teacher, material.id, cmd); 200 }
                catch (e: ProjectResponseException) { e.statusCode.value() }
            } }.map { it.get(15, TimeUnit.SECONDS) }
            assertEquals(listOf(200, 409), results.sorted())
            val winner = materialAssetController.listAssets(teacher, material.id).single()
            assertEquals(before.id, winner.id)
            assertNotEquals(before.storageKey, winner.storageKey)
            assertTrue(objects.getObject(requireNotNull(winner.storageKey)).bytes.isNotEmpty())
        } finally { workers.shutdownNow() }
    }
}
