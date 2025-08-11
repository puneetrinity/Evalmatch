/**
 * Unified Skill Learning System
 * 
 * Consolidates functionality from:
 * - skill-memory-system.ts (794 lines) - Advanced skill learning & validation
 * - skill-learning-scheduler.ts (561 lines) - Automated learning scheduler
 * 
 * Total consolidation: 1,355 lines → ~600 lines (56% reduction)
 */

import { logger } from './logger';
import { getOrCreateStorage } from '../storage';
import Groq from 'groq-sdk';
import { generateEmbedding, cosineSimilarity } from './embeddings';

// ==================== TYPES & INTERFACES ====================

export interface SkillValidationResult {
  skill: string;
  isValid: boolean;
  confidence: number;
  validationType: 'esco' | 'ml_similarity' | 'groq_llm' | 'frequency_based';
  reason: string;
  shouldAutoApprove: boolean;
  metadata?: {
    groqResponse?: object;
    similarSkills?: string[];
    frequency?: number;
    embedding?: number[];
  };
}

export interface LearnedSkill {
  skill: string;
  frequency: number;
  firstSeen: Date;
  lastSeen: Date;
  validationAttempts: number;
  autoApproved: boolean;
  confidence: number;
  domain: string;
  embedding?: number[];
  aliases: string[];
  category: string;
}

export interface LearningStats {
  totalSkillsDiscovered: number;
  autoApprovedSkills: number;
  pendingValidation: number;
  rejectedSkills: number;
  averageConfidence: number;
  topDomains: { domain: string; count: number }[];
  recentActivity: {
    discovered: number;
    approved: number;
    rejected: number;
  };
}

export interface ValidationConfig {
  escoValidation: boolean;
  mlSimilarityThreshold: number;
  groqValidation: boolean;
  frequencyThreshold: number;
  autoApprovalRules: {
    escoMatch: boolean;
    highSimilarity: boolean;
    frequencyBased: boolean;
    domainMatch: boolean;
  };
  batchSize: number;
  maxRetries: number;
}

// ==================== CONSOLIDATED LEARNING SYSTEM ====================

export class SkillLearningSystem {
  private static instance: SkillLearningSystem;
  private groqClient: Groq | null = null;
  private validationQueue: Map<string, LearnedSkill> = new Map();
  private config: ValidationConfig;
  private learningStats: LearningStats;
  private isProcessing = false;

  private constructor() {
    this.config = {
      escoValidation: true,
      mlSimilarityThreshold: 0.85,
      groqValidation: true, 
      frequencyThreshold: 5,
      autoApprovalRules: {
        escoMatch: true,
        highSimilarity: true,
        frequencyBased: true,
        domainMatch: true
      },
      batchSize: 10,
      maxRetries: 3
    };

    this.learningStats = {
      totalSkillsDiscovered: 0,
      autoApprovedSkills: 0,
      pendingValidation: 0,
      rejectedSkills: 0,
      averageConfidence: 0,
      topDomains: [],
      recentActivity: { discovered: 0, approved: 0, rejected: 0 }
    };

    this.initializeGroqClient();
    this.startLearningScheduler();
  }

  static getInstance(): SkillLearningSystem {
    if (!SkillLearningSystem.instance) {
      SkillLearningSystem.instance = new SkillLearningSystem();
    }
    return SkillLearningSystem.instance;
  }

  private initializeGroqClient(): void {
    try {
      const apiKey = process.env.GROQ_API_KEY;
      if (apiKey) {
        this.groqClient = new Groq({ apiKey });
        logger.info('Groq client initialized for skill validation');
      } else {
        logger.warn('GROQ_API_KEY not found - skill validation will use fallback methods');
      }
    } catch (error) {
      logger.error('Failed to initialize Groq client:', error);
    }
  }

  /**
   * Multi-layer skill validation pipeline
   */
  async validateSkill(skill: string, domain: string = 'general'): Promise<SkillValidationResult> {
    try {
      logger.debug(`Starting validation for skill: ${skill}`);

      // Layer 1: ESCO Validation (instant auto-approve)
      const escoResult = await this.escoValidation(skill, domain);
      if (escoResult.shouldAutoApprove) {
        await this.recordValidation(skill, escoResult);
        return escoResult;
      }

      // Layer 2: ML Similarity Check (auto-approve if >85% similar)
      const mlResult = await this.mlSimilarityValidation(skill, domain);
      if (mlResult.shouldAutoApprove) {
        await this.recordValidation(skill, mlResult);
        return mlResult;
      }

      // Layer 3: Groq LLM Validation (validate legitimacy)
      const groqResult = await this.groqLLMValidation(skill, domain);
      if (groqResult.shouldAutoApprove) {
        await this.recordValidation(skill, groqResult);
        return groqResult;
      }

      // Layer 4: Frequency-based validation
      const frequencyResult = await this.frequencyBasedValidation(skill);
      await this.recordValidation(skill, frequencyResult);
      return frequencyResult;

    } catch (error) {
      logger.error('Skill validation failed:', error);
      return {
        skill,
        isValid: false,
        confidence: 0,
        validationType: 'frequency_based',
        reason: 'Validation pipeline failed',
        shouldAutoApprove: false
      };
    }
  }

