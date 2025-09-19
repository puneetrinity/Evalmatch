/**
 * MSW (Mock Service Worker) Request Handlers
 * Mocks EvalMatch API endpoints for testing
 */

import { http, HttpResponse } from 'msw'
import type { HttpHandler } from 'msw'

// Helper function to check authentication
function checkAuth(request: Request): { isAuthenticated: boolean; authType: 'firebase' | 'token' | 'none' } {
  const authHeader = request.headers.get('Authorization')
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { isAuthenticated: false, authType: 'none' }
  }
  
  const token = authHeader.replace('Bearer ', '')
  
  // Simulate invalid tokens
  if (token === 'invalid-token-12345' || token === null || token === '') {
    return { isAuthenticated: false, authType: 'none' }
  }
  
  // Detect auth type
  if (token.startsWith('evalmatch-api-token-')) {
    return { isAuthenticated: true, authType: 'token' }
  } else if (token === 'firebase-jwt-token') {
    return { isAuthenticated: true, authType: 'firebase' }
  } else {
    return { isAuthenticated: true, authType: 'firebase' } // Default to firebase for other valid tokens
  }
}

// Helper function to return 401 error
function unauthorizedResponse() {
  return HttpResponse.json(
    {
      success: false,
      error: 'UNAUTHORIZED',
      message: 'Authentication required',
      timestamp: new Date().toISOString()
    },
    { status: 401 }
  )
}

