import { logger } from "./logger";
import { generateEmbedding, cosineSimilarity } from "./embeddings";
import stringSimilarity from "string-similarity";

export interface ExperienceMatchResult {
  score: number;
  explanation: string;
  breakdown: {
    yearsScore: number;
    domainScore: number;
    seniorityScore: number;
    roleRelevanceScore: number;
  };
  insights: {
    yearsComparison: string;
    domainAlignment: string;
    seniorityLevel: string;
    roleRelevance: string;
  };
}

interface ExperienceAnalysis {
  years: number;
  domains: string[];
  seniorityLevel: 'junior' | 'mid' | 'senior' | 'lead' | 'executive';
  roles: string[];
  technologies: string[];
  responsibilities: string[];
}

/**
 * Enhanced experience scoring that analyzes multiple dimensions:
 * 1. Years of experience (30% weight)
 * 2. Domain/industry relevance (35% weight) 
 * 3. Seniority level alignment (20% weight)
 * 4. Role relevance (15% weight)
 */
export async function scoreExperienceEnhanced(
  resumeExperience: string,
  jobExperience: string,
): Promise<ExperienceMatchResult> {
  if (!resumeExperience || !jobExperience) {
    return {
      score: 30,
      explanation: "Insufficient experience information to perform detailed analysis",
      breakdown: { yearsScore: 30, domainScore: 30, seniorityScore: 30, roleRelevanceScore: 30 },
      insights: {
        yearsComparison: "Experience information incomplete",
        domainAlignment: "Cannot assess domain alignment",
        seniorityLevel: "Cannot determine seniority level",
        roleRelevance: "Cannot assess role relevance",
      },
    };
  }

  try {
    // Analyze both resume and job experience
    const resumeAnalysis = await analyzeExperience(resumeExperience);
    const jobAnalysis = await analyzeExperience(jobExperience);

    logger.debug("Experience analysis completed", {
      resumeYears: resumeAnalysis.years,
      jobRequiredYears: jobAnalysis.years,
      resumeDomains: resumeAnalysis.domains,
      jobDomains: jobAnalysis.domains,
      resumeSeniority: resumeAnalysis.seniorityLevel,
      jobSeniority: jobAnalysis.seniorityLevel,
    });

    // Calculate dimension scores
    const yearsScore = calculateYearsScore(resumeAnalysis.years, jobAnalysis.years);
    const domainScore = await calculateDomainScore(resumeAnalysis.domains, jobAnalysis.domains);
    const seniorityScore = calculateSeniorityScore(resumeAnalysis.seniorityLevel, jobAnalysis.seniorityLevel);
    const roleRelevanceScore = await calculateRoleRelevanceScore(
      resumeAnalysis.roles,
      jobAnalysis.roles,
      resumeAnalysis.responsibilities,
      jobAnalysis.responsibilities,
    );

    // Weighted total score
    const totalScore = Math.round(
      yearsScore * 0.30 +
      domainScore * 0.35 +
      seniorityScore * 0.20 +
      roleRelevanceScore * 0.15
    );

    // Generate insights
    const insights = generateExperienceInsights(
      resumeAnalysis,
      jobAnalysis,
      { yearsScore, domainScore, seniorityScore, roleRelevanceScore }
    );

    return {
      score: Math.max(0, Math.min(100, totalScore)),
      explanation: generateExperienceExplanation(totalScore, insights),
      breakdown: { yearsScore, domainScore, seniorityScore, roleRelevanceScore },
      insights,
    };
  } catch (error) {
    logger.error("Enhanced experience scoring failed:", error);
    
    // Fallback to basic scoring
    return fallbackExperienceScoring(resumeExperience, jobExperience);
  }
}

/**
 * Analyze experience text to extract structured information
 */
async function analyzeExperience(experienceText: string): Promise<ExperienceAnalysis> {
  const text = experienceText.toLowerCase();

  return {
    years: extractYearsFromText(text),
    domains: extractDomains(text),
    seniorityLevel: extractSeniorityLevel(text),
    roles: extractRoles(text),
    technologies: extractTechnologies(text),
    responsibilities: extractResponsibilities(text),
  };
}

/**
 * Extract years of experience using multiple patterns
 */
