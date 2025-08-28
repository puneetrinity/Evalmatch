import { logger } from "./logger";
import { generateEmbedding as _generateEmbedding, cosineSimilarity as _cosineSimilarity } from "./embeddings";
import _stringSimilarity from "string-similarity";

export interface IndustryMatchResult {
  score: number;
  explanation: string;
  breakdown: {
    industryAlignment: number;
    technologyStack: number;
    companySize: number;
    workEnvironment: number;
  };
  insights: {
    primaryIndustry: string;
    technologyOverlap: string[];
    companySizeMatch: string;
    environmentFit: string;
  };
}

interface IndustryAnalysis {
  industries: string[];
  technologies: string[];
  companySize: 'startup' | 'small' | 'medium' | 'large' | 'enterprise' | 'unknown';
  workEnvironment: 'remote' | 'hybrid' | 'onsite' | 'flexible' | 'unknown';
  businessModel: string[];
  verticals: string[];
}

// Hierarchical industry classification system with transferability
interface IndustryDefinition {
  keywords: string[];
  subIndustries: string[];
  transferableTo: { [industry: string]: number }; // Transferability scores 0-100
  bridgeSkills: string[]; // Skills that enable cross-industry transfer
  growthTrends: 'declining' | 'stable' | 'growing' | 'rapid_growth';
}

