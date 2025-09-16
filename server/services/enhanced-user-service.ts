/**
 * Enhanced User Service
 * Handles user management with Firebase and Mautic integration
 */

import { logger } from "../lib/logger";
import { getDatabase } from "../database";
import { users, userIdentityMapping, type User } from "../../shared/schema";
import { eq } from "drizzle-orm";
import { success, failure, Result } from "@shared/result-types";

export interface FirebaseUser {
  uid: string;
  email?: string;
  displayName?: string;
  photoURL?: string;
  provider?: string;
}

export interface EnhancedUserProfile {
  id: number;
  username: string;
  email?: string;
  firebaseUid?: string;
  mauticContactId?: string;
  displayName?: string;
  photoUrl?: string;
  lastLogin?: Date;
  loginCount?: number;
  isActive?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface UserService {
  findUserByEmail(_email: string): Promise<Result<EnhancedUserProfile | null, Error>>;
  findUserByFirebaseUid(_firebaseUid: string): Promise<Result<EnhancedUserProfile | null, Error>>;
  findUserByUsername(_username: string): Promise<Result<EnhancedUserProfile | null, Error>>;
  createOrUpdateUserFromFirebase(_firebaseUser: FirebaseUser): Promise<Result<EnhancedUserProfile, Error>>;
  linkMauticContact(_firebaseUid: string, _mauticContactId: string): Promise<Result<void, Error>>;
  updateLastLogin(_firebaseUid: string): Promise<Result<void, Error>>;
}

/**
 * Create enhanced user service instance with Firebase support
 */
export function createEnhancedUserService(): UserService {
  return {
    async findUserByEmail(email: string): Promise<Result<EnhancedUserProfile | null, Error>> {
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
        return success(mapUserToProfile(userRecord));

      } catch (error) {
        logger.error("Failed to find user by email", {
          email,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        return failure(error instanceof Error ? error : new Error('Unknown error'));
      }
    },

    async findUserByFirebaseUid(firebaseUid: string): Promise<Result<EnhancedUserProfile | null, Error>> {
      try {
        const db = getDatabase();

        const user = await db
          .select()
          .from(users)
          .where(eq(users.firebaseUid, firebaseUid))
          .limit(1);

        if (!user || user.length === 0) {
          return success(null);
        }

        const userRecord = user[0];
        return success(mapUserToProfile(userRecord));

      } catch (error) {
        logger.error("Failed to find user by Firebase UID", {
          firebaseUid,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        return failure(error instanceof Error ? error : new Error('Unknown error'));
      }
    },

    async findUserByUsername(username: string): Promise<Result<EnhancedUserProfile | null, Error>> {
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
        return success(mapUserToProfile(userRecord));

      } catch (error) {
        logger.error("Failed to find user by username", {
          username,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        return failure(error instanceof Error ? error : new Error('Unknown error'));
      }
    },

    async createOrUpdateUserFromFirebase(firebaseUser: FirebaseUser): Promise<Result<EnhancedUserProfile, Error>> {
      try {
        const db = getDatabase();
        
        // First check if user exists by Firebase UID
        let existingUser = await db
          .select()
          .from(users)
          .where(eq(users.firebaseUid, firebaseUser.uid))
          .limit(1);

        if (existingUser.length === 0 && firebaseUser.email) {
          // Check by email as fallback
          existingUser = await db
            .select()
            .from(users)
            .where(eq(users.email, firebaseUser.email))
            .limit(1);
        }

        let user: User;
        
        if (existingUser.length > 0) {
          // Update existing user
          const updatedUsers = await db
            .update(users)
            .set({
              firebaseUid: firebaseUser.uid,
              email: firebaseUser.email || existingUser[0].email,
              displayName: firebaseUser.displayName || existingUser[0].displayName,
              photoUrl: firebaseUser.photoURL || existingUser[0].photoUrl,
              lastLogin: new Date(),
              loginCount: (existingUser[0].loginCount || 0) + 1,
              updatedAt: new Date()
            })
            .where(eq(users.id, existingUser[0].id))
            .returning();
          
          user = updatedUsers[0];
          
          logger.info("Updated existing user from Firebase", {
            userId: user.id,
            firebaseUid: firebaseUser.uid
          });
        } else {
          // Create new user
          const username = firebaseUser.email 
            ? firebaseUser.email.split('@')[0] 
            : firebaseUser.uid;
            
          const newUsers = await db
            .insert(users)
            .values({
              username: username.substring(0, 100), // Ensure it fits in the column
              email: firebaseUser.email,
              firebaseUid: firebaseUser.uid,
              displayName: firebaseUser.displayName,
              photoUrl: firebaseUser.photoURL,
              lastLogin: new Date(),
              loginCount: 1,
              isActive: true
            })
            .returning();
          
          user = newUsers[0];
          
          // Also create identity mapping
          await db.insert(userIdentityMapping)
            .values({
              userId: user.id,
              firebaseUid: firebaseUser.uid,
              email: firebaseUser.email || '',
              provider: firebaseUser.provider || 'email'
            })
            .onConflictDoNothing();
          
          logger.info("Created new user from Firebase", {
            userId: user.id,
            firebaseUid: firebaseUser.uid
          });
        }

        return success(mapUserToProfile(user));

      } catch (error) {
        logger.error("Failed to create/update user from Firebase", {
          firebaseUid: firebaseUser.uid,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        return failure(error instanceof Error ? error : new Error('Unknown error'));
      }
    },

    async linkMauticContact(firebaseUid: string, mauticContactId: string): Promise<Result<void, Error>> {
      try {
        const db = getDatabase();
        
        await db
          .update(users)
          .set({
            mauticContactId,
            lastMauticSync: new Date(),
            updatedAt: new Date()
          })
          .where(eq(users.firebaseUid, firebaseUid));
        
        logger.info("Linked Mautic contact to user", {
          firebaseUid,
          mauticContactId
        });
        
        return success(undefined);
        
      } catch (error) {
        logger.error("Failed to link Mautic contact", {
          firebaseUid,
          mauticContactId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        return failure(error instanceof Error ? error : new Error('Unknown error'));
      }
    },

    async updateLastLogin(firebaseUid: string): Promise<Result<void, Error>> {
      try {
        const db = getDatabase();
        
        const userRecord = await db
          .select()
          .from(users)
          .where(eq(users.firebaseUid, firebaseUid))
          .limit(1);
        
        if (userRecord.length > 0) {
          await db
            .update(users)
            .set({
              lastLogin: new Date(),
              loginCount: (userRecord[0].loginCount || 0) + 1,
              updatedAt: new Date()
            })
            .where(eq(users.firebaseUid, firebaseUid));
        }
        
        logger.debug("Updated last login for user", { firebaseUid });
        
        return success(undefined);
        
      } catch (error) {
        logger.error("Failed to update last login", {
          firebaseUid,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        return failure(error instanceof Error ? error : new Error('Unknown error'));
      }
    }
  };
}

/**
 * Helper function to map database user to profile
 */
function mapUserToProfile(user: User): EnhancedUserProfile {
  return {
    id: user.id,
    username: user.username,
    email: user.email ?? undefined,
    firebaseUid: user.firebaseUid ?? undefined,
    mauticContactId: user.mauticContactId ?? undefined,
    displayName: user.displayName ?? undefined,
    photoUrl: user.photoUrl ?? undefined,
    lastLogin: user.lastLogin ?? undefined,
    loginCount: user.loginCount ?? undefined,
    isActive: user.isActive ?? undefined,
    createdAt: user.createdAt ?? undefined,
    updatedAt: user.updatedAt ?? undefined
  };
}

// Export singleton instance
export const userService = createEnhancedUserService();