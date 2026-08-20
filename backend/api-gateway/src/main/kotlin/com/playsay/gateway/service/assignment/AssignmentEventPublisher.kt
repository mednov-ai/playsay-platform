package com.playsay.gateway.service.assignment

import com.playsay.gateway.entity.AppUserEntity
import com.playsay.gateway.realtime.AssignmentChangedEvent
import java.util.UUID
import org.springframework.context.ApplicationEventPublisher
import org.springframework.stereotype.Component

@Component
class AssignmentEventPublisher(
    private val eventPublisher: ApplicationEventPublisher,
) {
    fun publish(
        actorSubject: String,
        assignmentId: UUID,
        recipients: List<AppUserEntity>,
        change: String,
    ) {
        publish(
            assignmentId = assignmentId,
            visibleSubjects = recipients.mapTo(mutableSetOf(), AppUserEntity::keycloakSubject)
                .apply { add(actorSubject) },
            change = change,
        )
    }

    fun publish(assignmentId: UUID, visibleSubjects: Set<String>, change: String) {
        eventPublisher.publishEvent(AssignmentChangedEvent(assignmentId, visibleSubjects, change))
    }
}
