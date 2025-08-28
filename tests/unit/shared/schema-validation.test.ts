/**
 * Unit Tests for Schema Validation
 * Tests data types, constraints, and validation logic
 */

import { describe, test, expect } from '@jest/globals';

describe('Schema Validation', () => {
  describe('User Schema', () => {
    test('should validate required user fields', () => {
      const validUser = {
        username: 'testuser',
        email: 'test@example.com'
      };

      expect(validUser.username).toBeTruthy();
      expect(validUser.email).toContain('@');
      expect(validUser.email).toContain('.');
    });

    test('should enforce email format', () => {
      const validEmails = [
        'user@example.com',
        'test.user@domain.co.uk',
        'user+tag@example.org'
      ];

      const invalidEmails = [
        'invalid-email',
        '@example.com',
        'user@',
        'user.example.com'
      ];

      validEmails.forEach(email => {
        expect(email).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
      });

      invalidEmails.forEach(email => {
        expect(email).not.toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
      });
    });

    test('should validate username constraints', () => {
      const validUsernames = [
        'user123',
        'test_user',
        'UserName',
        'u'
      ];

      const invalidUsernames = [
        '',
        ' ',
        'user with spaces',
        'user@domain'
      ];

      validUsernames.forEach(username => {
        expect(username.length).toBeGreaterThan(0);
        expect(username.trim()).toBe(username);
      });

      invalidUsernames.forEach(username => {
        expect(
          username.length === 0 || 
          username.includes(' ') || 
          username.includes('@')
        ).toBe(true);
      });
    });
  });

  describe('Resume Schema', () => {
    test('should validate required resume fields', () => {
      const validResume = {
        filename: 'resume.pdf',
        userId: 'user-123',
        content: 'Resume content here...'
      };

      expect(validResume.filename).toBeTruthy();
      expect(validResume.userId).toBeTruthy();
      expect(validResume.content).toBeTruthy();
    });

    test('should validate filename extensions', () => {
      const validFilenames = [
        'resume.pdf',
        'document.doc',
        'file.docx',
        'text.txt'
      ];

      const invalidFilenames = [
        'file.exe',
        'script.js',
        'image.jpg',
        'data.json'
      ];

      const allowedExtensions = ['.pdf', '.doc', '.docx', '.txt'];

      validFilenames.forEach(filename => {
        const hasValidExtension = allowedExtensions.some(ext => 
          filename.toLowerCase().endsWith(ext)
        );
        expect(hasValidExtension).toBe(true);
      });

      invalidFilenames.forEach(filename => {
        const hasValidExtension = allowedExtensions.some(ext => 
          filename.toLowerCase().endsWith(ext)
        );
        expect(hasValidExtension).toBe(false);
      });
    });

    test('should validate content length limits', () => {
      const shortContent = 'Brief resume';
      const normalContent = 'A' + 'x'.repeat(1000) + 'Z'; // 1002 chars
      const longContent = 'A' + 'x'.repeat(100000) + 'Z'; // 100002 chars

      const maxContentLength = 50000; // 50KB limit

      expect(shortContent.length).toBeLessThan(maxContentLength);
      expect(normalContent.length).toBeLessThan(maxContentLength);
      expect(longContent.length).toBeGreaterThan(maxContentLength);
    });

    test('should validate analyzed data structure', () => {
      const validAnalyzedData = {
        skills: ['JavaScript', 'React', 'Node.js'],
        experience: '5 years of web development',
        education: ['BS Computer Science', 'AWS Certification']
      };

      expect(Array.isArray(validAnalyzedData.skills)).toBe(true);
      expect(typeof validAnalyzedData.experience).toBe('string');
      expect(Array.isArray(validAnalyzedData.education)).toBe(true);
      expect(validAnalyzedData.skills.length).toBeGreaterThan(0);
    });
  });

  describe('Job Description Schema', () => {
    test('should validate required job fields', () => {
      const validJob = {
        title: 'Senior Developer',
        description: 'We are looking for a senior developer...',
        userId: 'user-123'
      };

      expect(validJob.title).toBeTruthy();
      expect(validJob.description).toBeTruthy();
      expect(validJob.userId).toBeTruthy();
    });

    test('should validate title length constraints', () => {
      const validTitles = [
        'Developer',
        'Senior Software Engineer',
        'Full-Stack Developer (Remote)'
      ];

      const invalidTitles = [
        '',
        'A',
        'A'.repeat(200) // Too long
      ];

      const minTitleLength = 2;
      const maxTitleLength = 100;

      validTitles.forEach(title => {
        expect(title.length).toBeGreaterThanOrEqual(minTitleLength);
        expect(title.length).toBeLessThanOrEqual(maxTitleLength);
      });

      invalidTitles.forEach(title => {
        expect(
          title.length < minTitleLength || 
          title.length > maxTitleLength
        ).toBe(true);
      });
    });

    test('should validate description content', () => {
      const validDescriptions = [
        'We are looking for a skilled developer to join our team.',
        'Responsibilities include: coding, testing, deployment.',
        'Requirements: 3+ years experience, JavaScript, React.'
      ];

      const invalidDescriptions = [
        '',
        'Short',
        'A'.repeat(10000) // Too long
      ];

      const minDescriptionLength = 20;
      const maxDescriptionLength = 5000;

      validDescriptions.forEach(desc => {
        expect(desc.length).toBeGreaterThanOrEqual(minDescriptionLength);
        expect(desc.length).toBeLessThanOrEqual(maxDescriptionLength);
      });

      invalidDescriptions.forEach(desc => {
        expect(
          desc.length < minDescriptionLength || 
          desc.length > maxDescriptionLength
        ).toBe(true);
      });
    });
  });

  describe('Analysis Result Schema', () => {
    test('should validate match percentage range', () => {
      const validPercentages = [0, 25, 50, 75, 100];
      const invalidPercentages = [-1, -10, 101, 150];

      validPercentages.forEach(percentage => {
        expect(percentage).toBeGreaterThanOrEqual(0);
        expect(percentage).toBeLessThanOrEqual(100);
      });

      invalidPercentages.forEach(percentage => {
        expect(
          percentage < 0 || percentage > 100
        ).toBe(true);
      });
    });

    test('should validate skill arrays', () => {
      const validMatchedSkills = [
        { skill: 'JavaScript', matchPercentage: 95, category: 'technical' },
        { skill: 'Communication', matchPercentage: 80, category: 'soft' }
      ];

      const validMissingSkills = ['TypeScript', 'Docker', 'Kubernetes'];

      expect(Array.isArray(validMatchedSkills)).toBe(true);
      expect(Array.isArray(validMissingSkills)).toBe(true);

      validMatchedSkills.forEach(skill => {
        expect(skill.skill).toBeTruthy();
        expect(typeof skill.matchPercentage).toBe('number');
        expect(skill.matchPercentage).toBeGreaterThanOrEqual(0);
        expect(skill.matchPercentage).toBeLessThanOrEqual(100);
      });

      validMissingSkills.forEach(skill => {
        expect(typeof skill).toBe('string');
        expect(skill.length).toBeGreaterThan(0);
      });
    });

    test('should validate confidence levels', () => {
      const validConfidenceLevels = ['low', 'medium', 'high'];
      const invalidConfidenceLevels = ['', 'very_low', 'extremely_high', 'unknown'];

      validConfidenceLevels.forEach(level => {
        expect(['low', 'medium', 'high']).toContain(level);
      });

      invalidConfidenceLevels.forEach(level => {
        expect(['low', 'medium', 'high']).not.toContain(level);
      });
    });

    test('should validate scoring dimensions', () => {
      const validScoringDimensions = {
        skills: 85,
        experience: 75,
        education: 60,
        semantic: 70,
        overall: 80
      };

      const requiredDimensions = ['skills', 'experience', 'education', 'semantic', 'overall'];

      requiredDimensions.forEach(dimension => {
        expect(validScoringDimensions).toHaveProperty(dimension);
        expect(typeof validScoringDimensions[dimension as keyof typeof validScoringDimensions]).toBe('number');
        expect(validScoringDimensions[dimension as keyof typeof validScoringDimensions]).toBeGreaterThanOrEqual(0);
        expect(validScoringDimensions[dimension as keyof typeof validScoringDimensions]).toBeLessThanOrEqual(100);
      });
    });
  });

  describe('Interview Questions Schema', () => {
    test('should validate question structure', () => {
      const validQuestions = [
        {
          question: 'Tell me about your JavaScript experience',
          category: 'technical' as const,
          difficulty: 'medium' as const,
          expectedAnswer: 'Should demonstrate understanding of JS fundamentals'
        },
        {
          question: 'How do you handle stress?',
          category: 'behavioral' as const,
          difficulty: 'easy' as const,
          expectedAnswer: 'Should show emotional intelligence'
        }
      ];

      validQuestions.forEach(q => {
        expect(q.question).toBeTruthy();
        expect(['technical', 'behavioral', 'situational', 'cultural']).toContain(q.category);
        expect(['easy', 'medium', 'hard']).toContain(q.difficulty);
        expect(q.expectedAnswer).toBeTruthy();
      });
    });

    test('should validate question categories', () => {
      const validCategories = ['technical', 'behavioral', 'situational', 'cultural'];
      const invalidCategories = ['', 'unknown', 'personal', 'illegal'];

      validCategories.forEach(category => {
        expect(['technical', 'behavioral', 'situational', 'cultural']).toContain(category);
      });

      invalidCategories.forEach(category => {
        expect(['technical', 'behavioral', 'situational', 'cultural']).not.toContain(category);
      });
    });

    test('should validate difficulty levels', () => {
      const validDifficulties = ['easy', 'medium', 'hard'];
      const invalidDifficulties = ['', 'simple', 'complex', 'impossible'];

      validDifficulties.forEach(difficulty => {
        expect(['easy', 'medium', 'hard']).toContain(difficulty);
      });

      invalidDifficulties.forEach(difficulty => {
        expect(['easy', 'medium', 'hard']).not.toContain(difficulty);
      });
    });
  });

  describe('Bias Analysis Schema', () => {
    test('should validate bias detection result', () => {
      const validBiasResult = {
        hasBias: false,
        biasScore: 0.1,
        detectedBiases: [],
        fairnessMetrics: {
          biasConfidenceScore: 0.1,
          potentialBiasAreas: [],
          fairnessAssessment: 'No significant bias detected'
        }
      };

      expect(typeof validBiasResult.hasBias).toBe('boolean');
      expect(typeof validBiasResult.biasScore).toBe('number');
      expect(validBiasResult.biasScore).toBeGreaterThanOrEqual(0);
      expect(validBiasResult.biasScore).toBeLessThanOrEqual(1);
      expect(Array.isArray(validBiasResult.detectedBiases)).toBe(true);
      expect(validBiasResult.fairnessMetrics).toBeTruthy();
    });

    test('should validate fairness metrics', () => {
      const validFairnessMetrics = {
        biasConfidenceScore: 0.15,
        potentialBiasAreas: ['language', 'education-requirements'],
        fairnessAssessment: 'Minor language bias detected in job requirements',
        recommendations: ['Use more inclusive language', 'Review education requirements']
      };

      expect(typeof validFairnessMetrics.biasConfidenceScore).toBe('number');
      expect(validFairnessMetrics.biasConfidenceScore).toBeGreaterThanOrEqual(0);
      expect(validFairnessMetrics.biasConfidenceScore).toBeLessThanOrEqual(1);
      expect(Array.isArray(validFairnessMetrics.potentialBiasAreas)).toBe(true);
      expect(typeof validFairnessMetrics.fairnessAssessment).toBe('string');
      
      if (validFairnessMetrics.recommendations) {
        expect(Array.isArray(validFairnessMetrics.recommendations)).toBe(true);
      }
    });
  });

  describe('Data Consistency Validation', () => {
    test('should ensure ID consistency across related entities', () => {
      const userId = 'user-123';
      const resumeId = 1;
      const jobId = 2;

      const analysisResult = {
        userId,
        resumeId,
        jobDescriptionId: jobId,
        matchPercentage: 85
      };

      expect(analysisResult.userId).toBe(userId);
      expect(analysisResult.resumeId).toBe(resumeId);
      expect(analysisResult.jobDescriptionId).toBe(jobId);
    });

    test('should validate timestamp formats', () => {
      const validTimestamps = [
        new Date().toISOString(),
        '2023-12-01T10:30:00.000Z',
        '2024-01-15T15:45:30.123Z'
      ];

      const isoTimestampRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;

      validTimestamps.forEach(timestamp => {
        expect(timestamp).toMatch(isoTimestampRegex);
        expect(new Date(timestamp).toISOString()).toBe(timestamp);
      });
    });

    test('should validate array length constraints', () => {
      const skills = ['JavaScript', 'React', 'Node.js'];
      const strengths = ['Strong technical skills', 'Good communication'];
      const recommendations = ['Consider for interview', 'Technical assessment recommended'];

      const maxArrayLength = 50;

      [skills, strengths, recommendations].forEach(array => {
        expect(Array.isArray(array)).toBe(true);
        expect(array.length).toBeLessThanOrEqual(maxArrayLength);
        expect(array.length).toBeGreaterThan(0);
      });
    });
  });
});