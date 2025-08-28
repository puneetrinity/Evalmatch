export const detectMatchingBias = jest.fn().mockResolvedValue({
  biasDetected: false,
  biasScore: 0.1,
  detectedBiases: [],
  fairnessMetrics: {
    biasConfidenceScore: 0.1,
    potentialBiasAreas: [],
    fairnessAssessment: 'No significant bias detected'
  },
  recommendations: []
});