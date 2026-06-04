package com.playsay.gateway.utils

import jakarta.servlet.http.HttpServletRequest

fun HttpServletRequest.rawBodyUtf8(): String =
    inputStream.readBytes().toString(Charsets.UTF_8)
