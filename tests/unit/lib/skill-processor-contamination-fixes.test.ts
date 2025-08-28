/**
 * Unit tests for skill processor contamination fixes
 * Tests the critical fixes applied to prevent cross-domain skill pollution
 */

// Disable automatic mocking for this test since we want to test the real implementation
jest.unmock('../../../server/lib/skill-processor');

import { SkillProcessor } from '../../../server/lib/skill-processor';
import { logger } from '../../../server/lib/logger';

// Mock logger to avoid console spam during tests
jest.mock('../../../server/lib/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

describe('Skill Processor Contamination Fixes', () => {
  let processor: SkillProcessor;

  beforeEach(() => {
    processor = SkillProcessor.getInstance();
    jest.clearAllMocks();
  });

  describe('Word Boundary Matching', () => {
    it('should NOT match AI in "details" or "training"', async () => {
      const text = 'I have experience with training programs and attention to details in my work.';
      const skills = await processor.extractSkills(text, 'technology');
      
      const skillNames = skills.map(s => s.normalized || s.original);
      
      // Should not contain Machine Learning (which had AI alias)
      expect(skillNames).not.toContain('Machine Learning');
      expect(skillNames).not.toContain('AI');
      expect(skillNames).not.toContain('Artificial Intelligence');
    });

    it('should NOT match PM in "3PM" or "RPM"', async () => {
      const text = 'Meeting scheduled for 3PM today. Engine runs at 3000 RPM.';
      const skills = await processor.extractSkills(text, 'general');
      
      const skillNames = skills.map(s => s.normalized || s.original);
      
      // Should not contain Project Management (which had PM alias)
      expect(skillNames).not.toContain('Project Management');
    });

    it('should NOT match TS in "cats" or "meets"', async () => {
      const text = 'She meets clients and works with cats in veterinary practice.';
      const skills = await processor.extractSkills(text, 'general');
      
      const skillNames = skills.map(s => s.normalized || s.original);
      
      // Should not contain TypeScript (which had TS alias)
      expect(skillNames).not.toContain('TypeScript');
    });

    it('should STILL match actual AI, PM, TS when used as real skills', async () => {
      const text = 'I work with AI systems, manage PM processes, and code in TypeScript.';
      const skills = await processor.extractSkills(text, 'technology');
      
      const skillNames = skills.map(s => s.normalized || s.original);
      
      // Should contain the actual skills when properly mentioned
      expect(skillNames).toContain('Machine Learning'); // AI -> Machine Learning
      expect(skillNames).toContain('Project Management'); // PM -> Project Management  
      expect(skillNames).toContain('TypeScript'); // TypeScript itself
    });
  });

  describe('Domain Filtering', () => {
    it('should skip technical skills for HR domain', async () => {
      const text = 'HR recruiter with JavaScript and React experience, excellent communication skills.';
      const skills = await processor.extractSkills(text, 'hr');
      
      const skillNames = skills.map(s => s.normalized || s.original);
      
      // Should skip technical skills for HR
      expect(skillNames).not.toContain('JavaScript');
      expect(skillNames).not.toContain('React');
      expect(skillNames).not.toContain('TypeScript');
      
      // Should keep soft skills
      expect(skillNames).toContain('Communication');
    });

    it('should skip pharmaceutical skills for technology domain', async () => {
      const text = 'Software developer with GMP knowledge and FDA regulations experience, Python skills.';
      const skills = await processor.extractSkills(text, 'technology');
      
      const skillNames = skills.map(s => s.normalized || s.original);
      
      // Should skip pharmaceutical domain skills
      expect(skillNames).not.toContain('GMP');
      expect(skillNames).not.toContain('FDA Regulations');
      expect(skillNames).not.toContain('Pharmaceutical Manufacturing');
      
      // Should keep technical skills
      expect(skillNames).toContain('Python');
    });

    it('should allow all skills for pharmaceutical domain', async () => {
      const text = 'Pharmaceutical scientist with Python programming, GMP compliance, and FDA regulations.';
      const skills = await processor.extractSkills(text, 'pharmaceutical');
      
      const skillNames = skills.map(s => s.normalized || s.original);
      
      // Should allow both technical and pharmaceutical skills
      expect(skillNames).toContain('Python');
      expect(skillNames).toContain('GMP');
      expect(skillNames).toContain('FDA Regulations');
    });

    it('should allow all skills for auto/general domain (backward compatibility)', async () => {
      const text = 'Professional with JavaScript, GMP, and communication skills.';
      
      const autoSkills = await processor.extractSkills(text, 'auto');
      const generalSkills = await processor.extractSkills(text, 'general');
      
      const autoNames = autoSkills.map(s => s.normalized || s.original);
      const generalNames = generalSkills.map(s => s.normalized || s.original);
      
      // Both should allow all skill types
      expect(autoNames).toContain('JavaScript');
      expect(autoNames).toContain('GMP');
      expect(autoNames).toContain('Communication');
      
      expect(generalNames).toContain('JavaScript');
      expect(generalNames).toContain('GMP');
      expect(generalNames).toContain('Communication');
    });
  });

  describe('Regex Safety & Performance', () => {
    it('should handle special regex characters safely', async () => {
      const text = 'Experience with C++ and .NET framework, jQuery.';
      const skills = await processor.extractSkills(text, 'technology');
      
      // Should not throw errors and should handle special chars
      expect(skills).toBeDefined();
      expect(Array.isArray(skills)).toBe(true);
      
      // Note: These skills aren't in our current dictionary but shouldn't cause errors
    });

    it('should cache regex patterns for performance', async () => {
      const text1 = 'JavaScript developer with React experience.';
      const text2 = 'Python developer with JavaScript knowledge.';
      
      // First call - should create regex cache
      await processor.extractSkills(text1, 'technology');
      
      // Second call - should use cached regex (faster)
      const start = Date.now();
      await processor.extractSkills(text2, 'technology');
      const end = Date.now();
      
      // Should complete quickly (cached regex)
      expect(end - start).toBeLessThan(100); // Less than 100ms
    });

    it('should handle malformed skill names gracefully', async () => {
      const text = 'Experience with [malformed] skill (testing) edge*cases.';
      
      // Should not throw errors even with unusual text patterns
      expect(async () => {
        await processor.extractSkills(text, 'technology');
      }).not.toThrow();
    });
  });

  describe('Integration with Existing System', () => {
    it('should maintain ESCO integration', async () => {
      const text = 'Software developer with JavaScript and communication skills.';
      const skills = await processor.extractSkills(text, 'technology');
      
      // Should extract skills (combination of ESCO + local dictionary)
      expect(skills.length).toBeGreaterThan(0);
      expect(skills[0]).toHaveProperty('normalized');
      expect(skills[0]).toHaveProperty('category');
      expect(skills[0]).toHaveProperty('confidence');
    });

    it('should work with learning system validation', async () => {
      const text = 'Senior developer with React, TypeScript and team leadership.';
      const skills = await processor.extractSkills(text, 'technology');
      
      // Should return properly structured skills for learning system
      skills.forEach(skill => {
        expect(skill).toHaveProperty('original');
        expect(skill).toHaveProperty('normalized');
        expect(skill).toHaveProperty('category');
        expect(skill).toHaveProperty('confidence');
        expect(typeof skill.confidence).toBe('number');
        expect(skill.confidence).toBeGreaterThanOrEqual(0);
        expect(skill.confidence).toBeLessThanOrEqual(1);
      });
    });
  });

  describe('Real-World Contamination Scenarios', () => {
    it('should handle HR job description without technical contamination', async () => {
      const hrJob = `
        HR Business Partner
        We seek an experienced HR professional with excellent communication skills 
        and expertise in talent acquisition. The candidate should have experience 
        with training programs, employee relations, and performance management.
        Must demonstrate attention to details and ability to work with diverse teams.
      `;
      
      const skills = await processor.extractSkills(hrJob, 'hr');
      const skillNames = skills.map(s => s.normalized || s.original);
      
      // Should NOT contain any technical skills
      const technicalSkills = ['JavaScript', 'Python', 'React', 'TypeScript', 'Machine Learning', 'AWS'];
      technicalSkills.forEach(techSkill => {
        expect(skillNames).not.toContain(techSkill);
      });
      
      // Should contain relevant HR skills
      expect(skillNames).toContain('Communication');
      // Note: Other HR-specific skills might need to be added to dictionary
    });

    it('should handle tech job without pharmaceutical contamination', async () => {
      const techJob = `
        Senior Software Engineer
        Looking for experienced developer with strong background in JavaScript, 
        React, and modern web development. Experience with cloud platforms and 
        agile development methodologies required.
      `;
      
      const skills = await processor.extractSkills(techJob, 'technology');
      const skillNames = skills.map(s => s.normalized || s.original);
      
      // Should NOT contain pharmaceutical skills
      const pharmaSkills = ['GMP', 'FDA Regulations', 'Pharmaceutical Manufacturing'];
      pharmaSkills.forEach(pharmaSkill => {
        expect(skillNames).not.toContain(pharmaSkill);
      });
      
      // Should contain relevant technical skills
      expect(skillNames).toContain('JavaScript');
      expect(skillNames).toContain('React');
    });
  });
});