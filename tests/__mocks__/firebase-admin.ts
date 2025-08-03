/**
 * Mock Firebase Admin SDK for Jest Tests
 * Provides mock implementations to bypass ES Module import issues
 */

// Mock Firebase App
export const mockApp = {
  name: 'test-app',
  options: {},
  delete: jest.fn().mockResolvedValue(void 0),
};

// Mock Firebase Auth
export const mockAuth = {
  verifyIdToken: jest.fn(),
  createCustomToken: jest.fn(),
  getUser: jest.fn(),
  getUserByEmail: jest.fn(),
  createUser: jest.fn(),
  updateUser: jest.fn(),
  deleteUser: jest.fn(),
  listUsers: jest.fn(),
  setCustomUserClaims: jest.fn(),
};

// Mock Firebase Admin App functions
export const initializeApp = jest.fn().mockReturnValue(mockApp);
export const getApps = jest.fn().mockReturnValue([]);
export const cert = jest.fn().mockReturnValue({});
export const getAuth = jest.fn().mockReturnValue(mockAuth);

// Mock default export
const firebaseAdmin = {
  initializeApp,
  getApps,
  cert,
  auth: {
    getAuth,
  },
  app: {
    initializeApp,
    getApps,
    cert,
  },
};

export default firebaseAdmin;

// Named exports for different import patterns
export { mockApp as App };
export { mockAuth as Auth };