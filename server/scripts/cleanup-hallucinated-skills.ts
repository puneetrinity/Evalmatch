/**
 * Script to clean up hallucinated skills from existing resume data
 * This addresses the issue where AI generated 229+ nonsensical skills like "Softmax with Gradient..."
 */

import { logger } from "../lib/logger";
import { storage } from "../storage";
import type { AnalyzeResumeResponse } from "../../shared/schema";
import type { ResumeId } from "../../shared/api-contracts";

interface SkillCleanupStats {
  resumesProcessed: number;
  totalSkillsRemoved: number;
  resumesWithHallucinations: number;
  hallucinationPatterns: { [pattern: string]: number };
}

/**
 * Patterns that indicate AI hallucinations in skills
 */
const HALLUCINATION_PATTERNS = [
  /softmax with gradient/i,
  /magnitude and direction and sign/i,
  /and direction and/i,
  /with gradient/i,
  /\b\w+\s+and\s+\w+\s+and\s+\w+\s+and\s+\w+/i, // Multiple "and" patterns
  /^.{100,}$/, // Skills longer than 100 characters
  /\b(\w+\s+){10,}/i, // Skills with 10+ words
  /neural network activation/i,
  /backpropagation algorithm/i,
  /loss function optimization/i,
  /feature extraction and/i,
  /dimensionality reduction with/i,
];

/**
 * Validate if a skill appears to be hallucinated
 */
function isHallucinatedSkill(skill: string): boolean {
  if (!skill || typeof skill !== 'string') {
    return true; // Invalid skill format
  }

  const trimmedSkill = skill.trim();
  
  // Check length
  if (trimmedSkill.length > 80) {
    return true;
  }

  // Check word count
  const wordCount = trimmedSkill.split(/\s+/).length;
  if (wordCount > 8) {
    return true;
  }

  // Check against known hallucination patterns
  for (const pattern of HALLUCINATION_PATTERNS) {
    if (pattern.test(trimmedSkill)) {
      return true;
    }
  }

  // Check for excessive repetition
  const words = trimmedSkill.toLowerCase().split(/\s+/);
  const uniqueWords = new Set(words);
  if (words.length > 3 && uniqueWords.size < words.length * 0.6) {
    return true; // Too much repetition
  }

  return false;
}

/**
 * Clean skills array by removing hallucinated entries
 */
function cleanSkillsArray(skills: string[]): { 
  cleanedSkills: string[], 
  removedCount: number,
  patterns: string[]
} {
  if (!Array.isArray(skills)) {
    return { cleanedSkills: [], removedCount: 0, patterns: [] };
  }

  const cleanedSkills: string[] = [];
  const removedPatterns: string[] = [];
  let removedCount = 0;

  for (const skill of skills) {
    if (isHallucinatedSkill(skill)) {
      removedCount++;
      // Track which pattern caused removal
      for (const pattern of HALLUCINATION_PATTERNS) {
        if (pattern.test(skill)) {
          removedPatterns.push(pattern.toString());
          break;
        }
      }
    } else {
      cleanedSkills.push(skill);
    }
  }

  return { cleanedSkills, removedCount, patterns: removedPatterns };
}

/**
 * Clean up hallucinated skills from a single resume
 */
async function cleanupResumeSkills(resumeId: number): Promise<{
  originalSkillCount: number;
  cleanedSkillCount: number;
  removedCount: number;
  hadHallucinations: boolean;
  patterns: string[];
}> {
  try {
    // Ensure storage is available
    if (!storage) {
      throw new Error('Storage not initialized');
    }
    
    // Get resume data
    const resume = await storage.getResumeById(resumeId, 'system');
    if (!resume) {
      throw new Error(`Resume ${resumeId} not found`);
    }

    // Extract skills from various sources
    let allSkills: string[] = [];
    
    // Skills from direct field
    if (Array.isArray(resume.skills)) {
      allSkills.push(...resume.skills);
    }

    // Skills from analyzed data
    if (resume.analyzedData?.skills && Array.isArray(resume.analyzedData.skills)) {
      allSkills.push(...resume.analyzedData.skills);
    }

    const originalSkillCount = allSkills.length;
    
    // Clean the skills
    const { cleanedSkills, removedCount, patterns } = cleanSkillsArray(allSkills);
    
    const hadHallucinations = removedCount > 0;

    // Update resume if hallucinations were found
    if (hadHallucinations) {
      logger.info(`Cleaning resume ${resumeId}: ${originalSkillCount} → ${cleanedSkills.length} skills`, {
        resumeId,
        originalCount: originalSkillCount,
        cleanedCount: cleanedSkills.length,
        removedCount,
        filename: resume.filename,
      });

      // Update both skills field and analyzedData
      const updatedAnalyzedData = resume.analyzedData ? {
        ...resume.analyzedData,
        skills: cleanedSkills
      } : null;

      // Update in database - need proper AnalyzeResumeResponse format
      await storage.updateResumeAnalysis(resumeId, {
        id: resumeId as ResumeId,
        filename: resume.filename,
        skills: cleanedSkills,
        // Transform experience data to match expected object array format
        experience: resume.analyzedData?.workExperience || [],
        // Transform education data to match expected object array format  
        education: Array.isArray(resume.analyzedData?.education) 
          ? resume.analyzedData.education.map(edu => 
              typeof edu === 'string' 
                ? { degree: edu, institution: 'Unknown' }
                : { 
                    degree: (edu as any).degree || String(edu), 
                    institution: (edu as any).institution || 'Unknown',
                    year: (edu as any).year,
                    field: (edu as any).field
                  }
            )
          : [],
        analyzedData: updatedAnalyzedData || {
          name: '',
          skills: cleanedSkills,
          experience: resume.analyzedData?.experience || '',
          education: Array.isArray(resume.analyzedData?.education) 
            ? resume.analyzedData.education 
            : [],
          summary: '',
          keyStrengths: [],
        },
        processingTime: 0,
        confidence: 0.8,
      });
    }

    return {
      originalSkillCount,
      cleanedSkillCount: cleanedSkills.length,
      removedCount,
      hadHallucinations,
      patterns,
    };
  } catch (error) {
    logger.error(`Error cleaning resume ${resumeId}:`, error);
    throw error;
  }
}

