/**
 * Mock for Firebase Auth
 */

import { jest } from '@jest/globals';

export const getAuth = () => ({
  currentUser: null,
  signInWithEmailAndPassword: jest.fn(),
  createUserWithEmailAndPassword: jest.fn(),
  signOut: jest.fn(),
  onAuthStateChanged: jest.fn(),
});

export const signInWithEmailAndPassword = jest.fn();
export const createUserWithEmailAndPassword = jest.fn();
export const signOut = jest.fn();
export const onAuthStateChanged = jest.fn();

export default {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword, 
  signOut,
  onAuthStateChanged,
};