const INDUSTRY_HIERARCHY: { [industry: string]: IndustryDefinition } = {
  technology: {
    keywords: [
      'software', 'saas', 'platform', 'tech', 'digital', 'ai', 'machine learning',
      'data science', 'analytics', 'cloud', 'cybersecurity', 'blockchain', 'web3'
    ],
    subIndustries: ['saas', 'ai_ml', 'cybersecurity', 'blockchain', 'cloud_infrastructure'],
    transferableTo: {
      fintech: 85, healthcare: 80, education: 75, media: 70, enterprise: 90,
      ecommerce: 85, consulting: 75, manufacturing: 60, energy: 65
    },
    bridgeSkills: ['data analysis', 'system design', 'project management', 'api development'],
    growthTrends: 'rapid_growth'
  },
  fintech: {
    keywords: [
      'fintech', 'financial technology', 'banking', 'payments', 'cryptocurrency',
      'trading', 'investment', 'lending', 'insurance', 'wealth management'
    ],
    subIndustries: ['payments', 'lending', 'investment', 'insurance', 'crypto', 'regtech'],
    transferableTo: {
      technology: 80, enterprise: 75, consulting: 80, healthcare: 60,
      ecommerce: 70, realEstate: 65, energy: 55
    },
    bridgeSkills: ['risk management', 'compliance', 'data security', 'financial modeling'],
    growthTrends: 'growing'
  },
  healthcare: {
    keywords: [
      'healthcare', 'medical', 'pharmaceutical', 'biotech', 'medtech', 'clinical',
      'hospital', 'telemedicine', 'health tech', 'life sciences'
    ],
    subIndustries: ['medtech', 'biotech', 'pharma', 'telemedicine', 'clinical_research'],
    transferableTo: {
      technology: 75, fintech: 60, education: 70, consulting: 65,
      manufacturing: 70, energy: 50
    },
    bridgeSkills: ['regulatory compliance', 'data privacy', 'research methodology', 'quality assurance'],
    growthTrends: 'growing'
  },
  ecommerce: {
    keywords: [
      'e-commerce', 'ecommerce', 'retail', 'marketplace', 'shopping', 'consumer',
      'direct-to-consumer', 'd2c', 'b2c', 'online retail'
    ],
    subIndustries: ['marketplace', 'b2c', 'd2c', 'omnichannel', 'social_commerce'],
    transferableTo: {
      technology: 80, media: 85, transportation: 75, fintech: 70,
      enterprise: 65, manufacturing: 60, realEstate: 55
    },
    bridgeSkills: ['customer experience', 'supply chain', 'digital marketing', 'inventory management'],
    growthTrends: 'growing'
  },
  enterprise: {
    keywords: [
      'enterprise', 'b2b', 'business software', 'erp', 'crm', 'hr tech',
      'productivity', 'collaboration', 'workflow', 'automation'
    ],
    subIndustries: ['crm', 'erp', 'hr_tech', 'productivity', 'automation', 'collaboration'],
    transferableTo: {
      technology: 90, consulting: 85, fintech: 75, healthcare: 70,
      manufacturing: 80, education: 70, energy: 65
    },
    bridgeSkills: ['business process optimization', 'change management', 'system integration', 'stakeholder management'],
    growthTrends: 'stable'
  },
  media: {
    keywords: [
      'media', 'entertainment', 'streaming', 'gaming', 'content', 'publishing',
      'advertising', 'marketing', 'social media', 'creator economy'
    ],
    subIndustries: ['streaming', 'gaming', 'advertising', 'content_creation', 'publishing'],
    transferableTo: {
      technology: 75, ecommerce: 80, education: 75, enterprise: 60,
      consulting: 65, transportation: 50
    },
    bridgeSkills: ['content strategy', 'user engagement', 'brand management', 'creative direction'],
    growthTrends: 'growing'
  },
  education: {
    keywords: [
      'education', 'edtech', 'learning', 'training', 'academic', 'university',
      'online learning', 'e-learning', 'mooc', 'skill development'
    ],
    subIndustries: ['k12', 'higher_ed', 'corporate_training', 'online_learning', 'skill_development'],
    transferableTo: {
      technology: 70, healthcare: 65, enterprise: 70, consulting: 75,
      media: 70, fintech: 50
    },
    bridgeSkills: ['curriculum development', 'learning analytics', 'instructional design', 'assessment'],
    growthTrends: 'growing'
  },
  transportation: {
    keywords: [
      'transportation', 'mobility', 'automotive', 'ride sharing', 'logistics',
      'delivery', 'supply chain', 'shipping', 'freight'
    ],
    subIndustries: ['automotive', 'logistics', 'ride_sharing', 'delivery', 'freight'],
    transferableTo: {
      technology: 70, ecommerce: 75, manufacturing: 80, energy: 70,
      enterprise: 65, consulting: 60
    },
    bridgeSkills: ['operations optimization', 'route planning', 'fleet management', 'IoT systems'],
    growthTrends: 'growing'
  },
  realEstate: {
    keywords: [
      'real estate', 'proptech', 'construction', 'architecture', 'property',
      'housing', 'commercial real estate', 'residential'
    ],
    subIndustries: ['proptech', 'construction', 'commercial', 'residential', 'property_management'],
    transferableTo: {
      technology: 60, fintech: 70, manufacturing: 75, consulting: 70,
      enterprise: 60, transportation: 55
    },
    bridgeSkills: ['project management', 'financial analysis', 'regulatory knowledge', 'space planning'],
    growthTrends: 'stable'
  },
  energy: {
    keywords: [
      'energy', 'renewable energy', 'sustainability', 'clean tech', 'solar',
      'wind', 'oil and gas', 'utilities', 'power'
    ],
    subIndustries: ['renewable', 'oil_gas', 'utilities', 'cleantech', 'nuclear'],
    transferableTo: {
      manufacturing: 85, technology: 65, consulting: 70, transportation: 70,
      enterprise: 60, healthcare: 50
    },
    bridgeSkills: ['environmental compliance', 'energy systems', 'sustainability planning', 'grid management'],
    growthTrends: 'growing'
  },
  manufacturing: {
    keywords: [
      'manufacturing', 'industrial', 'factory', 'production', 'supply chain',
      'operations', 'quality control', 'lean manufacturing'
    ],
    subIndustries: ['automotive', 'aerospace', 'chemicals', 'electronics', 'textiles'],
    transferableTo: {
      energy: 80, transportation: 85, technology: 65, enterprise: 75,
      healthcare: 70, consulting: 65
    },
    bridgeSkills: ['process optimization', 'quality systems', 'lean methodologies', 'supply chain management'],
    growthTrends: 'stable'
  },
  consulting: {
    keywords: [
      'consulting', 'professional services', 'advisory', 'strategy', 'management',
      'implementation', 'transformation', 'outsourcing'
    ],
    subIndustries: ['strategy', 'technology', 'operations', 'hr', 'financial'],
    transferableTo: {
      enterprise: 85, technology: 80, fintech: 80, healthcare: 70,
      education: 75, manufacturing: 70, energy: 70
    },
    bridgeSkills: ['strategic thinking', 'stakeholder management', 'change management', 'analytical skills'],
    growthTrends: 'stable'
  }
};

