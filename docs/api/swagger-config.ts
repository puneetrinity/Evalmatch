/**
 * Swagger/OpenAPI Configuration for EvalMatch API
 * Auto-generates API documentation from route annotations
 */

import swaggerJsdoc from 'swagger-jsdoc';

export const swaggerOptions: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'EvalMatch API',
      version: '2.1.0',
      description: `
        AI-powered recruitment platform API for intelligent resume analysis and bias-free hiring.
        
        ## Features
        - Multi-format resume processing (PDF, DOCX, TXT)
        - AI-powered candidate matching with 85% accuracy
        - Bias detection in job descriptions
        - Interview question generation
        - Enterprise-grade security and validation
        
        ## Authentication
        All protected endpoints require Firebase JWT authentication.
        Include the token in the Authorization header: \`Bearer <jwt-token>\`
        
        ## Rate Limiting
        - Resume uploads: 50 requests per 15 minutes
        - Analysis endpoints: 20 requests per 15 minutes
        - General endpoints: 100 requests per 15 minutes
      `,
      contact: {
        name: 'EvalMatch API Support',
        url: 'https://evalmatch.app/docs/api',
        email: 'api-support@evalmatch.app'
      },
      license: {
        name: 'Commercial License',
        url: 'https://evalmatch.app/license'
      },
      termsOfService: 'https://evalmatch.app/terms'
    },
    servers: [
      {
        url: 'https://evalmatch.app/api',
        description: 'Production server'
      },
      {
        url: 'https://recruitment-corner.scholavar.com/api', 
        description: 'Scholavar production server'
      },
      {
        url: 'http://localhost:3000/api',
        description: 'Development server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Firebase JWT token. Get it from Firebase Auth SDK.'
        }
      },
      schemas: {
        // Base API Response Types
        ApiResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: true
            },
            data: {
              type: 'object',
              description: 'Response data (varies by endpoint)'
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
              example: '2025-01-14T10:30:00.000Z'
            }
          },
          required: ['success', 'timestamp']
        },
        ApiError: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false
            },
            error: {
              type: 'object',
              properties: {
                code: {
                  type: 'string',
                  example: 'VALIDATION_ERROR'
                },
                message: {
                  type: 'string',
                  example: 'Invalid input provided'
                },
                details: {
                  type: 'object',
                  description: 'Additional error details'
                }
              },
              required: ['code', 'message']
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
              example: '2025-01-14T10:30:00.000Z'
            }
          },
          required: ['success', 'error', 'timestamp']
        },
        
        // Resume Types
        Resume: {
          type: 'object',
          properties: {
            id: {
              type: 'integer',
              example: 123
            },
            filename: {
              type: 'string',
              example: 'john_doe_resume.pdf'
            },
            originalName: {
              type: 'string',
              example: 'John Doe Resume.pdf'
            },
            content: {
              type: 'string',
              description: 'Extracted text content from the resume'
            },
            fileSize: {
              type: 'integer',
              description: 'File size in bytes',
              example: 245760
            },
            mimeType: {
              type: 'string',
              example: 'application/pdf'
            },
            status: {
              type: 'string',
              enum: ['uploaded', 'processing', 'analyzed', 'error'],
              example: 'analyzed'
            },
            uploadedAt: {
              type: 'string',
              format: 'date-time',
              example: '2025-01-14T10:30:00.000Z'
            },
            userId: {
              type: 'string',
              description: 'Firebase user ID'
            }
          },
          required: ['id', 'filename', 'status', 'uploadedAt', 'userId']
        },
        
        // Job Description Types
        JobDescription: {
          type: 'object',
          properties: {
            id: {
              type: 'integer',
              example: 456
            },
            title: {
              type: 'string',
              example: 'Senior Full Stack Developer'
            },
            description: {
              type: 'string',
              description: 'Full job description text'
            },
            requirements: {
              type: 'array',
              items: {
                type: 'string'
              },
              example: ['5+ years experience', 'React expertise', 'Node.js knowledge']
            },
            location: {
              type: 'string',
              example: 'San Francisco, CA'
            },
            employmentType: {
              type: 'string',
              enum: ['full-time', 'part-time', 'contract', 'freelance'],
              example: 'full-time'
            },
            salaryRange: {
              type: 'object',
              properties: {
                min: { type: 'number', example: 120000 },
                max: { type: 'number', example: 180000 },
                currency: { type: 'string', example: 'USD' }
              }
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              example: '2025-01-14T10:30:00.000Z'
            },
            userId: {
              type: 'string',
              description: 'Firebase user ID'
            }
          },
          required: ['id', 'title', 'description', 'createdAt', 'userId']
        },
        
        // Analysis Types
        AnalysisResult: {
          type: 'object',
          properties: {
            id: {
              type: 'integer',
              example: 789
            },
            resumeId: {
              type: 'integer',
              example: 123
            },
            jobId: {
              type: 'integer', 
              example: 456
            },
            overallScore: {
              type: 'number',
              minimum: 0,
              maximum: 100,
              example: 87.5,
              description: 'Overall matching score (0-100)'
            },
            confidenceScore: {
              type: 'number',
              minimum: 0,
              maximum: 100,
              example: 92.3,
              description: 'AI confidence in the analysis (0-100)'
            },
            strengths: {
              type: 'array',
              items: {
                type: 'string'
              },
              example: ['Strong React experience', 'Full-stack capabilities', 'Leadership skills']
            },
            improvements: {
              type: 'array',
              items: {
                type: 'string'
              },
              example: ['Could benefit from more DevOps experience', 'GraphQL knowledge would be valuable']
            },
            skillsMatch: {
              type: 'object',
              properties: {
                matched: {
                  type: 'array',
                  items: { type: 'string' },
                  example: ['JavaScript', 'React', 'Node.js']
                },
                missing: {
                  type: 'array',
                  items: { type: 'string' },
                  example: ['Docker', 'Kubernetes']
                },
                score: {
                  type: 'number',
                  example: 85.5
                }
              }
            },
            experienceMatch: {
              type: 'object',
              properties: {
                yearsRequired: { type: 'number', example: 5 },
                yearsCandidate: { type: 'number', example: 7 },
                score: { type: 'number', example: 95.0 }
              }
            },
            analyzedAt: {
              type: 'string',
              format: 'date-time',
              example: '2025-01-14T10:30:00.000Z'
            }
          },
          required: ['id', 'resumeId', 'jobId', 'overallScore', 'confidenceScore', 'analyzedAt']
        },
        
        // Bias Analysis Types
        BiasAnalysis: {
          type: 'object',
          properties: {
            jobId: {
              type: 'integer',
              example: 456
            },
            overallBiasScore: {
              type: 'number',
              minimum: 0,
              maximum: 100,
              example: 15.2,
              description: 'Lower scores indicate less bias (0-100)'
            },
            biasCategories: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  category: {
                    type: 'string',
                    enum: ['gender', 'age', 'race', 'disability', 'education', 'other'],
                    example: 'gender'
                  },
                  score: {
                    type: 'number',
                    example: 25.0
                  },
                  examples: {
                    type: 'array',
                    items: { type: 'string' },
                    example: ['young professional', 'competitive environment']
                  }
                }
              }
            },
            suggestions: {
              type: 'array',
              items: {
                type: 'string'
              },
              example: ['Replace "young professional" with "early-career professional"', 'Use inclusive language for team culture']
            },
            analyzedAt: {
              type: 'string',
              format: 'date-time',
              example: '2025-01-14T10:30:00.000Z'
            }
          },
          required: ['jobId', 'overallBiasScore', 'biasCategories', 'analyzedAt']
        },
        
        // Interview Questions Types
        InterviewQuestions: {
          type: 'object',
          properties: {
            resumeId: {
              type: 'integer',
              example: 123
            },
            jobId: {
              type: 'integer',
              example: 456
            },
            questions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  question: {
                    type: 'string',
                    example: 'Can you describe your experience with React hooks and how you've used them in production?'
                  },
                  category: {
                    type: 'string',
                    enum: ['technical', 'behavioral', 'situational', 'experience'],
                    example: 'technical'
                  },
                  difficulty: {
                    type: 'string',
                    enum: ['beginner', 'intermediate', 'advanced'],
                    example: 'intermediate'
                  },
                  reasoning: {
                    type: 'string',
                    example: 'Based on their React experience mentioned in the resume'
                  }
                }
              }
            },
            generatedAt: {
              type: 'string',
              format: 'date-time',
              example: '2025-01-14T10:30:00.000Z'
            }
          },
          required: ['resumeId', 'jobId', 'questions', 'generatedAt']
        }
      },
      responses: {
        UnauthorizedError: {
          description: 'Authentication required',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ApiError'
              },
              example: {
                success: false,
                error: {
                  code: 'AUTH_TOKEN_MISSING',
                  message: 'Authentication required'
                },
                timestamp: '2025-01-14T10:30:00.000Z'
              }
            }
          }
        },
        ForbiddenError: {
          description: 'Insufficient permissions',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ApiError'
              },
              example: {
                success: false,
                error: {
                  code: 'INSUFFICIENT_PERMISSIONS',
                  message: 'Access denied'
                },
                timestamp: '2025-01-14T10:30:00.000Z'
              }
            }
          }
        },
        ValidationError: {
          description: 'Validation error',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ApiError'
              },
              example: {
                success: false,
                error: {
                  code: 'VALIDATION_ERROR',
                  message: 'Invalid input provided',
                  details: {
                    field: 'email',
                    issue: 'Invalid email format'
                  }
                },
                timestamp: '2025-01-14T10:30:00.000Z'
              }
            }
          }
        },
        RateLimitError: {
          description: 'Rate limit exceeded',
          headers: {
            'X-RateLimit-Limit': {
              schema: {
                type: 'integer'
              },
              description: 'Request limit per time window'
            },
            'X-RateLimit-Remaining': {
              schema: {
                type: 'integer'
              },
              description: 'Remaining requests in current window'
            },
            'X-RateLimit-Reset': {
              schema: {
                type: 'integer'
              },
              description: 'Time window reset timestamp'
            }
          },
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ApiError'
              },
              example: {
                success: false,
                error: {
                  code: 'RATE_LIMIT_EXCEEDED',
                  message: 'Too many requests. Try again in 15 minutes.'
                },
                timestamp: '2025-01-14T10:30:00.000Z'
              }
            }
          }
        },
        ServerError: {
          description: 'Internal server error',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ApiError'
              },
              example: {
                success: false,
                error: {
                  code: 'INTERNAL_ERROR',
                  message: 'An unexpected error occurred'
                },
                timestamp: '2025-01-14T10:30:00.000Z'
              }
            }
          }
        }
      },
      parameters: {
        ResumeId: {
          name: 'id',
          in: 'path',
          required: true,
          description: 'Resume ID',
          schema: {
            type: 'integer',
            example: 123
          }
        },
        JobId: {
          name: 'id',
          in: 'path',
          required: true,
          description: 'Job description ID',
          schema: {
            type: 'integer',
            example: 456
          }
        },
        JobIdParam: {
          name: 'jobId',
          in: 'path',
          required: true,
          description: 'Job description ID',
          schema: {
            type: 'integer',
            example: 456
          }
        },
        ResumeIdParam: {
          name: 'resumeId',
          in: 'path',
          required: true,
          description: 'Resume ID',
          schema: {
            type: 'integer',
            example: 123
          }
        }
      }
    },
    security: [
      {
        bearerAuth: []
      }
    ],
    tags: [
      {
        name: 'Health',
        description: 'System health and status endpoints'
      },
      {
        name: 'Authentication',
        description: 'User authentication and profile management'
      },
      {
        name: 'Resumes',
        description: 'Resume upload and management'
      },
      {
        name: 'Job Descriptions',
        description: 'Job description creation and management'
      },
      {
        name: 'Analysis',
        description: 'AI-powered resume analysis and matching'
      },
      {
        name: 'Bias Detection',
        description: 'Job description bias analysis'
      },
      {
        name: 'Interview Questions',
        description: 'AI-generated interview questions'
      }
    ]
  },
  apis: [
    './server/routes/*.ts',
    './server/index.ts'
  ]
};

export const swaggerSpec = swaggerJsdoc(swaggerOptions);