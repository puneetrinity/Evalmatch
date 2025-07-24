// Test script for PDF text extraction using pdf-parse
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pdfParse from 'pdf-parse';

// Get current file directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function extractTextFromPdf() {
  try {
    console.log('Testing PDF extraction with pdf-parse...');
    
    // Read the test PDF file
    const pdfPath = path.join(__dirname, 'uploads', 'temp', 'test_resume.pdf');
    const pdfBuffer = fs.readFileSync(pdfPath);
    
    console.log(`PDF file loaded: ${pdfPath} (${pdfBuffer.length} bytes)`);
    
    // Use pdf-parse to extract text
    const data = await pdfParse(pdfBuffer);
    
    // Show results
    console.log('\n--- EXTRACTION RESULTS (pdf-parse) ---');
    console.log(`Number of pages: ${data.numpages}`);
    console.log(`Total characters extracted: ${data.text.length}`);
    console.log('\nSample of extracted text (first 500 chars):');
    console.log(data.text.substring(0, 500) + '...');
    
    // Write the full output to a text file for comparison
    const outputPath = path.join(__dirname, 'uploads', 'temp', 'pdf_parse_result.txt');
    fs.writeFileSync(outputPath, data.text);
    console.log(`\nFull results written to: ${outputPath}`);
    
    return data.text;
  } catch (error) {
    console.error('Error extracting PDF text with pdf-parse:', error);
    return null;
  }
}

// Run the extraction
extractTextFromPdf();