package com.playsay.payment.utils

import jakarta.servlet.http.HttpServletRequest

fun HttpServletRequest.rawBodyUtf8(): String =
    inputStream.readBytes().toString(Charsets.UTF_8)
