package com.playsay.vocabulary.service

import com.playsay.vocabulary.dto.LexicalCatalogScope
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

class VocabularyLexicalIdentityScopeTest {
    @Test
    fun `configured school scope shares lexical identity`() {
        val identity = vocabularyCatalogIdentity("student-1", " honey-school ")

        assertThat(identity.scope).isEqualTo(LexicalCatalogScope.SCHOOL)
        assertThat(identity.scopeKey).isEqualTo("honey-school")
    }

    @Test
    fun `blank school scope preserves learner isolation`() {
        val identity = vocabularyCatalogIdentity("student-1", "  ")

        assertThat(identity.scope).isEqualTo(LexicalCatalogScope.LEARNER)
        assertThat(identity.scopeKey).isEqualTo("learner:student-1")
    }
}
