// Test script for our improved PDF parser
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get current file directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Directly read the PDF file
const pdfPath = path.join(__dirname, 'uploads', 'temp', 'test_resume.pdf');
const pdfBuffer = fs.readFileSync(pdfPath);

// Simple PDF text extraction test
async function extractTextFromPdf() {
  try {
    console.log('Testing PDF extraction...');
    console.log(`PDF file loaded: ${pdfPath} (${pdfBuffer.length} bytes)`);
    
    // Use the strings command as a basic extraction method
    const { exec } = await import('child_process');
    const util = await import('util');
    const execAsync = util.promisify(exec);
    
    // Create a temporary file
    const tempPath = path.join(__dirname, 'uploads', 'temp', 'output.txt');
    
    // Extract text using strings command
    await execAsync(`strings "${pdfPath}" > "${tempPath}"`);
    
    // Read the extracted text
    const extractedText = fs.readFileSync(tempPath, 'utf8');
    
    // Clean up text
    const cleanedText = extractedText
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n/g, '\n\n')
      .trim();
    
    // Show results
    console.log('\n--- EXTRACTION RESULTS ---');
    console.log(`Total characters extracted: ${cleanedText.length}`);
    console.log('\nSample of extracted text (first 500 chars):');
    console.log(cleanedText.substring(0, 500) + '...');
    
    // Write the full output to a text file for comparison
    const outputPath = path.join(__dirname, 'uploads', 'temp', 'extraction_result.txt');
    fs.writeFileSync(outputPath, cleanedText);
    console.log(`\nFull results written to: ${outputPath}`);
    
    return cleanedText;
  } catch (error) {
    console.error('Error extracting PDF text:', error);
    return null;
  }
}

// Run the test
extractTextFromPdf();