package com.playsay.gateway.service.material

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ObjectNode
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.playsay.gateway.dto.LessonMaterialDraftResponse
import com.playsay.gateway.service.MaterialAiDraftInput
import com.playsay.gateway.service.MessageProvider
import com.playsay.gateway.utils.MetaData
import org.springframework.stereotype.Component

@Component
class StubMaterialAiDraftProvider(
    private val messageProvider: MessageProvider,
) {
    private val objectMapper: ObjectMapper = jacksonObjectMapper()

    fun draft(input: MaterialAiDraftInput): LessonMaterialDraftResponse {
        val sourceMeta = objectMapper.createObjectNode()
            .put("kind", "AI_STUB")
            .put("provider", "stub")
            .put("sourceType", input.resolvedSourceType())
            .put("prompt", input.prompt)
            .put("note", "Deterministic fallback draft; configure PLAYSAY_AI_PROVIDER=openai for live generation.")
        input.sourceFileName?.let { sourceMeta.put("sourceFileName", it) }
        input.sourceUrl?.let { sourceMeta.put("sourceUrl", it) }
        input.sourceTitle?.let { sourceMeta.put("sourceTitle", it) }
        input.sourceFetchedChars?.let { sourceMeta.put("sourceFetchedChars", it) }

        return LessonMaterialDraftResponse(
            title = input.title,
            description = messageProvider.get(MetaData.Messages.MATERIAL_DRAFT_DESCRIPTION, input.prompt.take(180)),
            language = input.language,
            cefrLevel = input.cefrLevel,
            visibility = "PRIVATE",
            status = "DRAFT",
            document = stubDocument(input),
            sourceMeta = sourceMeta,
            scoringRubric = defaultScoringRubric(),
        )
    }

    private fun stubDocument(input: MaterialAiDraftInput): ObjectNode =
        objectMapper.createObjectNode().apply {
            put("schemaVersion", 1)
            putArray("pages").add(
                objectMapper.createObjectNode().apply {
                    put("id", "page-warmup")
                    put("title", input.title)
                    put("layout", "FLOW")
                    putArray("blocks").apply {
                        add(textBlock("block-goal", messageProvider[MetaData.Messages.MATERIAL_GOAL_TITLE], input.prompt))
                        add(objectMapper.createObjectNode().apply {
                            put("id", "block-vocab"); put("type", "flashcards"); put("title", "Useful words")
                            putArray("cards")
                                .add(flashcard("topic", "topic", messageProvider[MetaData.Messages.FLASHCARD_TOPIC_TRANSLATION], "Let's discuss this topic."))
                                .add(flashcard("opinion", "opinion", messageProvider[MetaData.Messages.FLASHCARD_OPINION_TRANSLATION], "I think it is useful."))
                                .add(flashcard("because", "because", messageProvider[MetaData.Messages.FLASHCARD_BECAUSE_TRANSLATION], "I agree because..."))
                        })
                        add(objectMapper.createObjectNode().apply {
                            put("id", "block-gap"); put("type", "fillGaps"); put("title", "Complete the ideas")
                            put("instruction", "Choose words that fit the meaning.")
                            putArray("items")
                                .add(gapItem("I can talk about ___ in English.", "this topic"))
                                .add(gapItem("My opinion is ___ because it is useful.", "positive"))
                        })
                        add(objectMapper.createObjectNode().apply {
                            put("id", "block-speaking"); put("type", "speakingPrompt"); put("title", "Let's speak")
                            put("prompt", "Ask your partner three questions about the topic, then share one answer.")
                            put("level", input.cefrLevel); put("language", input.language)
                        })
                        add(objectMapper.createObjectNode().apply {
                            put("id", "block-writing"); put("type", "freeWriting"); put("title", "Short answer")
                            put("prompt", "Write 3-5 sentences using the new words."); put("minWords", 20)
                        })
                        add(objectMapper.createObjectNode().apply {
                            put("id", "block-drawing"); put("type", "drawingArea"); put("title", "Teacher notes"); put("height", 220)
                        })
                    }
                },
            )
        }

    private fun textBlock(id: String, title: String, body: String): ObjectNode = objectMapper.createObjectNode().apply {
        put("id", id); put("type", "text"); put("title", title); put("body", body)
    }

    private fun flashcard(id: String, front: String, back: String, example: String): ObjectNode =
        objectMapper.createObjectNode().apply {
            put("id", id); put("front", front); put("back", back); put("example", example)
        }

    private fun gapItem(prompt: String, answer: String): ObjectNode = objectMapper.createObjectNode().apply {
        put("prompt", prompt); put("answer", answer)
    }

    private fun defaultScoringRubric(): ObjectNode = objectMapper.createObjectNode().apply {
        put("maxScore", 10)
        putArray("criteria")
            .add(criterion("taskCompletion", messageProvider[MetaData.Messages.RUBRIC_TASK_COMPLETION], 4))
            .add(criterion("grammar", messageProvider[MetaData.Messages.RUBRIC_GRAMMAR], 2))
            .add(criterion("vocabulary", messageProvider[MetaData.Messages.RUBRIC_VOCABULARY], 2))
            .add(criterion("fluency", messageProvider[MetaData.Messages.RUBRIC_FLUENCY], 2))
        putArray("analysisFlags").add("taskCompletion").add("grammar").add("vocabulary").add("spelling")
    }

    private fun criterion(key: String, label: String, weight: Int): ObjectNode = objectMapper.createObjectNode().apply {
        put("key", key); put("label", label); put("weight", weight)
    }
}

internal fun MaterialAiDraftInput.hasSourceImage(): Boolean = sourceImageDataUrl?.isNotBlank() == true

internal fun MaterialAiDraftInput.resolvedSourceType(): String =
    sourceType?.trim()?.takeIf(String::isNotEmpty) ?: if (hasSourceImage()) "scan" else "teacher_prompt"
