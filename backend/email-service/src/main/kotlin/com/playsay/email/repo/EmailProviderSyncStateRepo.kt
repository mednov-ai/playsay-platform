package com.playsay.email.repo

import com.playsay.email.entity.EmailProviderSyncStateEntity
import org.springframework.data.jpa.repository.JpaRepository

interface EmailProviderSyncStateRepo : JpaRepository<EmailProviderSyncStateEntity, String>
