package com.playsay.gateway

import com.playsay.gateway.controller.*
import com.playsay.gateway.dto.*
import com.playsay.gateway.repo.*
import com.playsay.gateway.repo.schedule.*
import com.playsay.gateway.service.*
import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.utils.MetaData
import com.fasterxml.jackson.databind.node.ObjectNode
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import java.math.BigDecimal
import java.time.Instant
import java.util.UUID
import java.util.concurrent.Callable
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertTrue
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.TestInstance
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.http.HttpStatus
import org.springframework.mock.web.MockMultipartFile
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException

class MaterialSubmissionScoringControllerTest : MaterialControllerTestFixture() {
    @Test
    fun `submission scoring applies attempts and hints while ignoring fill gap weights`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val student = authentication(subject = "student-1", username = "student.one", role = "ROLE_STUDENT")
        userProfileStore.currentUserId(student)
        val material = materialCrudController.create(
            teacher,
            LessonMaterialRequest(
                title = "Attempt scoring",
                status = "PUBLISHED",
                document = objectMapper.readTree(
                    """
                    {
                      "schemaVersion": 1,
                      "pages": [
                        {
                          "id": "page-1",
                          "title": "Attempts",
                          "layout": "FLOW",
                          "blocks": [
                            {
                              "id": "gaps",
                              "type": "fillGaps",
                              "title": "Fill gaps",
                              "assessment": {
                                "attemptPenalty": 0.30,
                                "hintPenalty": 0.15,
                                "minimumCorrectFactor": 0.40
                              },
                              "items": [
                                {
                                  "prompt": "It is ___ cat.",
                                  "answer": "a",
                                  "options": ["a", "an", "-"],
                                  "weight": 2
                                },
                                {
                                  "prompt": "It is ___ apple.",
                                  "answer": "an",
                                  "options": ["a", "an", "-"],
                                  "weight": 1
                                }
                              ]
                            }
                          ]
                        }
                      ]
                    }
                    """.trimIndent(),
                ),
                scoringRubric = objectMapper.readTree("""{"maxScore":10}"""),
            ),
        ).body!!
        val course = courseController.create(teacher, CourseRequest(title = "Course", isPublished = true)).body!!
        val lessonTemplate = courseController.createLesson(
            teacher,
            course.id,
            CourseLessonRequest(title = "Lesson", materialId = material.id),
        ).body!!
        val lesson = scheduleController.create(
            teacher,
            ScheduledLessonRequest(
                lessonTemplateId = lessonTemplate.id,
                scheduledStart = activeLessonStart(),
                scheduledEnd = activeLessonEnd(),
                participantSubjects = listOf("student-1"),
            ),
        ).body!!

        val submission = scheduledMaterialController.saveScheduledLessonMaterialSubmission(
            student,
            lesson.id,
            MaterialSubmissionRequest(
                content = objectMapper.readTree(
                    """
                    {
                      "schemaVersion": 1,
                      "materialId": "${material.id}",
                      "answers": {
                        "gaps": {
                          "type": "fillGaps",
                          "items": {
                            "It is ___ cat.-0": "a",
                            "It is ___ apple.-1": "an"
                          },
                          "attempts": {
                            "It is ___ cat.-0": [
                              { "value": "an", "correct": false },
                              { "value": "a", "correct": true }
                            ],
                            "It is ___ apple.-1": [
                              { "value": "an", "correct": true }
                            ]
                          },
                          "hints": {
                            "It is ___ cat.-0": [
                              { "type": "firstLetter", "penalty": 0.15 }
                            ]
                          }
                        }
                      }
                    }
                    """.trimIndent(),
                ),
                submitted = true,
            ),
        )

