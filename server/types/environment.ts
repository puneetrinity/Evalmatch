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

// Explicitly use the enum values to prevent unused warnings
const _Development = Environment.Development;
const _Production = Environment.Production;  
const _Test = Environment.Test;