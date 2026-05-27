package com.playsay.gateway.utils

object MetaData {
    object Roles {
        const val ADMIN = "ADMIN"
        const val TEACHER = "TEACHER"
        const val STUDENT = "STUDENT"
    }

    object Authorities {
        const val PREFIX = "ROLE_"
        const val ADMIN = "${PREFIX}${Roles.ADMIN}"
        const val TEACHER = "${PREFIX}${Roles.TEACHER}"
        const val STUDENT = "${PREFIX}${Roles.STUDENT}"
    }

    object LessonStatuses {
        const val SCHEDULED = "SCHEDULED"
        const val IN_PROGRESS = "IN_PROGRESS"
        const val COMPLETED = "COMPLETED"
        const val CANCELLED = "CANCELLED"
    }

    object LessonTypes {
        const val INDIVIDUAL = "INDIVIDUAL"
        const val GROUP = "GROUP"
    }

    object AttendanceStatuses {
        const val PLANNED = "PLANNED"
        const val PRESENT = "PRESENT"
    }

    object MaterialVisibility {
        const val PRIVATE = "PRIVATE"
        const val PUBLIC = "PUBLIC"
    }

    object MaterialStatuses {
        const val DRAFT = "DRAFT"
        const val PUBLISHED = "PUBLISHED"
        const val ARCHIVED = "ARCHIVED"
    }

    object AiProviders {
        const val STUB = "stub"
        const val OPENAI = "openai"
    }

    object StorageProviders {
        const val MEMORY = "memory"
        const val S3 = "s3"
    }

    object RealtimeMessageTypes {
        const val ERROR = "error"
        const val LESSON_UPDATED = "lesson.updated"
        const val LESSON_DELETED = "lesson.deleted"
    }

    object ErrorCodes {
        const val ADMIN_ROLE_REQUIRED = "ADMIN_ROLE_REQUIRED"
        const val TEACHER_OR_ADMIN_ROLE_REQUIRED = "TEACHER_OR_ADMIN_ROLE_REQUIRED"
        const val COURSE_NOT_FOUND = "COURSE_NOT_FOUND"
        const val SCHEDULED_LESSON_NOT_FOUND = "SCHEDULED_LESSON_NOT_FOUND"
        const val MATERIAL_NOT_FOUND = "MATERIAL_NOT_FOUND"
        const val INVALID_REQUEST = "INVALID_REQUEST"
    }

    object Messages {
        const val MATERIAL_DRAFT_DESCRIPTION = "MATERIAL_DRAFT_DESCRIPTION"
        const val MATERIAL_GOAL_TITLE = "MATERIAL_GOAL_TITLE"
        const val FLASHCARD_TOPIC_TRANSLATION = "FLASHCARD_TOPIC_TRANSLATION"
        const val FLASHCARD_OPINION_TRANSLATION = "FLASHCARD_OPINION_TRANSLATION"
        const val FLASHCARD_BECAUSE_TRANSLATION = "FLASHCARD_BECAUSE_TRANSLATION"
        const val RUBRIC_TASK_COMPLETION = "RUBRIC_TASK_COMPLETION"
        const val RUBRIC_GRAMMAR = "RUBRIC_GRAMMAR"
        const val RUBRIC_VOCABULARY = "RUBRIC_VOCABULARY"
        const val RUBRIC_FLUENCY = "RUBRIC_FLUENCY"
        const val MATERIAL_NEW_TITLE = "MATERIAL_NEW_TITLE"
        const val MATERIAL_IMPORT_URL_PROMPT = "MATERIAL_IMPORT_URL_PROMPT"
        const val MATERIAL_FROM_URL_TITLE = "MATERIAL_FROM_URL_TITLE"
        const val MATERIAL_AI_IMAGE_ALT = "MATERIAL_AI_IMAGE_ALT"
        const val MATERIAL_NEW_BLOCK_TITLE = "MATERIAL_NEW_BLOCK_TITLE"
        const val MATERIAL_NEW_BLOCK_BODY = "MATERIAL_NEW_BLOCK_BODY"
    }
}
