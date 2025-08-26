/**
 * Unified Prompt Template Engine for AI Providers
 * 
 * Consolidates prompt generation logic that was previously duplicated across
 * anthropic.ts, openai.ts, and groq.ts (~300 lines each)
 * 
 * Eliminates ~900+ lines of duplicate prompt code.
 */

import { logger } from "../logger";

export type ProviderFormat = 'anthropic' | 'openai' | 'groq';

export interface PromptOptions {
  format?: ProviderFormat;
  temperature?: number;
  maxTokens?: number;
  includeConfidence?: boolean;
  includeProcessingTime?: boolean;
  customInstructions?: string;
}

export interface ResumeAnalysisContext {
  text: string;
  filename?: string;
  userId?: string;
  sessionId?: string;
}

export interface JobAnalysisContext {
  title: string;
  description: string;
  company?: string;
  userId?: string;
}

export interface MatchAnalysisContext {
  resumeAnalysis: object;
  jobAnalysis: object;
  includeInterviewQuestions?: boolean;
}

/**
 * Centralized prompt template engine for all AI providers
 */
export class PromptTemplateEngine {
  
  // ==================== RESUME ANALYSIS PROMPTS ====================

  /**
   * Generate resume analysis prompt with provider-specific formatting
   */
  static generateResumeAnalysisPrompt(context: ResumeAnalysisContext, options: PromptOptions = {}): string {
    const { format = 'anthropic' } = options;
    
    const basePrompt = this.getBaseResumeAnalysisPrompt();
    const formatInstructions = this.getFormatInstructions('resume', format);
    const jsonSchema = this.getResumeAnalysisSchema();
    
    let prompt = `${basePrompt}\n\n${formatInstructions}\n\n${jsonSchema}\n\n`;
    
    // Add provider-specific formatting
    switch (format) {
      case 'anthropic':
        prompt += this.wrapForAnthropic(prompt, context.text);
        break;
      case 'openai':
        prompt += this.wrapForOpenAI(prompt, context.text);
        break;
      case 'groq':
        prompt += this.wrapForGroq(prompt, context.text);
        break;
    }

    if (options.customInstructions) {
      prompt += `\n\nAdditional Instructions: ${options.customInstructions}`;
    }

    logger.debug('Generated resume analysis prompt', { 
      format, 
      textLength: context.text.length,
      promptLength: prompt.length 
    });

    return prompt;
  }

  // ==================== JOB ANALYSIS PROMPTS ====================

  /**
   * Generate job description analysis prompt
   */
  static generateJobAnalysisPrompt(context: JobAnalysisContext, options: PromptOptions = {}): string {
    const { format = 'anthropic' } = options;
    
    const basePrompt = this.getBaseJobAnalysisPrompt();
    const formatInstructions = this.getFormatInstructions('job', format);
    const jsonSchema = this.getJobAnalysisSchema();
    
    let prompt = `${basePrompt}\n\n${formatInstructions}\n\n${jsonSchema}\n\n`;
    
    const jobText = `Job Title: ${context.title}\n\nJob Description: ${context.description}`;
    
    switch (format) {
      case 'anthropic':
        prompt = this.wrapForAnthropic(prompt, jobText);
        break;
      case 'openai':
        prompt = this.wrapForOpenAI(prompt, jobText);
        break;
      case 'groq':
        prompt = this.wrapForGroq(prompt, jobText);
        break;
    }

    logger.debug('Generated job analysis prompt', { 
      format, 
      title: context.title,
      descLength: context.description.length 
    });

    return prompt;
  }

  // ==================== MATCH ANALYSIS PROMPTS ====================

  /**
   * Generate match analysis prompt
   */
  static generateMatchAnalysisPrompt(context: MatchAnalysisContext, options: PromptOptions = {}): string {
    const { format = 'anthropic' } = options;
    
    const basePrompt = this.getBaseMatchAnalysisPrompt();
    const formatInstructions = this.getFormatInstructions('match', format);
    const jsonSchema = this.getMatchAnalysisSchema();
    
    let prompt = `${basePrompt}\n\n${formatInstructions}\n\n${jsonSchema}\n\n`;
    
    const analysisText = `Resume Analysis: ${JSON.stringify(context.resumeAnalysis, null, 2)}\n\nJob Analysis: ${JSON.stringify(context.jobAnalysis, null, 2)}`;
    
    switch (format) {
      case 'anthropic':
        prompt = this.wrapForAnthropic(prompt, analysisText);
        break;
      case 'openai':
        prompt = this.wrapForOpenAI(prompt, analysisText);
        break;
      case 'groq':
        prompt = this.wrapForGroq(prompt, analysisText);
        break;
    }

    return prompt;
  }

