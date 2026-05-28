package com.playsay.gateway

import com.playsay.gateway.controller.*
import com.playsay.gateway.dto.*
import com.playsay.gateway.service.*
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue
import org.springframework.http.HttpStatus
import org.springframework.web.server.ResponseStatusException

class MaterialUrlImportServiceTest {
    @Test
    fun `extracts readable html title description and body text`() {
        val extracted = extractHtmlText(
            """
            <!doctype html>
            <html>
              <head>
                <title>A1 animals lesson</title>
                <meta name="description" content="Practice animal words &amp; simple sentences">
                <style>.hidden { display: none; }</style>
                <script>window.secret = true;</script>
              </head>
              <body>
                <nav>Skip menu</nav>
                <main>
                  <h1>Animals for children</h1>
                  <p>Read and match the animal words.</p>
                  <ul><li>owl</li><li>penguin</li></ul>
                </main>
              </body>
            </html>
            """.trimIndent(),
        )

        assertEquals("A1 animals lesson", extracted.title)
        assertEquals("Practice animal words & simple sentences", extracted.description)
        assertTrue("Animals for children" in extracted.text)
        assertTrue("Read and match the animal words." in extracted.text)
        assertTrue("window.secret" !in extracted.text)
        assertTrue("Skip menu" !in extracted.text)
    }

    @Test
    fun `rejects localhost url imports`() {
        val error = assertFailsWith<ResponseStatusException> {
            validateImportUri("http://localhost:8080/private")
        }

        assertEquals(HttpStatus.BAD_REQUEST, error.statusCode)
    }

    @Test
    fun `rejects non-http schemes`() {
        val error = assertFailsWith<ResponseStatusException> {
            validateImportUri("file:///etc/passwd")
        }

        assertEquals(HttpStatus.BAD_REQUEST, error.statusCode)
    }
}
