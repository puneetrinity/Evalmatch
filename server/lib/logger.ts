/**
 * ✅ LOGGER SHIM - Unification
 * Re-exports the Pino logger from config/logger to unify logging across modules
 * Maintains backward compatibility while centralizing on production-ready Pino
 */

export { logger } from '../config/logger';
export default undefined as never; // Prefer named import for consistency
