/**
 * Utility functions for handling resume upload sessions
 */

import { randomUUID } from 'crypto';

/**
 * Generate a new unique session ID
 * @returns A unique session ID string
 */
export function generateSessionId(): string {
  return `session_${randomUUID()}`;
}

/**
 * Active sessions in memory - maps session ID to creation timestamp
 * We'll clean up old sessions periodically
 */
const activeSessions = new Map<string, number>();

/**
 * Register a new session
 * @param sessionId Session ID to register
 */
export function registerSession(sessionId: string): void {
  activeSessions.set(sessionId, Date.now());
}

/**
 * Get a list of all active session IDs
 * @returns Array of active session IDs
 */
export function getActiveSessions(): string[] {
  // Clean up sessions older than 24 hours
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  
  // Remove expired sessions
  for (const [sessionId, timestamp] of activeSessions.entries()) {
    if (timestamp < oneDayAgo) {
      activeSessions.delete(sessionId);
    }
  }
  
  return Array.from(activeSessions.keys());
}

/**
 * Check if a session is active
 * @param sessionId Session ID to check
 * @returns True if the session is active
 */
export function isSessionActive(sessionId: string): boolean {
  return activeSessions.has(sessionId);
}