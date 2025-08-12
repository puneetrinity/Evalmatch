/**
 * Advanced File Security Tests
 * Comprehensive testing of file upload security, malicious content detection,
 * and file type validation with real-world attack scenarios
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import { SecurityValidator } from '../../shared/security-validation';

describe('Advanced File Security Tests', () => {
  let app: any;
  const securityIncidents: Array<{
    testType: string;
    threatLevel: 'low' | 'medium' | 'high' | 'critical';
    blocked: boolean;
    details: string;
  }> = [];

  beforeAll(async () => {
    const { createFixedTestApp } = await import('../helpers/test-server-fixed');
    app = await createFixedTestApp();
  });

  afterAll(async () => {
    generateSecurityReport();
    
    const { clearFixedTestApp } = await import('../helpers/test-server-fixed');
    clearFixedTestApp();
  });

  describe('Malicious File Detection', () => {
    test('should detect and block executable files masquerading as PDFs', async () => {
      // Create a fake PDF with executable content
      const maliciousPDF = createMaliciousPDF();
      
      const response = await request(app)
        .post('/api/resumes')
        .attach('file', maliciousPDF, 'malicious.pdf')
        .expect(400);

      expect(response.body.error).toContain('Invalid file content');
      
      recordSecurityIncident('executable_masquerade', 'critical', true, 
        'Executable file disguised as PDF was blocked');
    });

    test('should detect and block zip bombs', async () => {
      const zipBomb = createZipBomb();
      
      const response = await request(app)
        .post('/api/resumes')
        .attach('file', zipBomb, 'document.zip')
        .expect(400);

      expect(response.body.error).toMatch(/file type not allowed|invalid/i);
      
      recordSecurityIncident('zip_bomb', 'high', true, 
        'Zip bomb attack was detected and blocked');
    });

    test('should detect embedded malicious scripts in documents', async () => {
      const scriptEmbeddedDoc = createScriptEmbeddedDocument();
      
      const response = await request(app)
        .post('/api/resumes')
        .attach('file', scriptEmbeddedDoc, 'resume_with_script.docx')
        .expect(400);

      expect(response.body.error).toMatch(/security|malicious|invalid/i);
      
      recordSecurityIncident('embedded_script', 'high', true, 
        'Document with embedded scripts was blocked');
    });

    test('should detect suspicious file entropy patterns', async () => {
      // Create files with abnormal entropy (potential encryption/compression)
      const highEntropyFile = Buffer.alloc(1024 * 1024);
      // Fill with random data to simulate encrypted content
      for (let i = 0; i < highEntropyFile.length; i++) {
        highEntropyFile[i] = Math.floor(Math.random() * 256);
      }
      
      const response = await request(app)
        .post('/api/resumes')
        .attach('file', highEntropyFile, 'suspicious.pdf')
        .expect(400);

      expect(response.body.error).toMatch(/invalid|suspicious|security/i);
      
      recordSecurityIncident('high_entropy', 'medium', true, 
        'High entropy file (potential encryption) was blocked');
    });

    test('should handle polyglot files (multiple valid formats)', async () => {
      const polyglotFile = createPolyglotFile();
      
      const response = await request(app)
        .post('/api/resumes')
        .attach('file', polyglotFile, 'polyglot.pdf')
        .expect(400);

      expect(response.body.error).toMatch(/invalid|security|format/i);
      
      recordSecurityIncident('polyglot_file', 'high', true, 
        'Polyglot file (multiple formats) was detected and blocked');
    });
  });

  describe('File Content Validation', () => {
    test('should validate PDF magic numbers strictly', async () => {
      const invalidMagicPDF = Buffer.concat([
        Buffer.from('FAKE-PDF-1.4\n'), // Invalid magic number
        Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\nxref\ntrailer\nstartxref\n%%EOF')
      ]);
      
      const response = await request(app)
        .post('/api/resumes')
        .attach('file', invalidMagicPDF, 'invalid_magic.pdf')
        .expect(400);

      expect(response.body.error).toContain('Invalid file content');
      
      recordSecurityIncident('invalid_magic', 'medium', true, 
        'File with invalid magic number was rejected');
    });

    test('should validate DOCX structure integrity', async () => {
      const corruptedDOCX = Buffer.from('PK\x03\x04CORRUPTED_ZIP_STRUCTURE');
      
      const response = await request(app)
        .post('/api/resumes')
        .attach('file', corruptedDOCX, 'corrupted.docx')
        .expect(400);

      expect(response.body.error).toMatch(/invalid|corrupted|format/i);
      
      recordSecurityIncident('corrupted_docx', 'low', true, 
        'Corrupted DOCX structure was detected');
    });

    test('should detect hidden executables in file headers', async () => {
      // PDF with embedded PE header
      const pdfWithPE = Buffer.concat([
        Buffer.from('%PDF-1.4\n'),
        Buffer.from('MZ'), // PE executable signature
        Buffer.alloc(1024, 0),
        Buffer.from('\ntrailer\n%%EOF')
      ]);
      
      const response = await request(app)
        .post('/api/resumes')
        .attach('file', pdfWithPE, 'embedded_exe.pdf')
        .expect(400);

      expect(response.body.error).toMatch(/malicious|invalid|security/i);
      
      recordSecurityIncident('embedded_executable', 'critical', true, 
        'Executable signature found in document');
    });
  });

  describe('Content Sanitization', () => {
    test('should sanitize potentially malicious text content', async () => {
      const maliciousContent = `
        John Doe Resume
        <script>alert('xss')</script>
        <?php system('rm -rf /'); ?>
        javascript:void(0)
        eval("malicious code")
        DROP TABLE users;
        ../../../etc/passwd
        SELECT * FROM passwords;
        <iframe src="data:text/html,<script>alert(1)</script>"></iframe>
        
        Skills: JavaScript, Python, SQL Injection
      `;
      
      const response = await request(app)
        .post('/api/resumes')
        .attach('file', Buffer.from(maliciousContent), 'malicious_content.txt')
        .expect(200);

      const sanitizedContent = response.body.resume.content;
      
      // Verify malicious content is removed
      expect(sanitizedContent).not.toContain('<script>');
      expect(sanitizedContent).not.toContain('<?php');
      expect(sanitizedContent).not.toContain('javascript:');
      expect(sanitizedContent).not.toContain('eval(');
      expect(sanitizedContent).not.toContain('DROP TABLE');
      expect(sanitizedContent).not.toContain('../../../');
      expect(sanitizedContent).not.toContain('<iframe');
      
      // Verify legitimate content is preserved
      expect(sanitizedContent).toContain('John Doe Resume');
      expect(sanitizedContent).toContain('JavaScript, Python');
      
      recordSecurityIncident('content_sanitization', 'high', true, 
        'Malicious content was sanitized while preserving legitimate data');
    });

    test('should handle Unicode-based attacks', async () => {
      const unicodeAttacks = [
        'java\u0073cript:alert(1)', // Unicode escape
        'script\u202E\u0000alert(1)', // Right-to-left override
        'javascript\u00A0:alert(1)', // Non-breaking space
        '\uFEFFjavascript:alert(1)', // Byte order mark
        'j\u0061v\u0061script:alert(1)' // Unicode encoded
      ];
      
      const maliciousContent = `Resume\n${unicodeAttacks.join('\n')}`;
      
      const response = await request(app)
        .post('/api/resumes')
        .attach('file', Buffer.from(maliciousContent), 'unicode_attack.txt')
        .expect(200);

      const sanitizedContent = response.body.resume.content;
      
      unicodeAttacks.forEach(attack => {
        expect(sanitizedContent).not.toContain('javascript:');
        expect(sanitizedContent).not.toContain('alert(');
      });
      
      recordSecurityIncident('unicode_attacks', 'medium', true, 
        'Unicode-based attacks were neutralized');
    });

    test('should prevent XML external entity (XXE) attacks', async () => {
      const xxePayload = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE resume [
  <!ENTITY xxe SYSTEM "file:///etc/passwd">
  <!ENTITY xxe2 SYSTEM "http://malicious.com/steal-data">
]>
<resume>
  <name>John Doe &xxe;</name>
  <data>&xxe2;</data>
</resume>`;
      
      const response = await request(app)
        .post('/api/resumes')
        .attach('file', Buffer.from(xxePayload), 'xxe_attack.xml')
        .expect(400); // Should reject XML files or sanitize XXE

      expect(response.body.error).toMatch(/not allowed|invalid|security/i);
      
      recordSecurityIncident('xxe_attack', 'high', true, 
        'XML External Entity attack was blocked');
    });
  });

  describe('File Size and Resource Limits', () => {
    test('should enforce file size limits strictly', async () => {
      const oversizedFile = Buffer.alloc(15 * 1024 * 1024, 'A'); // 15MB file
      
      const response = await request(app)
        .post('/api/resumes')
        .attach('file', oversizedFile, 'oversized.txt')
        .expect(413); // Payload Too Large

      expect(response.body.error).toMatch(/too large|size limit|exceeded/i);
      
      recordSecurityIncident('oversized_file', 'medium', true, 
        'Oversized file upload was rejected');
    });

    test('should prevent resource exhaustion via deeply nested structures', async () => {
      const deeplyNestedJSON = createDeeplyNestedStructure(10000);
      
      const response = await request(app)
        .post('/api/resumes')
        .attach('file', Buffer.from(JSON.stringify(deeplyNestedJSON)), 'nested.json')
        .expect(400);

      expect(response.body.error).toMatch(/invalid|not allowed|security/i);
      
      recordSecurityIncident('resource_exhaustion', 'medium', true, 
        'Deeply nested structure attack was blocked');
    });

    test('should handle compression bomb attempts', async () => {
      // Simulated compression bomb (highly repetitive data)
      const repetitiveData = 'A'.repeat(1024 * 1024); // 1MB of same character
      
      const response = await request(app)
        .post('/api/resumes')
        .attach('file', Buffer.from(repetitiveData), 'compression_bomb.txt')
        .expect(400);

      expect(response.body.error).toMatch(/suspicious|invalid|security/i);
      
      recordSecurityIncident('compression_bomb', 'medium', true, 
        'Compression bomb pattern was detected');
    });
  });

  describe('Filename Security', () => {
    test('should sanitize dangerous filenames', async () => {
      const dangerousFilenames = [
        '../../../etc/passwd.pdf',
        'con.pdf', // Windows reserved name
        'file<script>.pdf',
        'file|rm -rf /.pdf',
        'file;cat /etc/passwd.pdf',
        'file\x00hidden.exe.pdf', // Null byte injection
        'file\r\nhidden.pdf',
        'file\u202Efdp.exe', // Right-to-left override
        'file' + 'A'.repeat(300) + '.pdf' // Extremely long filename
      ];
      
      const validContent = Buffer.from('%PDF-1.4\n1 0 obj\n<</Type/Catalog>>\nendobj\ntrailer\n%%EOF');
      
      for (const filename of dangerousFilenames) {
        const response = await request(app)
          .post('/api/resumes')
          .attach('file', validContent, filename);

        if (response.status === 200) {
          // If upload succeeded, filename should be sanitized
          expect(response.body.resume.filename).not.toContain('../');
          expect(response.body.resume.filename).not.toContain('<script>');
          expect(response.body.resume.filename).not.toContain('|');
          expect(response.body.resume.filename).not.toContain(';');
          expect(response.body.resume.filename).not.toContain('\x00');
          expect(response.body.resume.filename).not.toContain('\r');
          expect(response.body.resume.filename).not.toContain('\n');
          expect(response.body.resume.filename.length).toBeLessThan(255);
          
          recordSecurityIncident('filename_sanitization', 'medium', true, 
            `Dangerous filename "${filename}" was sanitized`);
        } else {
          // Upload was rejected, which is also acceptable
          recordSecurityIncident('filename_rejection', 'medium', true, 
            `Dangerous filename "${filename}" caused upload rejection`);
        }
      }
    });
  });

  describe('MIME Type and Extension Validation', () => {
    test('should detect MIME type spoofing', async () => {
      // JavaScript file with PDF extension and MIME type
      const jsContent = 'alert("This is JavaScript, not PDF");\nconsole.log("XSS attempt");';
      
      const response = await request(app)
        .post('/api/resumes')
        .field('fileType', 'application/pdf') // Claimed MIME type
        .attach('file', Buffer.from(jsContent), 'malicious.pdf'); // PDF extension

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/invalid|mismatch|security/i);
      
      recordSecurityIncident('mime_spoofing', 'high', true, 
        'MIME type spoofing was detected and blocked');
    });

    test('should validate file extension consistency', async () => {
      const validPDFContent = Buffer.from('%PDF-1.4\n1 0 obj\n<</Type/Catalog>>\nendobj\ntrailer\n%%EOF');
      
      // PDF content with wrong extension
      const response = await request(app)
        .post('/api/resumes')
        .attach('file', validPDFContent, 'document.exe')
        .expect(400);

      expect(response.body.error).toMatch(/not allowed|invalid|extension/i);
      
      recordSecurityIncident('extension_mismatch', 'medium', true, 
        'File extension mismatch was detected');
    });

    test('should handle double extensions', async () => {
      const validContent = Buffer.from('Valid resume content');
      
      const response = await request(app)
        .post('/api/resumes')
        .attach('file', validContent, 'resume.pdf.exe')
        .expect(400);

      expect(response.body.error).toMatch(/not allowed|invalid/i);
      
      recordSecurityIncident('double_extension', 'high', true, 
        'Double extension attack was blocked');
    });
  });

  describe('Advanced Threat Detection', () => {
    test('should detect steganography attempts', async () => {
      // Create a PDF with suspicious data patterns that might hide steganographic content
      const suspiciousPatterns = createSteganographicPatterns();
      
      const response = await request(app)
        .post('/api/resumes')
        .attach('file', suspiciousPatterns, 'steganography.pdf')
        .expect(400);

      expect(response.body.error).toMatch(/suspicious|invalid|security/i);
      
      recordSecurityIncident('steganography', 'medium', true, 
        'Potential steganographic content was detected');
    });

    test('should detect metadata injection attacks', async () => {
      const maliciousMetadata = createMaliciousMetadata();
      
      const response = await request(app)
        .post('/api/resumes')
        .attach('file', maliciousMetadata, 'metadata_attack.pdf')
        .expect(400);

      expect(response.body.error).toMatch(/invalid|malicious|metadata/i);
      
      recordSecurityIncident('metadata_injection', 'medium', true, 
        'Malicious metadata was detected and blocked');
    });

    test('should handle time-based attacks', async () => {
      // File with timestamps far in the future or past
      const futuristicContent = createFileWithSuspiciousTimestamps();
      
      const response = await request(app)
        .post('/api/resumes')
        .attach('file', futuristicContent, 'time_attack.pdf');

      // Response might be 200 (sanitized) or 400 (rejected) - both are acceptable
      if (response.status === 200) {
        // Should sanitize timestamps
        expect(response.body.resume).toBeTruthy();
        recordSecurityIncident('timestamp_sanitization', 'low', true, 
          'Suspicious timestamps were sanitized');
      } else {
        expect(response.status).toBe(400);
        recordSecurityIncident('timestamp_rejection', 'low', true, 
          'File with suspicious timestamps was rejected');
      }
    });
  });

  // Helper functions for creating test payloads
  function createMaliciousPDF(): Buffer {
    // PDF with embedded executable code
    return Buffer.concat([
      Buffer.from('%PDF-1.4\n'),
      Buffer.from('MZ\x90\x00'), // PE header signature
      Buffer.from('1 0 obj\n<</Type/Catalog/OpenAction<</S/JavaScript/JS(app.alert("XSS"))>>/Pages 2 0 R>>\nendobj\n'),
      Buffer.from('xref\n0 2\ntrailer<</Size 2/Root 1 0 R>>\nstartxref\n0\n%%EOF')
    ]);
  }

  function createZipBomb(): Buffer {
    // Simplified zip bomb structure
    const header = Buffer.from('PK\x03\x04\x14\x00\x00\x00\x08\x00');
    const data = Buffer.alloc(10000, 0x00); // Highly compressible data
    const footer = Buffer.from('PK\x05\x06\x00\x00\x00\x00\x01\x00\x01\x00');
    return Buffer.concat([header, data, footer]);
  }

  function createScriptEmbeddedDocument(): Buffer {
    // DOCX-like structure with embedded script
    return Buffer.concat([
      Buffer.from('PK\x03\x04'), // ZIP header
      Buffer.from('<w:document><w:body><w:p><w:r><w:t><script>alert("xss")</script></w:t></w:r></w:p></w:body></w:document>'),
      Buffer.from('PK\x05\x06\x00\x00\x00\x00\x01\x00\x01\x00')
    ]);
  }

  function createPolyglotFile(): Buffer {
    // File that's valid as both PDF and HTML
    return Buffer.from(`%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R>>endobj
4 0 obj<</Length 40>>stream
BT /F1 12 Tf 72 720 Td (<html><script>alert(1)</script>) Tj ET
endstream endobj
xref
0 5
trailer<</Size 5/Root 1 0 R>>
startxref
400
%%EOF
<html><body><script>alert("Polyglot attack")</script></body></html>`);
  }

  function createDeeplyNestedStructure(depth: number): any {
    let nested: any = "deep";
    for (let i = 0; i < depth; i++) {
      nested = { level: i, nested };
    }
    return nested;
  }

  function createSteganographicPatterns(): Buffer {
    // PDF with suspicious repeated patterns that might hide data
    const patterns = Buffer.alloc(1024);
    for (let i = 0; i < patterns.length; i += 4) {
      patterns.writeUInt32LE(0xDEADBEEF, i);
    }
    
    return Buffer.concat([
      Buffer.from('%PDF-1.4\n'),
      patterns,
      Buffer.from('\ntrailer\n%%EOF')
    ]);
  }

  function createMaliciousMetadata(): Buffer {
    return Buffer.from(`%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R/Names<</JavaScript<</Names[(malicious)3 0 R]>>>>>>endobj
2 0 obj<</Type/Pages/Count 0/Kids[]>>endobj
3 0 obj<</S/JavaScript/JS(app.alert("Metadata XSS"))>>endobj
xref
0 4
trailer<</Size 4/Root 1 0 R>>
startxref
0
%%EOF`);
  }

  function createFileWithSuspiciousTimestamps(): Buffer {
    // File with creation date in year 2099
    const futureDate = new Date('2099-12-31').toISOString();
    return Buffer.from(`%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Count 0/Kids[]/CreationDate(D:${futureDate.replace(/[-:T]/g, '').slice(0, 14)}Z)>>endobj
xref
0 3
trailer<</Size 3/Root 1 0 R>>
startxref
0
%%EOF`);
  }

  function recordSecurityIncident(
    testType: string,
    threatLevel: 'low' | 'medium' | 'high' | 'critical',
    blocked: boolean,
    details: string
  ): void {
    securityIncidents.push({
      testType,
      threatLevel,
      blocked,
      details
    });
  }

  function generateSecurityReport(): void {
    const totalIncidents = securityIncidents.length;
    const blockedIncidents = securityIncidents.filter(i => i.blocked).length;
    const criticalThreats = securityIncidents.filter(i => i.threatLevel === 'critical').length;
    const highThreats = securityIncidents.filter(i => i.threatLevel === 'high').length;
    
    const report = {
      testRunDate: new Date().toISOString(),
      summary: {
        totalSecurityTests: totalIncidents,
        threatsBlocked: blockedIncidents,
        blockingRate: (blockedIncidents / totalIncidents) * 100,
        threatLevelBreakdown: {
          critical: securityIncidents.filter(i => i.threatLevel === 'critical').length,
          high: securityIncidents.filter(i => i.threatLevel === 'high').length,
          medium: securityIncidents.filter(i => i.threatLevel === 'medium').length,
          low: securityIncidents.filter(i => i.threatLevel === 'low').length
        }
      },
      securityScore: calculateSecurityScore(),
      incidents: securityIncidents,
      recommendations: generateSecurityRecommendations()
    };

    console.log('🛡️  Security Test Report:', JSON.stringify(report, null, 2));
  }

  function calculateSecurityScore(): number {
    const weights = { critical: 40, high: 30, medium: 20, low: 10 };
    let totalScore = 0;
    let maxScore = 0;
    
    securityIncidents.forEach(incident => {
      const weight = weights[incident.threatLevel];
      maxScore += weight;
      if (incident.blocked) {
        totalScore += weight;
      }
    });
    
    return maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 100;
  }

  function generateSecurityRecommendations(): string[] {
    const recommendations: string[] = [];
    const blockedIncidents = securityIncidents.filter(i => i.blocked).length;
    const totalIncidents = securityIncidents.length;
    const blockingRate = (blockedIncidents / totalIncidents) * 100;
    
    if (blockingRate < 95) {
      recommendations.push('Security blocking rate is below 95% - review and strengthen security validations');
    }
    
    const unblockedCritical = securityIncidents.filter(i => i.threatLevel === 'critical' && !i.blocked);
    if (unblockedCritical.length > 0) {
      recommendations.push(`${unblockedCritical.length} critical threats were not blocked - immediate security review required`);
    }
    
    const unblockedHigh = securityIncidents.filter(i => i.threatLevel === 'high' && !i.blocked);
    if (unblockedHigh.length > 0) {
      recommendations.push(`${unblockedHigh.length} high-severity threats were not blocked - security improvements needed`);
    }
    
    if (recommendations.length === 0) {
      recommendations.push('Excellent security posture - all threats were properly handled');
    }
    
    return recommendations;
  }
});