/**
 * Mock JOSE library for Jest Tests
 * Provides mock implementations to bypass ES Module import issues
 */

import { jest } from '@jest/globals';

// Mock JWT verification functions
export const jwtVerify = jest.fn().mockResolvedValue({
  payload: {
    sub: 'test-user-id',
    iss: 'https://securetoken.google.com/test-project',
    aud: 'test-project',
    auth_time: Date.now() / 1000,
    user_id: 'test-user-id',
    firebase: {
      identities: {},
      sign_in_provider: 'password'
    },
    iat: Date.now() / 1000,
    exp: Date.now() / 1000 + 3600,
    email: 'test@example.com',
    email_verified: true
  },
  protectedHeader: {
    alg: 'RS256',
    kid: 'test-key-id',
    typ: 'JWT'
  }
});

export const createRemoteJWKSet = jest.fn().mockReturnValue(
  jest.fn().mockResolvedValue({
    keys: [{
      kty: 'RSA',
      kid: 'test-key-id',
      use: 'sig',
      alg: 'RS256',
      n: 'test-n-value',
      e: 'AQAB'
    }]
  })
);

export const importJWK = jest.fn().mockResolvedValue({
  alg: 'RS256',
  kty: 'RSA'
});

export const SignJWT = jest.fn().mockImplementation(() => ({
  setProtectedHeader: jest.fn().mockReturnThis(),
  setIssuedAt: jest.fn().mockReturnThis(),
  setExpirationTime: jest.fn().mockReturnThis(),
  setIssuer: jest.fn().mockReturnThis(),
  setAudience: jest.fn().mockReturnThis(),
  setSubject: jest.fn().mockReturnThis(),
  sign: jest.fn().mockResolvedValue('mock.jwt.token')
}));

// Mock decrypt functions
export const compactDecrypt = jest.fn().mockResolvedValue({
  plaintext: new TextEncoder().encode('{"test": "data"}'),
  protectedHeader: {
    alg: 'RSA-OAEP-256',
    enc: 'A256GCM'
  }
});

export const EncryptJWT = jest.fn().mockImplementation(() => ({
  setProtectedHeader: jest.fn().mockReturnThis(),
  setIssuedAt: jest.fn().mockReturnThis(),
  setExpirationTime: jest.fn().mockReturnThis(),
  setIssuer: jest.fn().mockReturnThis(),
  setAudience: jest.fn().mockReturnThis(),
  setSubject: jest.fn().mockReturnThis(),
  encrypt: jest.fn().mockResolvedValue('encrypted.jwt.token')
}));

// Export default for different import patterns
export default {
  jwtVerify,
  createRemoteJWKSet,
  importJWK,
  SignJWT,
  compactDecrypt,
  EncryptJWT
};