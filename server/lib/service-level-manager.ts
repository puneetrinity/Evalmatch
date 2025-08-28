/**
 * Phase 2.2: Graceful degradation system with dynamic service level adjustment
 * Automatically reduces feature complexity under load instead of failing completely
 */

import { logger } from "./logger";
import { queueManager } from "./queue-manager";
import { cacheManager } from "./redis-cache";

export type ServiceLevel = "FULL" | "REDUCED" | "BASIC" | "MAINTENANCE";

export interface ServiceLevelConfig {
  level: ServiceLevel;
  description: string;
  features: {
    aiAnalysis: boolean;
    biasDetection: boolean;
    fairnessAnalysis: boolean;
    enhancedMatching: boolean;
    interviewQuestions: boolean;
    caching: boolean;
    fullTextAnalysis: boolean;
    semanticSearch: boolean;
  };
  limits: {
    maxConcurrentRequests: number;
    requestTimeoutMs: number;
    maxQueueDepth: number;
    aiTokenLimit?: number;
  };
}

// Service level configurations
const SERVICE_LEVEL_CONFIGS: Record<ServiceLevel, ServiceLevelConfig> = {
  FULL: {
    level: "FULL",
    description: "All features enabled with full AI capabilities",
    features: {
      aiAnalysis: true,
      biasDetection: true,
      fairnessAnalysis: true,
      enhancedMatching: true,
      interviewQuestions: true,
      caching: true,
      fullTextAnalysis: true,
      semanticSearch: true,
    },
    limits: {
      maxConcurrentRequests: 100,
      requestTimeoutMs: 30000,
      maxQueueDepth: 200,
      aiTokenLimit: 8000,
    }
  },
  
  REDUCED: {
    level: "REDUCED",
    description: "Core AI features with reduced complexity",
    features: {
      aiAnalysis: true,
      biasDetection: false, // Skip expensive bias analysis
      fairnessAnalysis: false,
      enhancedMatching: true,
      interviewQuestions: false, // Skip question generation
      caching: true,
      fullTextAnalysis: false, // Structure-only analysis
      semanticSearch: false,
    },
    limits: {
      maxConcurrentRequests: 150,
      requestTimeoutMs: 20000,
      maxQueueDepth: 150,
      aiTokenLimit: 4000, // Reduced token usage
    }
  },
  
  BASIC: {
    level: "BASIC",
    description: "Essential matching with minimal AI usage",
    features: {
      aiAnalysis: true,
      biasDetection: false,
      fairnessAnalysis: false,
      enhancedMatching: false, // Simple keyword matching only
      interviewQuestions: false,
      caching: true,
      fullTextAnalysis: false,
      semanticSearch: false,
    },
    limits: {
      maxConcurrentRequests: 200,
      requestTimeoutMs: 10000,
      maxQueueDepth: 100,
      aiTokenLimit: 2000, // Minimal tokens
    }
  },
  
  MAINTENANCE: {
    level: "MAINTENANCE",
    description: "Emergency mode with static responses only",
    features: {
      aiAnalysis: false,
      biasDetection: false,
      fairnessAnalysis: false,
      enhancedMatching: false,
      interviewQuestions: false,
      caching: true, // Still use cache for static responses
      fullTextAnalysis: false,
      semanticSearch: false,
    },
    limits: {
      maxConcurrentRequests: 50,
      requestTimeoutMs: 5000,
      maxQueueDepth: 25,
    }
  }
};

// System health thresholds for automatic degradation
const DEGRADATION_THRESHOLDS = {
  memory: {
    REDUCED: 1024, // MB - start reducing at 1GB heap usage
    BASIC: 1536,   // MB - basic mode at 1.5GB
    MAINTENANCE: 2048 // MB - maintenance mode at 2GB
  },
  queueDepth: {
    REDUCED: 100,
    BASIC: 200,
    MAINTENANCE: 300
  },
  responseTime: {
    REDUCED: 5000,  // ms - p95 response time
    BASIC: 10000,
    MAINTENANCE: 20000
  },
  errorRate: {
    REDUCED: 0.05,  // 5% error rate
    BASIC: 0.15,    // 15% error rate  
    MAINTENANCE: 0.30 // 30% error rate
  }
};

export class ServiceLevelManager {
  private static instance: ServiceLevelManager | null = null;
  private currentLevel: ServiceLevel = "FULL";
  private lastLevelChange = Date.now();
  private metrics = {
    memoryUsageMB: 0,
    queueDepth: 0,
    p95ResponseTime: 0,
    errorRate: 0,
    lastCheck: Date.now()
  };

  private constructor() {}

  static getInstance(): ServiceLevelManager {
    if (!ServiceLevelManager.instance) {
      ServiceLevelManager.instance = new ServiceLevelManager();
    }
    return ServiceLevelManager.instance;
  }

  /**
   * Get current service level configuration
   */
  getCurrentConfig(): ServiceLevelConfig {
    return SERVICE_LEVEL_CONFIGS[this.currentLevel];
  }

  /**
   * Get current service level
   */
  getCurrentLevel(): ServiceLevel {
    return this.currentLevel;
  }

  /**
   * Check if a feature is enabled at current service level
   */
  isFeatureEnabled(feature: keyof ServiceLevelConfig['features']): boolean {
    return this.getCurrentConfig().features[feature];
  }

  /**
   * Get current limits
   */
  getCurrentLimits(): ServiceLevelConfig['limits'] {
    return this.getCurrentConfig().limits;
  }

