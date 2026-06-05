package com.playsay.keyboard

import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.runApplication

@SpringBootApplication
class KeyboardServiceApplication

fun main(args: Array<String>) {
    runApplication<KeyboardServiceApplication>(*args)
}