// Enhanced technology stack with proficiency levels and metadata
interface TechnologyDefinition {
  technologies: string[];
  proficiencyLevels: {
    beginner: string[];
    intermediate: string[];
    advanced: string[];
    expert: string[];
  };
  recencyImportance: 'low' | 'medium' | 'high' | 'critical'; // How important recent experience is
  marketDemand: 'declining' | 'stable' | 'growing' | 'hot'; // Current market demand
  learningCurve: 'easy' | 'moderate' | 'steep' | 'expert_only'; // How hard to learn
}

const TECHNOLOGY_STACKS: { [category: string]: TechnologyDefinition } = {
  frontend: {
    technologies: [
      'react', 'vue', 'angular', 'javascript', 'typescript', 'html', 'css',
      'next.js', 'svelte', 'flutter', 'react native'
    ],
    proficiencyLevels: {
      beginner: ['html', 'css', 'javascript'],
      intermediate: ['react', 'vue', 'typescript'],
      advanced: ['next.js', 'angular', 'svelte'],
      expert: ['react native', 'flutter', 'web components']
    },
    recencyImportance: 'high',
    marketDemand: 'hot',
    learningCurve: 'moderate'
  },
  backend: {
    technologies: [
      'node.js', 'python', 'java', 'go', 'rust', 'c#', '.net', 'php', 'ruby',
      'django', 'flask', 'express', 'spring', 'laravel'
    ],
    proficiencyLevels: {
      beginner: ['node.js', 'python', 'php'],
      intermediate: ['express', 'django', 'flask', 'laravel'],
      advanced: ['java', 'spring', 'c#', '.net'],
      expert: ['go', 'rust', 'microservices architecture']
    },
    recencyImportance: 'medium',
    marketDemand: 'growing',
    learningCurve: 'moderate'
  },
  mobile: {
    technologies: [
      'ios', 'android', 'swift', 'kotlin', 'react native', 'flutter',
      'xamarin', 'ionic', 'cordova'
    ],
    proficiencyLevels: {
      beginner: ['ionic', 'cordova'],
      intermediate: ['react native', 'xamarin'],
      advanced: ['swift', 'kotlin', 'flutter'],
      expert: ['native ios', 'native android', 'cross-platform architecture']
    },
    recencyImportance: 'high',
    marketDemand: 'growing',
    learningCurve: 'steep'
  },
  cloud: {
    technologies: [
      'aws', 'azure', 'gcp', 'google cloud', 'docker', 'kubernetes',
      'terraform', 'serverless', 'microservices'
    ],
    proficiencyLevels: {
      beginner: ['docker', 'basic aws'],
      intermediate: ['kubernetes', 'terraform', 'serverless'],
      advanced: ['multi-cloud', 'aws solutions architect', 'azure architect'],
      expert: ['cloud native architecture', 'service mesh', 'infrastructure as code']
    },
    recencyImportance: 'critical',
    marketDemand: 'hot',
    learningCurve: 'steep'
  },
  database: {
    technologies: [
      'postgresql', 'mysql', 'mongodb', 'redis', 'elasticsearch', 'dynamodb',
      'cassandra', 'neo4j', 'influxdb'
    ],
    proficiencyLevels: {
      beginner: ['mysql', 'postgresql'],
      intermediate: ['mongodb', 'redis'],
      advanced: ['elasticsearch', 'dynamodb', 'cassandra'],
      expert: ['database architecture', 'sharding', 'distributed databases']
    },
    recencyImportance: 'medium',
    marketDemand: 'stable',
    learningCurve: 'moderate'
  },
  data: {
    technologies: [
      'python', 'r', 'sql', 'spark', 'hadoop', 'airflow', 'kafka',
      'snowflake', 'databricks', 'tableau', 'power bi'
    ],
    proficiencyLevels: {
      beginner: ['sql', 'python', 'tableau'],
      intermediate: ['spark', 'airflow', 'power bi'],
      advanced: ['hadoop', 'kafka', 'snowflake', 'databricks'],
      expert: ['data architecture', 'ml ops', 'real-time analytics']
    },
    recencyImportance: 'high',
    marketDemand: 'hot',
    learningCurve: 'steep'
  },
  devops: {
    technologies: [
      'jenkins', 'gitlab', 'github actions', 'circleci', 'ansible',
      'puppet', 'chef', 'prometheus', 'grafana', 'elk stack'
    ],
    proficiencyLevels: {
      beginner: ['jenkins', 'github actions'],
      intermediate: ['gitlab ci', 'ansible', 'prometheus'],
      advanced: ['puppet', 'chef', 'elk stack', 'grafana'],
      expert: ['devops architecture', 'sre practices', 'chaos engineering']
    },
    recencyImportance: 'high',
    marketDemand: 'growing',
    learningCurve: 'steep'
  },
  ai_ml: {
    technologies: [
      'tensorflow', 'pytorch', 'scikit-learn', 'pandas', 'numpy',
      'jupyter', 'mlflow', 'kubeflow', 'opencv'
    ],
    proficiencyLevels: {
      beginner: ['pandas', 'numpy', 'scikit-learn', 'jupyter'],
      intermediate: ['tensorflow', 'pytorch', 'opencv'],
      advanced: ['mlflow', 'kubeflow', 'model deployment'],
      expert: ['ml architecture', 'model optimization', 'research and development']
    },
    recencyImportance: 'critical',
    marketDemand: 'hot',
    learningCurve: 'expert_only'
  }
};

