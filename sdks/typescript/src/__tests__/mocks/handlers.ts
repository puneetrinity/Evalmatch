/**
 * MSW (Mock Service Worker) Request Handlers
 * Mocks EvalMatch API endpoints for testing
 */

import { http, HttpResponse } from 'msw'
import type { HttpHandler } from 'msw'

// Mock API responses
export const handlers: HttpHandler[] = [
  // Health endpoint
  http.get('https://api.test.evalmatch.com/health', ({ request }) => {
    console.log('MSW intercepted:', request.method, request.url)
    return HttpResponse.json({
      success: true,
      data: {
        status: 'healthy',
        uptime: 12345,
        version: '1.0.0'
      },
      timestamp: new Date().toISOString()
    })
  }),

  // Resumes endpoints
  http.get('https://api.test.evalmatch.com/resumes', ({ request }) => {
    console.log('MSW intercepted:', request.method, request.url)
    return HttpResponse.json({
      success: true,
      data: [
        {
          id: 1,
          filename: 'test-resume.pdf',
          status: 'analyzed',
          uploadedAt: '2024-01-01T00:00:00Z'
        }
      ],
      timestamp: new Date().toISOString()
    })
  }),

  http.post('https://api.test.evalmatch.com/resumes', ({ request }) => {
    console.log('MSW intercepted:', request.method, request.url)
    return HttpResponse.json({
      success: true,
      data: {
        id: 123,
        filename: 'uploaded-resume.pdf',
        status: 'processing',
        uploadedAt: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    })
  }),

  http.get('https://api.test.evalmatch.com/resumes/:id', ({ request, params }) => {
    console.log('MSW intercepted:', request.method, request.url)
    const id = Number(params.id)
    
    // Return 404 for specific test case
    if (id === 999) {
      return HttpResponse.json(
        { error: 'Resume not found' },
        { status: 404 }
      )
    }
    
    return HttpResponse.json({
      success: true,
      data: {
        id: id,
        filename: `resume-${id}.pdf`,
        status: 'analyzed',
        skills: ['JavaScript', 'React', 'Node.js'],
        uploadedAt: '2024-01-01T00:00:00Z'
      },
      timestamp: new Date().toISOString()
    })
  }),

  // Job descriptions endpoints
  http.post('https://api.test.evalmatch.com/job-descriptions', ({ request }) => {
    console.log('MSW intercepted:', request.method, request.url)
    return HttpResponse.json({
      success: true,
      data: {
        id: 456,
        title: 'Senior Developer',
        description: 'Test job description',
        requirements: ['React', 'TypeScript'],
        createdAt: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    })
  }),

  // Analysis endpoints
  http.post('https://api.test.evalmatch.com/analyze', ({ request }) => {
    console.log('MSW intercepted:', request.method, request.url)
    return HttpResponse.json({
      success: true,
      data: {
        overallScore: 0.85,
        skillsMatch: {
          matched: ['JavaScript', 'React'],
          missing: ['Python']
        },
        recommendations: ['Strong frontend skills', 'Consider backend training']
      },
      timestamp: new Date().toISOString()
    })
  }),

  // Explicit handlers for specific test endpoints first (more specific routes before generic ones)
  http.post('https://api.test.evalmatch.com/analysis/analyze/123', ({ request }) => {
    console.log('MSW intercepted ANALYZE 123:', request.method, request.url)
    return HttpResponse.json({
      success: true,
      data: {
        overallScore: 0.85,
        skillsMatch: {
          matched: ['JavaScript', 'React'],
          missing: ['Python']
        },
        recommendations: ['Strong frontend skills', 'Consider backend training']
      },
      timestamp: new Date().toISOString()
    })
  }),

  http.options('https://api.test.evalmatch.com/analysis/analyze/123', ({ request }) => {
    console.log('MSW intercepted OPTIONS ANALYZE 123:', request.method, request.url)
    return new HttpResponse(null, { status: 200 })
  }),

  // Generic path parameter handlers (fallback)
  http.post('https://api.test.evalmatch.com/analysis/analyze/:jobId', ({ request, params }) => {
    console.log('MSW intercepted ANALYZE GENERIC:', request.method, request.url, 'jobId:', params.jobId)
    return HttpResponse.json({
      success: true,
      data: {
        overallScore: 0.85,
        skillsMatch: {
          matched: ['JavaScript', 'React'],
          missing: ['Python']
        },
        recommendations: ['Strong frontend skills', 'Consider backend training']
      },
      timestamp: new Date().toISOString()
    })
  }),

  http.options('https://api.test.evalmatch.com/analysis/analyze/:jobId', ({ request, params }) => {
    console.log('MSW intercepted OPTIONS ANALYZE GENERIC:', request.method, request.url, 'jobId:', params.jobId)
    return new HttpResponse(null, { status: 200 })
  }),

  http.post('https://api.test.evalmatch.com/analyze-bias', ({ request }) => {
    console.log('MSW intercepted:', request.method, request.url)
    return HttpResponse.json({
      success: true,
      data: {
        biasScore: 0.1,
        riskLevel: 'low',
        issues: [],
        suggestions: ['Job description looks unbiased']
      },
      timestamp: new Date().toISOString()
    })
  }),

  // Explicit bias analysis handlers for specific test endpoints first
  http.post('https://api.test.evalmatch.com/analysis/analyze-bias/123', async ({ request }) => {
    console.log('MSW intercepted BIAS 123:', request.method, request.url)
    
    // Handle request body for POST requests
    try {
      const body = await request.json()
      console.log('MSW BIAS 123 body:', body)
    } catch (e) {
      // Body might be empty or not JSON
      console.log('MSW BIAS 123: No JSON body')
    }
    
    return HttpResponse.json({
      success: true,
      data: {
        biasScore: 0.1,
        riskLevel: 'low',
        issues: [],
        suggestions: ['Job description looks unbiased']
      },
      timestamp: new Date().toISOString()
    })
  }),

  http.options('https://api.test.evalmatch.com/analysis/analyze-bias/123', ({ request }) => {
    console.log('MSW intercepted OPTIONS BIAS 123:', request.method, request.url)
    return new HttpResponse(null, { 
      status: 200, 
      headers: { 
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      } 
    })
  }),

  // Generic bias analysis handlers (fallback)
  http.post('https://api.test.evalmatch.com/analysis/analyze-bias/:jobId', async ({ request, params }) => {
    console.log('MSW intercepted BIAS GENERIC:', request.method, request.url, 'jobId:', params.jobId)
    
    // Handle request body for POST requests
    try {
      const body = await request.json()
      console.log('MSW BIAS GENERIC body:', body)
    } catch (e) {
      // Body might be empty or not JSON
      console.log('MSW BIAS GENERIC: No JSON body')
    }
    
    return HttpResponse.json({
      success: true,
      data: {
        biasScore: 0.1,
        riskLevel: 'low',
        issues: [],
        suggestions: ['Job description looks unbiased']
      },
      timestamp: new Date().toISOString()
    })
  }),

  // OPTIONS handler for bias analysis CORS preflight requests
  http.options('https://api.test.evalmatch.com/analysis/analyze-bias/:jobId', ({ request, params }) => {
    console.log('MSW intercepted OPTIONS BIAS GENERIC:', request.method, request.url, 'jobId:', params.jobId)
    return new HttpResponse(null, { 
      status: 200, 
      headers: { 
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      } 
    })
  }),

  // Error scenarios for testing (must come before catch-all)
  http.get('https://api.test.evalmatch.com/error/401', ({ request }) => {
    console.log('MSW intercepted ERROR 401:', request.method, request.url)
    return HttpResponse.json({
      error: 'Authentication required',
      message: 'Please provide a valid authentication token',
      code: 'MISSING_AUTH_HEADER'
    }, { status: 401 })
  }),

  http.get('https://api.test.evalmatch.com/error/429', ({ request }) => {
    console.log('MSW intercepted ERROR 429:', request.method, request.url)
    return HttpResponse.json({
      error: 'Rate limit exceeded',
      message: 'Too many requests',
      code: 'RATE_LIMIT_EXCEEDED',
      retryAfter: 60
    }, { status: 429 })
  }),

  http.get('https://api.test.evalmatch.com/error/500', ({ request }) => {
    console.log('MSW intercepted ERROR 500:', request.method, request.url)
    return HttpResponse.json({
      error: 'Internal server error',
      message: 'Something went wrong',
      code: 'INTERNAL_ERROR'
    }, { status: 500 })
  }),

  // Retry-specific test endpoints
  http.get('https://api.test.evalmatch.com/retry-test', ({ request }) => {
    console.log('MSW intercepted RETRY TEST:', request.method, request.url)
    const url = new URL(request.url)
    const attempt = parseInt(url.searchParams.get('attempt') || '0')
    
    if (attempt < 2) {
      return HttpResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      )
    }
    
    return HttpResponse.json({ success: true, data: 'success' })
  }),

  http.get('https://api.test.evalmatch.com/network-error', ({ request }) => {
    console.log('MSW intercepted NETWORK ERROR:', request.method, request.url)
    // Return 500 to simulate network error (MSW can't throw actual network errors in jsdom)
    return HttpResponse.json(
      { error: 'Network error' },
      { status: 500 }
    )
  }),

  http.get('https://api.test.evalmatch.com/backoff-test', ({ request }) => {
    console.log('MSW intercepted BACKOFF TEST:', request.method, request.url)
    return HttpResponse.json(
      { error: 'Server error' },
      { status: 500 }
    )
  }),

  // Dynamic resume endpoints for circuit breaker tests
  http.get('https://api.test.evalmatch.com/resumes-:index', ({ request, params }) => {
    console.log('MSW intercepted DYNAMIC RESUMES:', request.method, request.url, 'index:', params.index)
    return HttpResponse.json(
      { error: 'Server error for testing' },
      { status: 500 }
    )
  }),

  // OPTIONS handler for dynamic resume endpoints
  http.options('https://api.test.evalmatch.com/resumes-:index', ({ request }) => {
    console.log('MSW intercepted OPTIONS DYNAMIC RESUMES:', request.method, request.url)
    return new HttpResponse(null, { 
      status: 200, 
      headers: { 
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      } 
    })
  }),

  // Catch-all handler for any missing endpoints (should be LAST)
  http.all('*', ({ request }) => {
    console.log('MSW CATCH-ALL:', request.method, request.url)
    return HttpResponse.json(
      { error: 'Endpoint not implemented in test mocks' },
      { status: 404 }
    )
  })
]