  // ==================== BIAS ANALYSIS PROMPTS ====================

  /**
   * Generate bias analysis prompt
   */
  static generateBiasAnalysisPrompt(context: JobAnalysisContext, options: PromptOptions = {}): string {
    const { format = 'anthropic' } = options;
    
    const basePrompt = this.getBiasAnalysisPrompt();
    const formatInstructions = this.getFormatInstructions('bias', format);
    const jsonSchema = this.getBiasAnalysisSchema();
    
    let prompt = `${basePrompt}\n\n${formatInstructions}\n\n${jsonSchema}\n\n`;
    
    const jobText = `Job Title: ${context.title}\n\nJob Description: ${context.description}`;
    
    switch (format) {
      case 'anthropic':
        prompt = this.wrapForAnthropic(prompt, jobText);
        break;
      case 'openai':
        prompt = this.wrapForOpenAI(prompt, jobText);
        break;
      case 'groq':
        prompt = this.wrapForGroq(prompt, jobText);
        break;
    }

    return prompt;
  }

  // ==================== BASE PROMPT TEMPLATES ====================

  private static getBaseResumeAnalysisPrompt(): string {
    return `You are an expert AI resume analyzer. Analyze the provided resume text and extract key information with high accuracy.

Your task is to:
1. Extract personal information (name, contact details, location)
2. Identify and categorize skills (technical, soft, domain-specific)
3. Parse work experience with roles, companies, dates, and achievements
4. Extract education details (degrees, institutions, dates, relevant coursework)
5. Calculate an overall experience level and confidence score
6. Provide insights on resume strength and areas for improvement

Important guidelines:
- Be precise and factual - only extract information that is clearly stated
- Standardize job titles and skill names for consistency
- Calculate years of experience based on provided dates
- Assign confidence scores (0-100) based on information quality
- Handle missing or unclear information gracefully`;
  }

  private static getBaseJobAnalysisPrompt(): string {
    return `You are an expert job description analyzer. Analyze the provided job posting and extract structured information.

Your task is to:
1. Categorize required vs preferred skills and qualifications
2. Determine experience level requirements (entry, mid, senior, executive)
3. Extract key responsibilities and duties
4. Identify company information and culture indicators
5. Parse compensation, benefits, and location details
6. Calculate role complexity and requirements clarity
7. Assess potential bias indicators in language

Important guidelines:
- Distinguish between "required" and "nice-to-have" qualifications
- Standardize skill names and experience requirements
- Identify implicit bias in job language (gender, age, cultural)
- Extract both explicit and implied requirements
- Assess job posting quality and completeness`;
  }

  private static getBaseMatchAnalysisPrompt(): string {
    return `You are an expert at matching resumes to job requirements. Analyze how well the candidate fits the position.

Your task is to:
1. Calculate skill match percentages for required and preferred skills
2. Assess experience level alignment (under/over/appropriate)
3. Evaluate education and certification fit
4. Identify strengths and gaps in the candidate profile
5. Generate an overall match score with detailed breakdown
6. Provide specific recommendations for improving candidacy
7. Suggest interview questions based on analysis

Important guidelines:
- Provide specific, actionable feedback
- Highlight both strengths and areas for improvement
- Consider career progression and growth potential
- Be objective and fair in assessments
- Focus on job-relevant factors only`;
  }

  private static getBiasAnalysisPrompt(): string {
    return `You are an expert at identifying potential bias in job descriptions. Analyze the job posting for bias indicators.

Your task is to:
1. Identify gender-biased language and suggest alternatives
2. Detect age discrimination indicators
3. Find cultural or socioeconomic bias markers
4. Assess accessibility and inclusion language
5. Evaluate requirement necessity vs bias potential
6. Provide specific recommendations for improvement
7. Calculate overall bias risk score

Important guidelines:
- Be thorough but constructive in feedback
- Provide specific alternative language suggestions
- Consider legal compliance requirements
- Focus on creating inclusive job postings
- Assess both explicit and implicit bias indicators`;
  }

  // ==================== PROVIDER-SPECIFIC WRAPPERS ====================

  private static wrapForAnthropic(prompt: string, content: string): string {
    return `Human: ${prompt}

Please analyze the following content:

${content}

Please respond with valid JSON only.`;
  }

  private static wrapForOpenAI(prompt: string, content: string): string {
    return `${prompt}

Content to analyze:
${content}

Please provide your analysis as valid JSON only.`;
  }

  private static wrapForGroq(prompt: string, content: string): string {
    return `${prompt}

CONTENT:
${content}

Return valid JSON response only.`;
  }

  // ==================== FORMAT INSTRUCTIONS ====================

