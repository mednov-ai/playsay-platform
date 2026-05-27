package com.playsay.gateway.error

data class ProjectErrorResponse(
    val status: Int,
    val errorCode: String,
    val message: String,
)
