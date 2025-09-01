/**
 * MSW (Mock Service Worker) Handlers for Comprehensive Testing
 * Provides realistic API mocking for EvalMatch testing
 */

import { http, HttpResponse } from 'msw';

export const handlers = [
  // Mock Groq API
  http.post('*/groq/api', () => {
    return HttpResponse.json({
      success: true,
      data: {
        matchPercentage: 85,
        matchedSkills: ['JavaScript', 'Machine Learning', 'React'],
        missingSkills: ['Python'],
        candidateStrengths: ['Strong technical background'],
        candidateWeaknesses: ['Limited experience with Python'],
        recommendations: ['Consider Python training'],
        reasoning: 'Comprehensive analysis shows strong technical alignment with the role requirements.',
        confidence: 0.88,
        analysisMethod: 'groq',
        actualWeights: {
          skills: 0.6,
          experience: 0.3,
          education: 0.1,
          ml: 0.4,
          llm: 0.6
        },
        biasDetection: {
          hasBias: false,
          biasScore: 5,
          detectedBiases: [],
          recommendations: [],
          fairnessMetrics: {
            demographicParity: 0.95,
            equalizedOdds: 0.9,
            calibration: 0.85
          },
          explanation: 'No significant bias detected'
        },
        matchInsights: {
          matchStrength: 'strong',
          keyStrengths: ['Technical skills align well'],
          areasToExplore: ['Consider additional training'],
          overallAssessment: 'Good candidate fit',
          nextSteps: ['Schedule technical interview']
        }
      }
    });
  }),

  // Mock OpenAI API
  http.post('*/openai/api', () => {
    return HttpResponse.json({
      success: true,
      data: {
        matchPercentage: 82,
        matchedSkills: ['JavaScript', 'React', 'Node.js'],
        missingSkills: ['Machine Learning'],
        candidateStrengths: ['Full-stack development experience'],
        candidateWeaknesses: ['No ML experience'],
        recommendations: ['ML training recommended'],
        reasoning: 'Strong full-stack skills but lacks ML expertise.',
        confidence: 0.85,
        analysisMethod: 'openai'
      }
    });
  }),

  // Mock Anthropic API
  http.post('*/anthropic/api', () => {
    return HttpResponse.json({
      success: true,
      data: {
        matchPercentage: 78,
        matchedSkills: ['JavaScript', 'React'],
        missingSkills: ['Machine Learning', 'Python'],
        candidateStrengths: ['Frontend expertise'],
        candidateWeaknesses: ['Limited backend and ML experience'],
        recommendations: ['Backend and ML training'],
        reasoning: 'Good frontend skills but needs backend development.',
        confidence: 0.82,
        analysisMethod: 'anthropic'
      }
    });
  }),

  // Mock ESCO Service
  http.get('*/esco/skills', () => {
    return HttpResponse.json({
      skills: [
        {
          uri: 'http://data.europa.eu/esco/skill/javascript',
          preferredLabel: { en: 'JavaScript' },
          altLabels: { en: ['JS', 'ECMAScript'] },
          skillType: 'skill/competence',
          reuseLevel: 'sector-specific'
        },
        {
          uri: 'http://data.europa.eu/esco/skill/machine-learning',
          preferredLabel: { en: 'Machine Learning' },
          altLabels: { en: ['ML', 'AI'] },
          skillType: 'skill/competence',
          reuseLevel: 'cross-sector'
        }
      ],
      totalResults: 2
    });
  }),

  // Mock ESCO Health Check
  http.get('*/esco/health', () => {
    return HttpResponse.json({
      status: 'healthy',
      details: {
        totalSkills: 1000,
        ftsEntries: 1000,
        cacheSize: 10
      }
    });
  }),

  // Mock embedding services
  http.post('*/embeddings/calculate', () => {
    return HttpResponse.json({
      embedding: [0.1, 0.2, 0.3, 0.4, 0.5],
      similarity: 0.85
    });
  }),

  // Mock bias detection service
  http.post('*/bias/detect', () => {
    return HttpResponse.json({
      hasBias: false,
      biasScore: 15,
      confidence: 0.85,
      detectedBiases: [],
      explanation: 'No significant bias indicators detected',
      recommendations: []
    });
  }),

  // Fallback handler for unmatched requests
  http.all('*', ({ request }) => {
    console.warn(`Unhandled request: ${request.method} ${request.url}`);
    return HttpResponse.json(
      { error: 'Not mocked', url: request.url },
      { status: 404 }
    );
  })
];