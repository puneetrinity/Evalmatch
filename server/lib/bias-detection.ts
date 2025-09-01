import { logger } from "./logger";

export interface BiasDetectionResult {
  hasBias: boolean;
  biasScore: number; // 0-100, higher means more bias
  detectedBiases: BiasType[];
  recommendations: string[];
  fairnessMetrics: {
    demographicParity: number;
    equalizedOdds: number;
    calibration: number;
  };
  explanation: string;
}

export interface BiasType {
  type: 'age' | 'gender' | 'name' | 'education' | 'location' | 'experience_gap' | 'technology' | 'industry';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  evidence: string[];
  mitigation: string;
}

export interface CandidateProfile {
  skills: string[];
  experience: string;
  education: string;
  name?: string;
  location?: string;
  technologies: string[];
  industries: string[];
  resumeText: string;
}

export interface JobProfile {
  requiredSkills: string[];
  experience: string;
  education?: string;
  location?: string;
  technologies: string[];
  industries: string[];
  jobText: string;
}

// Bias indicators and patterns
const BIAS_PATTERNS = {
  age: {
    keywords: [
      'digital native', 'fresh graduate', 'young', 'energetic', 'recent graduate',
      'mature', 'experienced professional', 'senior', 'veteran', 'seasoned'
    ],
    biasedPhrases: [
      'looking for young talent', 'prefer fresh graduates', 'digital native required',
      'too experienced', 'overqualified', 'might be too senior'
    ]
  },
  gender: {
    keywords: [
      'aggressive', 'assertive', 'dominant', 'competitive', 'ninja', 'rockstar',
      'collaborative', 'supportive', 'nurturing', 'team player'
    ],
    biasedPhrases: [
      'cultural fit', 'must fit our culture', 'team chemistry', 'personality fit'
    ]
  },
  name: {
    // Patterns that might indicate name-based bias
    suspiciousPatterns: [
      /\b[A-Z][a-z]+ [A-Z][a-z]+\b/, // Full names in text
      /foreign.{0,20}name/i,
      /difficult.{0,20}pronounce/i,
      /cultural.{0,20}background/i
    ]
  },
  education: {
    eliteBias: [
      'ivy league', 'top tier', 'prestigious university', 'elite school',
      'harvard', 'stanford', 'mit', 'oxbridge', 'top 10 university'
    ],
    degreeRequirements: [
      'degree required', 'bachelor required', 'university degree',
      'formal education', 'college degree'
    ]
  },
  location: {
    locationBias: [
      'local candidates only', 'must be in', 'located in', 'no remote',
      'onsite only', 'commutable distance'
    ]
  },
  experience: {
    gapPenalty: [
      'employment gap', 'career break', 'unemployed', 'job gap',
      'time off', 'career hiatus'
    ],
    overqualification: [
      'overqualified', 'too experienced', 'might leave', 'flight risk'
    ]
  }
};

/**
 * Detect potential bias in candidate matching algorithms
 */
export async function detectMatchingBias(
  candidate: CandidateProfile,
  job: JobProfile,
  matchScore: number,
  scoringBreakdown: { [dimension: string]: number }
): Promise<BiasDetectionResult> {
  const detectedBiases: BiasType[] = [];
  let totalBiasScore = 0;

  try {
    // 1. Check for age bias
    const ageBias = detectAgeBias(candidate, job, matchScore);
    if (ageBias) {
      detectedBiases.push(ageBias);
      totalBiasScore += getSeverityScore(ageBias.severity);
    }

    // 2. Check for gender bias (implicit through language)
    const genderBias = detectGenderBias(candidate, job, scoringBreakdown);
    if (genderBias) {
      detectedBiases.push(genderBias);
      totalBiasScore += getSeverityScore(genderBias.severity);
    }

    // 3. Check for education bias
    const educationBias = detectEducationBias(candidate, job, scoringBreakdown);
    if (educationBias) {
      detectedBiases.push(educationBias);
      totalBiasScore += getSeverityScore(educationBias.severity);
    }

    // 4. Check for location bias
    const locationBias = detectLocationBias(candidate, job, matchScore);
    if (locationBias) {
      detectedBiases.push(locationBias);
      totalBiasScore += getSeverityScore(locationBias.severity);
    }

    // 5. Check for experience gap bias
    const experienceBias = detectExperienceBias(candidate, job, scoringBreakdown);
    if (experienceBias) {
      detectedBiases.push(experienceBias);
      totalBiasScore += getSeverityScore(experienceBias.severity);
    }

    // 6. Check for technology/skill bias
    const technologyBias = detectTechnologyBias(candidate, job, scoringBreakdown);
    if (technologyBias) {
      detectedBiases.push(technologyBias);
      totalBiasScore += getSeverityScore(technologyBias.severity);
    }

    // Calculate fairness metrics
    const fairnessMetrics = calculateFairnessMetrics(
      candidate,
      job,
      matchScore,
      scoringBreakdown,
      detectedBiases
    );

    // Generate recommendations
    const recommendations = generateBiasRecommendations(detectedBiases);

    const finalBiasScore = Math.min(100, totalBiasScore);
    const hasBias = finalBiasScore > 30 || detectedBiases.some(b => b.severity === 'critical');

    return {
      hasBias,
      biasScore: finalBiasScore,
      detectedBiases,
      recommendations,
      fairnessMetrics,
      explanation: generateBiasExplanation(detectedBiases, finalBiasScore),
    };
  } catch (error) {
    logger.error("Bias detection failed:", error);
    
    // Return safe fallback
    return {
      hasBias: false,
      biasScore: 0,
      detectedBiases: [],
      recommendations: ["Bias detection temporarily unavailable"],
      fairnessMetrics: {
        demographicParity: 50,
        equalizedOdds: 50,
        calibration: 50,
      },
      explanation: "Bias analysis could not be completed",
    };
  }
}

