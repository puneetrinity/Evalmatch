export const calculateEnhancedMatch = jest.fn().mockResolvedValue({
  totalScore: 85,
  confidence: 0.8,
  dimensionScores: {
    skills: 90,
    experience: 80,
    education: 85,
    semantic: 75
  },
  skillBreakdown: [
    { skill: 'JavaScript', matched: true, score: 95, required: true },
    { skill: 'React', matched: true, score: 90, required: true }
  ],
  explanation: {
    strengths: ['Strong technical background'],
    weaknesses: ['Some skill gaps'],
    recommendations: ['Consider additional training']
  }
});

export const calculateEnhancedMatchWithESCO = jest.fn().mockResolvedValue({
  totalScore: 85,
  confidence: 0.8,
  dimensionScores: {
    skills: 90,
    experience: 80,
    education: 85,
    semantic: 75
  },
  skillBreakdown: [
    { skill: 'JavaScript', matched: true, score: 95, required: true },
    { skill: 'React', matched: true, score: 90, required: true }
  ],
  explanation: {
    strengths: ['Strong technical background'],
    weaknesses: ['Some skill gaps'],
    recommendations: ['Consider additional training']
  }
});

export const matchSkillsEnhanced = jest.fn().mockReturnValue([
  { skill: 'JavaScript', score: 95, matched: true },
  { skill: 'React', score: 90, matched: true }
]);

export const ScoringWeights = {
  skills: 0.5,
  experience: 0.3,
  education: 0.15,
  semantic: 0.05
};