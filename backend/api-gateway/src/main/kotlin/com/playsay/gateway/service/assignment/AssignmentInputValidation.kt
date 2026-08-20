package com.playsay.gateway.service.assignment

import com.playsay.gateway.error.ProjectResponseException
import com.playsay.gateway.utils.MetaData
import org.springframework.http.HttpStatus

internal fun String?.cleanAssignmentField(fieldName: String, maxLength: Int): String? {
    val cleaned = this?.trim()?.takeIf { it.isNotEmpty() }
    if (cleaned != null && cleaned.length > maxLength) {
        throw ProjectResponseException.localized(
            HttpStatus.BAD_REQUEST,
            MetaData.ErrorCodes.FIELD_TOO_LONG,
            fieldName,
            maxLength,
        )
    }
    return cleaned
}