// Mock API responses
export const handlers: HttpHandler[] = [
  // Health endpoints - return plain objects per spec
  http.get('https://api.test.evalmatch.com/health', ({ request }) => {
    console.log('MSW intercepted:', request.method, request.url)
    return HttpResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: 12345,
      version: '1.0.0'
    })
  }),

  http.get('https://api.test.evalmatch.com/system-health', ({ request }) => {
    console.log('MSW intercepted:', request.method, request.url)
    return HttpResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'EvalMatch API',
      version: '2.1.0',
      health: {
        score: 95,
        status: 'healthy',
        components: {
          database: 'healthy',
          ai_services: 'healthy',
          cache: 'healthy'
        }
      }
    })
  }),

  // Resumes endpoints
  http.get('https://api.test.evalmatch.com/resumes', ({ request }) => {
    console.log('MSW intercepted:', request.method, request.url)
    
    const auth = checkAuth(request)
    if (!auth.isAuthenticated) {
      return unauthorizedResponse()
    }
    
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
    
    const auth = checkAuth(request)
    if (!auth.isAuthenticated) {
      return unauthorizedResponse()
    }
    
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
    
    const auth = checkAuth(request)
    if (!auth.isAuthenticated) {
      return unauthorizedResponse()
    }
    
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

  // Credits endpoints - return ApiResponse envelopes per spec
  http.get('https://api.test.evalmatch.com/credits/balance', ({ request }) => {
    console.log('MSW intercepted:', request.method, request.url)
    return HttpResponse.json({
      success: true,
      credits: 150,
      totalPurchased: 200,
      totalUsed: 50,
      tier: 'premium',
      timestamp: new Date().toISOString()
    })
  }),

  http.get('https://api.test.evalmatch.com/credits/history', ({ request }) => {
    console.log('MSW intercepted:', request.method, request.url)
    const url = new URL(request.url)
    const page = parseInt(url.searchParams.get('page') || '1')
    const limit = parseInt(url.searchParams.get('limit') || '10')
    
    return HttpResponse.json({
      success: true,
      data: {
        transactions: [
          {
            id: 1,
            type: 'purchase',
            amount: 100,
            description: 'Premium plan credits',
            createdAt: '2024-01-15T10:00:00Z'
          },
          {
            id: 2, 
            type: 'usage',
            amount: -5,
            description: 'Resume analysis',
            createdAt: '2024-01-15T11:00:00Z'
          }
        ],
        currentBalance: 150,
        totalPurchased: 200,
        totalUsed: 50,
        pagination: {
          page,
          limit,
          total: 25,
          totalPages: 3
        }
      },
      timestamp: new Date().toISOString()
    })
  }),

  http.get('https://api.test.evalmatch.com/credits/packages', ({ request }) => {
    console.log('MSW intercepted:', request.method, request.url)
    return HttpResponse.json({
      success: true,
      packages: [
        {
          id: 'starter',
          name: 'Starter Package',
          credits: 50,
          price: 10,
          priceDisplay: '$10.00',
          currency: 'USD',
          popular: false,
          description: 'Perfect for getting started',
          earnMethod: 'automatic',
          requirement: 'Sign up only'
        },
        {
          id: 'professional',
          name: 'Professional Package', 
          credits: 200,
          price: 30,
          priceDisplay: '$30.00',
          currency: 'USD',
          popular: true,
          description: 'Most popular choice for professionals',
          earnMethod: 'daily',
          requirement: 'Complete daily tasks'
        }
      ],
      timestamp: new Date().toISOString()
    })
  }),

  http.post('https://api.test.evalmatch.com/credits/grant-beta', ({ request }) => {
    console.log('MSW intercepted:', request.method, request.url)
    return HttpResponse.json({
      success: true,
      message: 'Beta credits granted successfully',
      credits: 50,
      timestamp: new Date().toISOString()
    })
  }),

  // Job descriptions CRUD endpoints
  http.get('https://api.test.evalmatch.com/job-descriptions', ({ request }) => {
    console.log('MSW intercepted:', request.method, request.url)
    
    const auth = checkAuth(request)
    if (!auth.isAuthenticated) {
      return unauthorizedResponse()
    }
    
    return HttpResponse.json({
      success: true,
      data: [
        {
          id: 1,
          title: 'Senior Frontend Developer',
          description: 'We are looking for a senior frontend developer...',
          requirements: ['React', 'TypeScript', '5+ years experience'],
          createdAt: '2024-01-01T00:00:00Z'
        },
        {
          id: 2,
          title: 'Backend Engineer',
          description: 'Join our backend team...',
          requirements: ['Node.js', 'PostgreSQL', 'Docker'],
          createdAt: '2024-01-02T00:00:00Z'
        }
      ],
      timestamp: new Date().toISOString()
    })
  }),

  http.get('https://api.test.evalmatch.com/job-descriptions/:id', ({ request, params }) => {
    console.log('MSW intercepted:', request.method, request.url)
    
    const auth = checkAuth(request)
    if (!auth.isAuthenticated) {
      return unauthorizedResponse()
    }
    
    const id = Number(params.id)
    
    // Return 404 for specific test case
    if (id === 999) {
      return HttpResponse.json(
        { error: 'Job description not found' },
        { status: 404 }
      )
    }
    
    return HttpResponse.json({
      success: true,
      data: {
        id: id,
        title: `Job Title ${id}`,
        description: `Job description for position ${id}`,
        requirements: ['React', 'TypeScript'],
        skills: ['JavaScript', 'React', 'Node.js'],
        createdAt: '2024-01-01T00:00:00Z'
      },
      timestamp: new Date().toISOString()
    })
  }),

  http.patch('https://api.test.evalmatch.com/job-descriptions/:id', async ({ request, params }) => {
    console.log('MSW intercepted:', request.method, request.url)
    
    const auth = checkAuth(request)
    if (!auth.isAuthenticated) {
      return unauthorizedResponse()
    }
    
    const id = Number(params.id)
    const body = await request.json() as {
      title?: string;
      description?: string;
      requirements?: string[];
    }
    
    return HttpResponse.json({
      success: true,
      data: {
        id: id,
        title: body.title || `Updated Job ${id}`,
        description: body.description || `Updated description for ${id}`,
        requirements: body.requirements || ['Updated requirement'],
        updatedAt: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    })
  }),

  http.delete('https://api.test.evalmatch.com/job-descriptions/:id', ({ request, params }) => {
    console.log('MSW intercepted:', request.method, request.url)
    
    const auth = checkAuth(request)
    if (!auth.isAuthenticated) {
      return unauthorizedResponse()
    }
    
    const id = Number(params.id)
    
    // Return 404 for specific test case
    if (id === 999) {
      return HttpResponse.json(
        { error: 'Job description not found' },
        { status: 404 }
      )
    }
    
    return HttpResponse.json({
      success: true,
      timestamp: new Date().toISOString()
    })
  }),

  // Resumes batch upload endpoint
  http.post('https://api.test.evalmatch.com/resumes/batch', ({ request }) => {
    console.log('MSW intercepted:', request.method, request.url)
    return HttpResponse.json({
      success: true,
      data: {
        batchId: 'batch_123',
        message: 'Processed 2 files: 2 successful, 0 failed',
        results: {
          successful: [
            {
              filename: 'batch-resume-1.pdf',
              resumeId: 201,
              fileSize: 245760,
              processingTime: 1250,
              hasAnalysis: true
            },
            {
              filename: 'batch-resume-2.pdf',
              resumeId: 202,
              fileSize: 189032,
              processingTime: 1100,
              hasAnalysis: true
            }
          ],
          failed: []
        },
        summary: {
          totalFiles: 2,
          successfulUploads: 2,
          failedUploads: 0,
          totalSize: 434792,
          processingTime: 2350
        }
      },
      timestamp: new Date().toISOString()
    })
  }),

  // Analysis text endpoint
  http.post('https://api.test.evalmatch.com/analysis/analyze-text', async ({ request }) => {
    console.log('MSW intercepted:', request.method, request.url)
    
    const auth = checkAuth(request)
    if (!auth.isAuthenticated) {
      return unauthorizedResponse()
    }
    const body = await request.json() as {
      resumeText: string;
      jobDescriptionText: string;
    }
    
    return HttpResponse.json({
      success: true,
      data: {
        matchPercentage: 87.5,
        matchedSkills: ['React', 'JavaScript', 'Node.js'],
        missingSkills: ['TypeScript', 'GraphQL'],
        candidateStrengths: ['Strong React skills', 'Good JavaScript foundation'],
        candidateWeaknesses: ['Limited TypeScript experience', 'No GraphQL background'],
        confidenceLevel: 'high',
        recommendations: ['Learn TypeScript fundamentals', 'Practice GraphQL queries']
      },
      timestamp: new Date().toISOString()
    })
  }),

  // Tokens status by token endpoint
  http.get('https://api.test.evalmatch.com/v1/tokens/status/by-token', ({ request }) => {
    console.log('MSW intercepted:', request.method, request.url)
    
    const auth = checkAuth(request)
    if (!auth.isAuthenticated || auth.authType !== 'token') {
      return HttpResponse.json(
        {
          success: false,
          error: 'FORBIDDEN',
          message: 'This endpoint requires API token authentication',
          timestamp: new Date().toISOString()
        },
        { status: 403 }
      )
    }
    
    return HttpResponse.json({
      success: true,
      data: {
        token: {
          id: 'token_123',
          name: 'Test API Token',
          partial: 'em_123_***',
          status: 'active',
          permissions: ['read', 'write'],
          createdAt: '2024-01-01T00:00:00Z',
          expiresAt: null,
          lastUsedAt: new Date().toISOString()
        },
        usage: {
          requestsToday: 15,
          requestsThisMonth: 450,
          totalRequests: 1250
        }
      },
      timestamp: new Date().toISOString()
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