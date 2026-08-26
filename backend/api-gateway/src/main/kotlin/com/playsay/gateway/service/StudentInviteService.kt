package com.playsay.gateway.service
import com.playsay.gateway.dto.StudentInviteConsumeRequest
import com.playsay.gateway.dto.StudentInviteConsumeResponse
import org.springframework.stereotype.Service

@Service
class StudentInviteService {
    fun consume(@Suppress("UNUSED_PARAMETER") request: StudentInviteConsumeRequest, @Suppress("UNUSED_PARAMETER") clientAddress: String?): StudentInviteConsumeResponse =
        StudentInviteConsumeResponse(status = "LESSON_LINK_REPLACED")
}
