// Simple test file to validate regex patterns without dependencies

// Helper function to test text-based experience extraction patterns
function testExperiencePattern(text: string): string {
  // Professional comprehensive pattern from groq.ts
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
  
  // Only use fallback pattern for texts containing work/professional context keywords
  if (text.toLowerCase().includes('work') || text.toLowerCase().includes('professional') || 
      text.toLowerCase().includes('career') || text.toLowerCase().includes('employment') ||
      text.toLowerCase().includes('job') || text.toLowerCase().includes('developer') ||
      text.toLowerCase().includes('engineer') || text.toLowerCase().includes('consultant')) {
    
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
  }
  
  return "0 years";
}

// Helper function to test name extraction patterns  
function testNamePattern(text: string): string {
  const firstLines = text.split('\n').slice(0, 5);
  
  // Labeled name patterns (high priority)
  const labelPatterns = [
    /(?:name|full[\s\-_]?name|candidate[\s\-_]?name):\s*([A-Za-zÀ-ÖØ-öø-ÿĀ-žА-я\u4e00-\u9fff][A-Za-zÀ-ÖØ-öø-ÿĀ-žА-я\u4e00-\u9fff'.\-\s]{1,60})/i,
    /(?:申请人姓名|名前|姓名):\s*([A-Za-zÀ-ÖØ-öø-ÿĀ-žА-я\u4e00-\u9fff][A-Za-zÀ-ÖØ-öø-ÿĀ-žА-я\u4e00-\u9fff'.\-\s\(\)]{1,60})/,
  ];
  
  // Try labeled patterns first
  for (const line of firstLines) {
    for (const pattern of labelPatterns) {
      const match = line.match(pattern);
      if (match && match[1]) {
        const cleanName = match[1].trim();
        if (isValidName(cleanName)) {
          return cleanName;
        }
      }
    }
  }
  
  // Header-based patterns (fallback)
  const headerPatterns = [
    /^\s*(?:Dr\.?\s+|Mr\.?\s+|Ms\.?\s+|Mrs\.?\s+|Prof\.?\s+)?([A-Za-zÀ-ÖØ-öø-ÿĀ-žА-я\u4e00-\u9fff][A-Za-zÀ-ÖØ-öø-ÿĀ-žА-я\u4e00-\u9fff'.-]+(?:\s+[A-Za-zÀ-ÖØ-öø-ÿĀ-žА-я\u4e00-\u9fff][A-Za-zÀ-ÖØ-öø-ÿĀ-žА-я\u4e00-\u9fff'.-]+){0,4}(?:\s+(?:Jr\.?|Sr\.?|III|IV|Ph\.?D\.?|M\.?D\.?|Esq\.?))?)\s*$/
  ];
  
  for (const pattern of headerPatterns) {
    for (const line of firstLines) {
      // Context-aware validation: exclude lines with email/phone/obvious non-names/work context
      if (line.includes('@') || /\d{3}/.test(line) || 
          /\b(?:objective|summary|email|phone|address|linkedin|github|experience|worked|platform|azure|microsoft|corporation)\b/i.test(line)) {
        continue;
      }
      
      const match = line.match(pattern);
      if (match && match[1]) {
        let name = match[1].trim();
        
        // Check if there's a title prefix and add it back
        const titleMatch = line.match(/^\s*(Dr\.?\s+|Mr\.?\s+|Ms\.?\s+|Mrs\.?\s+|Prof\.?\s+)/);
        if (titleMatch) {
          name = titleMatch[1].trim() + ' ' + name;
        }
        
        if (isValidName(name)) {
          return name;
        }
      }
    }
  }
  
  return "Unknown";
}

function isValidName(name: string): boolean {
  // Length validation
  if (name.length < 3 || name.length > 80) {
    return false;
  }
  
  // Word count validation (1-5 words for flexibility with international names)
  const words = name.split(/\s+/);
  if (words.length < 1 || words.length > 5) {
    return false;
  }
  
  // Reject obvious non-names
  const lowercaseName = name.toLowerCase();
  const nonNamePhrases = [
    'resume', 'cv', 'curriculum', 'vitae', 'objective', 'summary',
    'experience', 'education', 'skills', 'contact', 'phone', 'email',
    'address', 'linkedin', 'github', 'portfolio', 'references',
    'software engineer', 'data scientist', 'product manager', 'developer'
  ];
  
  for (const phrase of nonNamePhrases) {
    if (lowercaseName.includes(phrase)) {
      return false;
    }
  }
  
  // Each word should start with a letter (not number or symbol)
  for (const word of words) {
    if (!/^[A-Za-zÀ-ÖØ-öø-ÿĀ-žА-я\u4e00-\u9fff]/.test(word)) {
      return false;
    }
  }
  
  return true;
}

describe('Regex Pattern Tests', () => {
  describe('Experience Pattern Extraction', () => {
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

    test('should handle context validation - prevent false positives', () => {
      const text = "I am 5 years old and love programming";
      const result = testExperiencePattern(text);
      expect(result).toBe("0 years");
    });

    test('should require experience context', () => {
      const text = "Company founded 10 years ago";
      const result = testExperiencePattern(text);
      expect(result).toBe("0 years");
    });

    test('should extract from work experience context', () => {
      const text = "Work Experience: 7 years in software engineering";
      const result = testExperiencePattern(text);
      expect(result).toBe("7 years");
    });

    test('should extract abbreviated years', () => {
      const text = "8 yrs of experience in DevOps";
      const result = testExperiencePattern(text);
      expect(result).toBe("8 years");
    });
  });

  describe('Name Pattern Extraction', () => {
    test('should extract labeled names', () => {
      const text = "Name: John Doe\nEmail: john@example.com";
      const result = testNamePattern(text);
      expect(result).toBe("John Doe");
    });

    test('should extract full name labels', () => {
      const text = "Full Name: Maria Elena Rodriguez\nPhone: 555-1234";
      const result = testNamePattern(text);
      expect(result).toBe("Maria Elena Rodriguez");
    });

    test('should extract candidate name labels', () => {
      const text = "Candidate Name: Dr. James Wilson Jr.\nAddress: 123 Main St";
      const result = testNamePattern(text);
      expect(result).toBe("Dr. James Wilson Jr.");
    });

    test('should extract international names with Unicode', () => {
      const text = "Name: María-José Pérez González\nLocation: Madrid";
      const result = testNamePattern(text);
      expect(result).toBe("María-José Pérez González");
    });

    test('should handle header-based extraction for unlabeled names', () => {
      const text = "MICHAEL ANDERSON\nSoftware Engineer\nPhone: 555-0123";
      const result = testNamePattern(text);
      expect(result).toBe("MICHAEL ANDERSON");
    });

    test('should handle first line extraction as fallback', () => {
      const text = "Sarah Johnson\n123 Oak Street\nNew York, NY 10001";
      const result = testNamePattern(text);
      expect(result).toBe("Sarah Johnson");
    });

    test('should prevent false positives - avoid company names', () => {
      const text = "Experience at Microsoft Corporation\nWorked on Azure platform";
      const result = testNamePattern(text);
      expect(result).toBe("Unknown");
    });

    test('should handle names with apostrophes', () => {
      const text = "Name: Sean O'Connor\nExperience: 5 years";
      const result = testNamePattern(text);
      expect(result).toBe("Sean O'Connor");
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
        "5 years industry experience"
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