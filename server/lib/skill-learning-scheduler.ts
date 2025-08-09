/**
 * Skill Learning Scheduler - Automated promotion and cleanup jobs
 * 
 * Runs periodic tasks to:
 * 1. Auto-promote high-frequency, validated skills
 * 2. Clean up garbage and low-frequency skills
 * 3. Update system statistics
 * 4. Sync with ESCO for new validations
 */

import cron from 'node-cron';
import { getDatabase } from "../database";
import { eq, sql, and, or, gte, lt, desc } from "drizzle-orm";
import { 
  skillMemory, 
  skillMemoryStats,
  skillPromotionLog,
  skillsTable,
  skillCategories,
  type SkillMemory 
} from "@shared/schema";
import { logger } from "./logger";
import { skillMemorySystem } from "./skill-memory-system";
import { escoExtractor } from "./esco-skill-extractor";

// Auto-promotion thresholds for batch processing
const BATCH_PROMOTION_RULES = {
  HIGH_FREQUENCY_WITH_GROQ: {
    frequency: 10,
    groqConfidence: 0.8,
    batchSize: 50
  },
  MEDIUM_FREQUENCY_WITH_HIGH_GROQ: {
    frequency: 5,
    groqConfidence: 0.9,
    batchSize: 25
  },
  ESCO_REVALIDATION: {
    frequency: 3,
    batchSize: 100
  }
};

export class SkillLearningScheduler {
  private isRunning = false;

  /**
   * Initialize all scheduled jobs
   */
  start(): void {
    logger.info('Starting skill learning scheduler...');

    // Every hour: Auto-promote high-confidence skills
    cron.schedule('0 * * * *', async () => {
      if (!this.isRunning) {
        await this.runAutoPromotionJob();
      }
    });

    // Every 6 hours: ESCO revalidation for pending skills
    cron.schedule('0 */6 * * *', async () => {
      if (!this.isRunning) {
        await this.runESCORevalidationJob();
      }
    });

    // Every 24 hours: Cleanup and statistics update
    cron.schedule('0 2 * * *', async () => {
      if (!this.isRunning) {
        await this.runDailyMaintenanceJob();
      }
    });

    // Every week: Deep cleanup and optimization
    cron.schedule('0 3 * * 0', async () => {
      if (!this.isRunning) {
        await this.runWeeklyCleanupJob();
      }
    });

    logger.info('Skill learning scheduler started with 4 jobs');
  }

