/**
 * Mock for react-hot-toast
 */

import { jest } from '@jest/globals';

export const toast = {
  success: jest.fn(),
  error: jest.fn(),
  loading: jest.fn(),
  dismiss: jest.fn(),
  promise: jest.fn(),
  custom: jest.fn(),
};

export default toast;