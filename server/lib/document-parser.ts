import { Buffer } from 'buffer';
import { createWorker } from 'tesseract.js';
import mammoth from 'mammoth';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';
import pdfParse from 'pdf-parse';
import { PDFDocument } from 'pdf-lib';

// For PDF.js (we'll dynamically import to avoid issues)
// import * as pdfjsLib from 'pdfjs-dist';

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
  // Step 1: Basic cleanup
  let text = raw
    .replace(/\s+/g, ' ')        // Replace multiple spaces with a single space
    .replace(/\n\s*\n/g, '\n\n') // Keep paragraph breaks
    .trim();
    
  // Step 2: Fix common PDF extraction issues
  text = text
    // Join hyphenated words that span lines 
    .replace(/(\w+)-\s*\n\s*(\w+)/g, (_, p1, p2) => `${p1}${p2}`)
    // Normalize bullet points
    .replace(/[•·○◦➢➤▪︎▸✓□■]/g, '* ')
    // Fix bullet point spacing
    .replace(/\*\s+/g, '* ')
    // Fix number list formatting
    .replace(/(\d+)\.\s+/g, '$1. ')
    // Fix email addresses that may have been broken
    .replace(/([a-zA-Z0-9._-]+)\s+@\s+([a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/g, '$1@$2');
  
  // Step 3: Improve section identification with extra spacing
  const sections = [
    'SKILLS', 'EXPERIENCE', 'EDUCATION', 'WORK EXPERIENCE',
    'PROFESSIONAL EXPERIENCE', 'EMPLOYMENT HISTORY', 'QUALIFICATIONS',
    'CERTIFICATIONS', 'PROJECTS', 'SUMMARY', 'OBJECTIVE', 'CONTACT',
    'PERSONAL INFORMATION', 'AWARDS', 'ACHIEVEMENTS', 'REFERENCES'
  ];
  
  // Add extra newlines before section headers for better parsing
  for (const section of sections) {
    const sectionRegex = new RegExp(`(\\n|^)(${section}|${section.toLowerCase()}|${section.charAt(0).toUpperCase() + section.slice(1).toLowerCase()})(\\s*:)?\\s*`, 'g');
    text = text.replace(sectionRegex, '\n\n$1$2$3\n');
  }
  
  // Step 4: Identify and format lists consistently
  text = text
    .replace(/(\n\s*[*•·○◦➢➤▪︎▸✓□■])/g, '\n* ') // Normalize all bullet types to "*"
    .replace(/(\n\s*\d+[\.)]) /g, '\n$1 ');     // Preserve numbering but normalize spacing
    
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
      
      // Next, try PDF.js if pdf-parse didn't work well
      if (!extractionSuccess) {
        try {
          console.log('[ResumeParser] Attempting secondary extraction: PDF.js');
          
          // Dynamically import PDF.js to avoid dependency issues
          const pdfjsLib = await import('pdfjs-dist');
          
          // Set the worker source
          const pdfjsWorker = await import('pdfjs-dist/build/pdf.worker.js');
          pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;
          
          // Load the PDF document
          const loadingTask = pdfjsLib.getDocument({ data: buffer });
          const pdfDocument = await loadingTask.promise;
          
          // Extract text from each page
          let pdfText = '';
          for (let i = 1; i <= pdfDocument.numPages; i++) {
            const page = await pdfDocument.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(' ');
            pdfText += pageText + '\n\n';
          }
          
          const sampleText = pdfText.substring(0, 100).replace(/\n/g, ' ') + '...';
          extractionResults.push({
            method: 'pdf.js',
            textLength: pdfText.length,
            sampleText,
            success: pdfText.length > 50
          });
          
          console.log(`[ResumeParser] Secondary: PDF.js (text length: ${pdfText.length}, items: ${pdfDocument.numPages} pages)`);
          
          // Only use PDF.js output if it's better than what we have
          if (pdfText.length > extractedText.length && pdfText.length > 50) {
            extractedText = pdfText;
            extractionSuccess = true;
          }
        } catch (err) {
          console.warn('[ResumeParser] Failed to extract text with PDF.js:', err);
          extractionResults.push({
            method: 'pdf.js',
            textLength: 0,
            sampleText: '',
            success: false,
            error: err
          });
        }
      }
      
      // Next, try pdf-lib for structural analysis
      if (!extractionSuccess) {
        try {
          console.log('[ResumeParser] Attempting structural extraction: pdf-lib');
          
          const pdfDoc = await PDFDocument.load(buffer);
          const pages = pdfDoc.getPages();
          let pdfLibText = '';
          
          for (const page of pages) {
            const { width, height } = page.getSize();
            // Extract text if possible (limited capability in pdf-lib)
            const text = page.doc.context.lookupMaybe(page.ref, 'Contents');
            if (text) {
              pdfLibText += `Page (${width}x${height}): ${text.toString()}\n\n`;
            }
          }
          
          const sampleText = pdfLibText.substring(0, 100).replace(/\n/g, ' ') + '...';
          extractionResults.push({
            method: 'pdf-lib',
            textLength: pdfLibText.length,
            sampleText,
            success: pdfLibText.length > 50
          });
          
          console.log(`[ResumeParser] Structural: pdf-lib (text length: ${pdfLibText.length}, pages: ${pages.length})`);
          
          // Only use pdf-lib output if it's substantially better
          if (pdfLibText.length > extractedText.length * 1.5 && pdfLibText.length > 50) {
            extractedText = pdfLibText;
            extractionSuccess = true;
          }
        } catch (err) {
          console.warn('[ResumeParser] Failed to extract with pdf-lib:', err);
          extractionResults.push({
            method: 'pdf-lib',
            textLength: 0,
            sampleText: '',
            success: false,
            error: err
          });
        }
      }
      
      // If pdf-parse failed or returned too little text, try the strings command
      if (!extractionSuccess) {
        try {
          console.log('[ResumeParser] Fallback: strings command');
          const { stdout } = await execAsync(`strings "${pdfPath}" > "${txtPath}"`);
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
        } catch (err) {
          console.warn('[ResumeParser] Failed to extract text with strings command:', err);
          extractionResults.push({
            method: 'strings',
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
      
      // If no method succeeded, return a helpful message
      if (!extractionSuccess) {
        console.error('[ResumeParser][Error] All PDF extraction methods failed');
        return 'PDF text extraction failed. This document may be encrypted, scanned at low quality, or in an unsupported format. Please try uploading a text-based PDF or Word document instead.';
      }
      
      // Post-process the extracted text to improve quality
      extractedText = postProcessResumeText(extractedText);
      
      // Validate the extracted text
      const validation = validateExtractedText(extractedText);
      if (!validation.isValid) {
        console.error(`[ResumeParser][Error] Text validation failed: ${validation.reason}`);
        return `Text extraction failed: ${validation.reason}. Please ensure your resume is a standard text-based PDF or Word document.`;
      }
      
      // Truncate if necessary
      if (extractedText.length > MAX_TEXT_LENGTH) {
        console.warn(`[ResumeParser][Warning] Text truncated from ${extractedText.length} to ${MAX_TEXT_LENGTH} characters`);
        extractedText = truncateText(extractedText);
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
