package com.playsay.worksheetimport.service

import com.playsay.worksheetimport.config.WorksheetImportProperties
import io.micrometer.core.instrument.Metrics
import io.micrometer.core.instrument.Timer
import java.awt.image.BufferedImage
import java.nio.file.Files
import java.nio.file.Path
import java.time.Duration
import java.util.Comparator
import java.util.concurrent.ExecutionException
import java.util.concurrent.Executors
import java.util.concurrent.ThreadFactory
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException
import javax.imageio.ImageIO
import org.apache.pdfbox.Loader
import org.apache.pdfbox.cos.COSName
import org.apache.pdfbox.pdmodel.PDDocument
import org.apache.pdfbox.pdmodel.PDPage
import org.apache.pdfbox.rendering.ImageType
import org.apache.pdfbox.rendering.PDFRenderer
import org.springframework.stereotype.Component

enum class PdfRejectionCode {
    ENCRYPTED,
    CORRUPT,
    ACTIVE_CONTENT,
    TOO_MANY_PAGES,
    PAGE_TOO_LARGE,
    TOTAL_PIXELS_EXCEEDED,
    MEMORY_LIMIT_EXCEEDED,
    TIMEOUT,
    RENDER_FAILED,
}

class PdfRejectedException(
    val code: PdfRejectionCode,
    cause: Throwable? = null,
) : RuntimeException(code.name, cause)

data class RasterizedPdfPage(
    val sourcePageNumber: Int,
    val path: Path,
    val width: Int,
    val height: Int,
    val mediaType: String = "image/png",
)

data class RasterizedPdf(
    val pages: List<RasterizedPdfPage>,
    private val directory: Path,
) : AutoCloseable {
    override fun close() {
        deleteTree(directory)
    }
}

