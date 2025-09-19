/**
 * Degraded Heuristics for AI Provider Failover
 * 
 * Provides ML-only analysis when all AI providers are unavailable
 * Ensures the system remains functional during widespread AI outages
 */

import { AnalyzeResumeResponse, AnalyzeJobDescriptionResponse, MatchAnalysisResponse, BiasAnalysisResponse, SkillMatch, ScoringDimensions } from "@shared/schema";
import { ResumeId, JobId, AnalysisId, createBrandedId } from "@shared/api-contracts";
import { logger } from "../lib/logger";

/**
 * Degraded resume analysis using keyword extraction and pattern matching
 */
export async function getDegradedResumeAnalysis(resumeText: string): Promise<AnalyzeResumeResponse> {
  logger.info('Using degraded mode for resume analysis');

  // Basic keyword extraction for skills
  const skills = extractSkillsFromText(resumeText);
  
  // Extract basic information using patterns
  const email = extractEmail(resumeText);
  const phone = extractPhone(resumeText);
  const name = extractName(resumeText);
  
  // Basic experience extraction
  const experience = extractExperience(resumeText);
  const education = extractEducation(resumeText);

  return {
    id: 0 as ResumeId,
    filename: "degraded-analysis",
    analyzedData: {
      name: name || "Name not detected",
      skills: skills,
      experience: experience.summary,
      education: education.map(edu => edu.degree),
      summary: "Resume analysis completed in degraded mode using keyword extraction",
      keyStrengths: skills.slice(0, 3), // Top 3 skills as strengths
      contactInfo: {
        email: email || "",
        phone: phone || "",
        location: extractLocation(resumeText) || ""
      }
    },
    processingTime: 100, // Fast processing
    confidence: 60, // Lower confidence for degraded mode
    // Convenience properties for backward compatibility
    skills: skills,
    experience: experience.positions,
    education: education
  };
}

/**
 * Degraded job description analysis using keyword extraction
 */
export async function getDegradedJobAnalysis(title: string, description: string): Promise<AnalyzeJobDescriptionResponse> {
  logger.info('Using degraded mode for job description analysis');

  const fullText = `${title}\n${description}`;
  
  // Extract required skills using common patterns
  const requiredSkills = extractSkillsFromText(fullText);
  const experienceLevel = extractExperienceLevel(fullText);
  const responsibilities = extractResponsibilities(description);

  return {
    id: 0 as JobId,
    title: title,
    analyzedData: {
      requiredSkills: requiredSkills,
      preferredSkills: [], // Not extracted in degraded mode
      responsibilities: responsibilities,
      experienceLevel: experienceLevel,
      summary: "Job description analysis completed in degraded mode using keyword extraction",
      salaryRange: {
        min: 0,
        max: 0,
        currency: "USD"
      }
    },
    processingTime: 50,
    confidence: 60,
    // Convenience properties
    requiredSkills: requiredSkills,
    experience: experienceLevel
  };
}

/**
 * Degraded match analysis using keyword overlap and ML scoring
 */