/**
 * Detect age-related bias
 */
function detectAgeBias(
  candidate: CandidateProfile,
  job: JobProfile,
  matchScore: number
): BiasType | null {
  const evidence: string[] = [];
  let severity: BiasType['severity'] = 'low';

  // Check job description for age-biased language
  const jobText = job.jobText.toLowerCase();
  for (const phrase of BIAS_PATTERNS.age.biasedPhrases) {
    if (jobText.includes(phrase.toLowerCase())) {
      evidence.push(`Job description contains: "${phrase}"`);
      severity = 'high';
    }
  }

  // Check for age-related keywords
  for (const keyword of BIAS_PATTERNS.age.keywords) {
    if (jobText.includes(keyword.toLowerCase())) {
      evidence.push(`Age-related keyword found: "${keyword}"`);
      if (severity === 'low') severity = 'medium';
    }
  }

  // Check experience patterns that might indicate age bias
  const candidateText = candidate.resumeText.toLowerCase();
  if (candidateText.includes('decades of experience') || candidateText.includes('20+ years')) {
    if (matchScore < 60) {
      evidence.push("Candidate with extensive experience received low match score");
      severity = 'medium';
    }
  }

  if (evidence.length === 0) return null;

  return {
    type: 'age',
    severity,
    description: 'Potential age discrimination detected in matching process',
    evidence,
    mitigation: 'Focus on skills and competencies rather than age-related indicators. Remove age-biased language from job descriptions.',
  };
}

/**
 * Detect gender-related bias (through implicit language patterns)
 */
function detectGenderBias(
  candidate: CandidateProfile,
  job: JobProfile,
  _scoringBreakdown: { [dimension: string]: number }
): BiasType | null {
  const evidence: string[] = [];
  let severity: BiasType['severity'] = 'low';

  const jobText = job.jobText.toLowerCase();
  
  // Check for gendered language in job description
  const masculineWords = ['aggressive', 'dominant', 'competitive', 'ninja', 'rockstar', 'guru'];
  const feminineWords = ['collaborative', 'supportive', 'nurturing', 'empathetic'];

  const masculineCount = masculineWords.filter(word => jobText.includes(word)).length;
  const feminineCount = feminineWords.filter(word => jobText.includes(word)).length;

  if (masculineCount > feminineCount + 2) {
    evidence.push(`Job description heavily favors masculine-coded language (${masculineCount} vs ${feminineCount})`);
    severity = 'medium';
  } else if (feminineCount > masculineCount + 2) {
    evidence.push(`Job description heavily favors feminine-coded language (${feminineCount} vs ${masculineCount})`);
    severity = 'medium';
  }

  // Check for cultural fit bias (often masks gender bias)
  for (const phrase of BIAS_PATTERNS.gender.biasedPhrases) {
    if (jobText.includes(phrase.toLowerCase())) {
      evidence.push(`Potentially biased phrase: "${phrase}"`);
      severity = 'high';
    }
  }

  if (evidence.length === 0) return null;

  return {
    type: 'gender',
    severity,
    description: 'Potential gender bias detected through language patterns',
    evidence,
    mitigation: 'Use gender-neutral language in job descriptions. Focus on specific skills and qualifications rather than cultural fit.',
  };
}

/**
 * Detect education-related bias
 */
