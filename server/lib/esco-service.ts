/**
 * Phase 2.2: Production TypeScript ESCO Service
 * 
 * Replaces Python esco_service.py with TypeScript implementation
 * Uses read-only SQLite FTS5 snapshot for high-performance skill matching
 */

import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import path from 'path';
import { logger } from './logger';
import type { ESCOSearchResult } from './esco-migration';

export interface ESCOSkillExtractionOptions {
  text: string;
  domain?: 'pharmaceutical' | 'technology' | 'auto' | 'general';
  maxResults?: number;
  minScore?: number;
  includeAlternatives?: boolean;
}

export interface ESCOExtractionResult {
  success: boolean;
  skills: ESCOSearchResult[];
  totalSkills: number;
  domains: string[];
  processingTimeMs: number;
  detectedDomain?: string;
  contamination?: {
    blocked: number;
    flagged: number;
    reasons: string[];
  };
}

/**
 * Production ESCO Service - TypeScript implementation with SQLite FTS5
 */
export class ESCOService {
  private static instance: ESCOService;
  private db: Database | null = null;
  private dbPath: string;
  private queryCache = new Map<string, ESCOExtractionResult>();
  private readonly CACHE_TTL = 3600000; // 1 hour
  private cacheTimestamps = new Map<string, number>();

  constructor() {
    this.dbPath = path.resolve(process.cwd(), 'server/data/esco_skills.db');
  }

  static getInstance(): ESCOService {
    if (!ESCOService.instance) {
      ESCOService.instance = new ESCOService();
    }
    return ESCOService.instance;
  }

  /**
   * Initialize database connection
   */
  private async initializeDatabase(): Promise<void> {
    if (!this.db) {
      try {
        this.db = await open({
          filename: this.dbPath,
          driver: sqlite3.Database,
          mode: sqlite3.OPEN_READONLY // Read-only for production safety
        });
        
        logger.info('✅ ESCO database connected (read-only)');
      } catch (error) {
        logger.error('❌ Failed to connect to ESCO database:', error);
        throw new Error(`ESCO database unavailable: ${error}`);
      }
    }
  }

  /**
   * Main skill extraction method - replaces Python service
   */
  async extractSkills(options: ESCOSkillExtractionOptions): Promise<ESCOExtractionResult> {
    const startTime = Date.now();
    const { text, domain = 'auto', maxResults = 50, minScore = 0.3 } = options;
    
    // Check cache first
    const cacheKey = this.getCacheKey(text, domain, maxResults, minScore);
    const cachedResult = this.getFromCache(cacheKey);
    if (cachedResult) {
      return cachedResult;
    }

    try {
      await this.initializeDatabase();
      
      // Step 1: Auto-detect domain if needed
      const detectedDomain = domain === 'auto' ? await this.detectDomain(text) : domain;
      
      // Step 2: Extract skills using FTS5 search
      const rawSkills = await this.performFTSSearch(text, detectedDomain, maxResults);
      
      // Step 3: Apply contamination filtering
      const filteredResults = await this.applyContaminationFilters(rawSkills, detectedDomain, text);
      
      // Step 4: Rank and score results
      const rankedSkills = this.rankSearchResults(filteredResults.skills, text);
      
      // Step 5: Filter by minimum score
      const finalSkills = rankedSkills.filter(skill => skill.matchScore >= minScore);
      
      const result: ESCOExtractionResult = {
        success: true,
        skills: finalSkills,
        totalSkills: finalSkills.length,
        domains: [...new Set(finalSkills.map(skill => skill.domain))],
        processingTimeMs: Date.now() - startTime,
        detectedDomain,
        contamination: filteredResults.contamination
      };
      
      // Cache the result
      this.setCache(cacheKey, result);
      
      logger.info(`🔍 ESCO extraction: ${finalSkills.length} skills found in ${result.processingTimeMs}ms`);
      return result;
      
    } catch (error) {
      logger.error('ESCO skill extraction failed:', error);
      return {
        success: false,
        skills: [],
        totalSkills: 0,
        domains: [],
        processingTimeMs: Date.now() - startTime,
        detectedDomain: domain === 'auto' ? 'general' : domain
      };
    }
  }

  /**
   * Domain detection using keyword analysis
   */
  private async detectDomain(text: string): Promise<string> {
    const normalizedText = text.toLowerCase();
    
    // Pharmaceutical indicators
    const pharmaKeywords = [
      'pharmaceutical', 'pharma', 'drug', 'clinical', 'fda', 'gmp', 
      'medical', 'biotechnology', 'biotech', 'regulatory', 'compliance',
      'manufacturing practice', 'validation', 'quality control', 'api',
      'pharmacovigilance', 'clinical trials', 'good manufacturing'
    ];
    
    // Technology indicators  
    const techKeywords = [
      'software', 'developer', 'programming', 'engineer', 'technology',
      'tech', 'development', 'coding', 'digital', 'cloud', 'data',
      'javascript', 'python', 'react', 'angular', 'ios', 'android',
      'api', 'database', 'web', 'mobile', 'devops', 'agile', 'scrum'
    ];
    
    const pharmaScore = pharmaKeywords.filter(keyword => normalizedText.includes(keyword)).length;
    const techScore = techKeywords.filter(keyword => normalizedText.includes(keyword)).length;
    
    logger.debug(`Domain detection - Pharma: ${pharmaScore}, Tech: ${techScore}`, {
      textLength: text.length,
      // PII-SAFE: Only log text length, not content
    });
    
    if (pharmaScore > techScore && pharmaScore >= 2) {
      return 'pharmaceutical';
    } else if (techScore > pharmaScore && techScore >= 2) {
      return 'technology';
    } else {
      return 'general';
    }
  }

