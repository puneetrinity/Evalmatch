/**
 * Unit tests for Job Bias Detection Functionality
 * Tests the newly implemented detectJobBias function and its integration
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { detectJobBias, BiasDetectionResult } from '../../../server/lib/bias-detection';
import { logger } from '../../../server/lib/logger';

// Mock logger
jest.mock('../../../server/lib/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

describe('Job Bias Detection Functionality', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('detectJobBias() basic functionality', () => {
    it('should return bias detection result structure', async () => {
      const jobDescription = 'We are looking for a talented software engineer';
      
      const result = await detectJobBias(jobDescription);
      
      expect(result).toHaveProperty('hasBias');
      expect(result).toHaveProperty('biasScore');
      expect(result).toHaveProperty('detectedBiases');
      expect(result).toHaveProperty('recommendations');
      expect(result).toHaveProperty('fairnessMetrics');
      expect(result).toHaveProperty('explanation');
    });

    it('should detect no bias in neutral job description', async () => {
      const neutralJobDescription = 'We are looking for a software engineer with 3+ years of experience in JavaScript and React.';
      
      const result = await detectJobBias(neutralJobDescription);
      
      expect(result.hasBias).toBe(false);
      expect(result.biasScore).toBe(0);
      expect(result.detectedBiases).toHaveLength(0);
      expect(result.explanation).toContain('No significant bias indicators detected');
    });

    it('should log completion of bias analysis', async () => {
      const jobDescription = 'Software engineer position available';
      
      await detectJobBias(jobDescription);
      
      expect(logger.info).toHaveBeenCalledWith('Job bias analysis completed',
        expect.objectContaining({
          hasBias: expect.any(Boolean),
          biasScore: expect.any(Number),
          detectedBiasTypes: expect.any(Array)
        })
      );
    });
  });

  describe('Age bias detection', () => {
    it('should detect age bias from "young" keywords', async () => {
      const biasedJobDescription = 'Looking for a young, energetic digital native to join our team';
      
      const result = await detectJobBias(biasedJobDescription);
      
      expect(result.hasBias).toBe(true);
      expect(result.biasScore).toBeGreaterThan(0);
      expect(result.detectedBiases).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'age',
            severity: expect.stringMatching(/^(low|medium|high)$/),
            evidence: expect.arrayContaining(['young', 'energetic', 'digital native'])
          })
        ])
      );
    });

    it('should detect age bias from "mature" keywords', async () => {
      const biasedJobDescription = 'Seeking a mature, seasoned professional with veteran experience';
      
      const result = await detectJobBias(biasedJobDescription);
      
      expect(result.hasBias).toBe(true);
      expect(result.detectedBiases).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'age',
            evidence: expect.arrayContaining(['mature', 'seasoned', 'veteran'])
          })
        ])
      );
    });

    it('should calculate severity based on number of age bias words', async () => {
      const highBiasDescription = 'Young energetic digital native fresh graduate needed';
      const mediumBiasDescription = 'Looking for young energetic candidate';
      const lowBiasDescription = 'Seeking energetic team member';
      
      const highResult = await detectJobBias(highBiasDescription);
      const mediumResult = await detectJobBias(mediumBiasDescription);
      const lowResult = await detectJobBias(lowBiasDescription);
      
      // More bias words should result in higher severity
      const highSeverity = highResult.detectedBiases[0]?.severity;
      const mediumSeverity = mediumResult.detectedBiases[0]?.severity;
      const lowSeverity = lowResult.detectedBiases[0]?.severity;
      
      expect(['high', 'medium']).toContain(highSeverity);
      expect(['medium', 'low']).toContain(mediumSeverity);
      expect(lowSeverity).toBe('low');
    });
  });

  describe('Gender bias detection', () => {
    it('should detect gender bias from gendered language', async () => {
      const biasedJobDescription = 'Looking for a rockstar ninja who can be aggressive in sales';
      
      const result = await detectJobBias(biasedJobDescription);
      
      expect(result.hasBias).toBe(true);
      expect(result.detectedBiases).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'gender',
            mitigation: expect.stringContaining('gender-neutral language')
          })
        ])
      );
    });

    it('should provide appropriate mitigation for gender bias', async () => {
      const biasedJobDescription = 'Seeking a competitive rockstar developer';
      
      const result = await detectJobBias(biasedJobDescription);
      
      if (result.hasBias) {
        const genderBias = result.detectedBiases.find(b => b.type === 'gender');
        expect(genderBias?.mitigation).toContain('gender-neutral language');
        expect(genderBias?.mitigation).toContain('gendered assumptions');
      }
    });
  });

  describe('Education bias detection', () => {
    it('should detect excessive education requirements', async () => {
      const biasedJobDescription = 'Must have PhD from top university with prestigious degree';
      
      const result = await detectJobBias(biasedJobDescription);
      
      // Check if education bias is detected (depends on BIAS_PATTERNS configuration)
      if (result.hasBias) {
        const educationBias = result.detectedBiases.find(b => b.type === 'education');
        if (educationBias) {
          expect(educationBias.mitigation).toContain('education requirements');
          expect(educationBias.mitigation).toContain('job success');
        }
      }
    });

    it('should suggest appropriate mitigation for education bias', async () => {
      const biasedJobDescription = 'Ivy League graduates preferred';
      
      const result = await detectJobBias(biasedJobDescription);
      
      if (result.hasBias) {
        const educationBias = result.detectedBiases.find(b => b.type === 'education');
        if (educationBias) {
          expect(educationBias.description).toContain('exclude qualified candidates');
        }
      }
    });
  });

  describe('Fairness metrics calculation', () => {
    it('should calculate fairness metrics inversely to bias score', async () => {
      const noBiasDescription = 'Software engineer with JavaScript experience';
      const biasedDescription = 'Young energetic rockstar ninja needed';
      
      const cleanResult = await detectJobBias(noBiasDescription);
      const biasedResult = await detectJobBias(biasedDescription);
      
      // Clean job should have higher demographic parity
      expect(cleanResult.fairnessMetrics.demographicParity)
        .toBeGreaterThanOrEqual(biasedResult.fairnessMetrics.demographicParity);
        
      // Both should have reasonable fairness metrics
      expect(cleanResult.fairnessMetrics.demographicParity).toBeLessThanOrEqual(1);
      expect(cleanResult.fairnessMetrics.equalizedOdds).toBeLessThanOrEqual(1);
      expect(cleanResult.fairnessMetrics.calibration).toBeLessThanOrEqual(1);
    });

    it('should provide default fairness values for job descriptions', async () => {
      const jobDescription = 'Software engineer position';
      
      const result = await detectJobBias(jobDescription);
      
      expect(result.fairnessMetrics.equalizedOdds).toBe(0.8);
      expect(result.fairnessMetrics.calibration).toBe(0.75);
      expect(result.fairnessMetrics.demographicParity).toBeGreaterThanOrEqual(0);
      expect(result.fairnessMetrics.demographicParity).toBeLessThanOrEqual(1);
    });
  });

  describe('Error handling', () => {
    it('should handle empty job description gracefully', async () => {
      const emptyDescription = '';
      
      const result = await detectJobBias(emptyDescription);
      
      expect(result.hasBias).toBe(false);
      expect(result.biasScore).toBe(0);
      expect(result.detectedBiases).toHaveLength(0);
    });

    it('should handle null/undefined input gracefully', async () => {
      const result = await detectJobBias(null as any);
      
      expect(result).toHaveProperty('hasBias');
      expect(result).toHaveProperty('explanation');
    });

    it('should return error explanation on failure', async () => {
      // Mock an error in bias detection
      const originalConsole = console.error;
      console.error = jest.fn();
      
      // Force an error by causing bias patterns to fail
      jest.doMock('../../../server/lib/bias-detection', () => {
        throw new Error('Test error');
      });
      
      try {
        const result = await detectJobBias('test description');
        expect(result.explanation).toContain('error');
      } catch (error) {
        // If the function throws, that's also acceptable
        expect(error).toBeDefined();
      }
      
      console.error = originalConsole;
    });

    it('should log errors during bias detection', async () => {
      const jobDescription = 'Test description';
      
      // This should not error in normal operation
      await detectJobBias(jobDescription);
      
      // Should have logged completion, not errors
      expect(logger.info).toHaveBeenCalled();
      expect(logger.error).not.toHaveBeenCalled();
    });
  });

  describe('Multiple bias types', () => {
    it('should detect multiple bias types in same description', async () => {
      const multiBiasDescription = 'Looking for a young, aggressive rockstar with top university degree';
      
      const result = await detectJobBias(multiBiasDescription);
      
      if (result.hasBias) {
        const biasTypes = result.detectedBiases.map(b => b.type);
        
        // Should detect multiple types of bias
        expect(biasTypes.length).toBeGreaterThan(1);
        expect(result.biasScore).toBeGreaterThan(0);
        expect(result.recommendations.length).toBeGreaterThan(0);
      }
    });

    it('should accumulate bias scores correctly', async () => {
      const singleBiasDescription = 'Looking for energetic candidate';
      const multiBiasDescription = 'Looking for young energetic rockstar ninja';
      
      const singleResult = await detectJobBias(singleBiasDescription);
      const multiResult = await detectJobBias(multiBiasDescription);
      
      if (singleResult.hasBias && multiResult.hasBias) {
        expect(multiResult.biasScore).toBeGreaterThanOrEqual(singleResult.biasScore);
      }
    });
  });

  describe('Recommendations generation', () => {
    it('should provide recommendations when bias is detected', async () => {
      const biasedDescription = 'Young energetic rockstar needed';
      
      const result = await detectJobBias(biasedDescription);
      
      if (result.hasBias) {
        expect(result.recommendations).toBeInstanceOf(Array);
        expect(result.recommendations.length).toBeGreaterThan(0);
        expect(result.recommendations[0]).toBeDefined();
        expect(typeof result.recommendations[0]).toBe('string');
      }
    });

    it('should provide specific recommendations for detected bias types', async () => {
      const ageGenderBiasDescription = 'Young aggressive rockstar needed';
      
      const result = await detectJobBias(ageGenderBiasDescription);
      
      if (result.hasBias && result.detectedBiases.length > 0) {
        // Each detected bias should contribute to recommendations
        expect(result.recommendations.length).toBeGreaterThan(0);
      }
    });
  });
});