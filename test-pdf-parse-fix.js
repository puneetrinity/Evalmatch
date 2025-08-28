#!/usr/bin/env node

/**
 * Test script to verify pdf-parse dynamic import fix
 */

import fs from 'fs';
import path from 'path';

async function testPdfParseDynamicImport() {
    console.log('Testing pdf-parse dynamic import fix...');
    
    try {
        // Test dynamic import (this should work without the ENOENT error)
        console.log('1. Testing dynamic import of pdf-parse...');
        const pdfParse = (await import('pdf-parse')).default;
        console.log('✅ pdf-parse imported successfully via dynamic import');
        
        // Test with a real PDF file
        const pdfPath = '/home/ews/Evalmatch/test/data/05-versions-space.pdf';
        if (fs.existsSync(pdfPath)) {
            console.log('2. Testing PDF parsing with real file...');
            const pdfBuffer = fs.readFileSync(pdfPath);
            const result = await pdfParse(pdfBuffer);
            console.log(`✅ PDF parsed successfully: ${result.text.length} characters extracted`);
        } else {
            console.log('2. No test PDF file found, skipping parse test');
        }
        
        console.log('✅ All tests passed! pdf-parse dynamic import is working correctly.');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

testPdfParseDynamicImport();