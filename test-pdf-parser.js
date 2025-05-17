// Test script for our improved PDF parser
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseDocument } from './server/lib/document-parser.js';

// Get current file directory (ES modules don't have __dirname)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testPdfParser() {
  try {
    console.log('Testing enhanced PDF parser with resume...');
    
    // Read the test PDF file
    const pdfPath = path.join(__dirname, 'uploads', 'temp', 'test_resume.pdf');
    const pdfBuffer = fs.readFileSync(pdfPath);
    
    console.log(`PDF file loaded: ${pdfPath} (${pdfBuffer.length} bytes)`);
    
    // Process with our enhanced parser
    const extractedText = await parseDocument(pdfBuffer, 'application/pdf');
    
    // Show results
    console.log('\n--- EXTRACTION RESULTS ---');
    console.log(`Total characters extracted: ${extractedText.length}`);
    console.log('\nSample of extracted text:');
    console.log(extractedText.substring(0, 500) + '...');
    
    // Write the full output to a text file for comparison
    const outputPath = path.join(__dirname, 'uploads', 'temp', 'extraction_result.txt');
    fs.writeFileSync(outputPath, extractedText);
    console.log(`\nFull results written to: ${outputPath}`);
    
  } catch (error) {
    console.error('Error testing PDF parser:', error);
  }
}

// Run the test
testPdfParser();