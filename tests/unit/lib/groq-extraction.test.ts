import { extractName, extractExperience } from '../../../server/lib/groq';

// Helper function to test text-based experience extraction patterns
function testExperiencePattern(text: string): string {
  // Replicate the professional comprehensive pattern from groq.ts
  const comprehensivePattern = /\b(?:(?:(\d+(?:\.\d+)?)(?:\s*(?:-|–|—|\s+to\s+)\s*(\d+(?:\.\d+)?))?(\+)?)\s*(?:years?|yrs?|y)|(?:(?:over|more\s+than|at\s+least)\s*(\d+(?:\.\d+)?))\s*(?:years?|yrs?|y))\b/gi;
  
  // Context-aware pattern requiring "experience" nearby
  const contextAwarePattern = /\b(?=.*\b(?:experience|exp)\b)(?:(?:(\d+(?:\.\d+)?)(?:\s*(?:-|–|—|\s+to\s+)\s*(\d+(?:\.\d+)?))?(\+)?)\s*(?:years?|yrs?|y)|(?:(?:over|more\s+than|at\s+least)\s*(\d+(?:\.\d+)?))\s*(?:years?|yrs?|y))\b/gi;

  // First try context-aware extraction
  let match = contextAwarePattern.exec(text);
  if (match) {
    const min = parseFloat(match[1] || match[4]);
    const max = match[2] ? parseFloat(match[2]) : null;
    const plus = match[3] === '+';
    
    if (max) {
      return `${min}-${max} years`;
    } else if (plus) {
      return `${min}+ years`;
    } else if (match[0].toLowerCase().includes('over')) {
      return `over ${min} years`;
    } else if (match[0].toLowerCase().includes('more than')) {
      return `more than ${min} years`;
    } else if (match[0].toLowerCase().includes('at least')) {
      return `at least ${min} years`;
    } else {
      return `${min} years`;
    }
  }
  
  // Fallback to comprehensive pattern without context requirement
  contextAwarePattern.lastIndex = 0;
  comprehensivePattern.lastIndex = 0;
  match = comprehensivePattern.exec(text);
  if (match) {
    const min = parseFloat(match[1] || match[4]);
    const max = match[2] ? parseFloat(match[2]) : null;
    const plus = match[3] === '+';
    
    if (max) {
      return `${min}-${max} years`;
    } else if (plus) {
      return `${min}+ years`;
    } else if (match[0].toLowerCase().includes('over')) {
      return `over ${min} years`;
    } else if (match[0].toLowerCase().includes('more than')) {
      return `more than ${min} years`;
    } else if (match[0].toLowerCase().includes('at least')) {
      return `at least ${min} years`;
    } else {
      return `${min} years`;
    }
  }
  
  return "0 years";
}

