package com.playsay.aitutor.service

import com.playsay.aitutor.dto.AgePolicy
import com.playsay.aitutor.dto.ConversationScenarioResponse
import com.playsay.aitutor.dto.TutorPersonaResponse
import org.springframework.stereotype.Service

@Service
class AiTutorCatalogService {
    private val allPolicies = AgePolicy.entries.toSet()
    private val personas = listOf(
        TutorPersonaResponse("maya", "Maya", "coral", "GENERAL_AMERICAN", "/avatars/maya.glb", allPolicies),
        TutorPersonaResponse("leo", "Leo", "verse", "STANDARD_BRITISH", "/avatars/leo.glb", allPolicies),
        TutorPersonaResponse("nova", "Nova", "sage", "GENERAL_AMERICAN", "/avatars/nova.glb", setOf(AgePolicy.TEEN, AgePolicy.ADULT)),
    )
    private val scenarios = listOf(
        ConversationScenarioResponse("meet-someone", "Meeting someone", "Introduce yourself and keep a friendly conversation going.", "A1", "EVERYDAY", "Introduce yourself and learn two things about the other person.", listOf("Give a relevant introduction", "Ask or answer simple personal-interest questions"), listOf("Say your name and one fact", "Ask a follow-up question"), allPolicies),
        ConversationScenarioResponse("cafe-order", "At a cafe", "Order food, ask questions, and handle a small change.", "A2", "TRAVEL", "Complete a cafe order politely and clearly.", listOf("Order at least one item", "Respond to a clarification", "Close the exchange politely"), listOf("Place an order", "Answer the server's question", "Confirm the final order"), allPolicies),
        ConversationScenarioResponse("weekend-plans", "Weekend plans", "Discuss preferences and make a plan together.", "B1", "EVERYDAY", "Agree on a realistic weekend plan.", listOf("Express a preference with a reason", "React to another suggestion", "Reach an agreement"), listOf("Suggest an activity", "Compare options", "Agree on time and place"), allPolicies),
        ConversationScenarioResponse("job-interview", "Job interview", "Practise concise professional answers.", "B2", "WORK", "Answer common interview questions with relevant evidence.", listOf("Answer the question directly", "Give a concrete example", "Use professional language"), listOf("Introduce your experience", "Describe a strength", "Ask a relevant question"), setOf(AgePolicy.TEEN, AgePolicy.ADULT)),
        ConversationScenarioResponse("free", "Free conversation", "Choose a safe topic that matters to you.", "A2", "FREE", "Sustain a clear, relevant conversation about the chosen topic.", listOf("Stay on topic", "Express and support an idea", "Respond to follow-up questions"), listOf("Introduce the topic", "Develop one idea", "Ask or answer a follow-up"), allPolicies, true),
    )

    fun personas(agePolicy: AgePolicy): List<TutorPersonaResponse> = personas.filter { agePolicy in it.agePolicies }
    fun scenarios(agePolicy: AgePolicy): List<ConversationScenarioResponse> = scenarios.filter { agePolicy in it.agePolicies }
    fun persona(id: String, agePolicy: AgePolicy) = personas(agePolicy).firstOrNull { it.id == id }
    fun scenario(id: String, agePolicy: AgePolicy) = scenarios(agePolicy).firstOrNull { it.id == id }
}