/**
 * Enhanced industry and domain matching that analyzes:
 * 1. Industry alignment (40% weight)
 * 2. Technology stack overlap (35% weight)
 * 3. Company size compatibility (15% weight)
 * 4. Work environment preferences (10% weight)
 */
export async function scoreIndustryDomainMatch(
  resumeContent: string,
  jobContent: string,
): Promise<IndustryMatchResult> {
  if (!resumeContent || !jobContent) {
    return createFallbackIndustryResult("Insufficient content for industry analysis");
  }

  try {
    // Analyze both resume and job content
    const resumeAnalysis = analyzeIndustryContent(resumeContent);
    const jobAnalysis = analyzeIndustryContent(jobContent);

    logger.debug("Industry analysis completed", {
      resumeIndustries: resumeAnalysis.industries,
      jobIndustries: jobAnalysis.industries,
      resumeTech: resumeAnalysis.technologies.slice(0, 5),
      jobTech: jobAnalysis.technologies.slice(0, 5),
      resumeCompanySize: resumeAnalysis.companySize,
      jobCompanySize: jobAnalysis.companySize,
    });

    // Calculate dimension scores
    const industryAlignment = calculateIndustryAlignment(
      resumeAnalysis.industries,
      jobAnalysis.industries,
      resumeAnalysis.verticals,
      jobAnalysis.verticals
    );

    const technologyStack = await calculateTechnologyStackScore(
      resumeAnalysis.technologies,
      jobAnalysis.technologies
    );

    const companySize = calculateCompanySizeScore(
      resumeAnalysis.companySize,
      jobAnalysis.companySize
    );

    const workEnvironment = calculateWorkEnvironmentScore(
      resumeAnalysis.workEnvironment,
      jobAnalysis.workEnvironment
    );

    // Weighted total score
    const totalScore = Math.round(
      industryAlignment * 0.40 +
      technologyStack * 0.35 +
      companySize * 0.15 +
      workEnvironment * 0.10
    );

    // Generate insights
    const insights = generateIndustryInsights(
      resumeAnalysis,
      jobAnalysis,
      { industryAlignment, technologyStack, companySize, workEnvironment }
    );

    return {
      score: Math.max(0, Math.min(100, totalScore)),
      explanation: generateIndustryExplanation(totalScore, insights),
      breakdown: { industryAlignment, technologyStack, companySize, workEnvironment },
      insights,
    };
  } catch (error) {
    logger.error("Industry domain matching failed:", error);
    return createFallbackIndustryResult("Industry analysis temporarily unavailable");
  }
}

/**
 * Analyze content to extract industry and domain information
 */
function analyzeIndustryContent(content: string): IndustryAnalysis {
  const text = content.toLowerCase();

  return {
    industries: extractIndustries(text),
    technologies: extractTechnologies(text),
    companySize: extractCompanySize(text),
    workEnvironment: extractWorkEnvironment(text),
    businessModel: extractBusinessModel(text),
    verticals: extractVerticals(text),
  };
}

/**
 * Extract industries from content using hierarchical taxonomy
 */
function extractIndustries(text: string): string[] {
  const foundIndustries: string[] = [];

  for (const [industry, definition] of Object.entries(INDUSTRY_HIERARCHY)) {
    const matchCount = definition.keywords.filter(keyword => text.includes(keyword)).length;
    if (matchCount > 0) {
      foundIndustries.push(industry);
    }
  }

  return foundIndustries;
}