  /**
   * Manually set service level (for maintenance or testing)
   */
  setServiceLevel(level: ServiceLevel, reason: string = "Manual override"): void {
    if (level !== this.currentLevel) {
      const previousLevel = this.currentLevel;
      this.currentLevel = level;
      this.lastLevelChange = Date.now();
      
      logger.info(`🔄 Service level changed: ${previousLevel} → ${level}`, {
        reason,
        config: this.getCurrentConfig(),
        previousLevel
      });
    }
  }

  /**
   * Update system metrics and potentially adjust service level
   */
  async updateMetricsAndAdjustLevel(): Promise<void> {
    try {
      // Collect current metrics
      await this.collectMetrics();
      
      // Determine optimal service level based on metrics
      const optimalLevel = this.determineOptimalLevel();
      
      // Apply level change if needed (with hysteresis to prevent flapping)
      if (optimalLevel !== this.currentLevel) {
        const timeSinceLastChange = Date.now() - this.lastLevelChange;
        const minChangeInterval = 30000; // 30 seconds minimum between changes
        
        if (timeSinceLastChange > minChangeInterval || optimalLevel === "MAINTENANCE") {
          this.setServiceLevel(optimalLevel, "Automatic adjustment based on system metrics");
        } else {
          logger.debug(`Service level change suppressed (hysteresis): ${this.currentLevel} → ${optimalLevel}`, {
            timeSinceLastChange,
            minChangeInterval
          });
        }
      }
      
    } catch (error) {
      logger.error("Failed to update service level metrics:", error);
    }
  }

  /**
   * Collect current system metrics
   */
  private async collectMetrics(): Promise<void> {
    // Memory usage
    const memoryUsage = process.memoryUsage();
    this.metrics.memoryUsageMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
    
    // Queue depth
    try {
      const queueStats = await queueManager.getQueueStats();
      this.metrics.queueDepth = Object.values(queueStats).reduce((total: number, stats: any) => {
        return total + (stats.waiting || 0) + (stats.active || 0);
      }, 0);
    } catch (error) {
      logger.warn("Failed to get queue stats for service level adjustment:", error);
    }
    
    this.metrics.lastCheck = Date.now();
  }

  /**
   * Determine optimal service level based on current metrics
   */
  private determineOptimalLevel(): ServiceLevel {
    const { memoryUsageMB, queueDepth, errorRate } = this.metrics;
    
    // Check for maintenance mode conditions (most critical)
    if (
      memoryUsageMB >= DEGRADATION_THRESHOLDS.memory.MAINTENANCE ||
      queueDepth >= DEGRADATION_THRESHOLDS.queueDepth.MAINTENANCE ||
      errorRate >= DEGRADATION_THRESHOLDS.errorRate.MAINTENANCE
    ) {
      return "MAINTENANCE";
    }
    
    // Check for basic mode conditions
    if (
      memoryUsageMB >= DEGRADATION_THRESHOLDS.memory.BASIC ||
      queueDepth >= DEGRADATION_THRESHOLDS.queueDepth.BASIC ||
      errorRate >= DEGRADATION_THRESHOLDS.errorRate.BASIC
    ) {
      return "BASIC";
    }
    
    // Check for reduced mode conditions
    if (
      memoryUsageMB >= DEGRADATION_THRESHOLDS.memory.REDUCED ||
      queueDepth >= DEGRADATION_THRESHOLDS.queueDepth.REDUCED ||
      errorRate >= DEGRADATION_THRESHOLDS.errorRate.REDUCED
    ) {
      return "REDUCED";
    }
    
    // All systems normal - full service
    return "FULL";
  }

  /**
   * Get current metrics for monitoring
   */
  getMetrics(): typeof this.metrics & { currentLevel: ServiceLevel; config: ServiceLevelConfig } {
    return {
      ...this.metrics,
      currentLevel: this.currentLevel,
      config: this.getCurrentConfig()
    };
  }

  /**
   * Get static response for maintenance mode
   */
  getMaintenanceResponse(type: 'resume' | 'job' | 'match'): any {
    const timestamp = new Date().toISOString();
    
    switch (type) {
      case 'resume':
        return {
          id: 0,
          analyzedData: {
            skills: ["System temporarily unavailable"],
            experience: "Unable to analyze - please try again later",
            education: [],
            summary: `Analysis temporarily unavailable as of ${timestamp}`,
            strengths: ["Please try again in a few minutes"],
            jobTitles: []
          },
          serviceLevel: "MAINTENANCE"
        };
        
      case 'job':
        return {
          id: 0,
          analyzedData: {
            requiredSkills: ["System temporarily unavailable"],
            preferredSkills: [],
            experienceLevel: "unknown",
            responsibilities: ["Analysis unavailable - maintenance mode"],
            summary: `Job analysis temporarily unavailable as of ${timestamp}`
          },
          serviceLevel: "MAINTENANCE"
        };
        
      case 'match':
        return {
          matchPercentage: null,
          matchedSkills: [],
          missingSkills: [],
          candidateStrengths: [],
          candidateWeaknesses: [],
          recommendations: [`System is in maintenance mode as of ${timestamp}. Please try again in a few minutes.`],
          confidenceLevel: "low",
          serviceLevel: "MAINTENANCE"
        };
        
      default:
        return {
          error: "Service temporarily unavailable",
          serviceLevel: "MAINTENANCE",
          message: "Please try again in a few minutes"
        };
    }
  }

  /**
   * Start periodic metric collection and adjustment
   */
  startPeriodicAdjustment(): void {
    const interval = 15000; // Check every 15 seconds
    
    setInterval(async () => {
      await this.updateMetricsAndAdjustLevel();
    }, interval);
    
    logger.info(`🔄 Started service level manager with ${interval}ms check interval`);
  }
}

// Export singleton instance
export const serviceLevelManager = ServiceLevelManager.getInstance();