describe('Resume Extraction Tests', () => {
  describe('Experience Pattern Extraction (Unit Tests)', () => {
    test('should extract decimal years', () => {
      const text = "With 3.5 years of software development experience";
      const result = testExperiencePattern(text);
      expect(result).toBe("3.5 years");
    });

    test('should extract range years', () => {
      const text = "I have 5-7 years experience in project management";
      const result = testExperiencePattern(text);
      expect(result).toBe("5-7 years");
    });

    test('should extract plus years', () => {
      const text = "Over 10+ years of leadership experience";
      const result = testExperiencePattern(text);
      expect(result).toBe("10+ years");
    });

    test('should extract phrase-based experience', () => {
      const text = "More than 8 years experience in data analysis";
      const result = testExperiencePattern(text);
      expect(result).toBe("more than 8 years");
    });

    test('should extract "over" phrase experience', () => {
      const text = "Over 12 years of consulting experience";
      const result = testExperiencePattern(text);
      expect(result).toBe("over 12 years");
    });

    test('should extract "at least" phrase experience', () => {
      const text = "At least 6 years of experience in marketing";
      const result = testExperiencePattern(text);
      expect(result).toBe("at least 6 years");
    });

    test('should extract em-dash ranges', () => {
      const text = "Between 3—5 years of experience";
      const result = testExperiencePattern(text);
      expect(result).toBe("3-5 years");
    });

    test('should extract "to" ranges', () => {
      const text = "From 2 to 4 years of experience in development";
      const result = testExperiencePattern(text);
      expect(result).toBe("2-4 years");
    });

    test('should handle context validation - prevent false positives', () => {
      const text = "I am 5 years old and love programming";
      const result = testExperiencePattern(text);
      expect(result).toBe("0 years"); // Should not match "5 years old"
    });

    test('should require experience context', () => {
      const text = "Company founded 10 years ago";
      const result = testExperiencePattern(text);
      expect(result).toBe("0 years"); // Should not match without experience context
    });

    test('should extract from work experience context', () => {
      const text = "Work Experience: 7 years in software engineering";
      const result = testExperiencePattern(text);
      expect(result).toBe("7 years");
    });

    test('should extract from professional experience context', () => {
      const text = "Professional experience includes 4.5 years in design";
      const result = testExperiencePattern(text);
      expect(result).toBe("4.5 years");
    });

    test('should handle multiple experience mentions', () => {
      const text = "5 years experience in frontend development and 3 years in backend";
      const result = testExperiencePattern(text);
      expect(result).toBe("5 years"); // Should return the first match
    });

    test('should handle abbreviated years', () => {
      const text = "8 yrs of experience in DevOps";
      const result = testExperiencePattern(text);
      expect(result).toBe("8 years");
    });
  });

  describe('Name Extraction (Integration Tests)', () => {
    test('should extract labeled names', async () => {
      const text = "Name: John Doe\nEmail: john@example.com";
      const result = await extractName(text);
      expect(result).toBe("John Doe");
    });

    test('should extract full name labels', async () => {
      const text = "Full Name: Maria Elena Rodriguez\nPhone: 555-1234";
      const result = await extractName(text);
      expect(result).toBe("Maria Elena Rodriguez");
    });

    test('should extract candidate name labels', async () => {
      const text = "Candidate Name: Dr. James Wilson Jr.\nAddress: 123 Main St";
      const result = await extractName(text);
      expect(result).toBe("Dr. James Wilson Jr.");
    });

    test('should extract international names with Unicode', async () => {
      const text = "Name: María-José Pérez González\nLocation: Madrid";
      const result = await extractName(text);
      expect(result).toBe("María-José Pérez González");
    });

    test('should extract Asian names with Unicode', async () => {
      const text = "申请人姓名: 李明\nName: Li Ming";
      const result = await extractName(text);
      expect(result).toBe("Li Ming");
    });

    test('should extract Arabic names with Unicode', async () => {
      const text = "Name: أحمد محمد علي\nEmail: ahmed@example.com";
      const result = await extractName(text);
      expect(result).toBe("أحمد محمد علي");
    });

    test('should extract names with titles and suffixes', async () => {
      const text = "Name: Dr. Elizabeth Thompson-Smith III\nTitle: Senior Engineer";
      const result = await extractName(text);
      expect(result).toBe("Dr. Elizabeth Thompson-Smith III");
    });

    test('should handle header-based extraction for unlabeled names', async () => {
      const text = "MICHAEL ANDERSON\nSoftware Engineer\nPhone: 555-0123";
      const result = await extractName(text);
      expect(result).toBe("MICHAEL ANDERSON");
    });

    test('should handle first line extraction as fallback', async () => {
      const text = "Sarah Johnson\n123 Oak Street\nNew York, NY 10001";
      const result = await extractName(text);
      expect(result).toBe("Sarah Johnson");
    });

    test('should preserve title prefixes after extraction', async () => {
      const text = "Dr. Robert Chen\nMedical Director";
      const result = await extractName(text);
      expect(result).toBe("Dr. Robert Chen");
    });

    test('should handle compound surnames', async () => {
      const text = "Name: Ana García-Martínez de la Cruz\nProfession: Architect";
      const result = await extractName(text);
      expect(result).toBe("Ana García-Martínez de la Cruz");
    });

    test('should prevent false positives - avoid company names', async () => {
      const text = "Experience at Microsoft Corporation\nWorked on Azure platform";
      const result = await extractName(text);
      expect(result).toBe("Unknown"); // Should not extract "Microsoft Corporation"
    });

    test('should handle mixed language resumes', async () => {
      const text = "名前: 田中太郎 (Tanaka Taro)\nSkills: JavaScript, Python";
      const result = await extractName(text);
      expect(result).toBe("田中太郎 (Tanaka Taro)");
    });

    test('should handle names with apostrophes', async () => {
      const text = "Name: Sean O'Connor\nExperience: 5 years";
      const result = await extractName(text);
      expect(result).toBe("Sean O'Connor");
    });

    test('should extract from header format', async () => {
      const text = "Resume of Jennifer Lee\nContact: jen.lee@email.com";
      const result = await extractName(text);
      expect(result).toBe("Jennifer Lee");
    });
  });

  describe('Experience Extraction (Integration Tests)', () => {
    test('should return experience object with totalYears', async () => {
      const text = "5 years of experience in software development";
      const result = await extractExperience(text);
      expect(result).toHaveProperty('totalYears');
      expect(result).toHaveProperty('yearsOfExperience');
    });

    test('should handle complex resume text', async () => {
      const text = `John Doe
      Software Engineer with 3.5 years of experience
      
      Experience:
      - Senior Developer at TechCorp (2021-2024)
      - Junior Developer at StartupCo (2020-2021)`;
      const result = await extractExperience(text);
      expect(result.yearsOfExperience).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle empty text', async () => {
      const nameResult = await extractName("");
      expect(nameResult).toBe("Unknown");
      
      const expResult = await extractExperience("");
      expect(expResult.totalYears).toBe("0 years");
    });

    test('should handle null/undefined input', async () => {
      const nameResult = await extractName(null as any);
      expect(nameResult).toBe("Unknown");
      
      const expResult = await extractExperience(undefined as any);
      expect(expResult.totalYears).toBe("0 years");
    });

    test('should handle very short text', async () => {
      const nameResult = await extractName("Hi");
      expect(nameResult).toBe("Unknown");
      
      const expResult = await extractExperience("Hi");
      expect(expResult.totalYears).toBe("0 years");
    });

    test('should handle text with only special characters', async () => {
      const nameResult = await extractName("!@#$%");
      expect(nameResult).toBe("Unknown");
      
      const expResult = await extractExperience("!@#$%");
      expect(expResult.totalYears).toBe("0 years");
    });

    test('should handle extremely long names gracefully', async () => {
      const longName = "A".repeat(200);
      const text = `Name: ${longName}`;
      const result = await extractName(text);
      expect(result).not.toBe(longName); // Should be handled appropriately
    });

    test('should handle malformed experience text', async () => {
      const text = "years experience of 5 software"; // Reversed order
      const result = await extractExperience(text);
      expect(result.totalYears).toBe("0 years"); // Should not match malformed patterns
    });
  });

  describe('Context Validation', () => {
    test('should require experience-related context for numbers', () => {
      const falsePositives = [
        "I am 25 years old",
        "Company founded 10 years ago", 
        "Product launched 3 years back",
        "Living in city for 5 years",
        "Married for 7 years"
      ];
      
      falsePositives.forEach(text => {
        const result = testExperiencePattern(text);
        expect(result).toBe("0 years");
      });
    });

    test('should accept valid experience contexts', () => {
      const validContexts = [
        "5 years of experience",
        "5 years experience in",
        "5 years working as",
        "5 years professional experience",
        "5 years work experience",
        "5 years industry experience",
        "experience: 5 years"
      ];
      
      validContexts.forEach(text => {
        const result = testExperiencePattern(text);
        expect(result).toBe("5 years");
      });
    });

    test('should handle case-insensitive context matching', () => {
      const text = "5 YEARS OF EXPERIENCE IN SOFTWARE";
      const result = testExperiencePattern(text);
      expect(result).toBe("5 years");
    });
  });
});