@Component
class BoundedPdfRasterizer(
    private val properties: WorksheetImportProperties,
) {
    fun rasterize(source: Path): RasterizedPdf {
        val timer = Timer.start(Metrics.globalRegistry)
        var outcome = "SUCCESS"
        val timeout = properties.pdf.timeout
        val executor = Executors.newSingleThreadExecutor(daemonThreadFactory())
        val future = executor.submit<RasterizedPdf> { rasterizeAtomically(source, timeout) }
        return try {
            future.get(timeout.toNanos(), TimeUnit.NANOSECONDS)
        } catch (exception: TimeoutException) {
            outcome = PdfRejectionCode.TIMEOUT.name
            future.cancel(true)
            throw PdfRejectedException(PdfRejectionCode.TIMEOUT, exception)
        } catch (exception: InterruptedException) {
            outcome = PdfRejectionCode.TIMEOUT.name
            future.cancel(true)
            Thread.currentThread().interrupt()
            throw PdfRejectedException(PdfRejectionCode.TIMEOUT, exception)
        } catch (exception: ExecutionException) {
            val rejected = (exception.cause as? PdfRejectedException)
                ?: PdfRejectedException(PdfRejectionCode.RENDER_FAILED, exception.cause)
            outcome = rejected.code.name
            throw rejected
        } finally {
            executor.shutdownNow()
            timer.stop(Metrics.timer("playsay.worksheet.import.pdf.raster.duration", "outcome", outcome))
        }
    }

    private fun rasterizeAtomically(source: Path, timeout: Duration): RasterizedPdf {
        val directory = Files.createTempDirectory("worksheet-pdf-")
        val deadline = System.nanoTime() + timeout.toNanos()
        try {
            val document = try {
                Loader.loadPDF(source.toFile())
            } catch (exception: org.apache.pdfbox.pdmodel.encryption.InvalidPasswordException) {
                throw PdfRejectedException(PdfRejectionCode.ENCRYPTED, exception)
            } catch (exception: Exception) {
                throw PdfRejectedException(PdfRejectionCode.CORRUPT, exception)
            }
            document.use {
                validateDocument(it)
                val plans = it.pages.mapIndexed { index, page -> plan(index, page) }
                val totalPixels = plans.sumOf { plan -> plan.pixels }
                if (totalPixels > properties.pdf.maxTotalPixels) {
                    throw PdfRejectedException(PdfRejectionCode.TOTAL_PIXELS_EXCEEDED)
                }
                val renderer = PDFRenderer(it)
                val pages = plans.map { plan ->
                    ensureTime(deadline)
                    val image = renderer.renderImageWithDPI(plan.index, properties.pdf.renderDpi.toFloat(), ImageType.RGB)
                    ensureTime(deadline)
                    if (image.width != plan.width || image.height != plan.height) {
                        validateRasterDimensions(image)
                    }
                    val target = directory.resolve("page-${plan.index + 1}.png")
                    if (!ImageIO.write(image, "png", target.toFile())) {
                        throw PdfRejectedException(PdfRejectionCode.RENDER_FAILED)
                    }
                    image.flush()
                    RasterizedPdfPage(plan.index + 1, target, plan.width, plan.height)
                }
                return RasterizedPdf(pages, directory)
            }
        } catch (exception: PdfRejectedException) {
            deleteTree(directory)
            throw exception
        } catch (exception: Exception) {
            deleteTree(directory)
            throw PdfRejectedException(PdfRejectionCode.RENDER_FAILED, exception)
        }
    }

    private fun validateDocument(document: PDDocument) {
        if (document.isEncrypted) throw PdfRejectedException(PdfRejectionCode.ENCRYPTED)
        if (document.numberOfPages !in 1..properties.pdf.maxPages) {
            throw PdfRejectedException(PdfRejectionCode.TOO_MANY_PAGES)
        }
        val catalog = document.documentCatalog.cosObject
        val names = catalog.getCOSDictionary(COSName.NAMES)
        if (
            catalog.containsKey(COSName.OPEN_ACTION) ||
            catalog.containsKey(COSName.AA) ||
            catalog.containsKey(COSName.ACRO_FORM) ||
            names?.containsKey(COSName.getPDFName("JavaScript")) == true ||
            names?.containsKey(COSName.EMBEDDED_FILES) == true
        ) {
            throw PdfRejectedException(PdfRejectionCode.ACTIVE_CONTENT)
        }
        document.pages.forEach { page ->
            if (page.cosObject.containsKey(COSName.AA)) {
                throw PdfRejectedException(PdfRejectionCode.ACTIVE_CONTENT)
            }
            page.annotations.forEach { annotation ->
                val dictionary = annotation.cosObject
                val subtype = dictionary.getNameAsString(COSName.SUBTYPE)
                if (
                    dictionary.containsKey(COSName.A) ||
                    dictionary.containsKey(COSName.AA) ||
                    subtype in ACTIVE_ANNOTATION_SUBTYPES
                ) {
                    throw PdfRejectedException(PdfRejectionCode.ACTIVE_CONTENT)
                }
            }
        }
    }

    private fun plan(index: Int, page: PDPage): PagePlan {
        val scale = properties.pdf.renderDpi / 72.0
        val rotation = Math.floorMod(page.rotation, 360)
        val box = page.cropBox
        val rawWidth = kotlin.math.ceil(box.width * scale).toLong()
        val rawHeight = kotlin.math.ceil(box.height * scale).toLong()
        val width = if (rotation == 90 || rotation == 270) rawHeight else rawWidth
        val height = if (rotation == 90 || rotation == 270) rawWidth else rawHeight
        if (width <= 0 || height <= 0 || width > Int.MAX_VALUE || height > Int.MAX_VALUE) {
            throw PdfRejectedException(PdfRejectionCode.PAGE_TOO_LARGE)
        }
        val pixels = Math.multiplyExact(width, height)
        if (pixels > properties.pdf.maxPagePixels) {
            throw PdfRejectedException(PdfRejectionCode.PAGE_TOO_LARGE)
        }
        val rasterBytes = Math.multiplyExact(pixels, 4L)
        if (rasterBytes > properties.pdf.maxMemoryBytes) {
            throw PdfRejectedException(PdfRejectionCode.MEMORY_LIMIT_EXCEEDED)
        }
        return PagePlan(index, width.toInt(), height.toInt(), pixels)
    }

    private fun validateRasterDimensions(image: BufferedImage) {
        val pixels = Math.multiplyExact(image.width.toLong(), image.height.toLong())
        if (pixels > properties.pdf.maxPagePixels) throw PdfRejectedException(PdfRejectionCode.PAGE_TOO_LARGE)
        if (Math.multiplyExact(pixels, 4L) > properties.pdf.maxMemoryBytes) {
            throw PdfRejectedException(PdfRejectionCode.MEMORY_LIMIT_EXCEEDED)
        }
    }

    private fun ensureTime(deadline: Long) {
        if (Thread.currentThread().isInterrupted || System.nanoTime() > deadline) {
            throw PdfRejectedException(PdfRejectionCode.TIMEOUT)
        }
    }

    private data class PagePlan(val index: Int, val width: Int, val height: Int, val pixels: Long)

    companion object {
        private val ACTIVE_ANNOTATION_SUBTYPES = setOf("FileAttachment", "Movie", "RichMedia", "Screen", "Sound", "Widget", "3D")

        private fun daemonThreadFactory() = ThreadFactory { runnable ->
            Thread(runnable, "worksheet-pdf-rasterizer").apply { isDaemon = true }
        }
    }
}

private fun deleteTree(directory: Path) {
    if (!Files.exists(directory)) return
    Files.walk(directory).use { paths ->
        paths.sorted(Comparator.reverseOrder()).forEach(Files::deleteIfExists)
    }
}