  /**
   * Perform SQLite FTS5 search with BM25 ranking
   */
  private async performFTSSearch(
    text: string, 
    domain: string, 
    maxResults: number
  ): Promise<ESCOSearchResult[]> {
    if (!this.db) throw new Error('Database not initialized');
    
    // Extract search terms and clean them
    const searchTerms = this.extractSearchTerms(text);
    const query = searchTerms.join(' OR ');
    
    // FTS5 query with BM25 ranking and domain filtering
    const sql = `
      SELECT 
        s.esco_id,
        s.skill_title,
        s.alternative_label,
        s.description,
        s.category,
        s.domain,
        bm25(fts) as bm25_score,
        snippet(fts, 1, '<mark>', '</mark>', '...', 32) as highlighted_text
      FROM esco_skills_fts fts
      JOIN esco_skills s ON s.id = fts.rowid
      WHERE fts MATCH ? 
        AND s.status = 'released'
        ${domain !== 'general' ? 'AND (s.domain = ? OR s.reuse_level = "transversal")' : ''}
      ORDER BY bm25_score DESC
      LIMIT ?
    `;
    
    const params = domain !== 'general' ? [query, domain, maxResults] : [query, maxResults];
    const results = await this.db.all(sql, params);
    
    return results.map(row => ({
      escoId: row.esco_id,
      skillTitle: row.skill_title,
      alternativeLabel: row.alternative_label || '',
      description: row.description || '',
      category: row.category,
      domain: row.domain,
      matchScore: this.convertBM25ToScore(row.bm25_score),
      matchType: this.determineMatchType(text, row.skill_title, row.alternative_label),
      highlightedText: row.highlighted_text
    }));
  }