  /**
   * ESCO validation layer
   */
  private async escoValidation(skill: string, domain: string): Promise<SkillValidationResult> {
    if (!this.config.escoValidation) {
      return this.createNegativeResult(skill, 'esco', 'ESCO validation disabled');
    }

    try {
      // Check against known ESCO skills (simplified - would use actual ESCO API)
      const escoSkills = await this.getESCOSkillsForDomain(domain);
      const normalizedSkill = skill.toLowerCase().trim();
      
      const isESCOMatch = escoSkills.some(escoSkill => 
        escoSkill.toLowerCase() === normalizedSkill ||
        escoSkill.toLowerCase().includes(normalizedSkill) ||
        normalizedSkill.includes(escoSkill.toLowerCase())
      );

      if (isESCOMatch) {
        return {
          skill,
          isValid: true,
          confidence: 0.95,
          validationType: 'esco',
          reason: 'Skill found in ESCO taxonomy',
          shouldAutoApprove: this.config.autoApprovalRules.escoMatch
        };
      }

      return this.createNegativeResult(skill, 'esco', 'Skill not found in ESCO taxonomy');

    } catch (error) {
      logger.debug('ESCO validation failed:', error);
      return this.createNegativeResult(skill, 'esco', 'ESCO validation error');
    }
  }

  /**
   * ML similarity validation layer
   */
  private async mlSimilarityValidation(skill: string, domain: string): Promise<SkillValidationResult> {
    try {
      const skillEmbedding = await generateEmbedding(skill);
      const domainSkills = await this.getKnownSkillsForDomain(domain);
      
      let maxSimilarity = 0;
      const similarSkills: string[] = [];

      for (const knownSkill of domainSkills) {
        try {
          const knownEmbedding = await generateEmbedding(knownSkill);
          const similarity = await this.calculateEmbeddingSimilarity(skillEmbedding, knownEmbedding);
          
          if (similarity > maxSimilarity) {
            maxSimilarity = similarity;
          }
          
          if (similarity > 0.7) {
            similarSkills.push(knownSkill);
          }
        } catch (error) {
          logger.debug(`Failed to compare with skill: ${knownSkill}`, { error });
        }
      }

      const shouldAutoApprove = maxSimilarity >= this.config.mlSimilarityThreshold && 
                               this.config.autoApprovalRules.highSimilarity;

      return {
        skill,
        isValid: maxSimilarity > 0.6,
        confidence: maxSimilarity,
        validationType: 'ml_similarity',
        reason: `Maximum similarity: ${maxSimilarity.toFixed(3)} with known skills`,
        shouldAutoApprove,
        metadata: { similarSkills, embedding: skillEmbedding }
      };

    } catch (error) {
      logger.debug('ML similarity validation failed:', error);
      return this.createNegativeResult(skill, 'ml_similarity', 'ML similarity validation error');
    }
  }

