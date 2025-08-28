/**
 * Mock for firebase/app
 */

import { jest } from '@jest/globals';

export const initializeApp = jest.fn().mockImplementation(() => ({
  name: '[DEFAULT]',
  options: {},
}));

export const getApps = jest.fn().mockImplementation(() => []);

export const getApp = jest.fn().mockImplementation(() => ({
  name: '[DEFAULT]',
  options: {},
}));

export default {
  initializeApp,
  getApps,
  getApp,
};