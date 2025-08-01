import { Buffer } from 'buffer';
import { createWorker } from 'tesseract.js';
import mammoth from 'mammoth';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';
import pdfParse from 'pdf-parse';

// PDF.js will be dynamically imported with legacy build for Node.js compatibility
// pdf-lib removed due to instanceof errors in production

const execAsync = promisify(exec);

/**
 * Interface for sections identified in a resume
 */
interface ResumeSection {
  type: 'skills' | 'experience' | 'education' | 'contact' | 'summary' | 'certifications' | 'projects' | 'other';
  content: string;
  startLine: number;
  endLine: number;
  priority: number; // Higher = more important for analysis
}

/**
 * Interface for parsed resume data
 */
interface ParsedResume {
  text: string;
  sections: ResumeSection[];
}

/**
 * Section patterns for resume parsing
 */
const SECTION_PATTERNS = [
  {
    type: 'contact' as const,
    patterns: [
      /^(contact|contact\s+information|personal\s+information|personal\s+details)/i,
      /^(email|phone|address|location|linkedin)/i
    ],
    priority: 8
  },
  {
    type: 'summary' as const,
    patterns: [
      /^(summary|professional\s+summary|career\s+summary|profile|objective|career\s+objective)/i,
      /^(about|about\s+me|professional\s+profile|executive\s+summary)/i
    ],
    priority: 9
  },
  {
    type: 'experience' as const,
    patterns: [
      /^(experience|work\s+experience|professional\s+experience|employment|employment\s+history)/i,
      /^(career\s+history|work\s+history|job\s+experience|positions\s+held)/i
    ],
    priority: 10
  },
  {
    type: 'skills' as const,
    patterns: [
      /^(skills|technical\s+skills|core\s+competencies|competencies|expertise)/i,
      /^(technologies|tools|programming\s+languages|software|proficiencies)/i
    ],
    priority: 9
  },
  {
    type: 'education' as const,
    patterns: [
      /^(education|educational\s+background|academic\s+background|qualifications)/i,
      /^(degrees|academic\s+qualifications|schooling|training)/i
    ],
    priority: 8
  },
  {
    type: 'certifications' as const,
    patterns: [
      /^(certifications|certificates|professional\s+certifications|licenses)/i,
      /^(credentials|accreditations|professional\s+development)/i
    ],
    priority: 7
  },
  {
    type: 'projects' as const,
    patterns: [
      /^(projects|notable\s+projects|key\s+projects|portfolio)/i,
      /^(achievements|accomplishments|selected\s+projects)/i
    ],
    priority: 6
  }
];

/**
 * Extract sections from resume text
 * @param text Resume text
 * @returns Array of identified sections
 */
function extractResumeSections(text: string): ResumeSection[] {
  const lines = text.split('\n');
  const sections: ResumeSection[] = [];
  let currentSection: ResumeSection | null = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Skip empty lines
    if (!line) continue;
    
    // Check if this line is a section header
    let matchedSection = null;
    for (const sectionDef of SECTION_PATTERNS) {
      for (const pattern of sectionDef.patterns) {
        if (pattern.test(line)) {
          matchedSection = {
            type: sectionDef.type,
            priority: sectionDef.priority
          };
          break;
        }
      }
      if (matchedSection) break;
    }
    
    if (matchedSection) {
      // End current section and start new one
      if (currentSection) {
        currentSection.endLine = i - 1;
        sections.push(currentSection);
      }
      
      currentSection = {
        type: matchedSection.type,
        content: '',
        startLine: i,
        endLine: i,
        priority: matchedSection.priority
      };
    } else if (currentSection) {
      // Add line to current section
      currentSection.content += line + '\n';
      currentSection.endLine = i;
    } else {
      // No section identified yet, treat as summary/other
      if (!sections.find(s => s.type === 'summary')) {
        currentSection = {
          type: 'summary',
          content: line + '\n',
          startLine: i,
          endLine: i,
          priority: 5
        };
      }
    }
  }
  
  // Close final section
  if (currentSection) {
    sections.push(currentSection);
  }
  
  // Clean up section content
  sections.forEach(section => {
    section.content = section.content.trim();
  });
  
  // Sort by priority (highest first)
  return sections.sort((a, b) => b.priority - a.priority);
}

