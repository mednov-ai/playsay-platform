package com.playsay.vocabulary.service

import com.playsay.vocabulary.dto.LexicalCatalogScope
import com.playsay.vocabulary.dto.LexicalContentStatus
import com.playsay.vocabulary.dto.LexicalImageability
import com.playsay.vocabulary.dto.VocabularyMediaAssetState
import com.playsay.vocabulary.dto.VocabularyMediaOverrideKind
import com.playsay.vocabulary.dto.VocabularyMediaOverrideRequest
import com.playsay.vocabulary.dto.VocabularyMediaReviewAction
import com.playsay.vocabulary.dto.VocabularyMediaReviewRequest
import com.playsay.vocabulary.dto.VocabularyMediaSafetyState
import com.playsay.vocabulary.entity.VocabularyEntryEntity
import com.playsay.vocabulary.entity.VocabularyLexicalContentRevisionEntity
import com.playsay.vocabulary.entity.VocabularyLexicalSenseEntity
import com.playsay.vocabulary.repo.VocabularyEntryRepo
import com.playsay.vocabulary.repo.VocabularyLexicalContentRevisionRepo
import com.playsay.vocabulary.repo.VocabularyLexicalSenseRepo
import com.playsay.vocabulary.repo.VocabularyMediaAssetRepo
import com.playsay.vocabulary.repo.VocabularyMediaGenerationRequestRepo
import java.time.Instant
import java.util.UUID
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Primary
import org.springframework.http.HttpStatus
import org.springframework.test.annotation.DirtiesContext
import org.springframework.web.server.ResponseStatusException
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import com.playsay.vocabulary.controller.VocabularyMediaController
import org.mockito.Mockito

