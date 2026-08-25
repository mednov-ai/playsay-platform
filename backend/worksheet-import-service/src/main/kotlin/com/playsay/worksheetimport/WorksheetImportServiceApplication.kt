package com.playsay.worksheetimport

import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.runApplication
import org.springframework.scheduling.annotation.EnableScheduling

@SpringBootApplication
@EnableScheduling
class WorksheetImportServiceApplication

fun main(args: Array<String>) {
    runApplication<WorksheetImportServiceApplication>(*args)
}