  /**
   * Hourly job: Auto-promote skills that meet promotion criteria
   */
  async runAutoPromotionJob(): Promise<void> {
    const startTime = Date.now();
    this.isRunning = true;

    try {
      logger.info('Starting auto-promotion job...');

      let totalPromoted = 0;

      // Rule 1: High frequency + Groq validated
      const db = getDatabase();
      const highFrequencySkills = await db
        .select()
        .from(skillMemory)
        .where(
          and(
            eq(skillMemory.autoApproved, false),
            gte(skillMemory.frequency, BATCH_PROMOTION_RULES.HIGH_FREQUENCY_WITH_GROQ.frequency),
            gte(skillMemory.groqConfidence, BATCH_PROMOTION_RULES.HIGH_FREQUENCY_WITH_GROQ.groqConfidence)
          )
        )
        .orderBy(desc(skillMemory.frequency), desc(skillMemory.groqConfidence))
        .limit(BATCH_PROMOTION_RULES.HIGH_FREQUENCY_WITH_GROQ.batchSize);

      for (const skill of highFrequencySkills) {
        await this.promoteSkill(skill, 'frequency_groq', 
          Math.min(0.9, skill.groqConfidence! + (skill.frequency * 0.01)));
        totalPromoted++;
      }

      // Rule 2: Medium frequency + very high Groq confidence
      const mediumFrequencySkills = await db
        .select()
        .from(skillMemory)
        .where(
          and(
            eq(skillMemory.autoApproved, false),
            gte(skillMemory.frequency, BATCH_PROMOTION_RULES.MEDIUM_FREQUENCY_WITH_HIGH_GROQ.frequency),
            gte(skillMemory.groqConfidence, BATCH_PROMOTION_RULES.MEDIUM_FREQUENCY_WITH_HIGH_GROQ.groqConfidence)
          )
        )
        .orderBy(desc(skillMemory.groqConfidence), desc(skillMemory.frequency))
        .limit(BATCH_PROMOTION_RULES.MEDIUM_FREQUENCY_WITH_HIGH_GROQ.batchSize);

      for (const skill of mediumFrequencySkills) {
        await this.promoteSkill(skill, 'high_groq_confidence', skill.groqConfidence!);
        totalPromoted++;
      }

      // Rule 3: Domain pattern matching
      const domainPatternSkills = await db
        .select()
        .from(skillMemory)
        .where(
          and(
            eq(skillMemory.autoApproved, false),
            gte(skillMemory.frequency, 5),
            gte(skillMemory.groqConfidence, 0.7)
          )
        )
        .orderBy(desc(skillMemory.frequency))
        .limit(30);

      for (const skill of domainPatternSkills) {
        if (this.matchesDomainPattern(skill.skillText)) {
          await this.promoteSkill(skill, 'domain_pattern', 0.85);
          totalPromoted++;
        }
      }

      const duration = Date.now() - startTime;
      logger.info(`Auto-promotion job completed: ${totalPromoted} skills promoted in ${duration}ms`);

    } catch (error) {
      logger.error('Auto-promotion job failed:', error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Every 6 hours: Re-validate pending skills with ESCO
   */
  async runESCORevalidationJob(): Promise<void> {
    const startTime = Date.now();
    this.isRunning = true;

    try {
      logger.info('Starting ESCO revalidation job...');

      // Get skills that haven't been ESCO validated yet but have some frequency
      const db = getDatabase();
      const pendingSkills = await db
        .select()
        .from(skillMemory)
        .where(
          and(
            eq(skillMemory.escoValidated, false),
            eq(skillMemory.autoApproved, false),
            gte(skillMemory.frequency, BATCH_PROMOTION_RULES.ESCO_REVALIDATION.frequency)
          )
        )
        .orderBy(desc(skillMemory.frequency))
        .limit(BATCH_PROMOTION_RULES.ESCO_REVALIDATION.batchSize);

      let revalidated = 0;
      let promoted = 0;

      for (const skill of pendingSkills) {
        try {
          // Re-check with ESCO
          const escoResult = await escoExtractor.extractSkills(skill.skillText);
          
          if (escoResult.success && escoResult.skills.length > 0) {
            const escoSkill = escoResult.skills[0];
            
            // Update with ESCO validation
            await db
              .update(skillMemory)
              .set({
                escoValidated: true,
                escoId: escoSkill.esco_id,
                escoCategory: escoSkill.category,
                autoApproved: true,
                autoApprovalReason: 'esco_revalidation',
                autoApprovalConfidence: 0.95,
                updatedAt: new Date()
              })
              .where(eq(skillMemory.id, skill.id));

            // Auto-promote since ESCO validated
            await this.promoteSkill({
              ...skill,
              escoValidated: true,
              escoId: escoSkill.esco_id,
              escoCategory: escoSkill.category,
              autoApproved: true,
              autoApprovalReason: 'esco_revalidation',
              autoApprovalConfidence: 0.95
            }, 'esco_revalidation', 0.95);

            promoted++;
            revalidated++;
          } else {
            revalidated++;
          }

          // Small delay to avoid overwhelming ESCO API
          await new Promise(resolve => setTimeout(resolve, 100));
          
        } catch (error) {
          logger.warn(`ESCO revalidation failed for skill: ${skill.skillText}`, error);
        }
      }

      const duration = Date.now() - startTime;
      logger.info(`ESCO revalidation job completed: ${revalidated} skills checked, ${promoted} promoted in ${duration}ms`);

    } catch (error) {
      logger.error('ESCO revalidation job failed:', error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Daily maintenance: Update stats and light cleanup
   */
  async runDailyMaintenanceJob(): Promise<void> {
    const startTime = Date.now();
    this.isRunning = true;

    try {
      logger.info('Starting daily maintenance job...');

      // Update system statistics
      await this.updateSystemStats();

      // Clean up very low frequency skills (frequency = 1, older than 7 days)
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const db = getDatabase();
      const lightCleanup = await db
        .delete(skillMemory)
        .where(
          and(
            eq(skillMemory.frequency, 1),
            eq(skillMemory.autoApproved, false),
            lt(skillMemory.groqConfidence, 0.3),
            lt(skillMemory.lastSeen, sevenDaysAgo)
          )
        );

      // Update daily statistics
      const today = new Date().toISOString().split('T')[0];
      const dailyStats = await this.calculateDailyStats();
      
      await db
        .insert(skillMemoryStats)
        .values({
          date: sql`${today}::date`,
          ...dailyStats
        })
        .onConflictDoUpdate({
          target: [skillMemoryStats.date],
          set: dailyStats
        });

      const duration = Date.now() - startTime;
      logger.info(`Daily maintenance completed: ${lightCleanup.rowCount || 0} skills cleaned up in ${duration}ms`);

    } catch (error) {
      logger.error('Daily maintenance job failed:', error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Weekly deep cleanup and optimization
   */
  async runWeeklyCleanupJob(): Promise<void> {
    const startTime = Date.now();
    this.isRunning = true;

    try {
      logger.info('Starting weekly cleanup job...');

      // Deep cleanup using the memory system
      const cleanedUp = await skillMemorySystem.cleanupLowFrequencySkills();

      // Clean up old promotion logs (keep only last 90 days)
      const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      const db = getDatabase();
      const oldLogs = await db
        .delete(skillPromotionLog)
        .where(lt(skillPromotionLog.createdAt, ninetyDaysAgo));

      // Clean up old daily stats (keep only last 365 days)
      const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
      const oldStats = await db
        .delete(skillMemoryStats)
        .where(lt(skillMemoryStats.createdAt, oneYearAgo));

      // Analyze system performance
      const systemStats = await skillMemorySystem.getSystemStats();
      
      const duration = Date.now() - startTime;
      logger.info(`Weekly cleanup completed in ${duration}ms`, {
        skillsCleaned: cleanedUp,
        logsCleaned: oldLogs.rowCount || 0,
        statsCleaned: oldStats.rowCount || 0,
        systemStats
      });

    } catch (error) {
      logger.error('Weekly cleanup job failed:', error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Promote a skill to main dictionary
   */
  private async promoteSkill(
    skill: SkillMemory, 
    reason: string, 
    confidence: number
  ): Promise<void> {
    try {
      // Find or create category
      let categoryId: number | undefined;
      if (skill.categorySuggestion) {
        const db = getDatabase();
        const category = await db
          .select()
          .from(skillCategories)
          .where(eq(skillCategories.name, skill.categorySuggestion))
          .limit(1);
        
        if (category.length === 0) {
          // Create new category if it doesn't exist
          const newCategory = await db
            .insert(skillCategories)
            .values({
              name: skill.categorySuggestion,
              level: 0,
              description: `Auto-created category for ${skill.categorySuggestion}`
            })
            .returning({ id: skillCategories.id });
          categoryId = newCategory[0]?.id;
        } else {
          categoryId = category[0].id;
        }
      }

      // Insert into main skills table
      const insertResult = await db
        .insert(skillsTable)
        .values({
          name: skill.skillText,
          normalizedName: skill.normalizedSkillText,
          categoryId,
          aliases: [], // Will be enhanced later
          description: `Auto-discovered skill (${reason}): ${skill.skillText}`,
        })
        .onConflictDoNothing()
        .returning({ id: skillsTable.id });

      const newSkillId = insertResult[0]?.id;

      if (newSkillId) {
        // Update memory record as promoted
        await db
          .update(skillMemory)
          .set({
            autoApproved: true,
            autoApprovalReason: reason,
            autoApprovalConfidence: confidence,
            updatedAt: new Date()
          })
          .where(eq(skillMemory.id, skill.id));

        // Log the promotion
        await db
          .insert(skillPromotionLog)
          .values({
            skillId: skill.id,
            mainSkillId: newSkillId,
            promotionReason: reason,
            promotionConfidence: confidence,
            promotionData: {
              originalFrequency: skill.frequency,
              escoMatch: skill.escoValidated,
              mlSimilarity: skill.mlSimilarityScore,
              groqValidation: skill.groqConfidence
            }
          });

        logger.debug(`Promoted skill: ${skill.skillText}`, {
          reason,
          confidence,
          frequency: skill.frequency,
          newSkillId
        });
      }

    } catch (error) {
      logger.error(`Failed to promote skill: ${skill.skillText}`, {
        reason,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Check if skill matches domain-specific patterns
   */
  private matchesDomainPattern(skillText: string): boolean {
    const pharmaPatterns = [
      /clinical.*trial/i, /gcp|good.*clinical.*practice/i, /pharmacovigilance/i,
      /regulatory.*affairs/i, /drug.*development/i, /biostatistics/i,
      /medical.*device/i, /fda.*approval/i, /ich.*guidelines/i, /crf.*design/i
    ];
    
    const techPatterns = [
      /react.*native|react.*js|reactjs/i, /kubernetes|k8s/i, /machine.*learning|ml/i,
      /artificial.*intelligence|ai/i, /cloud.*computing|aws|azure|gcp/i, /devops|ci.*cd/i,
      /microservices/i, /api.*development/i, /full.*stack/i, /data.*science/i
    ];

    const allPatterns = [...pharmaPatterns, ...techPatterns];
    return allPatterns.some(pattern => pattern.test(skillText));
  }

  /**
   * Update system statistics
   */
  private async updateSystemStats(): Promise<void> {
    try {
      const stats = await skillMemorySystem.getSystemStats();
      logger.info('System stats updated:', stats);
    } catch (error) {
      logger.warn('Failed to update system stats:', error);
    }
  }

  /**
   * Calculate daily statistics
   */
  private async calculateDailyStats(): Promise<{
    totalSkillsDiscovered: number;
    escoValidatedCount: number;
    autoApprovedCount: number;
    highFrequencyCount: number;
  }> {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      const db = getDatabase();
      const stats = await db
        .select({
          totalSkillsDiscovered: sql<number>`count(*)`,
          escoValidatedCount: sql<number>`count(*) filter (where esco_validated = true)`,
          autoApprovedCount: sql<number>`count(*) filter (where auto_approved = true)`,
          highFrequencyCount: sql<number>`count(*) filter (where frequency >= 10)`
        })
        .from(skillMemory)
        .where(sql`date(created_at) = ${today}`);

      return stats[0] || {
        totalSkillsDiscovered: 0,
        escoValidatedCount: 0,
        autoApprovedCount: 0,
        highFrequencyCount: 0
      };
      
    } catch (error) {
      logger.warn('Error calculating daily stats:', error);
      return {
        totalSkillsDiscovered: 0,
        escoValidatedCount: 0,
        autoApprovedCount: 0,
        highFrequencyCount: 0
      };
    }
  }

  /**
   * Stop all scheduled jobs
   */
  stop(): void {
    cron.destroy();
    logger.info('Skill learning scheduler stopped');
  }

  /**
   * Run a specific job manually (for testing)
   */
  async runJob(jobType: 'promotion' | 'revalidation' | 'maintenance' | 'cleanup'): Promise<void> {
    if (this.isRunning) {
      throw new Error('A job is already running. Please wait for it to complete.');
    }

    switch (jobType) {
      case 'promotion':
        await this.runAutoPromotionJob();
        break;
      case 'revalidation':
        await this.runESCORevalidationJob();
        break;
      case 'maintenance':
        await this.runDailyMaintenanceJob();
        break;
      case 'cleanup':
        await this.runWeeklyCleanupJob();
        break;
      default:
        throw new Error(`Unknown job type: ${jobType}`);
    }
  }

  /**
   * Get scheduler status
   */
  getStatus(): { isRunning: boolean; uptime: number } {
    return {
      isRunning: this.isRunning,
      uptime: process.uptime()
    };
  }
}

// Export singleton instance
export const skillLearningScheduler = new SkillLearningScheduler();