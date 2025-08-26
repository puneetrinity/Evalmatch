/**
 * MSW Server Setup for Tests
 * Centralizes server configuration and exports
 */

import { setupServer } from 'msw/node'
import { handlers } from './handlers'

// Create and configure the MSW server
export const server = setupServer(...handlers)

// Helper to completely override handlers (not just add)
export function resetHandlers(...newHandlers: any[]) {
  server.resetHandlers(...newHandlers)
}

// Helper to add additional handlers
export function addHandlers(...newHandlers: any[]) {
  server.use(...newHandlers)
}