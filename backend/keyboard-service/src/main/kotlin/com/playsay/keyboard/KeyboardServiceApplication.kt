package com.playsay.keyboard

import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.runApplication
import org.springframework.scheduling.annotation.EnableScheduling

@SpringBootApplication
@EnableScheduling
class KeyboardServiceApplication

fun main(args: Array<String>) {
    runApplication<KeyboardServiceApplication>(*args)
}
