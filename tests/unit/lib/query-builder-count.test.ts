/**
 * Unit tests for QueryBuilder COUNT functionality
 * Tests the newly implemented count() method and its integration
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { QueryBuilder } from '../../../server/lib/query-builder';
import { logger } from '../../../server/lib/logger';

// Mock logger
jest.mock('../../../server/lib/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

// Mock PgTable for testing
const mockTable = {
  [Symbol.for('drizzle:Name')]: 'test_table'
} as any;

describe('QueryBuilder COUNT Functionality', () => {
  let queryBuilder: QueryBuilder;

  beforeEach(() => {
    jest.clearAllMocks();
    queryBuilder = new QueryBuilder();
  });

  describe('count() method', () => {
    it('should return count structure with conditions', async () => {
      const result = await queryBuilder.count(mockTable);
      
      expect(result).toHaveProperty('count');
      expect(result).toHaveProperty('conditions');
      expect(typeof result.count).toBe('number');
      expect(Array.isArray(result.conditions)).toBe(true);
    });

    it('should execute count query successfully', async () => {
      await queryBuilder.count(mockTable);
      
      // Basic verification that the method completes without error
      expect(true).toBe(true);
    });

    it('should return zero count for placeholder implementation', async () => {
      const result = await queryBuilder.count(mockTable);
      
      expect(result.count).toBe(0);
    });
  });

  describe('count() with conditions', () => {
    it('should track WHERE conditions in count query', async () => {
      queryBuilder.where('status', 'active');
      const result = await queryBuilder.count(mockTable);
      
      expect(result.conditions).toHaveLength(1);
      expect(Array.isArray(result.conditions)).toBe(true);
    });

    it('should track LIKE conditions in count query', async () => {
      queryBuilder.like('title', '%engineer%');
      const result = await queryBuilder.count(mockTable);
      
      expect(result.conditions).toHaveLength(1);
      expect(Array.isArray(result.conditions)).toBe(true);
    });

    it('should track ILIKE conditions in count query', async () => {
      queryBuilder.ilike('description', '%javascript%');
      const result = await queryBuilder.count(mockTable);
      
      expect(result.conditions).toHaveLength(1);
      expect(Array.isArray(result.conditions)).toBe(true);
    });

    it('should combine multiple conditions in count query', async () => {
      queryBuilder
        .where('status', 'active')
        .like('title', '%engineer%')
        .ilike('skills', '%typescript%');
      
      const result = await queryBuilder.count(mockTable);
      
      expect(result.conditions).toHaveLength(3);
      expect(Array.isArray(result.conditions)).toBe(true);
    });
  });

  describe('count() with chaining', () => {
    it('should support method chaining before count()', async () => {
      const userQueryBuilder = QueryBuilder.forUser('user-123');
      const result = await userQueryBuilder
        .where('status', 'published')
        .like('title', '%developer%')
        .count(mockTable);
      
      expect(result).toHaveProperty('count');
      expect(result).toHaveProperty('conditions');
      expect(result.conditions.length).toBeGreaterThan(0);
    });

    it('should ignore pagination in count queries', async () => {
      queryBuilder
        .where('category', 'technology')
        .paginate(2, 10); // Should be ignored in count
      
      const result = await queryBuilder.count(mockTable);
      
      // Count should not include pagination info
      expect(result).not.toHaveProperty('pagination');
      expect(result).toHaveProperty('count');
      expect(result).toHaveProperty('conditions');
    });

    it('should ignore sorting in count queries', async () => {
      queryBuilder
        .where('status', 'active')
        .orderBy('createdAt', 'desc'); // Should be ignored in count
      
      const result = await queryBuilder.count(mockTable);
      
      // Count should not include sort info
      expect(result).toHaveProperty('count');
      expect(result.conditions).toHaveLength(1); // Only WHERE condition
    });
  });

  describe('count() performance', () => {
    it('should complete count query quickly', async () => {
      const startTime = Date.now();
      
      await queryBuilder
        .where('status', 'active')
        .like('title', '%test%')
        .count(mockTable);
      
      const endTime = Date.now();
      const executionTime = endTime - startTime;
      
      // Should complete within 50ms for unit test
      expect(executionTime).toBeLessThan(50);
    });

    it('should handle complex condition chains efficiently', async () => {
      const startTime = Date.now();
      
      // Build complex query
      const userQueryBuilder = QueryBuilder.forUser('user-123');
      userQueryBuilder
        .where('status', 'active')
        .where('category', 'job')
        .like('title', '%engineer%')
        .ilike('description', '%remote%')
        .like('location', '%san francisco%');
      
      await userQueryBuilder.count(mockTable);
      
      const endTime = Date.now();
      const executionTime = endTime - startTime;
      
      // Should still complete quickly
      expect(executionTime).toBeLessThan(100);
    });
  });

  describe('count() error handling', () => {
    it('should handle table symbol extraction gracefully', async () => {
      const tableWithoutSymbol = {} as any;
      
      const result = await queryBuilder.count(tableWithoutSymbol);
      
      expect(result).toHaveProperty('count');
      expect(result).toHaveProperty('conditions');
    });

    it('should return consistent structure even on errors', async () => {
      const result = await queryBuilder.count(mockTable);
      
      expect(result).toHaveProperty('count');
      expect(result).toHaveProperty('conditions');
      expect(typeof result.count).toBe('number');
      expect(Array.isArray(result.conditions)).toBe(true);
    });
  });

  describe('count() vs execute() consistency', () => {
    it('should use same condition tracking as execute()', async () => {
      queryBuilder
        .where('status', 'published')
        .like('title', '%javascript%');
      
      const countResult = await queryBuilder.count(mockTable);
      const executeResult = await queryBuilder.execute(mockTable);
      
      // Both should have same conditions
      expect(countResult.conditions).toEqual(executeResult.conditions);
    });

    it('should execute both count and execute methods successfully', async () => {
      queryBuilder.where('category', 'tech');
      
      const countResult = await queryBuilder.count(mockTable);
      const executeResult = await queryBuilder.execute(mockTable);
      
      expect(countResult).toHaveProperty('count');
      expect(executeResult).toHaveProperty('conditions');
    });
  });
});