/**
 * Extract technologies from content with enhanced matching
 */
function extractTechnologies(text: string): string[] {
  const foundTech: string[] = [];

  for (const [_category, definition] of Object.entries(TECHNOLOGY_STACKS)) {
    for (const tech of definition.technologies) {
      if (text.includes(tech)) {
        foundTech.push(tech);
      }
    }
  }

  return [...new Set(foundTech)]; // Remove duplicates
}

/**
 * Extract company size indicators
 */
function extractCompanySize(text: string): 'startup' | 'small' | 'medium' | 'large' | 'enterprise' | 'unknown' {
  if (text.match(/\b(startup|early stage|seed|series [a-c]|pre-ipo)\b/i)) {
    return 'startup';
  }
  if (text.match(/\b(small business|small company|1-50 employees|under 50)\b/i)) {
    return 'small';
  }
  if (text.match(/\b(medium|50-500 employees|series [d-f]|growth stage)\b/i)) {
    return 'medium';
  }
  if (text.match(/\b(large company|500-5000 employees|public company|nasdaq|nyse)\b/i)) {
    return 'large';
  }
  if (text.match(/\b(enterprise|fortune 500|multinational|5000\+ employees|global)\b/i)) {
    return 'enterprise';
  }
  return 'unknown';
}

/**
 * Extract work environment preferences
 */
function extractWorkEnvironment(text: string): 'remote' | 'hybrid' | 'onsite' | 'flexible' | 'unknown' {
  if (text.match(/\b(remote|work from home|distributed|anywhere)\b/i)) {
    return 'remote';
  }
  if (text.match(/\b(hybrid|flexible schedule|remote-friendly|part remote)\b/i)) {
    return 'hybrid';
  }
  if (text.match(/\b(onsite|office|in-person|on-premises)\b/i)) {
    return 'onsite';
  }
  if (text.match(/\b(flexible|adaptable|open to|either)\b/i)) {
    return 'flexible';
  }
  return 'unknown';
}

/**
 * Extract business model indicators
 */
function extractBusinessModel(text: string): string[] {
  const models: string[] = [];
  
  if (text.includes('b2b') || text.includes('business to business')) models.push('b2b');
  if (text.includes('b2c') || text.includes('business to consumer')) models.push('b2c');
  if (text.includes('saas') || text.includes('software as a service')) models.push('saas');
  if (text.includes('marketplace') || text.includes('platform')) models.push('marketplace');
  if (text.includes('subscription') || text.includes('recurring revenue')) models.push('subscription');
  if (text.includes('e-commerce') || text.includes('ecommerce')) models.push('ecommerce');
  
  return models;
}

/**
 * Extract industry verticals
 */
function extractVerticals(text: string): string[] {
  const verticals: string[] = [];
  
  const verticalKeywords = [
    'retail', 'banking', 'insurance', 'automotive', 'aerospace', 'defense',
    'government', 'non-profit', 'education', 'healthcare', 'legal', 'agriculture',
    'hospitality', 'travel', 'sports', 'fashion', 'food', 'beverage'
  ];

  for (const vertical of verticalKeywords) {
    if (text.includes(vertical)) {
      verticals.push(vertical);
    }
  }

  return verticals;
}

/**
 * Calculate transferability score between industries
 */
