/**
 * Skill Cross-Contamination Detection System
 * 
 * This module implements a "smell test" to detect when skills from one industry
 * incorrectly appear in analysis results for a different industry.
 * 
 * Example: Pharmaceutical skills (GMP, FDA) appearing in IT job analysis
 */

import { logger } from "./logger";

export interface ContaminationResult {
  isContaminated: boolean;
  confidence: number;
  reason: string;
  suggestedAction: 'block' | 'flag' | 'replace';
  replacement?: string;
}

export interface JobContext {
  industry: 'technology' | 'pharmaceutical' | 'finance' | 'healthcare' | 'manufacturing' | 'general';
  jobTitle: string;
  jobDescription?: string;
  requiredSkills?: string[];
}

// Industry-specific skill patterns based on real contamination issues
const INDUSTRY_SKILL_PATTERNS = {
  technology: {
    allowed: [
      // Programming & Development
      'javascript', 'python', 'java', 'react', 'node.js', 'angular', 'vue.js',
      'typescript', 'c++', 'c#', 'php', 'ruby', 'swift', 'kotlin', 'go',
      
      // Cloud & Infrastructure  
      'aws', 'azure', 'gcp', 'docker', 'kubernetes', 'terraform', 'jenkins',
      'cloud computing', 'devops', 'ci/cd', 'microservices',
      
      // Data & AI
      'sql', 'mongodb', 'postgresql', 'redis', 'elasticsearch', 'machine learning',
      'data analysis', 'artificial intelligence', 'big data',
      
      // Mobile & Web
      'ios development', 'android development', 'mobile development', 
      'web development', 'frontend', 'backend', 'full stack',
      
      // Security & Networking
      'cybersecurity', 'network security', 'information security', 
      'penetration testing', 'security compliance',
      
      // Business/Sales Tech Skills
      'enterprise sales', 'saas', 'api integration', 'technical sales',
      'solution architecture', 'system integration'
    ],
    forbidden: [
      // Pharmaceutical/Medical
      'good manufacturing practice', 'gmp', 'fda regulations', 'clinical trials',
      'drug development', 'regulatory affairs', 'pharmacovigilance', 
      'medical writing', 'clinical research', 'biotechnology research',
      'drug discovery', 'pharmaceutical manufacturing', 'medical devices',
      
      // Manufacturing/Industrial  
      'manufacturing processes', 'quality control manufacturing', 
      'industrial engineering', 'supply chain manufacturing',
      
      // Finance-specific (not tech-finance)
      'investment banking', 'portfolio management', 'trading systems',
      'financial modeling', 'risk management banking'
    ]
  },

  pharmaceutical: {
    allowed: [
      // Core Pharma
      'good manufacturing practice', 'gmp', 'fda regulations', 'ema guidelines',
      'clinical trials', 'drug development', 'regulatory affairs', 
      'pharmacovigilance', 'medical writing', 'clinical research',
      
      // Biotech & Research
      'biotechnology', 'drug discovery', 'molecular biology', 'biochemistry',
      'pharmacology', 'bioinformatics', 'genomics', 'proteomics',
      
      // Quality & Compliance
      'quality assurance', 'quality control', 'validation', 'compliance',
      'drug registration', 'medical communications', 'clinical data analysis',
      
      // Medical Affairs
      'medical affairs', 'adverse event reporting', 'drug safety',
      'risk management', 'signal detection',
      
      // Technology used IN pharma
      'python', 'r', 'sas', 'sql', 'data analysis', 'statistics'
    ],
    forbidden: [
      // Pure Technology
      'ios development', 'android development', 'react', 'angular', 'vue.js',
      'javascript frameworks', 'web development', 'mobile development',
      'cloud architecture', 'devops', 'kubernetes', 'docker containers',
      
      // Finance
      'investment banking', 'trading', 'portfolio management',
      
      // Other Industries
      'manufacturing automation', 'industrial processes'
    ]
  },

  finance: {
    allowed: [
      // Core Finance
      'investment banking', 'portfolio management', 'trading systems',
      'financial modeling', 'risk management', 'derivatives', 'securities',
      'wealth management', 'asset management', 'hedge funds',
      
      // FinTech
      'blockchain', 'cryptocurrency', 'payment systems', 'robo-advisors',
      'algorithmic trading', 'quantitative analysis', 'financial analytics',
      
      // Technology used IN finance
      'python', 'r', 'sql', 'matlab', 'bloomberg terminal', 'excel',
      'data analysis', 'machine learning', 'artificial intelligence'
    ],
    forbidden: [
      // Pharmaceutical  
      'gmp', 'fda regulations', 'clinical trials', 'drug development',
      
      // Pure Technology (non-fintech)
      'ios development', 'android development', 'game development',
      'web design', 'mobile apps', 'social media development'
    ]
  },

  healthcare: {
    allowed: [
      // Medical & Clinical
      'patient care', 'clinical assessment', 'medical diagnosis', 'treatment planning',
      'healthcare administration', 'medical records', 'hipaa compliance', 
      'electronic health records', 'telemedicine', 'medical coding',
      
      // Nursing & Care
      'nursing', 'patient monitoring', 'medication administration', 
      'wound care', 'infection control', 'patient education',
      
      // Healthcare Technology
      'healthcare informatics', 'medical devices', 'healthcare software',
      'clinical data analysis', 'epidemiology', 'public health'
    ],
    forbidden: [
      // Technology (non-healthcare)
      'web development', 'mobile development', 'game development',
      'social media marketing', 'e-commerce development',
      
      // Finance
      'investment banking', 'trading systems', 'portfolio management'
    ]
  },

  manufacturing: {
    allowed: [
      // Core Manufacturing
      'manufacturing processes', 'quality control', 'lean manufacturing',
      'six sigma', 'process improvement', 'supply chain management',
      'inventory management', 'production planning', 'operations management',
      
      // Industrial Engineering
      'industrial engineering', 'automation systems', 'robotics',
      'plc programming', 'manufacturing execution systems', 'mes',
      'preventive maintenance', 'safety compliance', 'iso standards',
      
      // Quality & Safety
      'quality assurance', 'statistical process control', 'root cause analysis',
      'workplace safety', 'osha compliance', 'environmental compliance'
    ],
    forbidden: [
      // Technology (non-industrial)
      'web development', 'mobile app development', 'social media',
      'digital marketing', 'e-commerce platforms',
      
      // Pharmaceutical
      'clinical trials', 'drug development', 'fda regulations',
      
      // Finance
      'investment banking', 'trading systems', 'financial modeling'
    ]
  },

  // General skills that can appear in multiple industries
  general: {
    allowed: [
      // Soft Skills
      'communication', 'leadership', 'project management', 'team management',
      'problem solving', 'analytical thinking', 'strategic planning',
      'negotiation', 'presentation skills', 'customer service',
      
      // Business Skills  
      'sales', 'marketing', 'business development', 'account management',
      'relationship management', 'client relations', 'business analysis',
      
      // General Tech Skills
      'microsoft office', 'excel', 'powerpoint', 'data analysis',
      'process improvement', 'quality assurance'
    ],
    forbidden: [] // General skills have no forbidden list
  }
};

