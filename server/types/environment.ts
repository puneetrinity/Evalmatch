/**
 * Environment enumeration
 * 
 * Shared enum for application environment types to avoid circular dependencies.
 */
export enum Environment {
  // eslint-disable-next-line no-unused-vars
  Development = "development",
  // eslint-disable-next-line no-unused-vars
  Production = "production", 
  // eslint-disable-next-line no-unused-vars
  Test = "test",
}

// Explicitly use the enum values to prevent unused warnings
const _useDevelopment = Environment.Development;
const _useProduction = Environment.Production;  
const _useTest = Environment.Test;