export async function getDegradedMatchAnalysis(
  resumeAnalysis: AnalyzeResumeResponse,
  jobAnalysis: AnalyzeJobDescriptionResponse
): Promise<MatchAnalysisResponse> {
  logger.info('Using degraded mode for match analysis');

  // Get skills from both analyses
  const resumeSkills = resumeAnalysis.skills || [];
  const jobSkills = jobAnalysis.requiredSkills || [];

  // Calculate skill overlap and convert to SkillMatch objects
  const matchedSkills: SkillMatch[] = resumeSkills
    .filter(skill => 
      jobSkills.some(jobSkill => 
        skill.toLowerCase().includes(jobSkill.toLowerCase()) ||
        jobSkill.toLowerCase().includes(skill.toLowerCase())
      )
    )
    .map(skill => ({
      skill,
      matchPercentage: 80, // Conservative match percentage for degraded mode
      category: 'technical',
      importance: 'important' as const,
      source: 'exact' as const
    }));

  const missingSkills = jobSkills.filter(jobSkill =>
    !resumeSkills.some(resumeSkill =>
      resumeSkill.toLowerCase().includes(jobSkill.toLowerCase()) ||
      jobSkill.toLowerCase().includes(resumeSkill.toLowerCase())
    )
  );

  // Simple matching algorithm
  const skillMatchPercentage = jobSkills.length > 0 
    ? (matchedSkills.length / jobSkills.length) * 100 
    : 0;

  // Experience matching
  const experienceMatch = calculateExperienceMatch(
    resumeAnalysis.experience || [],
    jobAnalysis.experience || ""
  );

  // Overall match percentage (weighted average)
  const matchPercentage = Math.round(
    (skillMatchPercentage * 0.7) + (experienceMatch * 0.3)
  );

  // Create scoring dimensions for degraded mode
  const scoringDimensions: ScoringDimensions = {
    skills: skillMatchPercentage,
    experience: experienceMatch,
    education: 70, // Default moderate score
    semantic: 50, // Limited semantic analysis in degraded mode
    overall: matchPercentage
  };

  // Create a proper MatchAnalysisResponse structure
  return {
    analysisId: 0 as AnalysisId, // Temporary ID for degraded mode
    jobId: 0 as JobId, // This should ideally come from parameters
    results: [{
      resumeId: 0 as ResumeId, // This should ideally come from parameters
      filename: "degraded-analysis",
      candidateName: resumeAnalysis.analyzedData?.name || "Unknown",
      matchPercentage: Math.min(100, Math.max(0, matchPercentage)),
      matchedSkills: matchedSkills,
      missingSkills: missingSkills,
      candidateStrengths: [
        "Skills analysis completed using keyword matching",
        `${matchedSkills.length} relevant skills identified`
      ],
      candidateWeaknesses: missingSkills.length > 0 
        ? [`Missing ${missingSkills.length} required skills`]
        : [],
      recommendations: [
        "Analysis completed in degraded mode - consider manual review",
        "Skill matching based on keyword overlap only"
      ],
      confidenceLevel: "low" as const, // Always low confidence in degraded mode
      scoringDimensions: scoringDimensions
    }],
    processingTime: 100,
    metadata: {
      aiProvider: "degraded-heuristics",
      modelVersion: "keyword-matching-v1",
      totalCandidates: 1,
      processedCandidates: 1,
      failedCandidates: 0
    }
  };
}

/**
 * Degraded bias analysis using local pattern detection
 */
export async function getDegradedBiasAnalysis(title: string, description: string): Promise<BiasAnalysisResponse> {
  logger.info('Using degraded mode for bias analysis');

  try {
    // Use existing local bias detection if available
    const { detectJobBias } = await import("../lib/bias-detection");
    const result = await detectJobBias(`${title}\n\n${description}`);

    return {
      hasBias: result.hasBias,
      biasTypes: result.detectedBiases?.map(b => b.type) || [],
      biasedPhrases: result.detectedBiases?.map(b => ({
        phrase: b.evidence?.[0] || b.type,
        reason: b.description
      })) || [],
      suggestions: result.recommendations || [
        "Manual review recommended - degraded analysis mode"
      ],
      improvedDescription: description, // No improvements in degraded mode
      overallScore: Math.max(50, 100 - result.biasScore), // Conservative scoring
      summary: "Bias analysis completed in degraded mode using local pattern matching"
    };
  } catch (error) {
    logger.warn('Local bias detection failed, using minimal analysis', error);
    
    // Minimal bias analysis if local detection fails
    return {
      hasBias: false,
      biasTypes: [],
      biasedPhrases: [],
      suggestions: [
        "Bias analysis temporarily unavailable - manual review strongly recommended",
        "Consider reviewing language for inclusivity and neutrality"
      ],
      improvedDescription: description,
      overallScore: 75, // Neutral score
      summary: "Bias analysis service temporarily unavailable"
    };
  }
}

// Helper functions for text extraction