/**
 * Main contamination detection function - the "smell test"
 */
export async function detectSkillContamination(
  skill: string,
  context: JobContext
): Promise<ContaminationResult> {
  const normalizedSkill = skill.toLowerCase().trim();
  
  try {
    // Quick check for obvious contamination
    const quickCheck = performQuickContaminationCheck(normalizedSkill, context);
    if (quickCheck.isContaminated) {
      return quickCheck;
    }

    // Deeper analysis for edge cases
    const deepCheck = await performDeepContaminationAnalysis(normalizedSkill, context);
    return deepCheck;

  } catch (error) {
    logger.error('Error in contamination detection:', error);
    
    // Safe fallback - when in doubt, don't contaminate
    return {
      isContaminated: false,
      confidence: 0.5,
      reason: 'Error in analysis, allowing skill with low confidence',
      suggestedAction: 'flag'
    };
  }
}

/**
 * Fast contamination check using predefined patterns
 */
function performQuickContaminationCheck(
  skill: string, 
  context: JobContext
): ContaminationResult {
  const industryPatterns = INDUSTRY_SKILL_PATTERNS[context.industry];
  
  if (!industryPatterns) {
    // Unknown industry, default to general patterns
    return {
      isContaminated: false,
      confidence: 0.6,
      reason: 'Unknown industry, allowing skill',
      suggestedAction: 'flag'
    };
  }

  // Check if skill is explicitly forbidden for this industry
  const isForbidden = industryPatterns.forbidden.some((forbiddenSkill: string) => 
    skill.includes(forbiddenSkill) || forbiddenSkill.includes(skill)
  );

  if (isForbidden) {
    logger.warn(`🚨 CONTAMINATION DETECTED: "${skill}" forbidden in ${context.industry}`, {
      skill,
      industry: context.industry,
      jobTitle: context.jobTitle
    });

    return {
      isContaminated: true,
      confidence: 0.95,
      reason: `Skill "${skill}" is from a different industry and doesn't belong in ${context.industry}`,
      suggestedAction: 'block'
    };
  }

  // Check if skill is explicitly allowed
  const isAllowed = industryPatterns.allowed.some((allowedSkill: string) =>
    skill.includes(allowedSkill) || allowedSkill.includes(skill)
  );

  if (isAllowed) {
    return {
      isContaminated: false,
      confidence: 0.9,
      reason: `Skill "${skill}" is appropriate for ${context.industry}`,
      suggestedAction: 'block' // This means don't block it
    };
  }

  // Check general skills (can appear in any industry)
  const generalPatterns = INDUSTRY_SKILL_PATTERNS.general;
  const isGeneralSkill = generalPatterns.allowed.some((generalSkill: string) =>
    skill.includes(generalSkill) || generalSkill.includes(skill)
  );

  if (isGeneralSkill) {
    return {
      isContaminated: false,
      confidence: 0.8,
      reason: `"${skill}" is a general business skill acceptable in any industry`,
      suggestedAction: 'block' // Don't block general skills
    };
  }

  // Unknown skill - flag for review but don't block
  return {
    isContaminated: false,
    confidence: 0.4,
    reason: `Skill "${skill}" not recognized, allowing with low confidence`,
    suggestedAction: 'flag'
  };
}

