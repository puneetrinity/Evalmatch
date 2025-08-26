/**
 * Tests for Interceptor System
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  InterceptorManager,
  BuiltInInterceptors,
  createDefaultInterceptors
} from '../../core/interceptors'

describe('InterceptorManager', () => {
  let manager: InterceptorManager

  beforeEach(() => {
    manager = new InterceptorManager()
  })

  it('should manage request interceptors', () => {
    const interceptor = vi.fn((config, context) => config)
    
    // Add interceptor
    const unsubscribe = manager.addRequestInterceptor(interceptor)
    
    expect(manager.getCounts().request).toBe(1)
    
    // Remove interceptor
    unsubscribe()
    expect(manager.getCounts().request).toBe(0)
  })

  it('should manage response interceptors', () => {
    const interceptor = vi.fn((response, context) => response)
    
    const unsubscribe = manager.addResponseInterceptor(interceptor)
    expect(manager.getCounts().response).toBe(1)
    
    unsubscribe()
    expect(manager.getCounts().response).toBe(0)
  })

  it('should manage error interceptors', () => {
    const interceptor = vi.fn().mockRejectedValue(new Error('test'))
    
    const unsubscribe = manager.addErrorInterceptor(interceptor)
    expect(manager.getCounts().error).toBe(1)
    
    unsubscribe()
    expect(manager.getCounts().error).toBe(0)
  })

  it('should process request through interceptors', async () => {
    const interceptor1 = vi.fn((config) => ({ ...config, test1: true }))
    const interceptor2 = vi.fn((config) => ({ ...config, test2: true }))
    
    manager.addRequestInterceptor(interceptor1)
    manager.addRequestInterceptor(interceptor2)
    
    const result = await manager.processRequest(
      { url: '/test' },
      { requestId: 'req_123', startTime: Date.now() }
    )
    
    expect(result).toMatchObject({
      url: '/test',
      test1: true,
      test2: true
    })
    
    expect(interceptor1).toHaveBeenCalledTimes(1)
    expect(interceptor2).toHaveBeenCalledTimes(1)
  })

  it('should process response through interceptors', async () => {
    const interceptor1 = vi.fn((response) => ({ ...response, processed1: true }))
    const interceptor2 = vi.fn((response) => ({ ...response, processed2: true }))
    
    manager.addResponseInterceptor(interceptor1)
    manager.addResponseInterceptor(interceptor2)
    
    const mockResponse = {
      status: 200,
      data: { success: true },
      config: {},
      headers: {},
      statusText: 'OK'
    }
    
    const result = await manager.processResponse(
      mockResponse,
      { requestId: 'req_123', startTime: Date.now(), duration: 100 }
    )
    
    expect(result).toMatchObject({
      ...mockResponse,
      processed1: true,
      processed2: true
    })
  })

  it('should clear all interceptors', () => {
    manager.addRequestInterceptor(vi.fn())
    manager.addResponseInterceptor(vi.fn())
    manager.addErrorInterceptor(vi.fn())
    
    expect(manager.getCounts()).toEqual({ request: 1, response: 1, error: 1 })
    
    manager.clear()
    expect(manager.getCounts()).toEqual({ request: 0, response: 0, error: 0 })
  })
})

describe('BuiltInInterceptors', () => {
  describe('requestId', () => {
    it('should add request ID to headers', () => {
      const interceptor = BuiltInInterceptors.requestId()
      const config = { headers: {} }
      const context = { requestId: 'req_123', startTime: Date.now() }
      
      const result = interceptor(config, context)
      
      expect(result.headers['X-Request-ID']).toBe('req_123')
    })
  })

  describe('userAgent', () => {
    it('should add user agent header', () => {
      const interceptor = BuiltInInterceptors.userAgent('2.0.0')
      const config = { headers: {} }
      const context = { requestId: 'req_123', startTime: Date.now() }
      
      const result = interceptor(config, context)
      
      expect(result.headers['User-Agent']).toBe('EvalMatch-SDK/2.0.0 (TypeScript)')
    })

    it('should use default version', () => {
      const interceptor = BuiltInInterceptors.userAgent()
      const config = { headers: {} }
      const context = { requestId: 'req_123', startTime: Date.now() }
      
      const result = interceptor(config, context)
      
      expect(result.headers['User-Agent']).toBe('EvalMatch-SDK/1.0.0 (TypeScript)')
    })
  })

  describe('timeout', () => {
    it('should set timeout when not provided', () => {
      const interceptor = BuiltInInterceptors.timeout(5000)
      const config = {}
      const context = { requestId: 'req_123', startTime: Date.now() }
      
      const result = interceptor(config, context)
      
      expect(result.timeout).toBe(5000)
    })

    it('should not override existing timeout', () => {
      const interceptor = BuiltInInterceptors.timeout(5000)
      const config = { timeout: 10000 }
      const context = { requestId: 'req_123', startTime: Date.now() }
      
      const result = interceptor(config, context)
      
      expect(result.timeout).toBe(10000)
    })
  })

  describe('authentication', () => {
    it('should add auth header when token available', async () => {
      const getToken = vi.fn().mockResolvedValue('test-token')
      const interceptor = BuiltInInterceptors.authentication(getToken)
      const config = { headers: {} }
      const context = { requestId: 'req_123', startTime: Date.now() }
      
      const result = await interceptor(config, context)
      
      expect(result.headers.Authorization).toBe('Bearer test-token')
      expect(getToken).toHaveBeenCalledTimes(1)
    })

    it('should not add auth header when token not available', async () => {
      const getToken = vi.fn().mockResolvedValue(null)
      const interceptor = BuiltInInterceptors.authentication(getToken)
      const config = { headers: {} }
      const context = { requestId: 'req_123', startTime: Date.now() }
      
      const result = await interceptor(config, context)
      
      expect(result.headers.Authorization).toBeUndefined()
    })
  })

  describe('contentType', () => {
    it('should set JSON content type for object data', () => {
      const interceptor = BuiltInInterceptors.contentType()
      const config = { 
        data: { test: 'data' },
        headers: {} 
      }
      const context = { requestId: 'req_123', startTime: Date.now() }
      
      const result = interceptor(config, context)
      
      expect(result.headers['Content-Type']).toBe('application/json')
    })

    it('should not set content type for FormData', () => {
      const interceptor = BuiltInInterceptors.contentType()
      const config = { 
        data: new FormData(),
        headers: {} 
      }
      const context = { requestId: 'req_123', startTime: Date.now() }
      
      const result = interceptor(config, context)
      
      expect(result.headers['Content-Type']).toBeUndefined()
    })

    it('should not override existing content type', () => {
      const interceptor = BuiltInInterceptors.contentType()
      const config = { 
        data: { test: 'data' },
        headers: { 'Content-Type': 'application/xml' } 
      }
      const context = { requestId: 'req_123', startTime: Date.now() }
      
      const result = interceptor(config, context)
      
      expect(result.headers['Content-Type']).toBe('application/xml')
    })
  })

  describe('responseTiming', () => {
    it('should log warning for slow responses', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      
      const interceptor = BuiltInInterceptors.responseTiming()
      const response = {
        status: 200,
        data: {},
        config: {},
        headers: {},
        statusText: 'OK'
      }
      const context = {
        requestId: 'req_123',
        startTime: Date.now() - 2000,
        duration: 2000,
        method: 'GET',
        endpoint: '/test'
      }
      
      const result = interceptor(response, context)
      
      expect(consoleSpy).toHaveBeenCalledWith(
        'Slow API response: GET /test took 2000ms'
      )
      expect(result).toBe(response)
      
      consoleSpy.mockRestore()
    })

    it('should not log for fast responses', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      
      const interceptor = BuiltInInterceptors.responseTiming()
      const response = {
        status: 200,
        data: {},
        config: {},
        headers: {},
        statusText: 'OK'
      }
      const context = {
        requestId: 'req_123',
        startTime: Date.now() - 500,
        duration: 500,
        method: 'GET',
        endpoint: '/test'
      }
      
      interceptor(response, context)
      
      expect(consoleSpy).not.toHaveBeenCalled()
      
      consoleSpy.mockRestore()
    })
  })

  describe('errorLogging', () => {
    it('should log error details when debug enabled', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      
      const interceptor = BuiltInInterceptors.errorLogging(true)
      const error = {
        message: 'Test error',
        response: { status: 500, data: { error: 'Server error' } },
        config: { url: '/test', method: 'get' }
      }
      const context = {
        requestId: 'req_123',
        startTime: Date.now(),
        duration: 1000,
        method: 'GET',
        endpoint: '/test'
      }
      
      await expect(interceptor(error as any, context)).rejects.toThrow()
      
      expect(consoleSpy).toHaveBeenCalledWith('API Error Details:', {
        requestId: 'req_123',
        method: 'GET',
        endpoint: '/test',
        duration: 1000,
        statusCode: 500,
        error: 'Test error',
        data: { error: 'Server error' }
      })
      
      consoleSpy.mockRestore()
    })

    it('should not log when debug disabled', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      
      const interceptor = BuiltInInterceptors.errorLogging(false)
      const error = { message: 'Test error' }
      const context = {
        requestId: 'req_123',
        startTime: Date.now(),
        duration: 1000
      }
      
      await expect(interceptor(error as any, context)).rejects.toThrow()
      
      expect(consoleSpy).not.toHaveBeenCalled()
      
      consoleSpy.mockRestore()
    })
  })
})

describe('createDefaultInterceptors', () => {
  it('should create default interceptor sets', () => {
    const getToken = vi.fn().mockResolvedValue('test-token')
    
    const result = createDefaultInterceptors(getToken, false)
    
    expect(result.requestInterceptors).toHaveLength(5)
    expect(result.responseInterceptors).toHaveLength(1)
    expect(result.errorInterceptors).toHaveLength(2)
  })

  it('should configure interceptors with proper parameters', async () => {
    const getToken = vi.fn().mockResolvedValue('test-token')
    
    const { requestInterceptors } = createDefaultInterceptors(getToken, true)
    
    // Test authentication interceptor works
    const authInterceptor = requestInterceptors.find(interceptor => 
      interceptor.name === 'authentication' || 
      interceptor.toString().includes('getToken')
    )
    
    expect(authInterceptor).toBeDefined()
  })
})