/**
 * Main cleanup function
 */
export async function cleanupHallucinatedSkills(
  options: {
    dryRun?: boolean;
    maxResumes?: number;
    specificResumeId?: number;
  } = {}
): Promise<SkillCleanupStats> {
  const { dryRun = false, maxResumes = 1000, specificResumeId } = options;
  
  logger.info("Starting hallucinated skills cleanup", {
    dryRun,
    maxResumes,
    specificResumeId,
  });

  // Ensure storage is available
  if (!storage) {
    throw new Error('Storage not initialized');
  }

  const stats: SkillCleanupStats = {
    resumesProcessed: 0,
    totalSkillsRemoved: 0,
    resumesWithHallucinations: 0,
    hallucinationPatterns: {},
  };

  try {
    let resumesToProcess: any[] = [];

    if (specificResumeId) {
      // Process specific resume
      const resume = await storage.getResumeById(specificResumeId, 'system');
      if (resume) {
        resumesToProcess = [resume];
      }
    } else {
      // Get all resumes from all users (system operation)
      resumesToProcess = await storage.getResumes();
    }

    logger.info(`Found ${resumesToProcess.length} resumes to process`);

    for (const resume of resumesToProcess) {
      try {
        if (dryRun) {
          // Dry run - just analyze without updating
          const result = await analyzeResumeSkills(resume.id);
          if (result.hadHallucinations) {
            stats.resumesWithHallucinations++;
            stats.totalSkillsRemoved += result.removedCount;
            
            logger.info(`[DRY RUN] Would clean resume ${resume.id}`, {
              filename: resume.filename,
              originalSkills: result.originalSkillCount,
              wouldRemove: result.removedCount,
              patterns: result.patterns,
            });
          }
        } else {
          // Actual cleanup
          const result = await cleanupResumeSkills(resume.id);
          if (result.hadHallucinations) {
            stats.resumesWithHallucinations++;
            stats.totalSkillsRemoved += result.removedCount;

            // Track pattern statistics
            for (const pattern of result.patterns) {
              stats.hallucinationPatterns[pattern] = 
                (stats.hallucinationPatterns[pattern] || 0) + 1;
            }
          }
        }

        stats.resumesProcessed++;

        // Progress logging
        if (stats.resumesProcessed % 10 === 0) {
          logger.info(`Progress: ${stats.resumesProcessed}/${resumesToProcess.length} resumes processed`);
        }
      } catch (error) {
        logger.error(`Failed to process resume ${resume.id}:`, error);
        // Continue with next resume
      }
    }

    logger.info("Hallucinated skills cleanup completed", {
      dryRun,
      ...stats,
      avgSkillsRemovedPerResume: stats.resumesWithHallucinations > 0 
        ? Math.round(stats.totalSkillsRemoved / stats.resumesWithHallucinations)
        : 0,
    });

    return stats;
  } catch (error) {
    logger.error("Hallucinated skills cleanup failed:", error);
    throw error;
  }
}

/**
 * Analyze resume skills without updating (for dry run)
 */
async function analyzeResumeSkills(resumeId: number): Promise<{
  originalSkillCount: number;
  cleanedSkillCount: number;
  removedCount: number;
  hadHallucinations: boolean;
  patterns: string[];
}> {
  // Ensure storage is available
  if (!storage) {
    throw new Error('Storage not initialized');
  }
  
  const resume = await storage.getResumeById(resumeId, 'system');
  if (!resume) {
    throw new Error(`Resume ${resumeId} not found`);
  }

  let allSkills: string[] = [];
  
  if (Array.isArray(resume.skills)) {
    allSkills.push(...resume.skills);
  }

  if (resume.analyzedData?.skills && Array.isArray(resume.analyzedData.skills)) {
    allSkills.push(...resume.analyzedData.skills);
  }

  const originalSkillCount = allSkills.length;
  const { cleanedSkills, removedCount, patterns } = cleanSkillsArray(allSkills);
  
  return {
    originalSkillCount,
    cleanedSkillCount: cleanedSkills.length,
    removedCount,
    hadHallucinations: removedCount > 0,
    patterns,
  };
}

/**
 * CLI runner for the cleanup script
 */
if (require.main === module) {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const specificId = args.find(arg => arg.startsWith('--resume-id='))?.split('=')[1];
  const maxResumes = parseInt(args.find(arg => arg.startsWith('--max='))?.split('=')[1] || '1000');

  cleanupHallucinatedSkills({
    dryRun,
    maxResumes,
    specificResumeId: specificId ? parseInt(specificId) : undefined,
  })
    .then((stats) => {
      logger.info('\n=== Cleanup Complete ===');
      logger.info(`Resumes processed: ${stats.resumesProcessed}`);
      logger.info(`Resumes with hallucinations: ${stats.resumesWithHallucinations}`);
      logger.info(`Total skills removed: ${stats.totalSkillsRemoved}`);
      logger.info('Pattern frequency:', stats.hallucinationPatterns);
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Cleanup failed:', error);
      process.exit(1);
    });
}