  /**
   * Extract and clean search terms from input text
   */
  private extractSearchTerms(text: string): string[] {
    const normalizedText = text.toLowerCase();
    
    // Remove common stop words and noise
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'up', 'about', 'into', 'through', 'during',
      'before', 'after', 'above', 'below', 'between', 'among', 'throughout',
      'years', 'year', 'experience', 'work', 'working', 'job', 'role', 'position',
      'required', 'preferred', 'must', 'should', 'would', 'could', 'can', 'will'
    ]);
    
    // Extract meaningful terms (2+ chars, not stop words)
    const terms = normalizedText
      .replace(/[^\w\s\-.]/g, ' ') // Replace special chars with space
      .split(/\s+/)
      .filter(term => 
        term.length >= 2 && 
        !stopWords.has(term) && 
        !/^\d+$/.test(term) // Remove pure numbers
      )
      .slice(0, 20); // Limit to prevent query explosion
    
    return [...new Set(terms)]; // Deduplicate
  }

  /**
   * Apply contamination filtering with critical guards (API, R, SAS, C++)
   */
  private async applyContaminationFilters(
    skills: ESCOSearchResult[], 
    domain: string, 
    originalText: string
  ): Promise<{ skills: ESCOSearchResult[]; contamination: { blocked: number; flagged: number; reasons: string[] } }> {
    if (!this.db) throw new Error('Database not initialized');
    
    const contamination = { blocked: 0, flagged: 0, reasons: [] as string[] };
    const filteredSkills: ESCOSearchResult[] = [];
    
    // Get contamination guards from database
    const guards = await this.db.all('SELECT * FROM contamination_guards');
    
    for (const skill of skills) {
      let isBlocked = false;
      
      // Check each contamination guard
      for (const guard of guards) {
        const pattern = new RegExp(guard.pattern, 'gi');
        const skillText = `${skill.skillTitle} ${skill.alternativeLabel}`.toLowerCase();
        
        if (pattern.test(skillText)) {
          const allowedContexts = guard.allowed_contexts.split(',');
          const blockedDomains = guard.blocked_domains.split(',');
          
          // Check if current domain is blocked for this skill
          if (blockedDomains.includes(domain)) {
            // Check if skill appears in allowed context within original text
            const hasValidContext = allowedContexts.some((context: string) => 
              originalText.toLowerCase().includes(context)
            );
            
            if (!hasValidContext) {
              isBlocked = true;
              contamination.blocked++;
              contamination.reasons.push(
                `Blocked ${skill.skillTitle}: ${guard.guard_name} (${domain} domain)`
              );
              break;
            }
          }
        }
      }
      
      if (!isBlocked) {
        filteredSkills.push(skill);
      }
    }
    
    logger.debug(`Contamination filter: ${contamination.blocked} blocked, ${filteredSkills.length} allowed`);
    
    return { skills: filteredSkills, contamination };
  }

  /**
   * Rank and score search results
   */
  private rankSearchResults(skills: ESCOSearchResult[], originalText: string): ESCOSearchResult[] {
    const normalizedText = originalText.toLowerCase();
    
    return skills.map(skill => {
      let score = skill.matchScore;
      const skillText = skill.skillTitle.toLowerCase();
      
      // Boost exact matches
      if (normalizedText.includes(skillText)) {
        score *= 1.5;
        skill.matchType = 'exact';
      }
      
      // Boost skills that appear with context
      if (this.hasSkillContext(normalizedText, skillText)) {
        score *= 1.2;
      }
      
      // Boost critical skills based on category
      if (skill.category === 'technical' && skill.domain === 'technology') {
        score *= 1.1;
      }
      
      return { ...skill, matchScore: Math.min(1.0, score) };
    }).sort((a, b) => b.matchScore - a.matchScore);
  }

  /**
   * Check if skill appears with meaningful context
   */
  private hasSkillContext(text: string, skill: string): boolean {
    const contextWords = [
      'experience', 'knowledge', 'expertise', 'proficient', 'skilled',
      'familiar', 'understanding', 'background', 'years', 'strong'
    ];
    
    const skillIndex = text.indexOf(skill);
    if (skillIndex === -1) return false;
    
    // Check 50 characters before and after skill mention
    const contextBefore = text.substring(Math.max(0, skillIndex - 50), skillIndex);
    const contextAfter = text.substring(skillIndex + skill.length, skillIndex + skill.length + 50);
    const fullContext = contextBefore + contextAfter;
    
    return contextWords.some(word => fullContext.includes(word));
  }

  /**
   * Convert BM25 score to normalized 0-1 score
   */
  private convertBM25ToScore(bm25Score: number): number {
    // BM25 scores are typically negative, with higher (less negative) being better
    // Convert to 0-1 scale where 1 is best match
    const normalizedScore = Math.exp(bm25Score / 2); // Exponential scaling
    return Math.min(1.0, Math.max(0.1, normalizedScore));
  }

  /**
   * Determine match type based on text analysis
   */
  private determineMatchType(
    originalText: string, 
    skillTitle: string, 
    alternativeLabel: string
  ): 'exact' | 'partial' | 'semantic' {
    const normalizedText = originalText.toLowerCase();
    const normalizedTitle = skillTitle.toLowerCase();
    
    if (normalizedText.includes(normalizedTitle)) {
      return 'exact';
    }
    
    const alternatives = alternativeLabel.split(',').map(alt => alt.trim().toLowerCase());
    if (alternatives.some(alt => alt && normalizedText.includes(alt))) {
      return 'partial';
    }
    
    return 'semantic';
  }

  /**
   * Cache management
   */
  private getCacheKey(text: string, domain: string, maxResults: number, minScore: number): string {
    return `${domain}:${maxResults}:${minScore}:${text.slice(0, 100)}`;
  }

  private getFromCache(key: string): ESCOExtractionResult | null {
    const cached = this.queryCache.get(key);
    const timestamp = this.cacheTimestamps.get(key);
    
    if (cached && timestamp && Date.now() - timestamp < this.CACHE_TTL) {
      return cached;
    }
    
    // Clean expired cache
    this.queryCache.delete(key);
    this.cacheTimestamps.delete(key);
    return null;
  }

  private setCache(key: string, result: ESCOExtractionResult): void {
    this.queryCache.set(key, result);
    this.cacheTimestamps.set(key, Date.now());
    
    // Limit cache size (LRU-like cleanup)
    if (this.queryCache.size > 1000) {
      const oldestKey = this.queryCache.keys().next().value;
      this.queryCache.delete(oldestKey);
      this.cacheTimestamps.delete(oldestKey);
    }
  }

  /**
   * Health check for the service
   */
  async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; details: any }> {
    try {
      await this.initializeDatabase();
      
      const skillCount = await this.db!.get('SELECT COUNT(*) as count FROM esco_skills');
      const ftsStatus = await this.db!.get('SELECT COUNT(*) as count FROM esco_skills_fts');
      
      return {
        status: 'healthy',
        details: {
          totalSkills: skillCount.count,
          ftsEntries: ftsStatus.count,
          cacheSize: this.queryCache.size,
          dbPath: this.dbPath
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      };
    }
  }

  /**
   * Clean up resources
   */
  async close(): Promise<void> {
    if (this.db) {
      await this.db.close();
      this.db = null;
    }
    this.queryCache.clear();
    this.cacheTimestamps.clear();
  }
}

/**
 * Singleton access to ESCO service
 */
export function getESCOService(): ESCOService {
  return ESCOService.getInstance();
}

/**
 * Legacy compatibility function for existing Python service calls
 */
export async function extractESCOSkills(
  text: string, 
  domain: 'pharmaceutical' | 'technology' | 'auto' = 'auto'
): Promise<ESCOExtractionResult> {
  const service = getESCOService();
  return service.extractSkills({ text, domain });
}

logger.info('✅ ESCO TypeScript service initialized (replacing Python service)');