  /**
   * Groq LLM validation layer
   */
  private async groqLLMValidation(skill: string, domain: string): Promise<SkillValidationResult> {
    if (!this.groqClient || !this.config.groqValidation) {
      return this.createNegativeResult(skill, 'groq_llm', 'Groq validation unavailable');
    }

    try {
      const prompt = `Analyze if "${skill}" is a legitimate professional skill in the ${domain} domain.
      
Consider:
1. Is this a real, measurable professional skill or competency?
2. Would employers realistically look for this skill?
3. Is it specific enough to be meaningful?
4. Does it fit the ${domain} context?

Respond with JSON:
{
  "isValid": boolean,
  "confidence": number (0-1),
  "reason": "explanation",
  "category": "technical|soft|domain",
  "shouldAutoApprove": boolean
}`;

      const response = await this.groqClient.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        response_format: { type: "json_object" }
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('Empty response from Groq');
      }

      const groqResult = JSON.parse(content);
      
      return {
        skill,
        isValid: groqResult.isValid || false,
        confidence: groqResult.confidence || 0,
        validationType: 'groq_llm',
        reason: groqResult.reason || 'LLM validation completed',
        shouldAutoApprove: groqResult.shouldAutoApprove && this.config.autoApprovalRules.domainMatch,
        metadata: { groqResponse: groqResult }
      };

    } catch (error) {
      logger.debug('Groq validation failed:', error);
      return this.createNegativeResult(skill, 'groq_llm', 'Groq LLM validation error');
    }
  }

  /**
   * Frequency-based validation
   */
  private async frequencyBasedValidation(skill: string): Promise<SkillValidationResult> {
    try {
  const _storage = await getOrCreateStorage();
      const frequency = await this.getSkillFrequency(skill);
      
      const shouldAutoApprove = frequency >= this.config.frequencyThreshold && 
                               this.config.autoApprovalRules.frequencyBased;

      return {
        skill,
        isValid: frequency > 1,
        confidence: Math.min(frequency / this.config.frequencyThreshold, 1),
        validationType: 'frequency_based',
        reason: `Skill appeared ${frequency} times`,
        shouldAutoApprove,
        metadata: { frequency }
      };

    } catch (error) {
      logger.debug('Frequency validation failed:', error);
      return this.createNegativeResult(skill, 'frequency_based', 'Frequency validation error');
    }
  }

  /**
   * Learning scheduler - automated processing
   */
  private startLearningScheduler(): void {
    // Process validation queue every 5 minutes
    setInterval(async () => {
      if (!this.isProcessing && this.validationQueue.size > 0) {
        await this.processValidationQueue();
      }
    }, 5 * 60 * 1000);

    // Auto-promotion job every hour
    setInterval(async () => {
      await this.runAutoPromotionJob();
    }, 60 * 60 * 1000);

    // Cleanup job every 24 hours
    setInterval(async () => {
      await this.runCleanupJob();
    }, 24 * 60 * 60 * 1000);

    logger.info('Skill learning scheduler started');
  }

  /**
   * Process validation queue in batches
   */
  private async processValidationQueue(): Promise<void> {
    if (this.validationQueue.size === 0) return;

    this.isProcessing = true;
    logger.info(`Processing ${this.validationQueue.size} skills in validation queue`);

    try {
      const batch = Array.from(this.validationQueue.entries()).slice(0, this.config.batchSize);
      
      const results = await Promise.all(
        batch.map(async ([skillName, learnedSkill]) => {
          try {
            const validation = await this.validateSkill(skillName, learnedSkill.domain);
            return { skillName, validation, learnedSkill };
          } catch (error) {
            logger.error(`Failed to validate skill ${skillName}:`, error);
            return null;
          }
        })
      );

      // Process results
      for (const result of results) {
        if (result && result.validation.shouldAutoApprove) {
          await this.promoteSkill(result.skillName, result.validation);
          this.validationQueue.delete(result.skillName);
          this.learningStats.autoApprovedSkills++;
        }
      }

      this.updateLearningStats();

    } catch (error) {
      logger.error('Validation queue processing failed:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Auto-promotion job for popular skills
   */
  private async runAutoPromotionJob(): Promise<void> {
    try {
      logger.debug('Running auto-promotion job');
      
      // Get skills that meet auto-promotion criteria
      const candidates = Array.from(this.validationQueue.entries())
        .filter(([_, skill]) => 
          skill.frequency >= this.config.frequencyThreshold &&
          !skill.autoApproved
        );

      for (const [skillName, skill] of candidates) {
        const validation = await this.validateSkill(skillName, skill.domain);
        
        if (validation.isValid && validation.confidence > 0.7) {
          await this.promoteSkill(skillName, validation);
          this.validationQueue.delete(skillName);
          this.learningStats.autoApprovedSkills++;
        }
      }

    } catch (error) {
      logger.error('Auto-promotion job failed:', error);
    }
  }

  /**
   * Cleanup job for old, unvalidated skills
   */
  private async runCleanupJob(): Promise<void> {
    try {
      logger.debug('Running skill memory cleanup job');
      
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 30); // 30 days old
      
      const toRemove: string[] = [];
      
      for (const [skillName, skill] of this.validationQueue.entries()) {
        if (skill.lastSeen < cutoffDate && skill.frequency < 2) {
          toRemove.push(skillName);
        }
      }

      for (const skillName of toRemove) {
        this.validationQueue.delete(skillName);
      }

      logger.info(`Cleaned up ${toRemove.length} old skills from validation queue`);

    } catch (error) {
      logger.error('Cleanup job failed:', error);
    }
  }

  /**
   * Calculate similarity between two embeddings
   */
  private async calculateEmbeddingSimilarity(embedding1: number[], embedding2: number[]): Promise<number> {
    try {
      return cosineSimilarity(embedding1, embedding2);
    } catch (error) {
      logger.error('Failed to calculate embedding similarity:', error);
      return 0;
    }
  }

  // ==================== HELPER METHODS ====================

  private createNegativeResult(skill: string, type: string, reason: string): SkillValidationResult {
    return {
      skill,
      isValid: false,
      confidence: 0,
      validationType: type as string,
      reason,
      shouldAutoApprove: false
    };
  }

  private async recordValidation(skill: string, result: SkillValidationResult): Promise<void> {
    try {
  const _storage = await getOrCreateStorage();
      
      // Update or create learned skill record
      const existing = this.validationQueue.get(skill) || {
        skill,
        frequency: 0,
        firstSeen: new Date(),
        lastSeen: new Date(),
        validationAttempts: 0,
        autoApproved: false,
        confidence: 0,
        domain: 'general',
        aliases: [],
        category: 'general'
      };

      existing.validationAttempts++;
      existing.confidence = Math.max(existing.confidence, result.confidence);
      existing.autoApproved = result.shouldAutoApprove;
      
      this.validationQueue.set(skill, existing);

      // Store in database if auto-approved
      if (result.shouldAutoApprove) {
        // Note: storeSkillValidation method needs to be implemented in IStorage interface
        logger.debug('Skill auto-approved for storage:', skill);
      }

    } catch (error) {
      logger.error('Failed to record validation:', error);
    }
  }

  private async promoteSkill(skill: string, validation: SkillValidationResult): Promise<void> {
    try {
      // Note: promoteSkillToHierarchy method needs to be implemented in IStorage interface
      logger.info(`Auto-promoted skill: ${skill} (confidence: ${validation.confidence})`);
    } catch (error) {
      logger.error('Failed to promote skill:', error);
    }
  }

  private async getESCOSkillsForDomain(domain: string): Promise<string[]> {
    // Simplified - would connect to actual ESCO service
    const commonSkills: Record<string, string[]> = {
      technology: ['JavaScript', 'Python', 'React', 'Node.js', 'SQL', 'Git'],
      pharmaceutical: ['GMP', 'FDA Regulations', 'Clinical Research', 'Drug Development'],
      general: ['Communication', 'Leadership', 'Problem Solving', 'Project Management']
    };
    return commonSkills[domain] || commonSkills.general;
  }

  private async getKnownSkillsForDomain(domain: string): Promise<string[]> {
    // Would query from skill hierarchy/database
    return this.getESCOSkillsForDomain(domain);
  }

  private async getSkillFrequency(skill: string): Promise<number> {
    const existing = this.validationQueue.get(skill);
    return existing ? existing.frequency : 0;
  }

  private updateLearningStats(): void {
    this.learningStats.pendingValidation = this.validationQueue.size;
    this.learningStats.totalSkillsDiscovered = this.learningStats.autoApprovedSkills + this.learningStats.pendingValidation;
    
    // Update average confidence
    const skills = Array.from(this.validationQueue.values());
    if (skills.length > 0) {
      this.learningStats.averageConfidence = skills.reduce((sum, skill) => sum + skill.confidence, 0) / skills.length;
    }
  }

  // ==================== PUBLIC API ====================

  /**
   * Add a skill to the learning system
   */
  async learnSkill(skill: string, domain: string = 'general'): Promise<void> {
    const existing = this.validationQueue.get(skill);
    
    if (existing) {
      existing.frequency++;
      existing.lastSeen = new Date();
    } else {
      this.validationQueue.set(skill, {
        skill,
        frequency: 1,
        firstSeen: new Date(),
        lastSeen: new Date(),
        validationAttempts: 0,
        autoApproved: false,
        confidence: 0,
        domain,
        aliases: [],
        category: 'general'
      });
      this.learningStats.recentActivity.discovered++;
    }
  }

  /**
   * Get learning statistics
   */
  getLearningStats(): LearningStats {
    this.updateLearningStats();
    return { ...this.learningStats };
  }

  /**
   * Get validation queue status
   */
  getValidationQueueStatus(): { size: number; processing: boolean } {
    return {
      size: this.validationQueue.size,
      processing: this.isProcessing
    };
  }

  /**
   * Force process validation queue (for testing/admin)
   */
  async forceProcessQueue(): Promise<void> {
    if (!this.isProcessing) {
      await this.processValidationQueue();
    }
  }
}

// ==================== EXPORTED FUNCTIONS ====================

/**
 * Main entry point for skill learning
 */
export async function learnSkill(skill: string, domain?: string): Promise<void> {
  const learningSystem = SkillLearningSystem.getInstance();
  await learningSystem.learnSkill(skill, domain);
}

/**
 * Validate a skill through the multi-layer pipeline
 */
export async function validateSkill(skill: string, domain?: string): Promise<SkillValidationResult> {
  const learningSystem = SkillLearningSystem.getInstance();
  return await learningSystem.validateSkill(skill, domain);
}

/**
 * Get learning system statistics
 */
export function getSkillLearningStats(): LearningStats {
  const learningSystem = SkillLearningSystem.getInstance();
  return learningSystem.getLearningStats();
}

/**
 * Legacy compatibility exports
 */
export { SkillLearningSystem as SkillMemorySystem };

logger.info('Skill Learning System initialized - consolidated from 2 files (1,355 lines → 600 lines)');