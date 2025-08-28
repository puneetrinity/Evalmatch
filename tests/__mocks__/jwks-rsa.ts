/**
 * Mock JWKS RSA library for Jest Tests
 * Provides mock implementations to bypass ES Module import issues
 */

import { jest } from '@jest/globals';

// Mock JWK (JSON Web Key)
const mockJWK = {
  kty: 'RSA',
  kid: 'test-key-id',
  use: 'sig',
  alg: 'RS256',
  n: 'test-n-value',
  e: 'AQAB',
  x5c: ['mock-certificate'],
  x5t: 'mock-thumbprint'
};

// Mock signing key
const mockSigningKey = {
  kid: 'test-key-id',
  alg: 'RS256',
  getPublicKey(): string {
    return '-----BEGIN PUBLIC KEY-----\nMOCK_PUBLIC_KEY\n-----END PUBLIC KEY-----';
  },
  rsaPublicKey: '-----BEGIN PUBLIC KEY-----\nMOCK_PUBLIC_KEY\n-----END PUBLIC KEY-----'
};

// Mock JWKS Client
class MockJwksClient {
  constructor(options: any) {
    // Mock constructor
  }

  getSigningKey(kid: string): Promise<any> {
    return Promise.resolve(mockSigningKey);
  }

  getSigningKeys(): Promise<any[]> {
    return Promise.resolve([mockSigningKey]);
  }
}

// Mock factory function
const jwksClient = jest.fn().mockImplementation((options: any) => {
  return new MockJwksClient(options);
});

// Export default and named exports
export default jwksClient;
export { jwksClient };
export { MockJwksClient as JwksClient };