        assertEquals(0, BigDecimal("8.50").compareTo(assertNotNull(submission.score)))
        assertEquals(1, submission.errorsCount)
        val assessment = submission.content["assessment"]
        assertEquals(1, assessment["errorsCount"].asInt())
        assertEquals(0, BigDecimal("2").compareTo(assessment["totalWeight"].decimalValue()))
        assertEquals(2, assessment["items"].size())
        val firstItem = assessment["items"][0]
        assertEquals("CORRECT_WITH_HINT", firstItem["status"].asText())
        assertEquals(0, BigDecimal.ONE.compareTo(firstItem["weight"].decimalValue()))
        assertEquals(2, firstItem["attemptsUsed"].asInt())
        assertEquals(1, firstItem["hintsUsed"].asInt())
        assertEquals(0, BigDecimal("0.70").compareTo(firstItem["scoreFactor"].decimalValue()))
    }

    @Test
    fun `submission scoring uses fixed fill gap retry factors instead of configured penalties`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val student = authentication(subject = "student-1", username = "student.one", role = "ROLE_STUDENT")
        userProfileStore.currentUserId(student)
        val material = materialCrudController.create(
            teacher,
            LessonMaterialRequest(
                title = "Fixed fill gap scoring",
                status = "PUBLISHED",
                document = objectMapper.readTree(
                    """
                    {
                      "schemaVersion": 1,
                      "pages": [
                        {
                          "id": "page-1",
                          "title": "Attempts",
                          "layout": "FLOW",
                          "blocks": [
                            {
                              "id": "gaps",
                              "type": "fillGaps",
                              "title": "Fill gaps",
                              "assessment": {
                                "maxAttempts": 1,
                                "attemptPenalty": 1,
                                "hintPenalty": 1
                              },
                              "items": [
                                {
                                  "id": "retry",
                                  "prompt": "I enjoy ___ books.",
                                  "answer": "reading",
                                  "maxAttempts": 5
                                }
                              ]
                            }
                          ]
                        }
                      ]
                    }
                    """.trimIndent(),
                ),
                scoringRubric = objectMapper.readTree("""{"maxScore":10}"""),
            ),
        ).body!!
        val lesson = scheduleController.create(
            teacher,
            ScheduledLessonRequest(
                materialId = material.id,
                scheduledStart = activeLessonStart(),
                scheduledEnd = activeLessonEnd(),
                participantSubjects = listOf("student-1"),
            ),
        ).body!!

        val submission = scheduledMaterialController.saveScheduledLessonMaterialSubmission(
            student,
            lesson.id,
            MaterialSubmissionRequest(
                content = objectMapper.readTree(
                    """
                    {
                      "schemaVersion": 1,
                      "materialId": "${material.id}",
                      "answers": {
                        "gaps": {
                          "type": "fillGaps",
                          "items": {
                            "retry": "reading"
                          },
                          "attempts": {
                            "retry": [
                              { "value": "read", "correct": false },
                              { "value": "reading", "correct": true }
                            ]
                          }
                        }
                      }
                    }
                    """.trimIndent(),
                ),
                submitted = true,
            ),
        )

        assertEquals(0, BigDecimal("7.00").compareTo(assertNotNull(submission.score)))
        val itemAssessment = submission.content["assessment"]["items"][0]
        assertEquals("CORRECT_AFTER_RETRY", itemAssessment["status"].asText())
        assertEquals(5, itemAssessment["maxAttempts"].asInt())
        assertEquals(0, BigDecimal("0.70").compareTo(itemAssessment["scoreFactor"].decimalValue()))
    }

    @Test
    fun `submission scoring applies matching pair max error limits`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val student = authentication(subject = "student-1", username = "student.one", role = "ROLE_STUDENT")
        userProfileStore.currentUserId(student)
        val material = materialCrudController.create(
            teacher,
            LessonMaterialRequest(
                title = "Matching attempts",
                status = "PUBLISHED",
                document = objectMapper.readTree(
                    """
                    {
                      "schemaVersion": 1,
                      "pages": [
                        {
                          "id": "page-1",
                          "title": "Matching",
                          "layout": "FLOW",
                          "blocks": [
                            {
                              "id": "matching",
                              "type": "matchingPairs",
                              "title": "Match",
                              "pairs": [
                                {
                                  "id": "pair-a",
                                  "left": "elusive",
                                  "right": "difficult to find"
                                },
                                {
                                  "id": "pair-b",
                                  "left": "goal",
                                  "right": "aim"
                                }
                              ],
                              "assessment": {
                                "maxErrors": 2
                              }
                            }
                          ]
                        }
                      ]
                    }
                    """.trimIndent(),
                ),
                scoringRubric = objectMapper.readTree("""{"maxScore":10}"""),
            ),
        ).body!!
        val course = courseController.create(teacher, CourseRequest(title = "Course", isPublished = true)).body!!
        val lessonTemplate = courseController.createLesson(
            teacher,
            course.id,
            CourseLessonRequest(title = "Lesson", materialId = material.id),
        ).body!!
        val lesson = scheduleController.create(
            teacher,
            ScheduledLessonRequest(
                lessonTemplateId = lessonTemplate.id,
                scheduledStart = activeLessonStart(),
                scheduledEnd = activeLessonEnd(),
                participantSubjects = listOf("student-1"),
            ),
        ).body!!

        val submission = scheduledMaterialController.saveScheduledLessonMaterialSubmission(
            student,
            lesson.id,
            MaterialSubmissionRequest(
                content = objectMapper.readTree(
                    """
                    {
                      "schemaVersion": 1,
                      "materialId": "${material.id}",
                      "answers": {
                        "matching": {
                          "type": "matchingPairs",
                          "matches": {},
                          "attempts": {
                            "pair-a": [
                              { "value": "pair-b", "correct": false }
                            ],
                            "pair-b": [
                              { "value": "pair-a", "correct": false }
                            ]
                          }
                        }
                      }
                    }
                    """.trimIndent(),
                ),
                submitted = true,
            ),
        )

        assertEquals(0, BigDecimal.ZERO.compareTo(assertNotNull(submission.score)))
        val firstItem = submission.content["assessment"]["items"][0]
        assertEquals("LOCKED", firstItem["status"].asText())
        assertEquals(1, firstItem["attemptsUsed"].asInt())
        assertEquals(1, firstItem["incorrectAttempts"].asInt())
        val secondItem = submission.content["assessment"]["items"][1]
        assertEquals("LOCKED", secondItem["status"].asText())
        assertEquals(1, secondItem["attemptsUsed"].asInt())
        assertEquals(1, secondItem["incorrectAttempts"].asInt())
    }

    @Test
    fun `submission scoring accepts stable item ids and additional accepted answers`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val student = authentication(subject = "student-1", username = "student.one", role = "ROLE_STUDENT")
        userProfileStore.currentUserId(student)
        val material = materialCrudController.create(
            teacher,
            LessonMaterialRequest(
                title = "Accepted variants",
                status = "PUBLISHED",
                document = objectMapper.readTree(
                    """
                    {
                      "schemaVersion": 1,
                      "pages": [
                        {
                          "id": "page-1",
                          "title": "Verb forms",
                          "layout": "FLOW",
                          "blocks": [
                            {
                              "id": "gaps",
                              "type": "fillGaps",
                              "title": "Complete the sentences",
                              "items": [
                                {
                                  "id": "item-go-cinema",
                                  "prompt": "I don't enjoy ___ to the cinema on my own.",
                                  "answer": "going",
                                  "acceptedAnswers": ["going out", "going alone"]
                                }
                              ]
                            }
                          ]
                        }
                      ]
                    }
                    """.trimIndent(),
                ),
                scoringRubric = objectMapper.readTree("""{"maxScore":10}"""),
            ),
        ).body!!
        val lesson = scheduleController.create(
            teacher,
            ScheduledLessonRequest(
                materialId = material.id,
                scheduledStart = activeLessonStart(),
                scheduledEnd = activeLessonEnd(),
                participantSubjects = listOf("student-1"),
            ),
        ).body!!

        val submission = scheduledMaterialController.saveScheduledLessonMaterialSubmission(
            student,
            lesson.id,
            MaterialSubmissionRequest(
                content = objectMapper.readTree(
                    """
                    {
                      "schemaVersion": 1,
                      "materialId": "${material.id}",
                      "answers": {
                        "gaps": {
                          "type": "fillGaps",
                          "items": {
                            "item-go-cinema": "going out"
                          },
                          "attempts": {
                            "item-go-cinema": [
                              { "value": "going out", "correct": true }
                            ]
                          }
                        }
                      }
                    }
                    """.trimIndent(),
                ),
                submitted = true,
            ),
        )

        assertEquals(0, BigDecimal.TEN.compareTo(assertNotNull(submission.score)))
        assertEquals(0, submission.errorsCount)
        val itemAssessment = submission.content["assessment"]["items"][0]
        assertEquals("item-go-cinema", itemAssessment["itemKey"].asText())
        assertEquals("CORRECT", itemAssessment["status"].asText())
    }

    @Test
    fun `submission scoring keeps duplicate word bank options distinct by option id`() {
        val teacher = authentication(subject = "teacher-1", username = "teacher.one", role = "ROLE_TEACHER")
        val student = authentication(subject = "student-1", username = "student.one", role = "ROLE_STUDENT")
        userProfileStore.currentUserId(student)
        val material = materialCrudController.create(
            teacher,
            LessonMaterialRequest(
                title = "Word bank duplicates",
                status = "PUBLISHED",
                document = objectMapper.readTree(
                    """
                    {
                      "schemaVersion": 1,
                      "pages": [
                        {
                          "id": "page-1",
                          "title": "Prepositions",
                          "layout": "FLOW",
                          "blocks": [
                            {
                              "id": "gaps",
                              "type": "fillGaps",
                              "title": "Complete the sentences",
                              "wordBankOptions": [
                                { "id": "bank-to-1", "value": "to" },
                                { "id": "bank-to-2", "value": "to" }
                              ],
                              "items": [
                                {
                                  "id": "item-arrive",
                                  "prompt": "I am going ___ the airport.",
                                  "answer": "to",
                                  "answerOptionId": "bank-to-2",
                                  "gapMode": "wordBank"
                                }
                              ]
                            }
                          ]
                        }
                      ]
                    }
                    """.trimIndent(),
                ),
                scoringRubric = objectMapper.readTree("""{"maxScore":10}"""),
            ),
        ).body!!
        val lesson = scheduleController.create(
            teacher,
            ScheduledLessonRequest(
                materialId = material.id,
                scheduledStart = activeLessonStart(),
                scheduledEnd = activeLessonEnd(),
                participantSubjects = listOf("student-1"),
            ),
        ).body!!

        val submission = scheduledMaterialController.saveScheduledLessonMaterialSubmission(
            student,
            lesson.id,
            MaterialSubmissionRequest(
                content = objectMapper.readTree(
                    """
                    {
                      "schemaVersion": 1,
                      "materialId": "${material.id}",
                      "answers": {
                        "gaps": {
                          "type": "fillGaps",
                          "items": {
                            "item-arrive": "to"
                          },
                          "optionIds": {
                            "item-arrive": "bank-to-1"
                          },
                          "attempts": {
                            "item-arrive": [
                              { "value": "to", "correct": false, "optionId": "bank-to-1" }
                            ]
                          }
                        }
                      }
                    }
                    """.trimIndent(),
                ),
                submitted = true,
            ),
        )

        assertEquals(0, BigDecimal.ZERO.compareTo(assertNotNull(submission.score)))
        assertEquals(1, submission.errorsCount)
        val itemAssessment = submission.content["assessment"]["items"][0]
        assertEquals("INCORRECT", itemAssessment["status"].asText())
        assertEquals(1, itemAssessment["incorrectAttempts"].asInt())
    }
}
