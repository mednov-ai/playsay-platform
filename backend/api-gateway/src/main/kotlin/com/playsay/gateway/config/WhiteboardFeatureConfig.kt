package com.playsay.gateway.config

import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component

@Component
class WhiteboardFeatureConfig(
    @param:Value("\${playsay.whiteboard.enabled:false}") val enabled: Boolean,
    @param:Value("\${playsay.collaboration.service-token:}") val serviceToken: String,
)