function detectEducationBias(
  candidate: CandidateProfile,
  job: JobProfile,
  scoringBreakdown: { [dimension: string]: number }
): BiasType | null {
  const evidence: string[] = [];
  let severity: BiasType['severity'] = 'low';

  const jobText = job.jobText.toLowerCase();
  const candidateEducation = candidate.education.toLowerCase();

  // Check for elite institution bias
  const hasEliteBias = BIAS_PATTERNS.education.eliteBias.some(term => 
    jobText.includes(term.toLowerCase())
  );

  if (hasEliteBias) {
    evidence.push("Job description shows preference for elite educational institutions");
    severity = 'medium';
  }

  // Check if education score disproportionately affects overall match
  const educationScore = scoringBreakdown.education || 0;
  if (educationScore < 40 && !candidateEducation.includes('bachelor') && !candidateEducation.includes('degree')) {
    evidence.push("Candidate penalized heavily for lack of formal degree");
    severity = 'high';
  }

  // Check for unnecessary degree requirements
  const requiresDegree = BIAS_PATTERNS.education.degreeRequirements.some(req =>
    jobText.includes(req.toLowerCase())
  );

  if (requiresDegree && job.requiredSkills.length > 0) {
    evidence.push("Job requires degree despite emphasizing skills-based work");
    severity = 'medium';
  }

  if (evidence.length === 0) return null;

  return {
    type: 'education',
    severity,
    description: 'Potential education bias detected in requirements or scoring',
    evidence,
    mitigation: 'Focus on skills and demonstrated competencies. Consider whether degree requirements are truly necessary.',
  };
}

/**
 * Detect location-related bias
 */
function detectLocationBias(
  candidate: CandidateProfile,
  job: JobProfile,
  matchScore: number
): BiasType | null {
  const evidence: string[] = [];
  let severity: BiasType['severity'] = 'low';

  const jobText = job.jobText.toLowerCase();

  // Check for location restrictions that might be unnecessary
  const hasLocationBias = BIAS_PATTERNS.location.locationBias.some(phrase =>
    jobText.includes(phrase.toLowerCase())
  );

  if (hasLocationBias) {
    evidence.push("Job shows strong location preference that may exclude qualified remote candidates");
    severity = 'medium';
  }

  // Check if candidate location affects scoring
  if (candidate.location && job.location) {
    if (candidate.location.toLowerCase() !== job.location.toLowerCase() && matchScore < 60) {
      evidence.push("Location mismatch appears to significantly impact match score");
      severity = 'medium';
    }
  }

  if (evidence.length === 0) return null;

  return {
    type: 'location',
    severity,
    description: 'Potential location bias detected',
    evidence,
    mitigation: 'Consider whether location requirements are essential. Evaluate remote work possibilities.',
  };
}

/**
 * Detect experience-related bias
 */
function detectExperienceBias(
  candidate: CandidateProfile,
  job: JobProfile,
  scoringBreakdown: { [dimension: string]: number }
): BiasType | null {
  const evidence: string[] = [];
  let severity: BiasType['severity'] = 'low';

  const candidateText = candidate.resumeText.toLowerCase();
  const jobText = job.jobText.toLowerCase();

  // Check for employment gap penalties
  const hasGapPenalty = BIAS_PATTERNS.experience.gapPenalty.some(term =>
    candidateText.includes(term.toLowerCase()) || jobText.includes(term.toLowerCase())
  );

  if (hasGapPenalty && (scoringBreakdown.experience || 0) < 40) {
    evidence.push("Candidate appears to be penalized for employment gaps");
    severity = 'high';
  }

  // Check for overqualification bias
  const hasOverqualificationBias = BIAS_PATTERNS.experience.overqualification.some(term =>
    jobText.includes(term.toLowerCase())
  );

  if (hasOverqualificationBias) {
    evidence.push("Job description indicates bias against overqualified candidates");
    severity = 'medium';
  }

  if (evidence.length === 0) return null;

  return {
    type: 'experience_gap',
    severity,
    description: 'Potential bias against employment gaps or overqualification',
    evidence,
    mitigation: 'Focus on relevant skills and recent projects rather than continuous employment. Consider reasons for career breaks.',
  };
}

/**
 * Detect technology/skill bias
 */
