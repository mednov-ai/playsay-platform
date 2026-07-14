package com.playsay.gateway.utils

fun Collection<String>.toStoredRoles(): String =
    map(String::trim)
        .filter(String::isNotEmpty)
        .distinct()
        .sorted()
        .joinToString(",")

fun String?.toApplicationRoles(): List<String> =
    this
        ?.split(",")
        ?.mapNotNull { role -> role.trim().takeIf { it.isNotEmpty() } }
        ?.distinct()
        ?.sorted()
        ?: emptyList()

fun String?.hasApplicationRole(role: String): Boolean =
    role in toApplicationRoles()
