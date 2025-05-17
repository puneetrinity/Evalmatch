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
  type: 'skills' | 'experience' | 'education' | 'contact' | 'summary' | 'other';
  content: string;
  startLine: number;
  endLine: number;
}

/**
 * Interface for parsed resume data
 */
interface ParsedResume {
  text: string;
  sections: ResumeSection[];
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
      error?: any;
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
      
      // If both methods failed or returned little text, try basic buffer extraction
      if (!extractionSuccess) {
        console.log('[ResumeParser] Fallback: basic buffer extraction');
        const bufferText = buffer.toString()
          .replace(/[^\x20-\x7E\n\r\t]/g, '') // Keep only printable ASCII characters
          .trim();
          
        const sampleText = bufferText.substring(0, 100).replace(/\n/g, ' ') + '...';
        extractionResults.push({
          method: 'buffer',
          textLength: bufferText.length,
          sampleText,
          success: bufferText.length > 50
        });
        
        console.log(`[ResumeParser] Fallback: buffer (text length: ${bufferText.length})`);
        
        // Only use buffer text if it's better than what we have
        if (bufferText.length > extractedText.length && bufferText.length > 50) {
          extractedText = bufferText;
          extractionSuccess = true;
        }
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
    return result.value;
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
    default:
      throw new Error(`Unsupported file type: ${mimeType}`);
  }
}
