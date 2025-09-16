/**
 * User Service
 * Simplified service for basic user operations with current schema
 */

import { logger } from "../lib/logger";
import { getDatabase } from "../database";
import { users } from "../../shared/schema";
import { eq } from "drizzle-orm";
import { success, failure, Result } from "@shared/result-types";

export interface UserProfile {
  id: number;
  username: string;
  email?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface UserService {
  findUserByEmail(_email: string): Promise<Result<UserProfile | null, Error>>;
  findUserByUsername(_username: string): Promise<Result<UserProfile | null, Error>>;
}

/**
 * Create user service instance with simplified operations
 * Note: This works with the basic users table schema
 */
export function createUserService(): UserService {
  return {
    async findUserByEmail(email: string): Promise<Result<UserProfile | null, Error>> {
      try {
        const db = getDatabase();
        
        const user = await db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);

        if (!user || user.length === 0) {
          return success(null);
        }

        const userRecord = user[0];
        return success({
          id: userRecord.id,
          username: userRecord.username,
          email: userRecord.email || undefined,
          createdAt: userRecord.createdAt?.toISOString(),
          updatedAt: userRecord.updatedAt?.toISOString()
        });

      } catch (error) {
        logger.error("Failed to find user by email", {
          email,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        return failure(error instanceof Error ? error : new Error('Unknown error'));
      }
    },

    async findUserByUsername(username: string): Promise<Result<UserProfile | null, Error>> {
      try {
        const db = getDatabase();
        
        const user = await db
          .select()
          .from(users)
          .where(eq(users.username, username))
          .limit(1);

        if (!user || user.length === 0) {
          return success(null);
        }

        const userRecord = user[0];
        return success({
          id: userRecord.id,
          username: userRecord.username,
          email: userRecord.email || undefined,
          createdAt: userRecord.createdAt?.toISOString(),
          updatedAt: userRecord.updatedAt?.toISOString()
        });

      } catch (error) {
        logger.error("Failed to find user by username", {
          username,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        return failure(error instanceof Error ? error : new Error('Unknown error'));
      }
    }
  };
}