@SpringBootTest(properties = [
    "spring.datasource.url=jdbc:h2:mem:vocabulary-media;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
    "spring.datasource.driver-class-name=org.h2.Driver",
    "spring.jpa.hibernate.ddl-auto=create-drop",
    "spring.liquibase.enabled=false",
    "spring.security.oauth2.resourceserver.jwt.jwk-set-uri=http://localhost/unused-jwks",
    "playsay.vocabulary.features.generated-media-enabled=true",
])
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class VocabularyMediaServiceTest @Autowired constructor(
    private val media: VocabularyMediaService,
    private val senses: VocabularyLexicalSenseRepo,
    private val revisions: VocabularyLexicalContentRevisionRepo,
    private val entries: VocabularyEntryRepo,
    private val assets: VocabularyMediaAssetRepo,
    private val generations: VocabularyMediaGenerationRequestRepo,
    private val generator: CapturingGenerator,
    private val storage: FailingStorage,
) {
    @TestConfiguration(proxyBeanMethods = false)
    class Config {
        @Bean @Primary fun testGenerator() = CapturingGenerator()
        @Bean @Primary fun testStorage() = FailingStorage()
        @Bean @Primary fun testAccess(): VocabularyAccessService =
            Mockito.mock(VocabularyAccessService::class.java) { invocation ->
                when (invocation.method.name) {
                    "requireOwnerAccess" -> {
                        val actor = invocation.arguments[0] as String
                        val owner = invocation.arguments[1] as String
                        if (actor != owner) throw ResponseStatusException(HttpStatus.FORBIDDEN)
                        owner
                    }
                    "canAccessOwner" -> invocation.arguments[0] == invocation.arguments[1]
                    else -> Mockito.RETURNS_DEFAULTS.answer(invocation)
                }
            }
    }

    @AfterEach
    fun resetFakes() {
        generator.safety = VocabularyMediaSafetyState.SAFE
        generator.fail = false
        storage.failWrite = false
        storage.failRead = false
    }

    @Test
    fun `homographs create separate candidates and first use deduplicates without private prompt fields`() {
        val bankMoney = seed("bank", "financial institution", "банк", "PRIVATE learner example", "owner-1")
        val bankRiver = seed("bank", "side of a river", "берег", "SECRET lesson note", "owner-2")

        media.view("owner-1", bankMoney.entry.id)
        media.view("owner-1", bankMoney.entry.id)
        media.view("owner-2", bankRiver.entry.id)
        assertEquals(2, generations.count())
        media.processPending()

        val moneyAsset = assets.findAllBySenseIdOrderByCreatedAtDesc(bankMoney.sense.id).single()
        val riverAsset = assets.findAllBySenseIdOrderByCreatedAtDesc(bankRiver.sense.id).single()
        assertNotEquals(moneyAsset.senseId, riverAsset.senseId)
        assertEquals(VocabularyMediaAssetState.CANDIDATE, moneyAsset.state)
        assertFalse(generator.prompts.joinToString().contains("PRIVATE"))
        assertFalse(generator.prompts.joinToString().contains("SECRET"))
        assertFalse(generator.prompts.joinToString().contains("owner-"))
    }

    @Test
    fun `regeneration and rejection preserve approved asset and personal hide does not mutate it`() {
        val seeded = seed("apple", "edible fruit", "яблоко", "private", "owner")
        media.view("owner", seeded.entry.id)
        media.processPending()
        val first = assets.findAllBySenseIdOrderByCreatedAtDesc(seeded.sense.id).single()
        media.review("owner", true, first.id, VocabularyMediaReviewRequest(VocabularyMediaReviewAction.APPROVE))

        media.regenerate("owner", seeded.entry.id)
        media.processPending()
        val candidate = assets.findAllBySenseIdOrderByCreatedAtDesc(seeded.sense.id).first { it.id != first.id }
        media.review("owner", true, candidate.id, VocabularyMediaReviewRequest(VocabularyMediaReviewAction.REJECT, "WRONG_SENSE"))
        assertEquals(VocabularyMediaAssetState.APPROVED, assets.findById(first.id).orElseThrow().state)
        assertEquals(first.id, media.view("owner", seeded.entry.id).asset?.id)

        val hidden = media.override("owner", seeded.entry.id, VocabularyMediaOverrideRequest(VocabularyMediaOverrideKind.HIDE))
        assertTrue(hidden.hidden)
        assertNull(hidden.asset)
        assertEquals(VocabularyMediaAssetState.APPROVED, assets.findById(first.id).orElseThrow().state)
    }

    @Test
    fun `non-imageable unsafe and provider or storage failures degrade to text states`() {
        val abstract = seed("justice", "fairness", "справедливость", "private", "owner-a", LexicalImageability.NON_IMAGEABLE)
        assertEquals("TEXT_ONLY", media.view("owner-a", abstract.entry.id).state)
        assertEquals(0, generations.count())

        val unsafe = seed("unsafe", "unsafe sense", "опасно", "private", "owner-b")
        generator.safety = VocabularyMediaSafetyState.BLOCKED
        media.view("owner-b", unsafe.entry.id)
        media.processPending()
        assertEquals("FAILED", media.view("owner-b", unsafe.entry.id).state)
        assertEquals("SAFETY_BLOCKED", generations.findFirstBySenseIdOrderByCreatedAtDesc(unsafe.sense.id)?.failureCode)

        val outage = seed("tree", "a woody plant", "дерево", "private", "owner-c")
        generator.safety = VocabularyMediaSafetyState.SAFE
        storage.failWrite = true
        media.view("owner-c", outage.entry.id)
        media.processPending()
        assertEquals("STORAGE_WRITE_FAILED", generations.findFirstBySenseIdOrderByCreatedAtDesc(outage.sense.id)?.failureCode)
    }

    @Test
    fun `asset delivery is authorized through a linked entry and never exposes storage keys`() {
        val first = seed("seal", "marine mammal", "тюлень", "private", "owner-1")
        val other = seed("seal", "official stamp", "печать", "private", "owner-2")
        media.view("owner-1", first.entry.id)
        media.processPending()
        val asset = assets.findAllBySenseIdOrderByCreatedAtDesc(first.sense.id).single()
        assertEquals(1, media.candidates("owner-1", true).size)
        assertTrue(media.candidates("owner-2", true).isEmpty())
        assertThrows(ResponseStatusException::class.java) { media.candidate("owner-2", true, asset.id) }
        media.review("owner-1", true, asset.id, VocabularyMediaReviewRequest(VocabularyMediaReviewAction.APPROVE))
        val view = media.view("owner-1", first.entry.id)
        assertTrue(view.asset?.contentUrl?.contains(asset.id.toString()) == true)
        assertFalse(view.toString().contains("vocabulary-media/"))
        assertTrue(media.content("owner-1", first.entry.id, asset.id).bytes.isNotEmpty())
        val error = assertThrows(ResponseStatusException::class.java) { media.content("owner-2", other.entry.id, asset.id) }
        assertEquals(HttpStatus.FORBIDDEN, error.statusCode)

        val controller = VocabularyMediaController(media)
        val ownerResponse = controller.content(authentication("owner-1"), first.entry.id, asset.id)
        assertTrue(ownerResponse.headers.cacheControl.orEmpty().contains("private"))
        assertEquals("Authorization", ownerResponse.headers.vary.single())
        assertThrows(ResponseStatusException::class.java) { controller.candidateContent(authentication("owner-1"), asset.id) }
        val candidateResponse = controller.candidateContent(authentication("owner-1", "ROLE_TEACHER"), asset.id)
        assertEquals("no-store", candidateResponse.headers.cacheControl)
    }

    private fun seed(
        lemma: String,
        meaning: String,
        translation: String,
        privateExample: String,
        owner: String,
        imageability: LexicalImageability = LexicalImageability.IMAGEABLE,
    ): Seeded {
        val sense = senses.save(VocabularyLexicalSenseEntity(
            catalogScope = LexicalCatalogScope.LEARNER,
            scopeKey = owner,
            normalizedLemma = lemma,
            normalizedMeaning = meaning,
            imageability = imageability,
        ))
        val revision = revisions.save(VocabularyLexicalContentRevisionEntity(
            senseId = sense.id,
            status = LexicalContentStatus.ACTIVE,
            sourceText = lemma,
            translation = translation,
            definition = meaning,
            example = privateExample,
        ))
        val entry = entries.save(VocabularyEntryEntity(
            ownerSubject = owner,
            sourceText = lemma,
            normalizedSource = lemma,
            translation = translation,
            example = privateExample,
            lexicalSenseId = sense.id,
            lexicalContentRevisionId = revision.id,
            createdBySubject = owner,
            createdAt = Instant.now(),
            updatedAt = Instant.now(),
        ))
        return Seeded(sense, entry)
    }

    data class Seeded(val sense: VocabularyLexicalSenseEntity, val entry: VocabularyEntryEntity)

    private fun authentication(subject: String, vararg roles: String): JwtAuthenticationToken = JwtAuthenticationToken(
        Jwt.withTokenValue("test-token").header("alg", "none").subject(subject).build(),
        roles.map(::SimpleGrantedAuthority),
    )
}