function extractYearsFromText(text: string): number {
  const patterns = [
    /(\d+)\+?\s*years?\s*(?:of\s*)?experience/i,
    /(\d+)\+?\s*years?\s*in/i,
    /(\d+)\+?\s*yrs?\s*(?:of\s*)?experience/i,
    /experience:\s*(\d+)\+?\s*years?/i,
    /(\d+)\+?\s*years?\s*working/i,
    /(\d+)\+?\s*years?\s*background/i,
    /minimum\s*(\d+)\+?\s*years?/i,
    /at\s*least\s*(\d+)\+?\s*years?/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return parseInt(match[1]);
    }
  }

  return -1; // No years found
}

/**
 * Extract domains/industries from experience text
 */
function extractDomains(text: string): string[] {
  const domainKeywords = [
    'fintech', 'finance', 'banking', 'financial services',
    'healthcare', 'medical', 'pharmaceutical', 'biotech',
    'e-commerce', 'retail', 'marketplace', 'shopping',
    'education', 'edtech', 'learning', 'academic',
    'gaming', 'entertainment', 'media', 'streaming',
    'saas', 'enterprise', 'b2b', 'b2c',
    'startup', 'scale-up', 'fortune 500',
    'consulting', 'agency', 'services',
    'manufacturing', 'logistics', 'supply chain',
    'real estate', 'proptech', 'construction',
    'automotive', 'transportation', 'mobility',
    'energy', 'renewable', 'sustainability',
    'cybersecurity', 'security', 'privacy',
    'ai', 'machine learning', 'data science',
    'blockchain', 'crypto', 'web3',
    'iot', 'embedded', 'hardware',
    'cloud', 'devops', 'infrastructure',
  ];

  const foundDomains: string[] = [];
  for (const domain of domainKeywords) {
    if (text.includes(domain)) {
      foundDomains.push(domain);
    }
  }

  return foundDomains;
}

/**
 * Extract seniority level from experience text
 */
function extractSeniorityLevel(text: string): 'junior' | 'mid' | 'senior' | 'lead' | 'executive' {
  // Executive level indicators
  if (text.match(/\b(cto|ceo|cfo|vp|vice president|director|head of|chief|executive)\b/i)) {
    return 'executive';
  }

  // Lead level indicators
  if (text.match(/\b(lead|principal|staff|architect|tech lead|team lead|engineering manager)\b/i)) {
    return 'lead';
  }

  // Senior level indicators
  if (text.match(/\b(senior|sr\.?|expert|specialist|10\+?\s*years|[8-9]\+?\s*years)\b/i)) {
    return 'senior';
  }

  // Junior level indicators
  if (text.match(/\b(junior|jr\.?|entry|graduate|intern|[1-2]\+?\s*years)\b/i)) {
    return 'junior';
  }

  // Mid level (default for 3-7 years or no clear indicators)
  return 'mid';
}

/**
 * Extract job roles from experience text
 */
function extractRoles(text: string): string[] {
  const rolePatterns = [
    'software engineer', 'developer', 'programmer', 'coder',
    'full stack', 'frontend', 'backend', 'mobile developer',
    'data scientist', 'data engineer', 'data analyst',
    'product manager', 'project manager', 'program manager',
    'designer', 'ux designer', 'ui designer', 'product designer',
    'devops', 'sre', 'system administrator', 'cloud engineer',
    'qa engineer', 'test engineer', 'quality assurance',
    'security engineer', 'cybersecurity specialist',
    'machine learning engineer', 'ai engineer',
    'consultant', 'analyst', 'specialist', 'coordinator',
  ];

  const foundRoles: string[] = [];
  for (const role of rolePatterns) {
    if (text.includes(role)) {
      foundRoles.push(role);
    }
  }

  return foundRoles;
}

/**
 * Extract technologies from experience text
 */
function extractTechnologies(text: string): string[] {
  const techKeywords = [
    'javascript', 'typescript', 'python', 'java', 'c#', 'go', 'rust', 'php',
    'react', 'vue', 'angular', 'node.js', 'express', 'django', 'flask',
    'aws', 'azure', 'gcp', 'docker', 'kubernetes', 'terraform',
    'mysql', 'postgresql', 'mongodb', 'redis', 'elasticsearch',
    'git', 'jenkins', 'ci/cd', 'agile', 'scrum',
  ];

  const foundTech: string[] = [];
  for (const tech of techKeywords) {
    if (text.includes(tech)) {
      foundTech.push(tech);
    }
  }

  return foundTech;
}

