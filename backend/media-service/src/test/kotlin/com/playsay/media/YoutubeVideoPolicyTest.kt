package com.playsay.media

import com.playsay.media.service.MediaServiceException
import com.playsay.media.service.YoutubeVideoPolicy
import kotlin.test.Test
import kotlin.test.assertFailsWith

class YoutubeVideoPolicyTest {
    @Test
    fun `missing provider fields do not override gateway manual authorization`() {
        YoutubeVideoPolicy.requireNoKnownViolation(null, null)
        YoutubeVideoPolicy.requireNoKnownViolation(420, "en-GB")
        YoutubeVideoPolicy.requireNoKnownViolation(180, null)
    }

    @Test
    fun `new extraction metadata cannot contradict gateway policy`() {
        assertFailsWith<MediaServiceException> { YoutubeVideoPolicy.requireNoKnownViolation(421, "en") }
        assertFailsWith<MediaServiceException> { YoutubeVideoPolicy.requireNoKnownViolation(180, "de") }
        assertFailsWith<MediaServiceException> { YoutubeVideoPolicy.requireNoKnownViolation(0, "en") }
    }
}