function detectTechnologyBias(
  candidate: CandidateProfile,
  job: JobProfile,
  scoringBreakdown: { [dimension: string]: number }
): BiasType | null {
  const evidence: string[] = [];
  let severity: BiasType['severity'] = 'low';

  // Check for technology recency bias
  const candidateTech = candidate.technologies;
  const jobTech = job.technologies;

  // Check if older but still relevant technologies are unfairly penalized
  const olderTechnologies = ['jquery', 'php', 'java', 'c++', 'perl', 'ruby'];
  const hasOlderTech = candidateTech.some(tech => 
    olderTechnologies.includes(tech.toLowerCase())
  );

  const skillsScore = scoringBreakdown.skills || 0;
  if (hasOlderTech && skillsScore < 40 && candidateTech.length >= jobTech.length) {
    evidence.push("Candidate with older but relevant technologies received low skills score");
    severity = 'medium';
  }

  // Check for technology stack bias (preference for trendy vs stable technologies)
  const trendyTech = ['react', 'vue', 'svelte', 'rust', 'go', 'typescript'];
  const jobHasTrendy = jobTech.some(tech => trendyTech.includes(tech.toLowerCase()));
  const candidateHasTrendy = candidateTech.some(tech => trendyTech.includes(tech.toLowerCase()));

  if (jobHasTrendy && !candidateHasTrendy && skillsScore < 50) {
    evidence.push("Candidate may be penalized for not using trendy technologies despite relevant skills");
    severity = 'medium';
  }

  if (evidence.length === 0) return null;

  return {
    type: 'technology',
    severity,
    description: 'Potential bias in technology stack evaluation',
    evidence,
    mitigation: 'Consider transferable skills and focus on problem-solving ability rather than specific technology trends.',
  };
}

/**
 * Calculate fairness metrics
 */
function calculateFairnessMetrics(
  candidate: CandidateProfile,
  job: JobProfile,
  matchScore: number,
  scoringBreakdown: { [dimension: string]: number },
  detectedBiases: BiasType[]
): { demographicParity: number; equalizedOdds: number; calibration: number } {
  // Simplified fairness metrics calculation
  // In a full implementation, these would be calculated across multiple candidates
  
  let demographicParity = 80; // Assume reasonable baseline
  let equalizedOdds = 75;
  let calibration = 85;

  // Adjust based on detected biases
  for (const bias of detectedBiases) {
    const penalty = getSeverityScore(bias.severity);
    demographicParity -= penalty * 0.3;
    equalizedOdds -= penalty * 0.2;
    calibration -= penalty * 0.1;
  }

  return {
    demographicParity: Math.max(0, Math.min(100, demographicParity)),
    equalizedOdds: Math.max(0, Math.min(100, equalizedOdds)),
    calibration: Math.max(0, Math.min(100, calibration)),
  };
}

/**
 * Generate bias mitigation recommendations
 */
function generateBiasRecommendations(detectedBiases: BiasType[]): string[] {
  const recommendations: string[] = [];

  if (detectedBiases.length === 0) {
    recommendations.push("No significant bias detected in current matching process");
    return recommendations;
  }

  // Add specific recommendations based on detected biases
  const biasTypes = new Set(detectedBiases.map(b => b.type));

  if (biasTypes.has('age')) {
    recommendations.push("Remove age-related language from job descriptions");
    recommendations.push("Focus on skills and competencies rather than years of experience");
  }

  if (biasTypes.has('gender')) {
    recommendations.push("Use gender-neutral language in job postings");
    recommendations.push("Replace 'cultural fit' with specific behavioral requirements");
  }

  if (biasTypes.has('education')) {
    recommendations.push("Consider skills-based hiring over degree requirements");
    recommendations.push("Evaluate candidates based on demonstrated competencies");
  }

  if (biasTypes.has('location')) {
    recommendations.push("Assess whether location requirements are truly necessary");
    recommendations.push("Consider remote work options for qualified candidates");
  }

  if (biasTypes.has('experience_gap')) {
    recommendations.push("Focus on recent relevant experience and projects");
    recommendations.push("Consider valid reasons for career breaks or transitions");
  }

  if (biasTypes.has('technology')) {
    recommendations.push("Evaluate transferable skills across technology stacks");
    recommendations.push("Consider learning ability alongside current technical knowledge");
  }

  // Add general recommendations
  recommendations.push("Regularly audit matching algorithms for fairness");
  recommendations.push("Collect and analyze outcome data to identify patterns");

  return recommendations;
}

/**
 * Generate explanation of bias analysis
 */