function extractSkillsFromText(text: string): string[] {
  // Common technical skills patterns
  const skillPatterns = [
    // Programming languages
    /\b(JavaScript|TypeScript|Python|Java|C\+\+|C#|PHP|Ruby|Go|Rust|Swift|Kotlin)\b/gi,
    // Frameworks and libraries
    /\b(React|Angular|Vue|Node\.js|Express|Django|Flask|Spring|Laravel|Rails)\b/gi,
    // Databases
    /\b(MySQL|PostgreSQL|MongoDB|Redis|SQLite|Oracle|SQL Server)\b/gi,
    // Cloud platforms
    /\b(AWS|Azure|Google Cloud|GCP|Docker|Kubernetes|Terraform)\b/gi,
    // Tools and methodologies
    /\b(Git|Agile|Scrum|DevOps|CI\/CD|REST|GraphQL|Microservices)\b/gi
  ];

  const skills = new Set<string>();
  
  for (const pattern of skillPatterns) {
    const matches = text.match(pattern);
    if (matches) {
      matches.forEach(match => skills.add(match));
    }
  }

  return Array.from(skills).slice(0, 20); // Limit to top 20 skills
}

function extractEmail(text: string): string | null {
  const emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/;
  const match = text.match(emailPattern);
  return match ? match[0] : null;
}

function extractPhone(text: string): string | null {
  const phonePattern = /(\+?1?[-.\s]?)?(\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}/;
  const match = text.match(phonePattern);
  return match ? match[0] : null;
}

function extractName(text: string): string | null {
  // Simple name extraction from first lines
  const lines = text.split('\n').slice(0, 3);
  for (const line of lines) {
    const namePattern = /^[A-Z][a-z]+ [A-Z][a-z]+/;
    const match = line.trim().match(namePattern);
    if (match) {
      return match[0];
    }
  }
  return null;
}

function extractLocation(text: string): string | null {
  const locationPattern = /\b([A-Z][a-z]+,?\s*[A-Z]{2}|[A-Z][a-z]+,?\s*[A-Z][a-z]+)\b/;
  const match = text.match(locationPattern);
  return match ? match[0] : null;
}

function extractExperience(text: string): { summary: string; positions: any[] } {
  const years = text.match(/(\d+)\+?\s*years?/gi);
  const yearCount = years ? Math.max(...years.map(y => parseInt(y))) : 0;
  
  return {
    summary: yearCount > 0 ? `${yearCount}+ years of experience detected` : "Experience level not clearly specified",
    positions: [{
      company: "Experience extraction limited in degraded mode",
      position: "Various positions detected",
      duration: yearCount > 0 ? `${yearCount}+ years` : "Duration not specified",
      description: "Detailed experience extraction requires AI analysis"
    }]
  };
}

function extractEducation(text: string): any[] {
  const degreePatterns = [
    /\b(Bachelor|Master|PhD|MBA|Associates?)\b/gi,
    /\b(B\.?S\.?|M\.?S\.?|B\.?A\.?|M\.?A\.?)\b/gi
  ];

  const degrees = new Set<string>();
  
  for (const pattern of degreePatterns) {
    const matches = text.match(pattern);
    if (matches) {
      matches.forEach(match => degrees.add(match));
    }
  }

  return Array.from(degrees).map(degree => ({
    degree: degree,
    institution: "Institution not extracted in degraded mode",
    field: "Field not extracted in degraded mode"
  }));
}

function extractExperienceLevel(text: string): string {
  const text_lower = text.toLowerCase();
  
  if (text_lower.includes('senior') || text_lower.includes('lead') || text_lower.includes('principal')) {
    return 'Senior';
  } else if (text_lower.includes('junior') || text_lower.includes('entry') || text_lower.includes('graduate')) {
    return 'Junior';
  } else if (text_lower.includes('mid') || text_lower.includes('intermediate')) {
    return 'Mid-level';
  }
  
  const years = text.match(/(\d+)\+?\s*years?/gi);
  if (years) {
    const maxYears = Math.max(...years.map(y => parseInt(y)));
    if (maxYears >= 5) return 'Senior';
    if (maxYears >= 2) return 'Mid-level';
    return 'Junior';
  }
  
  return 'Mid-level'; // Default
}

function extractResponsibilities(text: string): string[] {
  // Extract bullet points and numbered lists as responsibilities
  const lines = text.split('\n');
  const responsibilities: string[] = [];
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.match(/^[•\-\*]\s+/) || trimmed.match(/^\d+\.?\s+/)) {
      responsibilities.push(trimmed.replace(/^[•\-\*\d\.]+\s*/, ''));
    }
  }
  
  return responsibilities.slice(0, 10); // Limit to 10 responsibilities
}

function calculateExperienceMatch(
  resumeExperience: any[],
  jobExperience: string
): number {
  // Simple experience level matching
  const jobLevel = extractExperienceLevel(jobExperience);
  
  // For degraded mode, assume moderate match
  return 70; // Conservative match percentage
}