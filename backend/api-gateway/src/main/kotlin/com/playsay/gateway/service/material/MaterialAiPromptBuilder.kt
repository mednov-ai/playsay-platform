package com.playsay.gateway.service.material

import com.playsay.gateway.service.MaterialAiDraftInput
import org.springframework.stereotype.Component

@Component
class MaterialAiPromptBuilder {
    fun systemPrompt(): String = SYSTEM_PROMPT

    fun userPrompt(input: MaterialAiDraftInput): String =
        """
        Create a Honey School lesson material draft.

        Teacher request:
        ${input.prompt}

        Requested title: ${input.title}
        Language: ${input.language}
        CEFR level: ${input.cefrLevel}
        Lesson format: infer individual/group if the request mentions it.
        Source image attached: ${if (input.hasSourceImage()) "yes" else "no"}.
        Source file name: ${input.sourceFileName ?: "not provided"}.
        External source URL: ${input.sourceUrl ?: "not provided"}.
        External source page title: ${input.sourceTitle ?: "not provided"}.

        Requirements:
        - Build a practical live lesson for children learning English.
        - If external source text is provided in the teacher request, use it as source material, but transform it into original live-lesson activities instead of copying the page verbatim.
        - Before writing the JSON, classify the worksheet type from the source image or request: fill gaps, multiple choice, matching pairs, flashcards, reading/listening/speaking, or mixed.
        - If a source image is attached, first solve the worksheet yourself, then convert it into editable Honey School blocks.
        - Do not merely translate or copy the scan as text. Turn worksheet blanks into interactive exercise items.
        - Preserve every visible worksheet blank as an interactive item, grouped by the original section order, before adding any invented follow-up activity.
        - Do not drop later worksheet sections and do not replace the worksheet with a shorter practice set unless the scan is unreadable.
        - For "match words to pictures", "draw lines", "connect", or two-column matching worksheets, use matchingPairs blocks.
        - For matchingPairs, preserve every visible pair. Put the source item in left and the correct target in right. Set targetKind "IMAGE" only when the target should be a generated picture; set targetKind "TEXT" when both sides are text.
        - For IMAGE matchingPairs, create a fresh child-friendly imagePrompt for the target picture. Do not crop, reuse, embed, or describe copying the original scan picture. Set imageUrl null until a generated asset exists.
        - For TEXT matchingPairs, set imagePrompt and imageAlt to empty strings and imageUrl null.
        - For fill-in-article or grammar worksheet scans, use fillGaps or multipleChoice items with concise prompts, the correct answer, and choices.
        - For a/an article tasks, each blank item must provide choices ["a", "an", "-"] and an answer such as "a", "an", or "-".
        - Solve a/an tasks with English article rules: singular countable nouns use a/an by sound; plural nouns, uncountable nouns, numbers, and adjectives without a following noun use "-".
        - Keep the blank marker in item prompts, for example "___ apple" or "It is ___ girl.", so the renderer can place the combobox at the blank.
        - For sentence tasks, keep the full visible sentence with the blank marker and solve from grammar context.
        - Prefer 4-8 blocks: warm-up text, vocabulary/flashcards, one controlled exercise, one speaking task, one writing or drawing task.
        - Use supported block types only.
        - For unused block fields, return null or an empty array as required by the schema.
        - Keep all teacher-facing text concise.
        - Do not copy long copyrighted source text verbatim; transform it into original activities.
        - Keep status DRAFT and visibility PRIVATE.
        """.trimIndent()

    private companion object {
        val SYSTEM_PROMPT = """
            You are Honey School lesson material builder for an online English school for children.

            Return only structured data that matches the provided JSON schema.
            Do not output HTML or Markdown.
            Create safe, age-appropriate English lesson material.
            Infer CEFR carefully when needed, but respect the requested level when provided.
            Include a 10-point scoring rubric and analysis flags.
            Materials are used in live individual and group video lessons, so tasks must be easy for a teacher to run during a lesson.
        """.trimIndent()
    }
}
