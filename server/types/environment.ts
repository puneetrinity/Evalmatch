/**
 * Environment enumeration
 * 
 * Shared enum for application environment types to avoid circular dependencies.
 */
export enum Environment {
  Development = "development",
  Production = "production",
  Test = "test",
}

// Re-export individual values to ensure they are used
export const Development = Environment.Development;
export const Production = Environment.Production;
export const Test = Environment.Test;