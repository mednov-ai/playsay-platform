package com.playsay.aitutor.repo

import kotlin.test.Test
import kotlin.test.assertTrue
import org.springframework.data.jpa.repository.Query

class DialogCreditLedgerRepositoryTest {
    @Test
    fun `actor anonymization bypasses immutable entity updates`() {
        val method = DialogCreditLedgerRepository::class.java.getMethod("anonymizeActorSubject", String::class.java)
        val query = method.getAnnotation(Query::class.java)

        assertTrue(query.nativeQuery)
    }
}
