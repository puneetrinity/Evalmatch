/**
 * ESCO Skill Extractor Integration
 * Node.js interface for the ESCO Python service
 */

import { spawn } from 'child_process';
import { logger } from './logger';
import path from 'path';

export interface ESCOSkill {
  skill: string;
  category: string;
  confidence: number;
  domain: 'pharmaceutical' | 'technology' | 'general';
  esco_id: string;
}

export interface ESCOExtractionResult {
  success: boolean;
  skills: ESCOSkill[];
  total_skills: number;
  domains: string[];
  error?: string;
}

/**
 * ESCO Skill Extractor class
 * Interfaces with Python ESCO service for enhanced skill extraction
 */
export class ESCOSkillExtractor {
  private pythonServicePath: string;

  constructor() {
    // Path to our Python ESCO service
    this.pythonServicePath = path.join(process.cwd(), 'esco_service.py');
  }

  /**
   * Extract skills from text using ESCO taxonomy
   * @param text The text to analyze (resume content, job description, etc.)
   * @returns Promise containing extracted skills
   */
  async extractSkills(text: string): Promise<ESCOExtractionResult> {
    const startTime = Date.now();
    
    try {
      logger.info('Starting ESCO skill extraction', {
        textLength: text.length,
        textPreview: text.substring(0, 100) + '...'
      });

      const result = await this.callPythonService(text);
      const processingTime = Date.now() - startTime;

      logger.info('ESCO skill extraction completed', {
        success: result.success,
        skillsFound: result.skills.length,
        domains: result.domains,
        processingTime
      });

      return result;
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error('ESCO skill extraction failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime
      });

      return {
        success: false,
        skills: [],
        total_skills: 0,
        domains: [],
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get enhanced skills for resume analysis
   * Integrates ESCO skills with our existing skill system
   */
  async getEnhancedSkills(text: string, existingSkills: string[] = []): Promise<string[]> {
    try {
      const escoResult = await this.extractSkills(text);
      
      if (!escoResult.success) {
        logger.warn('ESCO extraction failed, falling back to existing skills', {
          error: escoResult.error
        });
        return existingSkills;
      }

      // Combine ESCO skills with existing skills
      const escoSkills = escoResult.skills.map(skill => skill.skill);
      const combinedSkills = [...new Set([...existingSkills, ...escoSkills])];

      logger.info('Enhanced skills generated', {
        originalSkills: existingSkills.length,
        escoSkills: escoSkills.length,
        combinedSkills: combinedSkills.length
      });

      return combinedSkills;
    } catch (error) {
      logger.error('Enhanced skills generation failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return existingSkills;
    }
  }

  /**
   * Get pharma-specific skills from text
   */
  async getPharmaSkills(text: string): Promise<ESCOSkill[]> {
    try {
      const result = await this.extractSkills(text);
      return result.skills.filter(skill => skill.domain === 'pharmaceutical');
    } catch (error) {
      logger.error('Pharma skills extraction failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return [];
    }
  }

  /**
   * Check if text contains pharma-related content
   */
  async isPharmaRelated(text: string): Promise<boolean> {
    try {
      const pharmaSkills = await this.getPharmaSkills(text);
      return pharmaSkills.length > 0;
    } catch (error) {
      logger.error('Pharma content detection failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  /**
   * Call the Python ESCO service
   * @private
   */
  private async callPythonService(text: string): Promise<ESCOExtractionResult> {
    return new Promise((resolve, reject) => {
      const python = spawn('python3', [this.pythonServicePath, text]);
      
      let stdout = '';
      let stderr = '';

      python.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      python.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      python.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Python process failed with code ${code}: ${stderr}`));
          return;
        }

        try {
          const result = JSON.parse(stdout);
          resolve(result);
        } catch (parseError) {
          reject(new Error(`Failed to parse Python service response: ${parseError}`));
        }
      });

      python.on('error', (error) => {
        reject(new Error(`Failed to start Python process: ${error.message}`));
      });

      // Timeout after 30 seconds
      setTimeout(() => {
        python.kill();
        reject(new Error('Python service timeout'));
      }, 30000);
    });
  }
}

// Singleton instance
export const escoExtractor = new ESCOSkillExtractor();

/**
 * Convenience function for quick skill extraction
 */
export async function extractESCOSkills(text: string): Promise<ESCOSkill[]> {
  const result = await escoExtractor.extractSkills(text);
  return result.skills;
}

/**
 * Enhanced skill extraction that combines ESCO with existing skills
 */
export async function getEnhancedSkillList(text: string, existingSkills: string[] = []): Promise<string[]> {
  return await escoExtractor.getEnhancedSkills(text, existingSkills);
}