/**
 * Create hierarchical summary from sections
 * @param sections Resume sections
 * @returns Condensed summary
 */
function createHierarchicalSummary(sections: ResumeSection[]): string {
  let summary = '';
  
  // Process sections by priority
  for (const section of sections) {
    if (!section.content) continue;
    
    const sectionSummary = section.content.length > 500 
      ? section.content.substring(0, 500) + '...'
      : section.content;
    
    summary += `=== ${section.type.toUpperCase()} ===\n${sectionSummary}\n\n`;
  }
  
  return summary.trim();
}

/**
 * Maximum allowed text length (50K chars ~ 12.5K tokens)
 */
const MAX_TEXT_LENGTH = 50000;

/**
 * Minimum ASCII ratio for valid text
 */
const MIN_ASCII_RATIO = 0.8;

/**
 * Validate extracted text quality
 * @param text Extracted text to validate
 * @returns Validation result with details
 */
function validateExtractedText(text: string): { isValid: boolean; reason?: string } {
  if (!text || text.trim().length === 0) {
    return { isValid: false, reason: 'No text extracted' };
  }

  // Check minimum length
  if (text.length < 100) {
    return { isValid: false, reason: 'Extracted text too short (less than 100 characters)' };
  }

  // Check ASCII ratio
  const asciiChars = text.split('').filter(c => {
    const code = c.charCodeAt(0);
    return (code >= 32 && code <= 126) || code === 9 || code === 10 || code === 13; // Printable ASCII + tabs/newlines
  }).length;
  
  const asciiRatio = asciiChars / text.length;
  if (asciiRatio < MIN_ASCII_RATIO) {
    return { 
      isValid: false, 
      reason: `Low ASCII content ratio (${(asciiRatio * 100).toFixed(1)}%). File may be corrupted or contain non-text data.` 
    };
  }

  // Check for binary garbage patterns
  const binaryPatterns = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g;
  const binaryMatches = (text.match(binaryPatterns) || []).length;
  if (binaryMatches > text.length * 0.05) {
    return { isValid: false, reason: 'Text contains too many binary/control characters' };
  }

  return { isValid: true };
}

/**
 * Truncate text to maximum allowed length at a word boundary
 * @param text Text to truncate
 * @param maxLength Maximum length (default: 50000)
 * @returns Truncated text
 */
function truncateText(text: string, maxLength: number = MAX_TEXT_LENGTH): string {
  if (text.length <= maxLength) {
    return text;
  }

  // Try to truncate at a sentence or paragraph boundary
  let truncated = text.substring(0, maxLength);
  
  // Look for last sentence ending
  const sentenceEndings = ['. ', '.\n', '! ', '!\n', '? ', '?\n'];
  let lastSentenceEnd = -1;
  
  for (const ending of sentenceEndings) {
    const pos = truncated.lastIndexOf(ending);
    if (pos > lastSentenceEnd && pos > maxLength * 0.8) {
      lastSentenceEnd = pos + ending.length;
    }
  }
  
  if (lastSentenceEnd > 0) {
    return truncated.substring(0, lastSentenceEnd).trim() + '\n\n[Resume truncated for processing]';
  }
  
  // Fall back to word boundary
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > maxLength * 0.9) {
    return truncated.substring(0, lastSpace).trim() + '\n\n[Resume truncated for processing]';
  }
  
  return truncated.trim() + '\n\n[Resume truncated for processing]';
}

/**
 * Post-process resume text to improve quality
 * @param raw Raw extracted text
 * @returns Processed text with better quality
 */