/**
 * Extract responsibilities from experience text
 */
function extractResponsibilities(text: string): string[] {
  const responsibilityKeywords = [
    'developed', 'built', 'created', 'designed', 'implemented',
    'managed', 'led', 'supervised', 'coordinated', 'oversaw',
    'analyzed', 'optimized', 'improved', 'enhanced', 'modernized',
    'deployed', 'maintained', 'supported', 'troubleshooted',
    'collaborated', 'worked with', 'partnered', 'consulted',
    'architecture', 'scalability', 'performance', 'security',
    'testing', 'debugging', 'monitoring', 'documentation',
  ];

  const foundResponsibilities: string[] = [];
  for (const responsibility of responsibilityKeywords) {
    if (text.includes(responsibility)) {
      foundResponsibilities.push(responsibility);
    }
  }

  return foundResponsibilities;
}

/**
 * Calculate years score (30% weight)
 */
function calculateYearsScore(resumeYears: number, jobYears: number): number {
  if (resumeYears < 0 || jobYears < 0) {
    return 50; // Default score when years cannot be determined
  }

  if (resumeYears >= jobYears * 1.5) {
    return 100; // Significantly exceeds requirement
  } else if (resumeYears >= jobYears) {
    return 90; // Meets or exceeds requirement
  } else if (resumeYears >= jobYears * 0.8) {
    return 75; // Close to requirement
  } else if (resumeYears >= jobYears * 0.6) {
    return 60; // Somewhat below requirement
  } else {
    return 30; // Significantly below requirement
  }
}

/**
 * Calculate domain relevance score (35% weight)
 */
async function calculateDomainScore(resumeDomains: string[], jobDomains: string[]): Promise<number> {
  if (resumeDomains.length === 0 || jobDomains.length === 0) {
    return 50; // Default score when domains cannot be determined
  }

  // Direct domain matches
  const directMatches = resumeDomains.filter(domain => 
    jobDomains.some(jobDomain => 
      domain.includes(jobDomain) || jobDomain.includes(domain)
    )
  );

  if (directMatches.length > 0) {
    return Math.min(100, 80 + (directMatches.length * 10));
  }

  // Semantic similarity for domains
  try {
    const resumeDomainsText = resumeDomains.join(' ');
    const jobDomainsText = jobDomains.join(' ');
    
    const [resumeEmbedding, jobEmbedding] = await Promise.all([
      generateEmbedding(resumeDomainsText),
      generateEmbedding(jobDomainsText),
    ]);

    const similarity = cosineSimilarity(resumeEmbedding, jobEmbedding);
    return Math.round(similarity * 100);
  } catch (error) {
    logger.warn("Domain semantic similarity calculation failed:", error);
    
    // Fallback to string similarity
    const resumeDomainsText = resumeDomains.join(' ');
    const jobDomainsText = jobDomains.join(' ');
    const similarity = stringSimilarity.compareTwoStrings(resumeDomainsText, jobDomainsText);
    return Math.round(similarity * 100);
  }
}

/**
 * Calculate seniority alignment score (20% weight)
 */
function calculateSeniorityScore(
  resumeSeniority: string,
  jobSeniority: string,
): number {
  const seniorityLevels = {
    junior: 1,
    mid: 2,
    senior: 3,
    lead: 4,
    executive: 5,
  };

  const resumeLevel = seniorityLevels[resumeSeniority as keyof typeof seniorityLevels] || 2;
  const jobLevel = seniorityLevels[jobSeniority as keyof typeof seniorityLevels] || 2;

  if (resumeLevel === jobLevel) {
    return 100; // Perfect match
  } else if (Math.abs(resumeLevel - jobLevel) === 1) {
    return 80; // One level difference
  } else if (resumeLevel > jobLevel) {
    return 70; // Overqualified
  } else {
    return 40; // Underqualified
  }
}

/**
 * Calculate role relevance score (15% weight)
 */
