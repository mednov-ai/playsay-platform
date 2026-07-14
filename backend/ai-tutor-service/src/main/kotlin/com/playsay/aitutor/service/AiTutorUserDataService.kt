package com.playsay.aitutor.service

import com.playsay.aitutor.repo.ConversationSessionRepository
import com.playsay.aitutor.repo.DialogCreditAccountRepository
import com.playsay.aitutor.repo.DialogCreditLedgerRepository
import com.playsay.aitutor.repo.LearnerAppUserRepository
import com.playsay.aitutor.repo.SessionEventRepository
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException

@Service
class AiTutorUserDataService(
    private val users: LearnerAppUserRepository,
    private val sessions: ConversationSessionRepository,
    private val events: SessionEventRepository,
    private val accounts: DialogCreditAccountRepository,
    private val ledger: DialogCreditLedgerRepository,
    @param:Value("\${playsay.user-data.service-token:}") private val serviceToken: String,
) {
    @Transactional
    fun purge(subject: String, presentedToken: String?) {
        if (serviceToken.isBlank() || presentedToken != serviceToken) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN)
        }
        sessions.findAllBySubject(subject).forEach { session ->
            events.deleteBySessionId(session.id)
            sessions.delete(session)
        }
        users.findByKeycloakSubject(subject)?.let { user ->
            ledger.deleteByStudentUserId(user.id)
            accounts.deleteById(user.id)
        }
        ledger.anonymizeActorSubject(subject)
    }
}
