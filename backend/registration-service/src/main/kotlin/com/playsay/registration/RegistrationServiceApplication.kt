package com.playsay.registration

import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.runApplication
import org.springframework.scheduling.annotation.EnableScheduling

@SpringBootApplication
@EnableScheduling
class RegistrationServiceApplication

fun main(args: Array<String>) {
    runApplication<RegistrationServiceApplication>(*args)
}
