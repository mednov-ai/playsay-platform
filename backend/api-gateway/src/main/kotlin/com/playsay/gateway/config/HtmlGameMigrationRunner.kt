package com.playsay.gateway.config

import com.playsay.gateway.service.game.HtmlGameLibraryMigrationService
import java.util.UUID
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.ApplicationArguments
import org.springframework.boot.ApplicationRunner
import org.springframework.boot.SpringApplication
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.context.ConfigurableApplicationContext
import org.springframework.stereotype.Component

/** Runs only in an explicitly configured, versioned maintenance Job. */
@Component
@ConditionalOnProperty(name = ["playsay.games.migration.enabled"], havingValue = "true")
class HtmlGameMigrationRunner(
    private val migration: HtmlGameLibraryMigrationService,
    private val context: ConfigurableApplicationContext,
    @param:Value("\${playsay.games.migration.dry-run:true}") private val dryRun: Boolean,
    @param:Value("\${playsay.games.migration.drained:false}") private val drained: Boolean,
    @param:Value("\${playsay.games.writes-enabled:true}") private val writesEnabled: Boolean,
) : ApplicationRunner {
    override fun run(args: ApplicationArguments) {
        check(dryRun || (drained && !writesEnabled)) { "Game migration requires drained contexts and disabled game writes" }
        var after: UUID? = null
        var blocked = 0
        var count = 0
        do {
            val batch = migration.batch(dryRun, after)
            count += batch.outcomes.size
            blocked += batch.outcomes.count { it.outcome == "BLOCKED" }
            after = batch.outcomes.lastOrNull()?.assetId
            if (batch.outcomes.isEmpty()) break
        } while (after != null)
        check(blocked == 0) { "Game migration has blocked records; cutover is not permitted" }
        after = null
        do {
            val ids = migration.materials(dryRun, after)
            after = ids.lastOrNull()
        } while (after != null)
        val reconciliation = if (!dryRun) migration.reconcile() else emptyMap()
        LoggerFactory.getLogger(javaClass).info("HTML game reconciliation {}", reconciliation)
        LoggerFactory.getLogger(javaClass).info("HTML game migration complete dryRun={} sources={} blocked={}", dryRun, count, blocked)
        SpringApplication.exit(context)
    }
}