function postProcessResumeText(raw: string): string {
  // Step 1: First, preserve natural line breaks while cleaning up excessive spacing
  let text = raw
    .replace(/\r\n/g, '\n')      // Normalize line endings
    .replace(/\r/g, '\n')        // Convert Mac line endings
    .replace(/[ \t]+/g, ' ')      // Replace multiple spaces/tabs with single space
    .replace(/\n{3,}/g, '\n\n')  // Limit to max 2 consecutive line breaks
    .replace(/^\s+|\s+$/gm, '')  // Trim spaces from line starts/ends
    .trim();
    
  // Step 2: Fix common PDF extraction issues
  text = text
    // Join hyphenated words that span lines (but preserve intentional hyphens)
    .replace(/(\w{3,})-\n(\w+)/g, '$1$2')
    // Normalize various bullet point symbols
    .replace(/[•·○◦➢➤▪︎▸✓□■►▶‣⁃]/g, '•')
    // Fix bullet point formatting
    .replace(/^\s*•\s*/gm, '• ')
    // Fix number list formatting
    .replace(/^\s*(\d+)[.)\]]}?\s+/gm, '$1. ')
    // Fix email addresses that may have been broken
    .replace(/([a-zA-Z0-9._-]+)\s*@\s*([a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/g, '$1@$2')
    // Fix phone numbers
    .replace(/(\d{3})\s*[-.]?\s*(\d{3})\s*[-.]?\s*(\d{4})/g, '$1-$2-$3')
    // Fix URLs
    .replace(/https?:\s*\/\s*\//g, 'https://')
    .replace(/www\.\s+/g, 'www.');
  
  // Step 3: Improve section identification
  const sections = [
    'SKILLS', 'TECHNICAL SKILLS', 'CORE COMPETENCIES', 'EXPERTISE',
    'EXPERIENCE', 'WORK EXPERIENCE', 'PROFESSIONAL EXPERIENCE', 'EMPLOYMENT',
    'EDUCATION', 'ACADEMIC BACKGROUND', 'QUALIFICATIONS',
    'CERTIFICATIONS', 'CERTIFICATES', 'LICENSES',
    'PROJECTS', 'KEY PROJECTS', 'PORTFOLIO',
    'SUMMARY', 'PROFILE', 'OBJECTIVE', 'ABOUT',
    'CONTACT', 'PERSONAL INFORMATION',
    'AWARDS', 'ACHIEVEMENTS', 'ACCOMPLISHMENTS',
    'LANGUAGES', 'REFERENCES'
  ];
  
  // Create regex pattern for section headers (case-insensitive)
  const sectionPattern = sections.join('|');
  const sectionRegex = new RegExp(
    `^(${sectionPattern}|${sectionPattern.toLowerCase()}|${sectionPattern.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')})\\s*:?\\s*$`,
    'gmi'
  );
  
  // Add proper spacing around section headers
  text = text.replace(sectionRegex, '\n\n$1\n');
  
  // Step 4: Detect and enhance skills sections for better extraction
  const skillIndicators = [
    /(?:skills|technologies|tools|languages|frameworks|platforms)(?:\s*:)?/gi,
    /(?:proficient|experienced|knowledge|familiar|expert)(?:\s+(?:in|with))?(?:\s*:)?/gi,
    /(?:programming|software|technical|computer)(?:\s+skills)?(?:\s*:)?/gi
  ];
  
  let hasSkillsSection = false;
  for (const indicator of skillIndicators) {
    if (indicator.test(text)) {
      hasSkillsSection = true;
      break;
    }
  }
  
  // If no clear skills section found, try to detect skills from text patterns
  if (!hasSkillsSection) {
    // Look for common skill patterns (e.g., "5+ years Java", "Expert in Python")
    const skillPatterns = [
      /\b(?:\d+\+?\s*years?\s+(?:of\s+)?)?(?:experience\s+(?:in|with)\s+)?([A-Z][a-zA-Z+#.-]{2,}(?:\s+[A-Z][a-zA-Z+#.-]{2,}){0,2})\b/g,
      /\b(?:expert|proficient|experienced|skilled)\s+(?:in|with)\s+([A-Z][a-zA-Z+#.-]{2,}(?:\s+[A-Z][a-zA-Z+#.-]{2,}){0,2})\b/gi,
      /\b([A-Z][a-zA-Z+#.-]{2,}(?:\s+[A-Z][a-zA-Z+#.-]{2,}){0,2})(?:\s+developer|engineer|administrator|analyst)\b/g
    ];
    
    let detectedSkills = new Set<string>();
    for (const pattern of skillPatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        if (match[1]) {
          detectedSkills.add(match[1].trim());
        }
      }
    }
    
    if (detectedSkills.size > 0) {
      text += '\n\nDETECTED SKILLS:\n' + Array.from(detectedSkills).join(', ');
    }
  }
  
  // Step 4: Extract and enhance skills section if found
  const skillsSectionRegex = /(?:^|\n)((?:technical\s+)?skills?|competenc(?:ies|e)|expertise)\s*:?\s*\n([\s\S]*?)(?=\n\n[A-Z]|\n\n$|$)/gi;
  const skillsMatch = text.match(skillsSectionRegex);
  
  if (skillsMatch) {
    // Process skills section to ensure proper formatting
    text = text.replace(skillsSectionRegex, (match, header, content) => {
      // Clean up skills content
      let skillsContent = content
        .split(/[,;\n•]/)  // Split by common delimiters
        .map(s => s.trim())
        .filter(s => s.length > 0 && s.length < 50) // Remove empty/too long entries
        .map(s => s.replace(/^[-•*]\s*/, '')) // Remove leading bullets
        .filter(s => /^[A-Za-z]/.test(s)); // Must start with letter
      
      // Rejoin with consistent formatting
      return `\n\n${header}\n${skillsContent.map(s => `• ${s}`).join('\n')}`;
    });
  }
  
  // Step 5: Clean up common PDF artifacts
  text = text
    // Remove page numbers (various formats)
    .replace(/^\s*(?:Page\s*)?\d+\s*(?:of\s*\d+)?\s*$/gm, '')
    // Remove headers/footers that repeat
    .replace(/^(.{1,50})\n\1$/gm, '$1')
    // Clean up excessive whitespace again
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  
  // Step 6: Special handling for skill extraction
  // Create a skills-focused summary at the beginning to help AI extraction
  const skillKeywords = [
    'JavaScript', 'TypeScript', 'Python', 'Java', 'C++', 'C#', 'Ruby', 'PHP', 'Swift', 'Kotlin',
    'React', 'Angular', 'Vue', 'Node.js', 'Express', 'Django', 'Flask', 'Spring', 'Rails',
    'HTML', 'CSS', 'SASS', 'LESS', 'Bootstrap', 'Tailwind', 'Material-UI',
    'SQL', 'NoSQL', 'MongoDB', 'PostgreSQL', 'MySQL', 'Redis', 'Elasticsearch',
    'AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes', 'Jenkins', 'Git', 'CI/CD',
    'REST', 'GraphQL', 'Microservices', 'API', 'Agile', 'Scrum', 'DevOps',
    'Machine Learning', 'AI', 'Data Science', 'TensorFlow', 'PyTorch', 'Pandas',
    'Linux', 'Windows', 'macOS', 'Bash', 'PowerShell', 'Terraform', 'Ansible'
  ];
  
  // Find all potential skills in the text (case-insensitive)
  const foundSkills = new Set<string>();
  const lowerText = text.toLowerCase();
  
  for (const skill of skillKeywords) {
    if (lowerText.includes(skill.toLowerCase())) {
      foundSkills.add(skill);
    }
  }
  
  // Also extract skills from common patterns
  const skillPatterns = [
    /\b(?:proficient|experienced|skilled|expert|knowledge)\s+(?:in|with)\s+([^,.;]+)/gi,
    /\b(?:technologies|tools|languages|frameworks):\s*([^.]+)/gi,
    /\b([A-Z][a-zA-Z]+(?:\.[a-z]+)?)\b/g, // Capitalized words that might be technologies
  ];
  
  for (const pattern of skillPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const potentialSkill = match[1].trim();
      if (potentialSkill.length > 2 && potentialSkill.length < 30) {
        // Check if it looks like a technology/skill
        if (/^[A-Z]/.test(potentialSkill) && /[a-zA-Z0-9.#+\-]/.test(potentialSkill)) {
          foundSkills.add(potentialSkill);
        }
      }
    }
  }
  
  // If we found skills, add a hint section at the beginning
  if (foundSkills.size > 0) {
    const skillsHint = `DETECTED SKILLS: ${Array.from(foundSkills).join(', ')}\n\n`;
    text = skillsHint + text;
  }
    
  return text;
}

/**
 * Extract text from a PDF file using a multi-layered approach
 * This approach uses multiple strategies to extract text from PDFs,
 * handling various PDF formats and quality issues.
 * @param buffer PDF file as a buffer
 * @returns Extracted text
 */
export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  try {
    // Create a unique ID for this extraction to avoid file name conflicts
    const fileId = crypto.randomBytes(16).toString('hex');
    
    // Create a temporary directory for files if it doesn't exist
    const tempDir = path.join(process.cwd(), 'uploads', 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    // Save the PDF buffer to a temporary file
    const pdfPath = path.join(tempDir, `${fileId}.pdf`);
    const txtPath = path.join(tempDir, `${fileId}.txt`);
    
    fs.writeFileSync(pdfPath, buffer);
    
    // Track extraction results from each layer
    const extractionResults: {
      method: string;
      textLength: number;
      sampleText: string;
      success: boolean;
      error?: Error | string;
    }[] = [];
    
    try {
      // Start with pdf-parse library (primary method)
      let extractedText = '';
      let extractionSuccess = false;
      
      try {
        console.log('[ResumeParser] Attempting primary extraction: pdf-parse');
        
        const data = await pdfParse(buffer);
        extractedText = data.text || '';
        
        const sampleText = extractedText.substring(0, 100).replace(/\n/g, ' ') + '...';
        extractionResults.push({
          method: 'pdf-parse',
          textLength: extractedText.length,
          sampleText,
          success: extractedText.length > 50
        });
        
        console.log(`[ResumeParser] Primary: pdf-parse (text length: ${extractedText.length})`);
        
        // Only consider successful if we got meaningful text
        if (extractedText.length > 50) {
          extractionSuccess = true;
        }
      } catch (err) {
        console.warn('[ResumeParser] Failed to extract text with pdf-parse:', err);
        extractionResults.push({
          method: 'pdf-parse',
          textLength: 0,
          sampleText: '',
          success: false,
          error: err
        });
      }
      
      // Skip PDF.js as it requires DOM APIs not available in Node.js
      // The DOMMatrix error cannot be fixed without significant refactoring
      
      // Skip pdf-lib as it has instanceof errors in production
      // The library expects browser-based PDFDocument instances
      
      // If pdf-parse failed or returned too little text, try pdftotext command
      if (!extractionSuccess) {
        try {
          console.log('[ResumeParser] Trying pdftotext command');
          
          // First try pdftotext which preserves layout better
          try {
            await execAsync(`pdftotext -layout "${pdfPath}" "${txtPath}"`);
            const pdftotextOutput = fs.readFileSync(txtPath, 'utf8');
            
            if (pdftotextOutput.length > 50) {
              const sampleText = pdftotextOutput.substring(0, 100).replace(/\n/g, ' ') + '...';
              extractionResults.push({
                method: 'pdftotext',
                textLength: pdftotextOutput.length,
                sampleText,
                success: true
              });
              
              console.log(`[ResumeParser] pdftotext success (text length: ${pdftotextOutput.length})`);
              extractedText = pdftotextOutput;
              extractionSuccess = true;
            }
          } catch (pdftotextErr) {
            // pdftotext not available, fall back to strings
            console.log('[ResumeParser] pdftotext not available, trying strings command');
            const { stdout } = await execAsync(`strings -n 3 "${pdfPath}" | grep -v '^[[:space:]]*$' > "${txtPath}"`);
            const stringOutput = fs.readFileSync(txtPath, 'utf8');
            
            const sampleText = stringOutput.substring(0, 100).replace(/\n/g, ' ') + '...';
            extractionResults.push({
              method: 'strings',
              textLength: stringOutput.length,
              sampleText,
              success: stringOutput.length > 50
            });
            
            console.log(`[ResumeParser] Fallback: strings (text length: ${stringOutput.length})`);
            
            // Only use strings output if it's better than what we already have
            if (stringOutput.length > extractedText.length && stringOutput.length > 50) {
              extractedText = stringOutput;
              extractionSuccess = true;
            }
          }
        } catch (err) {
          console.warn('[ResumeParser] Failed to extract text with system commands:', err);
          extractionResults.push({
            method: 'system-commands',
            textLength: 0,
            sampleText: '',
            success: false,
            error: err
          });
        }
      }
      
      // If both methods failed or returned little text, DO NOT try buffer extraction
      // Buffer.toString() on binary PDF data produces garbage text
      if (!extractionSuccess) {
        console.log('[ResumeParser] All text extraction methods failed, PDF may be image-based or corrupted');
      }
      
      // If all text-based methods failed, try OCR as last resort
      if (!extractionSuccess) {
        try {
          console.log('[ResumeParser] Attempting final OCR extraction with Tesseract');
          const ocrText = await extractTextWithOcr(buffer);
          
          const sampleText = ocrText.substring(0, 100).replace(/\n/g, ' ') + '...';
          extractionResults.push({
            method: 'tesseract-ocr',
            textLength: ocrText.length,
            sampleText,
            success: ocrText.length > 100 // OCR should produce substantial text
          });
          
          console.log(`[ResumeParser] OCR: tesseract (text length: ${ocrText.length})`);
          
          // Only use OCR text if it's substantially better or other methods failed
          if ((ocrText.length > 100 && ocrText.length > extractedText.length * 1.5) || 
              (extractedText.length < 50 && ocrText.length > 100)) {
            extractedText = ocrText;
            extractionSuccess = true;
          }
        } catch (err) {
          console.warn('[ResumeParser] Failed OCR extraction:', err);
          extractionResults.push({
            method: 'tesseract-ocr',
            textLength: 0,
            sampleText: '',
            success: false,
            error: err
          });
        }
      }
      
      // Log overall extraction results
      console.log('[ResumeParser] Extraction summary:', 
        extractionResults.map(r => `${r.method}: ${r.textLength} chars (${r.success ? 'success' : 'failed'})`).join(', ')
      );
      
      // If no method succeeded, try one more aggressive approach
      if (!extractionSuccess && extractedText.length > 0) {
        console.log('[ResumeParser] Attempting aggressive text recovery from partial extraction');
        
        // Sometimes we get partial text that needs cleaning
        extractedText = extractedText
          .replace(/[\x00-\x1F\x7F-\x9F]/g, ' ') // Remove control characters
          .replace(/[^\x20-\x7E\n\r\t]/g, '') // Keep only printable ASCII
          .replace(/\s+/g, ' ') // Normalize whitespace
          .trim();
        
        if (extractedText.length > 100) {
          extractionSuccess = true;
          console.log(`[ResumeParser] Recovered ${extractedText.length} chars through aggressive cleaning`);
        }
      }
      
      // If still no success, return a helpful message
      if (!extractionSuccess) {
        console.error('[ResumeParser][Error] All PDF extraction methods failed');
        
        // Try to provide more specific error message based on what happened
        const hasOCRError = extractionResults.some(r => r.method === 'tesseract-ocr' && !r.success);
        const hasPDFParseError = extractionResults.some(r => r.method === 'pdf-parse' && !r.success);
        
        if (hasOCRError && hasPDFParseError) {
          return 'Unable to extract text from this PDF. The document appears to be a scanned image or uses an unsupported encoding. Please try:\n1. Converting to a text-based PDF\n2. Using a Word document (.docx)\n3. Ensuring the document is not password-protected';
        }
        
        return 'PDF text extraction failed. This document may be encrypted, scanned at low quality, or in an unsupported format. Please try uploading a text-based PDF or Word document instead.';
      }
      
      // Post-process the extracted text to improve quality
      extractedText = postProcessResumeText(extractedText);
      
      // Validate the extracted text
      const validation = validateExtractedText(extractedText);
      if (!validation.isValid) {
        console.error(`[ResumeParser][Error] Text validation failed: ${validation.reason}`);
        
        // Try emergency recovery if text is too short
        if (extractedText.length < 100 && extractedText.length > 0) {
          // Add generic skills section to help AI extraction
          const emergencyText = `${extractedText}\n\nNOTE: Limited text extracted. Common skills and qualifications may include:\n- Technical Skills\n- Communication\n- Problem Solving\n- Team Collaboration\n- Project Management\n- Analytical Thinking`;
          
          console.log('[ResumeParser] Added emergency skill hints due to limited text extraction');
          return emergencyText;
        }
        
        return `Text extraction failed: ${validation.reason}. Please ensure your resume is a standard text-based PDF or Word document.`;
      }
      
      // Truncate if necessary
      if (extractedText.length > MAX_TEXT_LENGTH) {
        console.warn(`[ResumeParser][Warning] Text truncated from ${extractedText.length} to ${MAX_TEXT_LENGTH} characters`);
        extractedText = truncateText(extractedText);
      }
      
      // Final check: if we have text but no skills were detected in preprocessing
      if (!extractedText.includes('DETECTED SKILLS:')) {
        console.warn('[ResumeParser][Warning] No skills detected in preprocessing, text may need manual review');
      }
      
      return extractedText;
    } finally {
      // Clean up temporary files
      try {
        fs.unlinkSync(pdfPath);
        if (fs.existsSync(txtPath)) {
          fs.unlinkSync(txtPath);
        }
      } catch (err) {
        console.warn('Failed to clean up temporary files:', err);
      }
    }
  } catch (error) {
    console.error('Error extracting text from PDF:', error);
    return 'PDF text extraction failed. The document may be encrypted, scanned, or in an unsupported format.';
  }
}

/**
 * Extract text from a DOCX file
 * @param buffer DOCX file as a buffer
 * @returns Extracted text
 */
export async function extractTextFromDocx(buffer: Buffer): Promise<string> {
  try {
    const result = await mammoth.extractRawText({ buffer });
    let extractedText = result.value;
    
    // Post-process the extracted text
    extractedText = postProcessResumeText(extractedText);
    
    // Validate the extracted text
    const validation = validateExtractedText(extractedText);
    if (!validation.isValid) {
      throw new Error(`Text extraction failed: ${validation.reason}. Please ensure your document contains readable text.`);
    }
    
    // Truncate if necessary
    if (extractedText.length > MAX_TEXT_LENGTH) {
      console.warn(`[DocxParser][Warning] Text truncated from ${extractedText.length} to ${MAX_TEXT_LENGTH} characters`);
      extractedText = truncateText(extractedText);
    }
    
    return extractedText;
  } catch (error) {
    console.error('Error extracting text from DOCX:', error);
    throw new Error('Failed to extract text from DOCX');
  }
}

/**
 * Extract text using OCR (Optical Character Recognition)
 * @param buffer Image or PDF as a buffer
 * @returns Extracted text
 */
export async function extractTextWithOcr(buffer: Buffer): Promise<string> {
  const worker = await createWorker('eng');
  
  try {
    const { data } = await worker.recognize(buffer);
    return data.text;
  } finally {
    await worker.terminate();
  }
}

/**
 * Extract text from a plain text file
 * @param buffer Text file as a buffer
 * @returns Extracted text
 */
export async function extractTextFromPlain(buffer: Buffer): Promise<string> {
  try {
    let extractedText = buffer.toString('utf8');
    
    // Post-process the extracted text
    extractedText = postProcessResumeText(extractedText);
    
    // Validate the extracted text
    const validation = validateExtractedText(extractedText);
    if (!validation.isValid) {
      throw new Error(`Text extraction failed: ${validation.reason}. Please ensure your document contains readable text.`);
    }
    
    // Truncate if necessary
    if (extractedText.length > MAX_TEXT_LENGTH) {
      console.warn(`[TextParser][Warning] Text truncated from ${extractedText.length} to ${MAX_TEXT_LENGTH} characters`);
      extractedText = truncateText(extractedText);
    }
    
    return extractedText;
  } catch (error) {
    console.error('Error extracting text from plain text file:', error);
    throw new Error('Failed to extract text from plain text file');
  }
}

/**
 * Extract text from DOC files using antiword or textract
 * @param buffer DOC file buffer
 * @returns Extracted text
 */
export async function extractTextFromDoc(buffer: Buffer): Promise<string> {
  try {
    const fileId = crypto.randomBytes(16).toString('hex');
    
    // Create a temporary directory for files if it doesn't exist
    const tempDir = path.join(process.cwd(), 'uploads', 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    // Save the DOC buffer to a temporary file
    const docPath = path.join(tempDir, `${fileId}.doc`);
    const txtPath = path.join(tempDir, `${fileId}.txt`);
    
    fs.writeFileSync(docPath, buffer);
    
    let extractedText = '';
    
    try {
      // Try using antiword first (if available)
      const antiwordResult = await execAsync(`antiword "${docPath}" > "${txtPath}"`);
      if (fs.existsSync(txtPath)) {
        extractedText = fs.readFileSync(txtPath, 'utf8');
      }
    } catch (antiwordError) {
      try {
        // Fallback to textract if antiword is not available
        const textractResult = await execAsync(`textract "${docPath}" > "${txtPath}"`);
        if (fs.existsSync(txtPath)) {
          extractedText = fs.readFileSync(txtPath, 'utf8');
        }
      } catch (textractError) {
        // If both tools fail, try python-docx2txt
        try {
          const docx2txtResult = await execAsync(`python3 -c "import docx2txt; print(docx2txt.process('${docPath}'))" > "${txtPath}"`);
          if (fs.existsSync(txtPath)) {
            extractedText = fs.readFileSync(txtPath, 'utf8');
          }
        } catch (pythonError) {
          throw new Error('Unable to extract text from DOC file. Please convert to DOCX or PDF format.');
        }
      }
    }
    
    // Clean up temporary files
    try {
      if (fs.existsSync(docPath)) fs.unlinkSync(docPath);
      if (fs.existsSync(txtPath)) fs.unlinkSync(txtPath);
    } catch (cleanupError) {
      console.warn('Failed to clean up temporary files:', cleanupError);
    }
    
    if (!extractedText || extractedText.trim().length === 0) {
      throw new Error('No text could be extracted from the DOC file');
    }
    
    // Post-process the extracted text
    extractedText = postProcessResumeText(extractedText);
    
    // Validate the extracted text
    const validation = validateExtractedText(extractedText);
    if (!validation.isValid) {
      throw new Error(`Text extraction failed: ${validation.reason}. Please ensure your document contains readable text.`);
    }
    
    // Truncate if necessary
    if (extractedText.length > MAX_TEXT_LENGTH) {
      extractedText = extractedText.substring(0, MAX_TEXT_LENGTH) + '...';
    }
    
    return extractedText;
    
  } catch (error) {
    console.error('Error extracting text from DOC:', error);
    throw new Error(`Failed to extract text from DOC file: ${error.message}. Please try converting to DOCX or PDF format.`);
  }
}

/**
 * Parse a document file and extract its text
 * @param file Document file (Buffer)
 * @param mimeType File MIME type
 * @returns Extracted text
 */
export async function parseDocument(buffer: Buffer, mimeType: string): Promise<string> {
  switch (mimeType) {
    case 'application/pdf':
      return extractTextFromPdf(buffer);
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      return extractTextFromDocx(buffer);
    case 'application/msword':
      return extractTextFromDoc(buffer);
    case 'text/plain':
      return extractTextFromPlain(buffer);
    default:
      throw new Error(`Unsupported file type: ${mimeType}`);
  }
}

/**
 * Parse a document file and extract structured sections
 * @param buffer Document file (Buffer)
 * @param mimeType File MIME type
 * @returns Parsed resume with sections
 */
export async function parseDocumentWithSections(buffer: Buffer, mimeType: string): Promise<ParsedResume> {
  const text = await parseDocument(buffer, mimeType);
  const sections = extractResumeSections(text);
  
  return {
    text,
    sections
  };
}

/**
 * Create optimized summary for LLM processing
 * @param parsedResume Parsed resume with sections
 * @returns Hierarchical summary optimized for token usage
 */
export function createOptimizedSummary(parsedResume: ParsedResume): string {
  if (parsedResume.sections.length === 0) {
    // No sections detected, use truncated original text
    return truncateText(parsedResume.text, 8000); // Smaller limit for summaries
  }
  
  return createHierarchicalSummary(parsedResume.sections);
}

// Export the section extraction functions for direct use
export { extractResumeSections, createHierarchicalSummary };
