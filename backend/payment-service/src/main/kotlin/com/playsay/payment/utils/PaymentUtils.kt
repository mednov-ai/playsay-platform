package com.playsay.payment.utils

import java.math.BigDecimal
import java.math.RoundingMode
import java.security.MessageDigest

fun sha256Hex(value: String): String {
    val digest = MessageDigest.getInstance("SHA-256").digest(value.toByteArray(Charsets.UTF_8))
    return digest.joinToString("") { byte -> "%02x".format(byte) }
}

fun minorToDecimalString(amountMinor: Long): String =
    BigDecimal(amountMinor).divide(BigDecimal(100), 2, RoundingMode.UNNECESSARY).toPlainString()