function calculateTransferabilityScore(
  resumeIndustries: string[],
  jobIndustries: string[],
  resumeSkills: string[]
): { score: number; transferablePairs: Array<{ from: string; to: string; score: number; bridgeSkills: string[] }> } {
  const transferablePairs: Array<{ from: string; to: string; score: number; bridgeSkills: string[] }> = [];
  let totalTransferabilityScore = 0;
  let pairCount = 0;

  for (const resumeIndustry of resumeIndustries) {
    for (const jobIndustry of jobIndustries) {
      if (resumeIndustry === jobIndustry) {
        // Perfect match
        transferablePairs.push({
          from: resumeIndustry,
          to: jobIndustry,
          score: 100,
          bridgeSkills: []
        });
        totalTransferabilityScore += 100;
        pairCount++;
      } else {
        // Check transferability
        const resumeDefinition = INDUSTRY_HIERARCHY[resumeIndustry];
        if (resumeDefinition && resumeDefinition.transferableTo[jobIndustry]) {
          const baseTransferScore = resumeDefinition.transferableTo[jobIndustry];
          
          // Calculate bridge skills bonus
          const bridgeSkills = resumeDefinition.bridgeSkills.filter(skill =>
            resumeSkills.some(resumeSkill => 
              resumeSkill.toLowerCase().includes(skill.toLowerCase()) ||
              skill.toLowerCase().includes(resumeSkill.toLowerCase())
            )
          );
          
          const bridgeSkillsBonus = Math.min(15, bridgeSkills.length * 3);
          const finalScore = Math.min(100, baseTransferScore + bridgeSkillsBonus);
          
          transferablePairs.push({
            from: resumeIndustry,
            to: jobIndustry,
            score: finalScore,
            bridgeSkills
          });
          
          totalTransferabilityScore += finalScore;
          pairCount++;
        }
      }
    }
  }

  const averageScore = pairCount > 0 ? totalTransferabilityScore / pairCount : 0;
  return { score: averageScore, transferablePairs };
}

/**
 * Enhanced industry alignment score (40% weight) with transferability
 */
function calculateIndustryAlignment(
  resumeIndustries: string[],
  jobIndustries: string[],
  resumeVerticals: string[],
  jobVerticals: string[]
): number {
  if (resumeIndustries.length === 0 && jobIndustries.length === 0) {
    return 60; // Neutral score when no industry data available
  }

  if (jobIndustries.length === 0) {
    return 70; // Slight positive when job doesn't specify industry
  }

  if (resumeIndustries.length === 0) {
    return 30; // Lower score when resume has no industry but job requires it
  }

  // Direct industry matches (highest weight)
  const directMatches = resumeIndustries.filter(industry =>
    jobIndustries.includes(industry)
  );

  let score = 20; // Base score

  if (directMatches.length > 0) {
    // Perfect industry matches
    score += Math.min(50, directMatches.length * 25);
  } else {
    // Calculate transferability when no direct matches
    const transferability = calculateTransferabilityScore(
      resumeIndustries, 
      jobIndustries,
      [] // Skills will be passed from higher level function
    );
    
    if (transferability.score > 0) {
      score += Math.round(transferability.score * 0.4); // 40% of transferability score
    }
  }

  // Vertical matches (secondary factor)
  const verticalMatches = resumeVerticals.filter(vertical =>
    jobVerticals.includes(vertical)
  );

  if (verticalMatches.length > 0) {
    score += Math.min(15, verticalMatches.length * 5);
  }

  // Industry growth alignment bonus
  for (const jobIndustry of jobIndustries) {
    const jobDefinition = INDUSTRY_HIERARCHY[jobIndustry];
    if (jobDefinition && jobDefinition.growthTrends === 'rapid_growth') {
      score += 5; // Bonus for growing industries
    }
  }

  // Versatility bonus for multiple industry experience
  if (resumeIndustries.length > 2) {
    score += 5;
  }

  return Math.min(100, Math.max(0, score));
}

/**
 * Calculate technology stack overlap score (35% weight)
 */
async function calculateTechnologyStackScore(
  resumeTech: string[],
  jobTech: string[]
): Promise<number> {
  if (resumeTech.length === 0 && jobTech.length === 0) {
    return 50; // Neutral score when no tech data available
  }

  if (jobTech.length === 0) {
    return 60; // Slight positive when job doesn't specify tech requirements
  }

  if (resumeTech.length === 0) {
    return 30; // Lower score when resume has no tech but job requires it
  }

  // Direct technology matches
  const directMatches = resumeTech.filter(tech =>
    jobTech.some(jobTech => 
      tech.toLowerCase() === jobTech.toLowerCase() ||
      tech.toLowerCase().includes(jobTech.toLowerCase()) ||
      jobTech.toLowerCase().includes(tech.toLowerCase())
    )
  );

  // Calculate match percentage
  const matchPercentage = (directMatches.length / jobTech.length) * 100;

  // Bonus for having more technologies than required (versatility)
  const versatilityBonus = resumeTech.length > jobTech.length ? 10 : 0;

  // Enhanced category and proficiency matching
  const categoryMatches = calculateTechnologyCategoryMatches(resumeTech, jobTech);
  const proficiencyScore = calculateTechnologyProficiencyScore(resumeTech, jobTech);

  // Weighted combination: direct matches (50%), proficiency (30%), category (20%)
  const totalScore = Math.min(100, 
    matchPercentage * 0.5 + 
    proficiencyScore * 0.3 + 
    categoryMatches * 0.2 + 
    versatilityBonus
  );
  
  return Math.round(totalScore);
}

