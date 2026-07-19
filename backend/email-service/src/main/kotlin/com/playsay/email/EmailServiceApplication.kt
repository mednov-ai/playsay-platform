package com.playsay.email

import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.runApplication
import org.springframework.scheduling.annotation.EnableScheduling

@SpringBootApplication
@EnableScheduling
class EmailServiceApplication

fun main(args: Array<String>) {
    runApplication<EmailServiceApplication>(*args)
}
