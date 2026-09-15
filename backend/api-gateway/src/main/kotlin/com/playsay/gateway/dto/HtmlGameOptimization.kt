package com.playsay.gateway.dto

data class HtmlGameOptimizationResult(
    val html: String,
    val policy: String,
    val status: String,
    val inputBytes: Int,
    val outputBytes: Int,
    val eligibleCount: Int,
    val replacedCount: Int,
    val bytesSaved: Int,
    val durationMs: Long,
)

data class HtmlGameOptimizationMetadata(
    val status: String,
    val policy: String,
    val inputBytes: Int,
    val outputBytes: Int,
    val eligibleCount: Int,
    val replacedCount: Int,
    val bytesSaved: Int,
)