/**
 * Calculate enhanced technology category matches with proficiency weighting
 */
function calculateTechnologyCategoryMatches(resumeTech: string[], jobTech: string[]): number {
  let categoryScore = 0;

  for (const [_category, definition] of Object.entries(TECHNOLOGY_STACKS)) {
    const resumeHasCategory = definition.technologies.some(tech => 
      resumeTech.some(rTech => rTech.toLowerCase().includes(tech.toLowerCase()))
    );
    const jobHasCategory = definition.technologies.some(tech => 
      jobTech.some(jTech => jTech.toLowerCase().includes(tech.toLowerCase()))
    );

    if (resumeHasCategory && jobHasCategory) {
      let categoryBonus = 5; // Base bonus
      
      // Bonus based on market demand
      switch (definition.marketDemand) {
        case 'hot':
          categoryBonus += 3;
          break;
        case 'growing':
          categoryBonus += 2;
          break;
        case 'stable':
          categoryBonus += 1;
          break;
        // declining gets no bonus
      }
      
      // Bonus for advanced technologies
      const hasAdvancedTech = definition.proficiencyLevels.advanced.some(tech =>
        resumeTech.some(rTech => rTech.toLowerCase().includes(tech.toLowerCase()))
      ) || definition.proficiencyLevels.expert.some(tech =>
        resumeTech.some(rTech => rTech.toLowerCase().includes(tech.toLowerCase()))
      );
      
      if (hasAdvancedTech) {
        categoryBonus += 2;
      }
      
      categoryScore += categoryBonus;
    }
  }

  return Math.min(20, categoryScore); // Increased cap to 20 points
}

/**
 * Calculate technology proficiency level score
 */
function calculateTechnologyProficiencyScore(resumeTech: string[], jobTech: string[]): number {
  let proficiencyScore = 0;
  let totalWeight = 0;

  for (const [_category, definition] of Object.entries(TECHNOLOGY_STACKS)) {
    // Check if this category is relevant (both resume and job have techs from this category)
    const resumeCategoryTechs = definition.technologies.filter(tech => 
      resumeTech.some(rTech => rTech.toLowerCase().includes(tech.toLowerCase()))
    );
    const jobCategoryTechs = definition.technologies.filter(tech => 
      jobTech.some(jTech => jTech.toLowerCase().includes(tech.toLowerCase()))
    );

    if (resumeCategoryTechs.length > 0 && jobCategoryTechs.length > 0) {
      // Calculate proficiency level for this category
      let categoryProficiency = 0;
      
      if (definition.proficiencyLevels.expert.some(tech =>
        resumeCategoryTechs.some(rTech => rTech.toLowerCase().includes(tech.toLowerCase()))
      )) {
        categoryProficiency = 100;
      } else if (definition.proficiencyLevels.advanced.some(tech =>
        resumeCategoryTechs.some(rTech => rTech.toLowerCase().includes(tech.toLowerCase()))
      )) {
        categoryProficiency = 80;
      } else if (definition.proficiencyLevels.intermediate.some(tech =>
        resumeCategoryTechs.some(rTech => rTech.toLowerCase().includes(tech.toLowerCase()))
      )) {
        categoryProficiency = 60;
      } else {
        categoryProficiency = 40; // Beginner level
      }

      // Weight by recency importance
      let recencyWeight = 1;
      switch (definition.recencyImportance) {
        case 'critical':
          recencyWeight = 1.5;
          break;
        case 'high':
          recencyWeight = 1.3;
          break;
        case 'medium':  
          recencyWeight = 1.1;
          break;
        case 'low':
          recencyWeight = 0.9;
          break;
      }

      proficiencyScore += categoryProficiency * recencyWeight;
      totalWeight += recencyWeight;
    }
  }

  return totalWeight > 0 ? proficiencyScore / totalWeight : 50;
}

/**
 * Calculate company size compatibility score (15% weight)
 */
