/**
 * Match Insights Generator
 * Converts technical matching data into actionable user insights
 */

import { logger } from './logger';
import { ESCOSkill } from './esco-skill-extractor';

export interface MatchInsights {
  matchStrength: 'EXCELLENT' | 'STRONG' | 'MODERATE' | 'WEAK';
  overallScore: number;
  keyStrengths: string[];
  areasToExplore: string[];
  interviewFocus: string[];
  riskFactors: string[];
  domainExpertise?: {
    domain: string;
    level: 'Expert' | 'Experienced' | 'Familiar' | 'Limited';
    bonus: number;
  };
  summary: string;
}

export interface MatchAnalysisInput {
  matchPercentage: number;
  matchedSkills: Array<{
    skill: string;
    matchPercentage: number;
    category?: string;
    importance?: string;
  }>;
  missingSkills: string[];
  candidateStrengths: string[];
  candidateWeaknesses: string[];
  scoringDimensions: {
    skills: number;
    experience: number;
    education: number;
    semantic: number;
    overall: number;
  };
  escoSkills?: ESCOSkill[];
  pharmaRelated?: boolean;
  analysisMethod: string;
  confidence: number;
}

/**
 * Generate user-focused match insights from technical analysis
 */
export function generateMatchInsights(
  input: MatchAnalysisInput,
  resumeText?: string,
  jobText?: string
): MatchInsights {
  try {
    logger.info('Generating match insights', {
      matchPercentage: input.matchPercentage,
      skillsCount: input.matchedSkills.length,
      missingSkillsCount: input.missingSkills.length,
      pharmaRelated: input.pharmaRelated
    });

    // Determine match strength
    const matchStrength = determineMatchStrength(input.matchPercentage);
    
    // Generate key strengths based on scoring dimensions
    const keyStrengths = generateKeyStrengths(input);
    
    // Generate areas to explore (constructive version of weaknesses)
    const areasToExplore = generateAreasToExplore(input);
    
    // Generate interview focus points
    const interviewFocus = generateInterviewFocus(input);
    
    // Identify risk factors
    const riskFactors = generateRiskFactors(input);
    
    // Domain expertise assessment
    const domainExpertise = assessDomainExpertise(input);
    
    // Generate summary
    const summary = generateSummary(matchStrength, input.matchPercentage, domainExpertise);

    const insights: MatchInsights = {
      matchStrength,
      overallScore: input.matchPercentage,
      keyStrengths,
      areasToExplore,
      interviewFocus,
      riskFactors,
      domainExpertise,
      summary
    };

    logger.info('Match insights generated successfully', {
      matchStrength,
      strengthsCount: keyStrengths.length,
      areasToExploreCount: areasToExplore.length,
      interviewFocusCount: interviewFocus.length,
      hasDomainExpertise: !!domainExpertise
    });

    return insights;
  } catch (error) {
    logger.error('Failed to generate match insights', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    // Fallback insights
    return {
      matchStrength: 'MODERATE',
      overallScore: input.matchPercentage,
      keyStrengths: ['Resume successfully analyzed'],
      areasToExplore: ['Review candidate background in detail'],
      interviewFocus: ['General experience and skills'],
      riskFactors: [],
      summary: `${input.matchPercentage}% match - Review recommended`
    };
  }
}

function determineMatchStrength(matchPercentage: number): MatchInsights['matchStrength'] {
  if (matchPercentage >= 85) return 'EXCELLENT';
  if (matchPercentage >= 70) return 'STRONG';
  if (matchPercentage >= 55) return 'MODERATE';
  return 'WEAK';
}

function generateKeyStrengths(input: MatchAnalysisInput): string[] {
  const strengths: string[] = [];
  
  // Skills assessment
  if (input.scoringDimensions.skills >= 80) {
    const skillCount = input.matchedSkills.length;
    const topSkills = input.matchedSkills.slice(0, 3).map(s => s.skill);
    strengths.push(`Excellent skills match with ${skillCount} relevant skills including ${topSkills.join(', ')}`);
  } else if (input.scoringDimensions.skills >= 60) {
    strengths.push(`Good skills foundation with key competencies covered`);
  }

  // Experience assessment  
  if (input.scoringDimensions.experience >= 85) {
    strengths.push(`Exceeds experience requirements with strong track record`);
  } else if (input.scoringDimensions.experience >= 70) {
    strengths.push(`Meets experience requirements with relevant background`);
  }

  // Education assessment
  if (input.scoringDimensions.education >= 85) {
    strengths.push(`Education perfectly aligns with role requirements`);
  } else if (input.scoringDimensions.education >= 70) {
    strengths.push(`Strong educational background for the role`);
  }

  // Pharma domain bonus
  if (input.pharmaRelated) {
    const pharmaSkills = input.escoSkills?.filter(s => s.domain === 'pharmaceutical') || [];
    if (pharmaSkills.length > 10) {
      strengths.push(`Pharmaceutical domain expert with ${pharmaSkills.length} specialized skills`);
    } else if (pharmaSkills.length > 5) {
      strengths.push(`Solid pharmaceutical industry background`);
    }
  }

  // Analysis quality
  if (input.confidence >= 0.8) {
    strengths.push(`High-confidence analysis based on comprehensive data`);
  }

  return strengths.slice(0, 4); // Limit to top 4 strengths
}

function generateAreasToExplore(input: MatchAnalysisInput): string[] {
  const areas: string[] = [];
  
  // Missing critical skills
  if (input.missingSkills.length > 0) {
    const criticalMissing = input.missingSkills.slice(0, 3);
    areas.push(`Verify proficiency in ${criticalMissing.join(', ')}`);
  }

  // Experience gaps
  if (input.scoringDimensions.experience < 70) {
    areas.push(`Discuss relevant experience and transferable skills`);
  }

  // Education considerations
  if (input.scoringDimensions.education < 70) {
    areas.push(`Explore educational background and continuous learning`);
  }

  // Skills depth
  if (input.scoringDimensions.skills < 70) {
    areas.push(`Assess depth of technical skills and practical application`);
  }

  // Pharma-specific gaps
  if (input.pharmaRelated) {
    const pharmaSkills = input.escoSkills?.filter(s => s.domain === 'pharmaceutical') || [];
    if (pharmaSkills.length < 5) {
      areas.push(`Evaluate pharmaceutical industry experience and regulatory knowledge`);
    }
  }

  return areas.slice(0, 3); // Limit to top 3 areas
}

function generateInterviewFocus(input: MatchAnalysisInput): string[] {
  const focus: string[] = [];
  
  // Top matched skills
  const topSkills = input.matchedSkills.slice(0, 2).map(s => s.skill);
  if (topSkills.length > 0) {
    focus.push(`Deep dive into ${topSkills.join(' and ')} experience`);
  }

  // Domain-specific focus
  if (input.pharmaRelated) {
    const pharmaSkills = input.escoSkills?.filter(s => s.domain === 'pharmaceutical') || [];
    if (pharmaSkills.some(s => s.category === 'clinical_research')) {
      focus.push(`Clinical research methodology and trial management`);
    }
    if (pharmaSkills.some(s => s.category === 'regulatory_affairs')) {
      focus.push(`Regulatory compliance and submission processes`);
    }
  }

  // Experience-based focus
  if (input.scoringDimensions.experience >= 80) {
    focus.push(`Leadership experience and team management capabilities`);
  } else {
    focus.push(`Problem-solving approach and adaptability`);
  }

  // Skills application
  focus.push(`Real-world application of key technical skills`);

  return focus.slice(0, 4); // Limit to top 4 focus areas
}

function generateRiskFactors(input: MatchAnalysisInput): string[] {
  const risks: string[] = [];
  
  // Low overall match
  if (input.matchPercentage < 60) {
    risks.push(`Below-average match may indicate skills gap`);
  }

  // Critical missing skills
  if (input.missingSkills.length > 5) {
    risks.push(`Multiple missing skills may require extensive training`);
  }

  // Low experience score
  if (input.scoringDimensions.experience < 50) {
    risks.push(`Experience level may not meet role demands`);
  }

  // Low confidence
  if (input.confidence < 0.5) {
    risks.push(`Limited data available for comprehensive assessment`);
  }

  return risks.slice(0, 2); // Limit to top 2 risk factors
}

function assessDomainExpertise(input: MatchAnalysisInput): MatchInsights['domainExpertise'] {
  if (!input.pharmaRelated) return undefined;

  const pharmaSkills = input.escoSkills?.filter(s => s.domain === 'pharmaceutical') || [];
  const pharmaSkillCount = pharmaSkills.length;
  
  let level: 'Expert' | 'Experienced' | 'Familiar' | 'Limited';
  let bonus = 0;

  if (pharmaSkillCount >= 15) {
    level = 'Expert';
    bonus = 5;
  } else if (pharmaSkillCount >= 10) {
    level = 'Experienced';  
    bonus = 3;
  } else if (pharmaSkillCount >= 5) {
    level = 'Familiar';
    bonus = 2;
  } else {
    level = 'Limited';
    bonus = 0;
  }

  return {
    domain: 'Pharmaceutical',
    level,
    bonus
  };
}

function generateSummary(
  matchStrength: MatchInsights['matchStrength'],
  matchPercentage: number,
  domainExpertise?: MatchInsights['domainExpertise']
): string {
  const strengthText = {
    'EXCELLENT': 'Exceptional candidate',
    'STRONG': 'Strong candidate', 
    'MODERATE': 'Viable candidate',
    'WEAK': 'Potential candidate'
  }[matchStrength];

  let summary = `${matchPercentage}% Match - ${strengthText}`;
  
  if (domainExpertise && domainExpertise.level !== 'Limited') {
    summary += ` with ${domainExpertise.level.toLowerCase()} ${domainExpertise.domain.toLowerCase()} background`;
  }

  return summary;
}