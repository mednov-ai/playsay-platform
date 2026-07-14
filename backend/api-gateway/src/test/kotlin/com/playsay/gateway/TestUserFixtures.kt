package com.playsay.gateway

import com.playsay.gateway.entity.AppUserEntity
import com.playsay.gateway.repo.AppUserRepo
import java.time.Instant

fun AppUserRepo.seedPrimaryTeacherWithStudents(
    teacherSubject: String = "teacher-1",
    vararg studentSubjects: String = arrayOf("student-1", "student-2"),
) {
    val now = Instant.now()
    val teacher = saveAndFlush(
        AppUserEntity(
            keycloakSubject = teacherSubject,
            username = teacherSubject,
            roles = "TEACHER",
            createdAt = now,
            updatedAt = now,
        ),
    )
    saveAllAndFlush(
        studentSubjects.map { subject ->
            AppUserEntity(
                keycloakSubject = subject,
                username = subject,
                roles = "STUDENT",
                managedByTeacher = true,
                managedByTeacherUserId = teacher.id,
                createdAt = now,
                updatedAt = now,
            )
        },
    )
}

fun AppUserRepo.assignStudentToTeacher(studentSubject: String, teacherSubject: String = "teacher-1") {
    val teacher = findByKeycloakSubject(teacherSubject) ?: error("Missing test teacher $teacherSubject")
    val student = findByKeycloakSubject(studentSubject) ?: error("Missing test student $studentSubject")
    student.managedByTeacher = true
    student.managedByTeacherUserId = teacher.id
    saveAndFlush(student)
}