async function calculateRoleRelevanceScore(
  resumeRoles: string[],
  jobRoles: string[],
  resumeResponsibilities: string[],
  jobResponsibilities: string[],
): Promise<number> {
  let roleScore = 50; // Default
  let responsibilityScore = 50; // Default

  // Role matching
  if (resumeRoles.length > 0 && jobRoles.length > 0) {
    const roleMatches = resumeRoles.filter(role =>
      jobRoles.some(jobRole =>
        role.includes(jobRole) || jobRole.includes(role)
      )
    );
    roleScore = roleMatches.length > 0 ? Math.min(100, 70 + (roleMatches.length * 15)) : 30;
  }

  // Responsibility matching
  if (resumeResponsibilities.length > 0 && jobResponsibilities.length > 0) {
    const responsibilityMatches = resumeResponsibilities.filter(resp =>
      jobResponsibilities.some(jobResp =>
        resp.includes(jobResp) || jobResp.includes(resp)
      )
    );
    responsibilityScore = responsibilityMatches.length > 0 ? Math.min(100, 60 + (responsibilityMatches.length * 10)) : 40;
  }

  // Weighted combination of role and responsibility scores
  return Math.round(roleScore * 0.6 + responsibilityScore * 0.4);
}

/**
 * Generate experience insights
 */
function generateExperienceInsights(
  resumeAnalysis: ExperienceAnalysis,
  jobAnalysis: ExperienceAnalysis,
  scores: { yearsScore: number; domainScore: number; seniorityScore: number; roleRelevanceScore: number }
): {
  yearsComparison: string;
  domainAlignment: string;
  seniorityLevel: string;
  roleRelevance: string;
} {
  const yearsComparison = resumeAnalysis.years >= 0 && jobAnalysis.years >= 0
    ? `Candidate has ${resumeAnalysis.years} years vs ${jobAnalysis.years} required`
    : "Experience duration could not be determined";

  const domainAlignment = resumeAnalysis.domains.length > 0 && jobAnalysis.domains.length > 0
    ? `Domain match: ${resumeAnalysis.domains.join(', ')} ↔ ${jobAnalysis.domains.join(', ')}`
    : "Domain information limited";

  const seniorityLevel = `Candidate level: ${resumeAnalysis.seniorityLevel} → Required: ${jobAnalysis.seniorityLevel}`;

  const roleRelevance = resumeAnalysis.roles.length > 0
    ? `Previous roles: ${resumeAnalysis.roles.slice(0, 3).join(', ')}`
    : "Role information limited";

  return {
    yearsComparison,
    domainAlignment,
    seniorityLevel,
    roleRelevance,
  };
}

/**
 * Generate experience explanation
 */
function generateExperienceExplanation(
  totalScore: number,
  insights: any,
): string {
  if (totalScore >= 85) {
    return `Excellent experience alignment (${totalScore}%). ${insights.yearsComparison}. Strong domain match and appropriate seniority level.`;
  } else if (totalScore >= 70) {
    return `Good experience alignment (${totalScore}%). ${insights.yearsComparison}. Solid foundation with relevant background.`;
  } else if (totalScore >= 50) {
    return `Moderate experience alignment (${totalScore}%). ${insights.yearsComparison}. Some relevant experience but gaps in domain or seniority.`;
  } else {
    return `Limited experience alignment (${totalScore}%). ${insights.yearsComparison}. Significant gaps in required experience areas.`;
  }
}

/**
 * Fallback experience scoring when enhanced analysis fails
 */
function fallbackExperienceScoring(
  resumeExperience: string,
  jobExperience: string,
): ExperienceMatchResult {
  const resumeText = resumeExperience.toLowerCase();
  const jobText = jobExperience.toLowerCase();

  // Basic years comparison
  const resumeYears = extractYearsFromText(resumeText);
  const requiredYears = extractYearsFromText(jobText);
  const yearsScore = calculateYearsScore(resumeYears, requiredYears);

  // Basic text similarity
  const similarity = stringSimilarity.compareTwoStrings(resumeText, jobText);
  const textScore = Math.round(similarity * 100);

  const totalScore = Math.round((yearsScore * 0.6) + (textScore * 0.4));

  return {
    score: totalScore,
    explanation: `Basic experience analysis: ${totalScore}% match based on years and description similarity`,
    breakdown: {
      yearsScore: yearsScore,
      domainScore: textScore,
      seniorityScore: 50,
      roleRelevanceScore: 50,
    },
    insights: {
      yearsComparison: resumeYears >= 0 && requiredYears >= 0 
        ? `${resumeYears} years vs ${requiredYears} required`
        : "Experience duration unclear",
      domainAlignment: `Text similarity: ${Math.round(similarity * 100)}%`,
      seniorityLevel: "Could not determine seniority levels",
      roleRelevance: "Role analysis unavailable in fallback mode",
    },
  };
}