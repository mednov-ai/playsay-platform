package com.playsay.gateway.service

object MaterialHtmlGameTitlePolicy {
    const val FALLBACK_TITLE = "New game"

    fun isEnglish(title: String): Boolean {
        val letters = title.asSequence().filter(Char::isLetter).toList()
        return letters.isNotEmpty() && letters.all(::isLatinLetter)
    }

    private fun isLatinLetter(character: Char): Boolean =
        Character.UnicodeScript.of(character.code) == Character.UnicodeScript.LATIN
}