function calculateCompanySizeScore(
  resumeSize: string,
  jobSize: string
): number {
  if (resumeSize === 'unknown' || jobSize === 'unknown') {
    return 60; // Neutral score when size is unknown
  }

  const sizeMapping = {
    startup: 1,
    small: 2,
    medium: 3,
    large: 4,
    enterprise: 5
  };

  const resumeSizeNum = sizeMapping[resumeSize as keyof typeof sizeMapping] || 3;
  const jobSizeNum = sizeMapping[jobSize as keyof typeof sizeMapping] || 3;

  if (resumeSizeNum === jobSizeNum) {
    return 100; // Perfect match
  } else if (Math.abs(resumeSizeNum - jobSizeNum) === 1) {
    return 80; // Adjacent size categories
  } else if (Math.abs(resumeSizeNum - jobSizeNum) === 2) {
    return 60; // Moderate difference
  } else {
    return 40; // Significant difference
  }
}

/**
 * Calculate work environment compatibility score (10% weight)
 */
function calculateWorkEnvironmentScore(
  resumeEnv: string,
  jobEnv: string
): number {
  if (resumeEnv === 'unknown' || jobEnv === 'unknown') {
    return 70; // Neutral score when environment is unknown
  }

  if (resumeEnv === jobEnv) {
    return 100; // Perfect match
  }

  // Compatibility matrix
  const compatibility: { [key: string]: { [key: string]: number } } = {
    remote: { hybrid: 80, flexible: 90, onsite: 40 },
    hybrid: { remote: 80, flexible: 95, onsite: 70 },
    onsite: { hybrid: 70, flexible: 80, remote: 40 },
    flexible: { remote: 90, hybrid: 95, onsite: 80 }
  };

  return compatibility[resumeEnv]?.[jobEnv] || 50;
}

/**
 * Generate industry insights
 */
function generateIndustryInsights(
  resumeAnalysis: IndustryAnalysis,
  jobAnalysis: IndustryAnalysis,
  _scores: { industryAlignment: number; technologyStack: number; companySize: number; workEnvironment: number }
): {
  primaryIndustry: string;
  technologyOverlap: string[];
  companySizeMatch: string;
  environmentFit: string;
} {
  const primaryIndustry = jobAnalysis.industries.length > 0 
    ? jobAnalysis.industries[0] 
    : 'General Technology';

  const technologyOverlap = resumeAnalysis.technologies.filter(tech =>
    jobAnalysis.technologies.some(jobTech =>
      tech.toLowerCase() === jobTech.toLowerCase() ||
      tech.toLowerCase().includes(jobTech.toLowerCase()) ||
      jobTech.toLowerCase().includes(tech.toLowerCase())
    )
  );

  const companySizeMatch = `Resume: ${resumeAnalysis.companySize} → Job: ${jobAnalysis.companySize}`;

  const environmentFit = `Candidate: ${resumeAnalysis.workEnvironment} → Job: ${jobAnalysis.workEnvironment}`;

  return {
    primaryIndustry,
    technologyOverlap,
    companySizeMatch,
    environmentFit,
  };
}

/**
 * Generate industry explanation
 */
function generateIndustryExplanation(
  totalScore: number,
  insights: { primaryIndustry: string; technologyOverlap: unknown[] }
): string {
  if (totalScore >= 85) {
    return `Excellent industry alignment (${totalScore}%). Strong match in ${insights.primaryIndustry} with ${insights.technologyOverlap.length} overlapping technologies.`;
  } else if (totalScore >= 70) {
    return `Good industry alignment (${totalScore}%). Relevant experience in ${insights.primaryIndustry} sector with solid technology overlap.`;
  } else if (totalScore >= 50) {
    return `Moderate industry alignment (${totalScore}%). Some relevant background but technology stack or industry experience gaps present.`;
  } else {
    return `Limited industry alignment (${totalScore}%). Significant differences in industry background or required technology stack.`;
  }
}

/**
 * Create fallback result when industry analysis fails
 */
function createFallbackIndustryResult(reason: string): IndustryMatchResult {
  return {
    score: 60,
    explanation: `Industry analysis: ${reason}. Using neutral scoring.`,
    breakdown: {
      industryAlignment: 60,
      technologyStack: 60,
      companySize: 60,
      workEnvironment: 60,
    },
    insights: {
      primaryIndustry: "Unknown",
      technologyOverlap: [],
      companySizeMatch: "Could not determine",
      environmentFit: "Could not assess",
    },
  };
}