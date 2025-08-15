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
export const getRedirectResult = jest.fn();
export const sendPasswordResetEmail = jest.fn();
export const updateProfile = jest.fn();
export const updatePassword = jest.fn();
export const reauthenticateWithCredential = jest.fn();
export const EmailAuthProvider = {
  credential: jest.fn(),
};
export const GoogleAuthProvider = jest.fn().mockImplementation(() => ({
  providerId: 'google.com',
  addScope: jest.fn(),
  setCustomParameters: jest.fn(),
}));
export const signInWithPopup = jest.fn();

export default {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword, 
  signOut,
  onAuthStateChanged,
  getRedirectResult,
  sendPasswordResetEmail,
  updateProfile,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  GoogleAuthProvider,
  signInWithPopup,
};