function generateBiasExplanation(detectedBiases: BiasType[], biasScore: number): string {
  if (biasScore === 0) {
    return "No bias detected in the matching analysis.";
  }

  const criticalBiases = detectedBiases.filter(b => b.severity === 'critical').length;
  const highBiases = detectedBiases.filter(b => b.severity === 'high').length;
  const mediumBiases = detectedBiases.filter(b => b.severity === 'medium').length;

  let explanation = `Bias analysis score: ${biasScore}/100. `;

  if (criticalBiases > 0) {
    explanation += `Found ${criticalBiases} critical bias indicator(s). `;
  }

  if (highBiases > 0) {
    explanation += `Found ${highBiases} high-severity bias indicator(s). `;
  }

  if (mediumBiases > 0) {
    explanation += `Found ${mediumBiases} medium-severity bias indicator(s). `;
  }

  explanation += "Review recommendations for mitigation strategies.";

  return explanation;
}

/**
 * Convert severity to numeric score
 */
function getSeverityScore(severity: BiasType['severity']): number {
  switch (severity) {
    case 'critical': return 40;
    case 'high': return 25;
    case 'medium': return 15;
    case 'low': return 5;
    default: return 0;
  }
}

/**
 * Detects bias indicators in job descriptions
 * 
 * @param jobDescription - The job description text to analyze
 * @returns Promise resolving to bias analysis results
 */
export async function detectJobBias(jobDescription: string): Promise<BiasDetectionResult> {
  const detectedBiases: BiasType[] = [];
  let totalBiasScore = 0;

  try {
    const text = jobDescription.toLowerCase();
    
    // Check for age bias indicators
    const ageBiasWords = BIAS_PATTERNS.age.keywords.filter(keyword => 
      text.includes(keyword.toLowerCase())
    );
    if (ageBiasWords.length > 0) {
      const severity = ageBiasWords.length >= 3 ? 'high' : ageBiasWords.length >= 2 ? 'medium' : 'low';
      detectedBiases.push({
        type: 'age',
        severity,
        description: 'Job description contains age-related bias indicators',
        evidence: ageBiasWords,
        mitigation: 'Remove age-specific language. Focus on skills and experience requirements instead.'
      });
      totalBiasScore += getSeverityScore(severity);
    }

    // Check for gender bias indicators  
    const genderBiasWords = BIAS_PATTERNS.gender.keywords.filter(keyword => 
      text.includes(keyword.toLowerCase())
    );
    if (genderBiasWords.length > 0) {
      const severity = genderBiasWords.length >= 3 ? 'high' : genderBiasWords.length >= 2 ? 'medium' : 'low';
      detectedBiases.push({
        type: 'gender',
        severity,
        description: 'Job description contains gender-biased language',
        evidence: genderBiasWords,
        mitigation: 'Use gender-neutral language and avoid gendered assumptions about roles.'
      });
      totalBiasScore += getSeverityScore(severity);
    }

    // Check for education bias indicators
    const educationBiasWords = BIAS_PATTERNS.education.excessive.filter(keyword => 
      text.includes(keyword.toLowerCase())
    );
    if (educationBiasWords.length > 0) {
      const severity = educationBiasWords.length >= 2 ? 'medium' : 'low';
      detectedBiases.push({
        type: 'education',
        severity,
        description: 'Job description may exclude qualified candidates through excessive education requirements',
        evidence: educationBiasWords,
        mitigation: 'Consider whether education requirements are truly necessary for job success.'
      });
      totalBiasScore += getSeverityScore(severity);
    }

    // Calculate fairness metrics (simplified for job descriptions)
    const fairnessMetrics = {
      demographicParity: Math.max(0, 1 - (totalBiasScore / 100)), // Inverse of bias score
      equalizedOdds: 0.8, // Default value for job descriptions
      calibration: 0.75 // Default value for job descriptions
    };

    // Generate recommendations
    const recommendations = generateBiasRecommendations(detectedBiases);
    
    // Generate explanation
    const explanation = generateBiasExplanation(detectedBiases, totalBiasScore);

    const result: BiasDetectionResult = {
      hasBias: detectedBiases.length > 0,
      biasScore: Math.min(100, totalBiasScore),
      detectedBiases,
      recommendations,
      fairnessMetrics,
      explanation: explanation || 'No significant bias indicators detected in job description.'
    };

    logger.info('Job bias analysis completed', {
      hasBias: result.hasBias,
      biasScore: result.biasScore,
      detectedBiasTypes: detectedBiases.map(b => b.type)
    });

    return result;

  } catch (error) {
    logger.error('Job bias detection failed', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    // Return default result on error
    return {
      hasBias: false,
      biasScore: 0,
      detectedBiases: [],
      recommendations: [],
      fairnessMetrics: { demographicParity: 1, equalizedOdds: 1, calibration: 1 },
      explanation: 'Bias analysis could not be completed due to an error.'
    };
  }
}