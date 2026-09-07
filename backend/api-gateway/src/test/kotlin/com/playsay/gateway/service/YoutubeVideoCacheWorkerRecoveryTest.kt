package com.playsay.gateway.service

import com.playsay.contract.media.model.YoutubePlaybackQuality
import com.playsay.contract.media.model.YoutubeVideoCacheRequest
import com.playsay.gateway.client.YoutubeMediaClient
import com.playsay.gateway.repo.LessonMaterialRepo
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import java.time.Duration
import java.util.UUID
import java.util.concurrent.ExecutorService
import kotlin.test.Test
import org.mockito.Mockito.*
import org.springframework.test.util.ReflectionTestUtils

class YoutubeVideoCacheWorkerRecoveryTest {
    @Test
    fun `manual metadata reaches download but does not become automatic cache metadata`() {
        val cache = mock(YoutubeVideoCacheService::class.java)
        val media = mock(YoutubeMediaClient::class.java)
        val id = UUID.randomUUID()
        val work = YoutubeVideoCacheSnapshot(id, "5l-fo-d0gt8", "MEDIUM", "IN_PROGRESS", null, null, null, null, null, null, null, null, 1)
        val manual = YoutubeVideoMeta(work.videoId, 180, "en")
        `when`(cache.confirmedMetadata(id, work.videoId)).thenReturn(manual)
        val worker = YoutubeVideoCacheWorker(cache, media, mock(LessonMaterialRepo::class.java), SimpleMeterRegistry(), mock(ExecutorService::class.java), true, 900, 30)

        ReflectionTestUtils.invokeMethod<Unit>(worker, "process", work)

        verify(media).cacheVideo(YoutubeVideoCacheRequest(videoId = work.videoId, requestedQuality = YoutubePlaybackQuality.MEDIUM))
        verify(cache, never()).recordMetadata(id, manual)
        verify(cache).markRetry(id, "YOUTUBE_CACHE_UNAVAILABLE", Duration.ofMinutes(1))
    }

    @Test
    fun `known automatic duration rejection still prevents manual cache download`() {
        val cache = mock(YoutubeVideoCacheService::class.java)
        val media = mock(YoutubeMediaClient::class.java)
        val id = UUID.randomUUID()
        val work = YoutubeVideoCacheSnapshot(id, "5l-fo-d0gt8", "MEDIUM", "IN_PROGRESS", null, null, null, null, null, null, null, null, 1)
        `when`(cache.confirmedMetadata(id, work.videoId)).thenReturn(YoutubeVideoMeta(work.videoId, 180, "en"))
        `when`(media.resolveMetadata(work.videoId)).thenReturn(YoutubeVideoMeta(work.videoId, 421, "en"))
        val worker = YoutubeVideoCacheWorker(cache, media, mock(LessonMaterialRepo::class.java), SimpleMeterRegistry(), mock(ExecutorService::class.java), true, 900, 30)

        ReflectionTestUtils.invokeMethod<Unit>(worker, "process", work)

        verify(cache).markRejected(id, "YOUTUBE_DURATION_TOO_LONG")
        verify(media, never()).cacheVideo(YoutubeVideoCacheRequest(videoId = work.videoId, requestedQuality = YoutubePlaybackQuality.MEDIUM))
    }
}