/**
 * Deep contamination analysis using context and fuzzy matching
 */
async function performDeepContaminationAnalysis(
  skill: string,
  context: JobContext  
): Promise<ContaminationResult> {
  // For now, return the quick check result
  // This can be enhanced with AI/ML analysis later
  return performQuickContaminationCheck(skill, context);
}

/**
 * Determine job industry from job description text
 */
export function detectJobIndustry(jobTitle: string, jobDescription: string): JobContext['industry'] {
  const text = (jobTitle + ' ' + jobDescription).toLowerCase();
  
  // Pharmaceutical indicators
  const pharmaKeywords = [
    'pharmaceutical', 'pharma', 'drug', 'clinical', 'fda', 'medical',
    'biotechnology', 'biotech', 'regulatory', 'gmp', 'compliance'
  ];
  
  // Technology indicators  
  const techKeywords = [
    'software', 'developer', 'programming', 'engineer', 'technology',
    'tech', 'it', 'development', 'coding', 'digital', 'cloud', 'data'
  ];
  
  // Finance indicators
  const financeKeywords = [
    'finance', 'financial', 'banking', 'investment', 'trading', 'portfolio',
    'wealth', 'asset', 'risk', 'analyst', 'advisor'
  ];

  // Count matches for each industry
  const pharmaMatches = pharmaKeywords.filter(keyword => text.includes(keyword)).length;
  const techMatches = techKeywords.filter(keyword => text.includes(keyword)).length;
  const financeMatches = financeKeywords.filter(keyword => text.includes(keyword)).length;

  // Return the industry with most matches
  if (pharmaMatches > techMatches && pharmaMatches > financeMatches) {
    return 'pharmaceutical';
  }
  if (techMatches > pharmaMatches && techMatches > financeMatches) {
    return 'technology';  
  }
  if (financeMatches > pharmaMatches && financeMatches > techMatches) {
    return 'finance';
  }

  // Default to general if unclear
  return 'general';
}

/**
 * Batch process skills to detect contamination
 */
export async function batchDetectContamination(
  skills: string[],
  context: JobContext
): Promise<Array<{ skill: string; result: ContaminationResult }>> {
  const results = [];
  
  for (const skill of skills) {
    const result = await detectSkillContamination(skill, context);
    results.push({ skill, result });
  }
  
  return results;
}

/**
 * Clean contaminated skills from a skill array
 */
export async function cleanContaminatedSkills(
  skills: string[],
  context: JobContext
): Promise<{
  cleanSkills: string[];
  blockedSkills: string[];
  flaggedSkills: string[];
}> {
  const results = await batchDetectContamination(skills, context);
  
  const cleanSkills: string[] = [];
  const blockedSkills: string[] = [];
  const flaggedSkills: string[] = [];
  
  for (const { skill, result } of results) {
    if (result.isContaminated && result.suggestedAction === 'block') {
      blockedSkills.push(skill);
    } else if (result.suggestedAction === 'flag') {
      flaggedSkills.push(skill);
      cleanSkills.push(skill); // Include but mark as low confidence
    } else {
      cleanSkills.push(skill);
    }
  }
  
  logger.info('Contamination cleaning results:', {
    totalSkills: skills.length,
    cleanSkills: cleanSkills.length,
    blockedSkills: blockedSkills.length,
    flaggedSkills: flaggedSkills.length,
    industry: context.industry
  });
  
  return { cleanSkills, blockedSkills, flaggedSkills };
}