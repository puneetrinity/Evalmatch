/**
 * Performance Tests for File Processing Operations
 * Tests file upload, parsing, and security validation performance
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import { performance } from 'perf_hooks';
import { SecurityValidator } from '../../shared/security-validation';
import { testFileData } from '../fixtures/test-data';

describe('File Processing Performance Tests', () => {
  let app: any;
  const performanceMetrics: Array<{
    operation: string;
    duration: number;
    fileSize: number;
    memoryUsage: number;
  }> = [];

  beforeAll(async () => {
    const { createFixedTestApp } = await import('../helpers/test-server-fixed');
    app = await createFixedTestApp();
  });

  afterAll(async () => {
    // Generate performance report
    generatePerformanceReport();
    
    const { clearFixedTestApp } = await import('../helpers/test-server-fixed');
    clearFixedTestApp();
  });

  describe('File Upload Performance', () => {
    test('should handle single PDF upload within acceptable time limits', async () => {
      const testPDFContent = createTestPDF('single-file-test', 1024); // 1KB
      const startTime = performance.now();
      const initialMemory = process.memoryUsage();

      const response = await request(app)
        .post('/api/resumes')
        .attach('file', testPDFContent, 'performance-test.pdf')
        .expect(200);

      const endTime = performance.now();
      const finalMemory = process.memoryUsage();
      const duration = endTime - startTime;
      const memoryDelta = finalMemory.heapUsed - initialMemory.heapUsed;

      // Performance assertions
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
      expect(memoryDelta).toBeLessThan(50 * 1024 * 1024); // Memory increase < 50MB
      
      recordPerformanceMetric('single_pdf_upload', duration, testPDFContent.length, memoryDelta);
      
      expect(response.body.status).toBe('success');
    });

    test('should handle large PDF file (5MB) efficiently', async () => {
      const largePDFContent = createTestPDF('large-file-test', 5 * 1024 * 1024); // 5MB
      const startTime = performance.now();
      const initialMemory = process.memoryUsage();

      const response = await request(app)
        .post('/api/resumes')
        .attach('file', largePDFContent, 'large-performance-test.pdf')
        .expect(200);

      const endTime = performance.now();
      const finalMemory = process.memoryUsage();
      const duration = endTime - startTime;
      const memoryDelta = finalMemory.heapUsed - initialMemory.heapUsed;

      // Performance assertions for large files
      expect(duration).toBeLessThan(15000); // Should complete within 15 seconds
      expect(memoryDelta).toBeLessThan(100 * 1024 * 1024); // Memory increase < 100MB
      
      recordPerformanceMetric('large_pdf_upload', duration, largePDFContent.length, memoryDelta);
      
      expect(response.body.status).toBe('success');
    });

    test('should handle concurrent file uploads efficiently', async () => {
      const concurrentUploads = 5;
      const testFiles = Array(concurrentUploads).fill(null).map((_, i) => 
        createTestPDF(`concurrent-test-${i}`, 512 * 1024) // 512KB each
      );

      const startTime = performance.now();
      const initialMemory = process.memoryUsage();

      // Execute concurrent uploads
      const uploadPromises = testFiles.map((fileContent, i) => 
        request(app)
          .post('/api/resumes')
          .attach('file', fileContent, `concurrent-${i}.pdf`)
          .expect(200)
      );

      const responses = await Promise.all(uploadPromises);
      
      const endTime = performance.now();
      const finalMemory = process.memoryUsage();
      const duration = endTime - startTime;
      const memoryDelta = finalMemory.heapUsed - initialMemory.heapUsed;

      // Performance assertions for concurrent operations
      expect(duration).toBeLessThan(20000); // Should complete within 20 seconds
      expect(memoryDelta).toBeLessThan(200 * 1024 * 1024); // Memory increase < 200MB
      
      recordPerformanceMetric('concurrent_uploads', duration, 
        testFiles.reduce((acc, file) => acc + file.length, 0), memoryDelta);
      
      responses.forEach(response => {
        expect(response.body.status).toBe('success');
      });
    });
  });

  describe('Security Validation Performance', () => {
    test('should validate file content efficiently', async () => {
      const testContent = createTestPDF('security-test', 2 * 1024 * 1024); // 2MB
      const iterations = 100;
      
      const startTime = performance.now();
      const initialMemory = process.memoryUsage();

      // Run security validation multiple times
      for (let i = 0; i < iterations; i++) {
        const isValid = SecurityValidator.validateFileContent(testContent, 'application/pdf');
        expect(typeof isValid).toBe('boolean');
      }

      const endTime = performance.now();
      const finalMemory = process.memoryUsage();
      const duration = endTime - startTime;
      const memoryDelta = finalMemory.heapUsed - initialMemory.heapUsed;
      const avgDuration = duration / iterations;

      // Performance assertions for security validation
      expect(avgDuration).toBeLessThan(50); // Average < 50ms per validation
      expect(memoryDelta).toBeLessThan(10 * 1024 * 1024); // Memory increase < 10MB
      
      recordPerformanceMetric('security_validation', avgDuration, testContent.length, memoryDelta);
    });

    test('should detect malicious content quickly', async () => {
      const maliciousPatterns = [
        '<script>alert("xss")</script>',
        'javascript:alert(1)',
        '<?php system("rm -rf /"); ?>',
        'eval("malicious code")',
        'DROP TABLE users;'
      ];

      const startTime = performance.now();
      
      maliciousPatterns.forEach(pattern => {
        const sanitized = SecurityValidator.sanitizeString(pattern);
        expect(sanitized).not.toContain(pattern);
      });

      const endTime = performance.now();
      const duration = endTime - startTime;
      const avgDuration = duration / maliciousPatterns.length;

      // Should detect and sanitize malicious content quickly
      expect(avgDuration).toBeLessThan(10); // Average < 10ms per pattern
      
      recordPerformanceMetric('malicious_content_detection', avgDuration, 
        maliciousPatterns.join('').length, 0);
    });
  });

  describe('File Parsing Performance', () => {
    test('should parse DOCX files efficiently', async () => {
      const docxContent = createTestDOCX('parsing-test');
      const startTime = performance.now();

      const response = await request(app)
        .post('/api/resumes')
        .attach('file', docxContent, 'parsing-test.docx')
        .expect(200);

      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(8000); // Should parse within 8 seconds
      expect(response.body.resume.content).toBeTruthy();
      
      recordPerformanceMetric('docx_parsing', duration, docxContent.length, 0);
    });

    test('should handle text extraction from complex PDFs', async () => {
      const complexPDFContent = createComplexTestPDF();
      const startTime = performance.now();

      const response = await request(app)
        .post('/api/resumes')
        .attach('file', complexPDFContent, 'complex-parsing-test.pdf')
        .expect(200);

      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(12000); // Should parse within 12 seconds
      expect(response.body.resume.content).toBeTruthy();
      expect(response.body.resume.content.length).toBeGreaterThan(100);
      
      recordPerformanceMetric('complex_pdf_parsing', duration, complexPDFContent.length, 0);
    });
  });

  describe('Batch Operations Performance', () => {
    test('should handle batch resume analysis efficiently', async () => {
      // First upload multiple resumes
      const batchSize = 10;
      const resumeIds: number[] = [];
      
      for (let i = 0; i < batchSize; i++) {
        const resumeContent = createTestPDF(`batch-resume-${i}`, 1024 * 1024);
        const response = await request(app)
          .post('/api/resumes')
          .attach('file', resumeContent, `batch-resume-${i}.pdf`)
          .expect(200);
        
        resumeIds.push(response.body.resume.id);
      }

      // Create a job description
      const jobResponse = await request(app)
        .post('/api/job-descriptions')
        .send({
          title: 'Performance Test Job',
          description: 'Test job for performance testing with React, Node.js, TypeScript skills required.'
        })
        .expect(200);
      
      const jobId = jobResponse.body.jobDescription.id;

      // Test batch analysis performance
      const startTime = performance.now();
      const initialMemory = process.memoryUsage();

      const analysisResponse = await request(app)
        .post(`/api/analysis/analyze/${jobId}`)
        .send({ resumeIds })
        .expect(200);

      const endTime = performance.now();
      const finalMemory = process.memoryUsage();
      const duration = endTime - startTime;
      const memoryDelta = finalMemory.heapUsed - initialMemory.heapUsed;

      // Performance assertions for batch operations
      expect(duration).toBeLessThan(30000); // Should complete within 30 seconds
      expect(memoryDelta).toBeLessThan(500 * 1024 * 1024); // Memory increase < 500MB
      expect(analysisResponse.body.results.length).toBe(batchSize);
      
      recordPerformanceMetric('batch_analysis', duration, batchSize, memoryDelta);
    });
  });

  // Helper functions
  function createTestPDF(content: string, targetSize: number): Buffer {
    const baseContent = `%PDF-1.4
1 0 obj
<<
/Type /Catalog
/Pages 2 0 R
>>
endobj
2 0 obj
<<
/Type /Pages
/Kids [3 0 R]
/Count 1
>>
endobj
3 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
/Contents 4 0 R
>>
endobj
4 0 obj
<<
/Length ${content.length + 50}
>>
stream
BT
/F1 12 Tf
72 720 Td
(${content}) Tj
ET
endstream
endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000204 00000 n 
trailer
<<
/Size 5
/Root 1 0 R
>>
startxref
${300 + content.length}
%%EOF`;

    // Pad content to reach target size
    const currentSize = Buffer.from(baseContent).length;
    const padding = Math.max(0, targetSize - currentSize);
    const paddedContent = baseContent + 'A'.repeat(padding);
    
    return Buffer.from(paddedContent);
  }

  function createTestDOCX(content: string): Buffer {
    // Simplified DOCX structure for testing
    return Buffer.from(`UEsDBBQABgAIAAAAIQDfpNJsWgEAACAFAAATAAgCW0NvbnRlbnRfVHlwZXNdLnhtbCCiBAIooAAC${content}AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`);
  }

  function createComplexTestPDF(): Buffer {
    const complexContent = `Senior Software Engineer Resume
John Doe - Professional Summary
Experienced software engineer with 8+ years developing scalable applications.

Technical Skills:
- Programming Languages: JavaScript, TypeScript, Python, Java
- Frontend: React, Vue.js, Angular, HTML5, CSS3
- Backend: Node.js, Express, Django, Spring Boot
- Databases: PostgreSQL, MongoDB, Redis
- Cloud: AWS, Azure, Docker, Kubernetes
- DevOps: CI/CD, Jenkins, GitHub Actions

Professional Experience:
Senior Software Engineer | TechCorp | 2020-Present
- Architected microservices handling 1M+ requests/day
- Led team of 8 engineers across multiple time zones  
- Reduced system latency by 40% through optimization
- Implemented automated testing increasing coverage to 95%

Software Engineer | StartupXYZ | 2018-2020
- Built real-time data processing pipelines
- Developed RESTful APIs for mobile applications
- Collaborated with product team on feature specifications
- Mentored junior developers and conducted code reviews

Education:
Master of Science in Computer Science | Stanford University | 2018
Bachelor of Science in Computer Engineering | UC Berkeley | 2016

Certifications:
- AWS Solutions Architect Professional
- Kubernetes Certified Application Developer
- Scrum Master Certification

Projects:
- Open source contributor to React ecosystem
- Built personal SaaS product with 10K+ users
- Technical blog with 50K+ monthly readers`;

    return createTestPDF(complexContent, 2 * 1024 * 1024); // 2MB
  }

  function recordPerformanceMetric(operation: string, duration: number, size: number, memory: number): void {
    performanceMetrics.push({
      operation,
      duration,
      fileSize: size,
      memoryUsage: memory
    });
  }

  function generatePerformanceReport(): void {
    const report = {
      testRunDate: new Date().toISOString(),
      summary: {
        totalTests: performanceMetrics.length,
        avgDuration: performanceMetrics.reduce((acc, m) => acc + m.duration, 0) / performanceMetrics.length,
        maxDuration: Math.max(...performanceMetrics.map(m => m.duration)),
        totalMemoryUsage: performanceMetrics.reduce((acc, m) => acc + m.memoryUsage, 0)
      },
      metrics: performanceMetrics,
      recommendations: generateRecommendations()
    };

    console.log('📊 Performance Test Report:', JSON.stringify(report, null, 2));
  }

  function generateRecommendations(): string[] {
    const recommendations: string[] = [];
    
    const avgDuration = performanceMetrics.reduce((acc, m) => acc + m.duration, 0) / performanceMetrics.length;
    const maxMemory = Math.max(...performanceMetrics.map(m => m.memoryUsage));
    
    if (avgDuration > 3000) {
      recommendations.push('Consider optimizing file processing pipeline - average duration exceeds 3 seconds');
    }
    
    if (maxMemory > 200 * 1024 * 1024) {
      recommendations.push('High memory usage detected - implement memory optimization strategies');
    }
    
    const concurrentMetric = performanceMetrics.find(m => m.operation === 'concurrent_uploads');
    if (concurrentMetric && concurrentMetric.duration > 15000) {
      recommendations.push('Concurrent upload performance could be improved with better resource management');
    }
    
    return recommendations;
  }
});