class VocabularyMediaRateLimiterTest {
    @Test
    fun `regeneration is bounded per actor and sense`() {
        val limiter = VocabularyMediaRateLimiter(2)
        val senseId = UUID.randomUUID()
        val now = Instant.parse("2026-08-21T00:00:00Z")
        limiter.requireRegenerationAllowed("owner", senseId, now)
        limiter.requireRegenerationAllowed("owner", senseId, now.plusSeconds(1))
        val error = assertThrows(ResponseStatusException::class.java) {
            limiter.requireRegenerationAllowed("owner", senseId, now.plusSeconds(2))
        }
        assertEquals(HttpStatus.TOO_MANY_REQUESTS, error.statusCode)
        limiter.requireRegenerationAllowed("other-owner", senseId, now.plusSeconds(2))
    }
}

class CapturingGenerator : VocabularyImageGenerator {
    val prompts = mutableListOf<VocabularyImagePrompt>()
    var safety = VocabularyMediaSafetyState.SAFE
    var fail = false
    override fun generate(prompt: VocabularyImagePrompt): GeneratedVocabularyImage {
        prompts += prompt
        if (fail) throw VocabularyImageGenerationException("PROVIDER_UNAVAILABLE")
        return GeneratedVocabularyImage(byteArrayOf(1, 2, 3), "image/png", 10, 10, "TEST", "test-v1", safety, mapOf("en" to "Illustration of ${prompt.lemma}"))
    }
}

class FailingStorage : VocabularyMediaObjectStorage {
    private val values = mutableMapOf<String, VocabularyMediaObject>()
    var failWrite = false
    var failRead = false
    override fun put(key: String, bytes: ByteArray, contentType: String) {
        if (failWrite) throw VocabularyMediaStorageException("STORAGE_WRITE_FAILED")
        values[key] = VocabularyMediaObject(bytes, contentType)
    }
    override fun get(key: String): VocabularyMediaObject {
        if (failRead) throw VocabularyMediaStorageException("STORAGE_READ_FAILED")
        return values[key] ?: throw VocabularyMediaStorageException("OBJECT_MISSING")
    }
    override fun exists(key: String): Boolean = values.containsKey(key)
    override fun delete(key: String) { values.remove(key) }
}
