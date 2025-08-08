/**
 * Skill Memory System - Automated Learning for Skills Dictionary
 * 
 * Multi-layer validation pipeline:
 * 1. ESCO validation (instant auto-approve if found)
 * 2. ML similarity check (auto-approve if >85% similar to known skill)
 * 3. Groq validation (validate if legitimate skill)
 * 4. Auto-promotion based on frequency + confidence thresholds
 */

import { db } from "../db";
import { eq, sql, and, or, gte, lt, desc } from "drizzle-orm";
import { 
  skillMemory, 
  skillMemoryStats, 
  skillPromotionLog, 
  skillsTable, 
  skillCategories,
  type SkillMemory, 
  type InsertSkillMemory 
} from "@shared/schema";
import { logger } from "./logger";
import { escoExtractor, type ESCOSkill } from "./esco-skill-extractor";
import { generateEmbedding, cosineSimilarity, findMostSimilar } from "./embeddings";
import { normalizeSkillWithHierarchy } from "./skill-hierarchy";
import { groqAPI } from "./groq";

// Auto-approval thresholds
const AUTO_APPROVE_RULES = {
  ESCO_VALIDATED: true,                    // ESCO knows it = instant approve
  HIGH_ML_SIMILARITY: 0.85,               // 85%+ similar to known skill
  HIGH_FREQUENCY_WITH_GROQ: {             // Popular + Groq validated
    frequency: 10,
    groqConfidence: 0.8
  },
  DOMAIN_EXPERT_PATTERN: {                // Matches pharma/tech patterns
    frequency: 5,
    patternMatch: true,
    groqConfidence: 0.7
  }
};