  private static getFormatInstructions(type: 'resume' | 'job' | 'match' | 'bias', format: ProviderFormat): string {
    const baseInstructions = "Return your response as valid JSON only. Do not include explanations, markdown, or additional text.";
    
    switch (format) {
      case 'anthropic':
        return `${baseInstructions} Use the exact schema provided below.`;
      case 'openai':
        return `${baseInstructions} Follow the JSON schema strictly.`;
      case 'groq':
        return `${baseInstructions} IMPORTANT: Return only the JSON object with no extra formatting.`;
      default:
        return baseInstructions;
    }
  }

  // ==================== JSON SCHEMAS ====================

  private static getResumeAnalysisSchema(): string {
    return `JSON Schema:
{
  "personalInfo": {
    "name": "string",
    "email": "string | null",
    "phone": "string | null",
    "location": "string | null",
    "linkedIn": "string | null",
    "portfolio": "string | null"
  },
  "skills": {
    "technical": ["string"],
    "soft": ["string"],
    "domain": ["string"]
  },
  "experience": [
    {
      "role": "string",
      "company": "string",
      "duration": "string",
      "yearsOfExperience": "number",
      "responsibilities": ["string"],
      "achievements": ["string"]
    }
  ],
  "education": [
    {
      "degree": "string",
      "institution": "string",
      "year": "string | null",
      "gpa": "string | null",
      "relevantCoursework": ["string"]
    }
  ],
  "summary": {
    "experienceLevel": "entry | mid | senior | executive",
    "totalYearsExperience": "number",
    "keyStrengths": ["string"],
    "industryFocus": ["string"]
  },
  "confidence": "number (0-100)",
  "processingTime": "number"
}`;
  }

  private static getJobAnalysisSchema(): string {
    return `JSON Schema:
{
  "basicInfo": {
    "title": "string",
    "company": "string | null",
    "location": "string | null",
    "employmentType": "string | null",
    "experienceLevel": "entry | mid | senior | executive"
  },
  "requirements": {
    "required": {
      "skills": ["string"],
      "experience": "string",
      "education": "string | null",
      "certifications": ["string"]
    },
    "preferred": {
      "skills": ["string"],
      "experience": "string | null",
      "education": "string | null",
      "certifications": ["string"]
    }
  },
  "responsibilities": ["string"],
  "compensation": {
    "salary": "string | null",
    "benefits": ["string"],
    "equity": "boolean | null"
  },
  "companyInfo": {
    "description": "string | null",
    "size": "string | null",
    "industry": "string | null",
    "culture": ["string"]
  },
  "analysis": {
    "complexity": "low | medium | high",
    "clarity": "low | medium | high",
    "competitiveness": "low | medium | high"
  },
  "confidence": "number (0-100)",
  "processingTime": "number"
}`;
  }

  private static getMatchAnalysisSchema(): string {
    return `JSON Schema:
{
  "overallScore": "number (0-100)",
  "breakdown": {
    "skillsMatch": {
      "score": "number (0-100)",
      "requiredSkillsMatch": "number (0-100)",
      "preferredSkillsMatch": "number (0-100)",
      "missingSkills": ["string"],
      "strongSkills": ["string"]
    },
    "experienceMatch": {
      "score": "number (0-100)",
      "levelAlignment": "under | appropriate | over",
      "yearsGap": "number",
      "industryRelevance": "number (0-100)"
    },
    "educationMatch": {
      "score": "number (0-100)",
      "meetsRequirements": "boolean",
      "relevantDegree": "boolean"
    }
  },
  "strengths": ["string"],
  "concerns": ["string"],
  "recommendations": ["string"],
  "interviewQuestions": ["string"],
  "confidence": "number (0-100)",
  "processingTime": "number"
}`;
  }

  private static getBiasAnalysisSchema(): string {
    return `JSON Schema:
{
  "overallRisk": "low | medium | high",
  "biasIndicators": {
    "gender": {
      "risk": "low | medium | high",
      "issues": ["string"],
      "suggestions": ["string"]
    },
    "age": {
      "risk": "low | medium | high", 
      "issues": ["string"],
      "suggestions": ["string"]
    },
    "cultural": {
      "risk": "low | medium | high",
      "issues": ["string"], 
      "suggestions": ["string"]
    },
    "accessibility": {
      "risk": "low | medium | high",
      "issues": ["string"],
      "suggestions": ["string"]
    }
  },
  "recommendations": {
    "language": ["string"],
    "requirements": ["string"],
    "structure": ["string"]
  },
  "score": "number (0-100, where 100 is bias-free)",
  "confidence": "number (0-100)",
  "processingTime": "number"
}`;
  }
}