// Garbage detection patterns
const GARBAGE_PATTERNS = [
  /^[0-9]+$/,                            // Pure numbers
  /^[a-zA-Z]$/,                          // Single letters
  /^[^a-zA-Z0-9\s\-\+\#\.]+$/,          // Special chars only
  /^.{1,2}$/,                            // Too short
  /^.{100,}$/,                           // Too long
  /^(test|example|sample|dummy)$/i,      // Test data
  /^(asdf|qwer|hjkl|zxcv)$/i,           // Keyboard mashing
];

// Domain-specific skill patterns for pharma and tech
const DOMAIN_PATTERNS = {
  pharma: [
    /clinical.*trial/i,
    /gcp|good.*clinical.*practice/i,
    /pharmacovigilance/i,
    /regulatory.*affairs/i,
    /drug.*development/i,
    /biostatistics/i,
    /medical.*device/i,
    /fda.*approval/i,
    /ich.*guidelines/i,
    /crf.*design/i
  ],
  tech: [
    /react.*native|react.*js|reactjs/i,
    /kubernetes|k8s/i,
    /machine.*learning|ml/i,
    /artificial.*intelligence|ai/i,
    /cloud.*computing|aws|azure|gcp/i,
    /devops|ci.*cd/i,
    /microservices/i,
    /api.*development/i,
    /full.*stack/i,
    /data.*science/i
  ]
};

export class SkillMemorySystem {
  
  /**
   * Process a discovered skill through the multi-layer validation pipeline
   */
  async processDiscoveredSkill(
    skillText: string, 
    context: {
      type: 'resume' | 'job_description';
      id: string;
      contextSnippet?: string;
    }
  ): Promise<{
    processed: boolean;
    autoApproved: boolean;
    reason?: string;
    confidence?: number;
  }> {
    try {
      // Clean and normalize skill text
      const cleanedSkill = this.cleanSkillText(skillText);
      
      // Check if it's garbage
      if (this.isGarbageSkill(cleanedSkill)) {
        logger.debug(`Rejected garbage skill: ${skillText}`);
        return { processed: false, autoApproved: false, reason: 'garbage' };
      }

      // Check if already in main dictionary
      if (await this.isInMainDictionary(cleanedSkill)) {
        return { processed: false, autoApproved: false, reason: 'already_known' };
      }

      const normalizedSkill = cleanedSkill.toLowerCase().trim();
      
      // Check if already in memory system
      const existingMemory = await this.getExistingSkillMemory(normalizedSkill);
      
      if (existingMemory) {
        // Update frequency and context
        return await this.updateExistingSkillMemory(existingMemory, context);
      }

      // New skill - run through validation pipeline
      return await this.validateNewSkill(cleanedSkill, normalizedSkill, context);
      
    } catch (error) {
      logger.error('Error processing discovered skill:', {
        skill: skillText,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return { processed: false, autoApproved: false, reason: 'error' };
    }
  }

  /**
   * Multi-layer validation pipeline for new skills
   */
  private async validateNewSkill(
    skillText: string, 
    normalizedSkill: string, 
    context: {
      type: 'resume' | 'job_description';
      id: string;
      contextSnippet?: string;
    }
  ): Promise<{
    processed: boolean;
    autoApproved: boolean;
    reason?: string;
    confidence?: number;
  }> {
    
    const validationResult: {
      escoValidated: boolean;
      escoId?: string;
      escoCategory?: string;
      groqConfidence: number;
      groqCategory?: string;
      mlSimilarityScore: number;
      mlSimilarTo?: string;
      mlCategory?: string;
    } = {
      escoValidated: false,
      groqConfidence: 0,
      mlSimilarityScore: 0
    };

    // Layer 1: ESCO Validation (highest priority)
    logger.debug(`Layer 1: ESCO validation for skill: ${skillText}`);
    try {
      const escoResult = await escoExtractor.extractSkills(skillText);
      if (escoResult.success && escoResult.skills.length > 0) {
        const escoSkill = escoResult.skills[0];
        validationResult.escoValidated = true;
        validationResult.escoId = escoSkill.esco_id;
        validationResult.escoCategory = escoSkill.category;
        
        logger.info(`ESCO validated skill: ${skillText}`, {
          escoId: escoSkill.esco_id,
          category: escoSkill.category,
          confidence: escoSkill.confidence
        });
      }
    } catch (error) {
      logger.warn('ESCO validation failed:', { skill: skillText, error });
    }

    // Layer 2: ML Similarity Check
    logger.debug(`Layer 2: ML similarity check for skill: ${skillText}`);
    try {
      const similarityResult = await this.findMostSimilarKnownSkill(skillText);
      if (similarityResult) {
        validationResult.mlSimilarityScore = similarityResult.similarity;
        validationResult.mlSimilarTo = similarityResult.skill;
        validationResult.mlCategory = similarityResult.category;
        
        logger.debug(`ML similarity result: ${skillText}`, {
          similarTo: similarityResult.skill,
          similarity: similarityResult.similarity,
          category: similarityResult.category
        });
      }
    } catch (error) {
      logger.warn('ML similarity check failed:', { skill: skillText, error });
    }

    // Layer 3: Groq Validation (for non-ESCO skills)
    if (!validationResult.escoValidated) {
      logger.debug(`Layer 3: Groq validation for skill: ${skillText}`);
      try {
        const groqResult = await this.validateSkillWithGroq(skillText);
        validationResult.groqConfidence = groqResult.confidence;
        validationResult.groqCategory = groqResult.category;
        
        logger.debug(`Groq validation result: ${skillText}`, {
          confidence: groqResult.confidence,
          category: groqResult.category
        });
      } catch (error) {
        logger.warn('Groq validation failed:', { skill: skillText, error });
      }
    }

    // Determine auto-approval
    const autoApproval = this.determineAutoApproval(validationResult);
    
    // Store in memory system
    const memoryRecord: InsertSkillMemory = {
      skillText,
      normalizedSkillText: normalizedSkill,
      frequency: 1,
      escoValidated: validationResult.escoValidated,
      escoId: validationResult.escoId,
      escoCategory: validationResult.escoCategory,
      groqConfidence: validationResult.groqConfidence,
      groqCategory: validationResult.groqCategory,
      mlSimilarityScore: validationResult.mlSimilarityScore,
      mlSimilarTo: validationResult.mlSimilarTo,
      mlCategory: validationResult.mlCategory,
      autoApproved: autoApproval.approved,
      autoApprovalReason: autoApproval.reason,
      autoApprovalConfidence: autoApproval.confidence,
      categorySuggestion: this.suggestCategory(validationResult),
      sourceContexts: [{
        type: context.type,
        id: context.id,
        context: context.contextSnippet || '',
        timestamp: new Date().toISOString()
      }]
    };

    await db.insert(skillMemory).values(memoryRecord);
    
    // If auto-approved, promote to main dictionary
    if (autoApproval.approved) {
      await this.promoteSkillToMainDictionary(memoryRecord, autoApproval.reason!, autoApproval.confidence!);
    }

    // Update daily stats
    await this.updateDailyStats();

    logger.info(`New skill processed: ${skillText}`, {
      autoApproved: autoApproval.approved,
      reason: autoApproval.reason,
      confidence: autoApproval.confidence,
      escoValidated: validationResult.escoValidated,
      mlSimilarity: validationResult.mlSimilarityScore,
      groqConfidence: validationResult.groqConfidence
    });

    return {
      processed: true,
      autoApproved: autoApproval.approved,
      reason: autoApproval.reason,
      confidence: autoApproval.confidence
    };
  }

  /**
   * Determine if skill should be auto-approved based on validation results
   */
  private determineAutoApproval(validationResult: {
    escoValidated: boolean;
    groqConfidence: number;
    mlSimilarityScore: number;
  }): {
    approved: boolean;
    reason?: string;
    confidence?: number;
  } {
    // Rule 1: ESCO validated = instant approval
    if (validationResult.escoValidated) {
      return {
        approved: true,
        reason: 'esco',
        confidence: 0.95
      };
    }

    // Rule 2: High ML similarity = auto-approve
    if (validationResult.mlSimilarityScore >= AUTO_APPROVE_RULES.HIGH_ML_SIMILARITY) {
      return {
        approved: true,
        reason: 'ml_similar',
        confidence: validationResult.mlSimilarityScore
      };
    }

    // Rule 3: High Groq confidence = auto-approve for new skills
    if (validationResult.groqConfidence >= 0.9) {
      return {
        approved: true,
        reason: 'high_groq_confidence',
        confidence: validationResult.groqConfidence
      };
    }

    // Not auto-approved - will be promoted later based on frequency
    return { approved: false };
  }

  /**
   * Update existing skill memory with new occurrence
   */
  private async updateExistingSkillMemory(
    existingMemory: SkillMemory,
    context: {
      type: 'resume' | 'job_description';
      id: string;
      contextSnippet?: string;
    }
  ): Promise<{
    processed: boolean;
    autoApproved: boolean;
    reason?: string;
    confidence?: number;
  }> {
    
    const newFrequency = existingMemory.frequency + 1;
    const newContext = {
      type: context.type,
      id: context.id,
      context: context.contextSnippet || '',
      timestamp: new Date().toISOString()
    };

    const updatedContexts = [
      ...(existingMemory.sourceContexts || []),
      newContext
    ].slice(-10); // Keep only last 10 contexts for performance

    // Check if should be auto-promoted now
    let autoApproved = existingMemory.autoApproved;
    let autoApprovalReason = existingMemory.autoApprovalReason;
    let autoApprovalConfidence = existingMemory.autoApprovalConfidence;

    if (!existingMemory.autoApproved) {
      // Check frequency-based auto-approval rules
      if (newFrequency >= AUTO_APPROVE_RULES.HIGH_FREQUENCY_WITH_GROQ.frequency &&
          (existingMemory.groqConfidence || 0) >= AUTO_APPROVE_RULES.HIGH_FREQUENCY_WITH_GROQ.groqConfidence) {
        autoApproved = true;
        autoApprovalReason = 'frequency_groq';
        autoApprovalConfidence = Math.min(0.9, (existingMemory.groqConfidence || 0) + (newFrequency * 0.01));
      }
      // Check domain pattern rules
      else if (newFrequency >= AUTO_APPROVE_RULES.DOMAIN_EXPERT_PATTERN.frequency &&
               this.matchesDomainPattern(existingMemory.skillText) &&
               (existingMemory.groqConfidence || 0) >= AUTO_APPROVE_RULES.DOMAIN_EXPERT_PATTERN.groqConfidence) {
        autoApproved = true;
        autoApprovalReason = 'domain_pattern';
        autoApprovalConfidence = 0.85;
      }
    }

    // Update the record
    await db
      .update(skillMemory)
      .set({
        frequency: newFrequency,
        autoApproved,
        autoApprovalReason,
        autoApprovalConfidence,
        sourceContexts: updatedContexts,
        lastSeen: new Date(),
        updatedAt: new Date()
      })
      .where(eq(skillMemory.id, existingMemory.id));

    // If newly auto-approved, promote to main dictionary
    if (autoApproved && !existingMemory.autoApproved) {
      const updatedRecord = {
        ...existingMemory,
        frequency: newFrequency,
        autoApproved,
        autoApprovalReason,
        autoApprovalConfidence
      };
      await this.promoteSkillToMainDictionary(updatedRecord, autoApprovalReason!, autoApprovalConfidence!);
    }

    logger.debug(`Updated existing skill memory: ${existingMemory.skillText}`, {
      newFrequency,
      autoApproved: autoApproved && !existingMemory.autoApproved,
      reason: autoApprovalReason
    });

    return {
      processed: true,
      autoApproved: autoApproved && !existingMemory.autoApproved,
      reason: autoApprovalReason || undefined,
      confidence: autoApprovalConfidence || undefined
    };
  }

  /**
   * Clean skill text for processing
   */
  private cleanSkillText(skillText: string): string {
    return skillText
      .trim()
      .replace(/\s+/g, ' ')        // Multiple spaces to single
      .replace(/[""]/g, '"')       // Smart quotes to regular
      .replace(/['']/g, "'")       // Smart apostrophes to regular
      .slice(0, 100);              // Max length limit
  }

  /**
   * Check if skill text is garbage/noise
   */
  private isGarbageSkill(skillText: string): boolean {
    return GARBAGE_PATTERNS.some(pattern => pattern.test(skillText));
  }

  /**
   * Check if skill matches domain-specific patterns
   */
  private matchesDomainPattern(skillText: string): boolean {
    const allPatterns = [...DOMAIN_PATTERNS.pharma, ...DOMAIN_PATTERNS.tech];
    return allPatterns.some(pattern => pattern.test(skillText));
  }

  /**
   * Check if skill already exists in main dictionary
   */
  private async isInMainDictionary(skillText: string): Promise<boolean> {
    try {
      const normalized = normalizeSkillWithHierarchy(skillText);
      if (normalized.isKnown) {
        return true;
      }
      
      // Also check exact match in skills table
      const existing = await db
        .select()
        .from(skillsTable)
        .where(or(
          eq(skillsTable.name, skillText),
          eq(skillsTable.normalizedName, skillText.toLowerCase())
        ))
        .limit(1);
        
      return existing.length > 0;
    } catch (error) {
      logger.warn('Error checking main dictionary:', { skill: skillText, error });
      return false;
    }
  }

  /**
   * Get existing skill from memory system
   */
  private async getExistingSkillMemory(normalizedSkill: string): Promise<SkillMemory | null> {
    try {
      const existing = await db
        .select()
        .from(skillMemory)
        .where(eq(skillMemory.normalizedSkillText, normalizedSkill))
        .limit(1);
        
      return existing[0] || null;
    } catch (error) {
      logger.warn('Error checking skill memory:', { skill: normalizedSkill, error });
      return null;
    }
  }

  /**
   * Find most similar skill in main dictionary using ML
   */
  private async findMostSimilarKnownSkill(skillText: string): Promise<{
    skill: string;
    similarity: number;
    category?: string;
  } | null> {
    try {
      // Get all skills from main dictionary
      const allSkills = await db
        .select({
          name: skillsTable.name,
          categoryId: skillsTable.categoryId
        })
        .from(skillsTable);

      if (allSkills.length === 0) return null;

      const skillNames = allSkills.map(s => s.name);
      const result = await findMostSimilar(skillText, skillNames);
      
      if (result.similarity > 0.7) { // Only return if reasonably similar
        const skillRecord = allSkills[result.index];
        
        // Get category name if available
        let categoryName = undefined;
        if (skillRecord.categoryId) {
          const category = await db
            .select({ name: skillCategories.name })
            .from(skillCategories)
            .where(eq(skillCategories.id, skillRecord.categoryId))
            .limit(1);
          categoryName = category[0]?.name;
        }
        
        return {
          skill: result.text,
          similarity: result.similarity,
          category: categoryName
        };
      }
      
      return null;
    } catch (error) {
      logger.warn('Error finding similar skill:', { skill: skillText, error });
      return null;
    }
  }

  /**
   * Validate skill using Groq LLM
   */
  private async validateSkillWithGroq(skillText: string): Promise<{
    confidence: number;
    category?: string;
  }> {
    try {
      const prompt = `Analyze this text and determine if it represents a legitimate professional skill: "${skillText}"

Respond with a JSON object containing:
- isValid: boolean (true if this is a legitimate professional skill)
- confidence: number (0.0 to 1.0, how confident you are)
- category: string (general category like "Technology", "Healthcare", "Soft Skills", etc.)
- reasoning: string (brief explanation)

Focus on:
- Technical skills (programming, tools, frameworks)
- Professional competencies (project management, communication)
- Industry-specific skills (clinical research, regulatory affairs)
- Certifications and methodologies

Examples of VALID skills: "React.js", "Clinical Trial Management", "Machine Learning", "Regulatory Affairs"
Examples of INVALID: "asdf", "123", "good person", "hard worker"`;

      const response = await groqAPI.analyzeGeneric(prompt);
      
      try {
        const parsed = JSON.parse(response);
        return {
          confidence: parsed.isValid ? Math.min(1.0, parsed.confidence || 0.5) : 0,
          category: parsed.category
        };
      } catch (parseError) {
        // Fallback: simple text analysis
        const isValid = response.toLowerCase().includes('true') || 
                       response.toLowerCase().includes('valid') ||
                       response.toLowerCase().includes('legitimate');
        return {
          confidence: isValid ? 0.6 : 0.1
        };
      }
    } catch (error) {
      logger.warn('Groq skill validation failed:', { skill: skillText, error });
      return { confidence: 0.3 }; // Neutral confidence on error
    }
  }

  /**
   * Suggest category based on validation results
   */
  private suggestCategory(validationResult: {
    escoCategory?: string;
    groqCategory?: string;
    mlCategory?: string;
  }): string | undefined {
    return validationResult.escoCategory || 
           validationResult.mlCategory || 
           validationResult.groqCategory;
  }

  /**
   * Promote skill to main dictionary
   */
  private async promoteSkillToMainDictionary(
    skillRecord: InsertSkillMemory & { id?: number },
    reason: string,
    confidence: number
  ): Promise<void> {
    try {
      // Find appropriate category
      let categoryId: number | undefined;
      if (skillRecord.categorySuggestion) {
        const category = await db
          .select()
          .from(skillCategories)
          .where(eq(skillCategories.name, skillRecord.categorySuggestion))
          .limit(1);
        categoryId = category[0]?.id;
      }

      // Insert into main skills table
      const insertResult = await db
        .insert(skillsTable)
        .values({
          name: skillRecord.skillText!,
          normalizedName: skillRecord.normalizedSkillText!,
          categoryId,
          aliases: [], // Will be populated later if needed
          description: `Auto-discovered skill: ${skillRecord.skillText}`,
        })
        .returning({ id: skillsTable.id });

      const newSkillId = insertResult[0]?.id;

      // Log the promotion
      if (skillRecord.id && newSkillId) {
        await db
          .insert(skillPromotionLog)
          .values({
            skillId: skillRecord.id,
            mainSkillId: newSkillId,
            promotionReason: reason,
            promotionConfidence: confidence,
            promotionData: {
              originalFrequency: skillRecord.frequency,
              escoMatch: skillRecord.escoValidated,
              mlSimilarity: skillRecord.mlSimilarityScore,
              groqValidation: skillRecord.groqConfidence
            }
          });
      }

      logger.info(`Promoted skill to main dictionary: ${skillRecord.skillText}`, {
        reason,
        confidence,
        newSkillId,
        category: skillRecord.categorySuggestion
      });

    } catch (error) {
      logger.error(`Failed to promote skill to main dictionary: ${skillRecord.skillText}`, {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Update daily statistics
   */
  private async updateDailyStats(): Promise<void> {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      // Get counts for today
      const stats = await db
        .select({
          total: sql<number>`count(*)`,
          escoValidated: sql<number>`count(*) filter (where esco_validated = true)`,
          autoApproved: sql<number>`count(*) filter (where auto_approved = true)`,
          highFrequency: sql<number>`count(*) filter (where frequency >= 10)`
        })
        .from(skillMemory)
        .where(sql`date(created_at) = ${today}`);

      const dayStats = stats[0];
      
      // Upsert daily stats
      await db
        .insert(skillMemoryStats)
        .values({
          date: sql`${today}::date`,
          totalSkillsDiscovered: dayStats.total,
          escoValidatedCount: dayStats.escoValidated,
          autoApprovedCount: dayStats.autoApproved,
          highFrequencyCount: dayStats.highFrequency
        })
        .onConflictDoUpdate({
          target: [skillMemoryStats.date],
          set: {
            totalSkillsDiscovered: dayStats.total,
            escoValidatedCount: dayStats.escoValidated,
            autoApprovedCount: dayStats.autoApproved,
            highFrequencyCount: dayStats.highFrequency
          }
        });

    } catch (error) {
      logger.warn('Error updating daily stats:', error);
    }
  }

  /**
   * Clean up old, low-frequency skills (garbage collection)
   */
  async cleanupLowFrequencySkills(): Promise<number> {
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      
      // Delete skills that haven't been seen in 30 days and have low frequency
      const deleted = await db
        .delete(skillMemory)
        .where(
          and(
            eq(skillMemory.autoApproved, false),
            lt(skillMemory.frequency, 3),
            lt(skillMemory.lastSeen, thirtyDaysAgo)
          )
        );

      logger.info(`Cleaned up ${deleted.rowCount || 0} low-frequency skills`);
      return deleted.rowCount || 0;
      
    } catch (error) {
      logger.error('Error during skill cleanup:', error);
      return 0;
    }
  }

  /**
   * Get memory system statistics
   */
  async getSystemStats(): Promise<{
    totalSkills: number;
    autoApproved: number;
    pendingReview: number;
    escoValidated: number;
    highFrequency: number;
    recentActivity: number;
  }> {
    try {
      const stats = await db
        .select({
          total: sql<number>`count(*)`,
          autoApproved: sql<number>`count(*) filter (where auto_approved = true)`,
          pendingReview: sql<number>`count(*) filter (where auto_approved = false and frequency >= 5)`,
          escoValidated: sql<number>`count(*) filter (where esco_validated = true)`,
          highFrequency: sql<number>`count(*) filter (where frequency >= 10)`,
          recentActivity: sql<number>`count(*) filter (where last_seen > now() - interval '24 hours')`
        })
        .from(skillMemory);

      return stats[0] || {
        totalSkills: 0,
        autoApproved: 0,
        pendingReview: 0,
        escoValidated: 0,
        highFrequency: 0,
        recentActivity: 0
      };
      
    } catch (error) {
      logger.error('Error getting system stats:', error);
      return {
        totalSkills: 0,
        autoApproved: 0,
        pendingReview: 0,
        escoValidated: 0,
        highFrequency: 0,
        recentActivity: 0
      };
    }
  }
}

// Export singleton instance
export const skillMemorySystem = new SkillMemorySystem();