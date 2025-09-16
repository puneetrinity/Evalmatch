-- Migration: 015_add_firebase_mautic_mapping.sql
-- Purpose: Add Firebase UID and Mautic Contact ID mapping to users table
-- Date: 2025-09-16

-- Add Firebase and Mautic related columns to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS firebase_uid VARCHAR(128) UNIQUE,
ADD COLUMN IF NOT EXISTS mautic_contact_id VARCHAR(50),
ADD COLUMN IF NOT EXISTS display_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS photo_url TEXT,
ADD COLUMN IF NOT EXISTS last_mautic_sync TIMESTAMP,
ADD COLUMN IF NOT EXISTS last_login TIMESTAMP,
ADD COLUMN IF NOT EXISTS login_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_firebase_uid ON users(firebase_uid);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_mautic_contact_id ON users(mautic_contact_id);

-- Create a mapping table to track user identity relationships
CREATE TABLE IF NOT EXISTS user_identity_mapping (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  firebase_uid VARCHAR(128) UNIQUE NOT NULL,
  email VARCHAR(255) NOT NULL,
  provider VARCHAR(50), -- 'google', 'email', etc.
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_user_firebase UNIQUE(user_id, firebase_uid)
);

CREATE INDEX IF NOT EXISTS idx_identity_firebase_uid ON user_identity_mapping(firebase_uid);
CREATE INDEX IF NOT EXISTS idx_identity_email ON user_identity_mapping(email);

-- Create a function to automatically create or update user from Firebase auth
CREATE OR REPLACE FUNCTION upsert_user_from_firebase(
  p_firebase_uid VARCHAR,
  p_email VARCHAR,
  p_display_name VARCHAR,
  p_photo_url TEXT,
  p_provider VARCHAR DEFAULT 'email'
) RETURNS INTEGER AS $$
DECLARE
  v_user_id INTEGER;
BEGIN
  -- First try to find user by Firebase UID
  SELECT id INTO v_user_id FROM users WHERE firebase_uid = p_firebase_uid;
  
  IF v_user_id IS NULL AND p_email IS NOT NULL THEN
    -- Try to find by email
    SELECT id INTO v_user_id FROM users WHERE email = p_email;
  END IF;
  
  IF v_user_id IS NULL THEN
    -- Create new user
    INSERT INTO users (
      username, 
      email, 
      firebase_uid, 
      display_name, 
      photo_url,
      last_login,
      login_count
    ) VALUES (
      COALESCE(SPLIT_PART(p_email, '@', 1), p_firebase_uid), -- Use email prefix or Firebase UID as username
      p_email,
      p_firebase_uid,
      p_display_name,
      p_photo_url,
      CURRENT_TIMESTAMP,
      1
    )
    RETURNING id INTO v_user_id;
    
    -- Also create identity mapping
    INSERT INTO user_identity_mapping (user_id, firebase_uid, email, provider)
    VALUES (v_user_id, p_firebase_uid, COALESCE(p_email, ''), p_provider)
    ON CONFLICT DO NOTHING;
  ELSE
    -- Update existing user
    UPDATE users 
    SET 
      firebase_uid = COALESCE(firebase_uid, p_firebase_uid),
      email = COALESCE(email, p_email),
      display_name = COALESCE(p_display_name, display_name),
      photo_url = COALESCE(p_photo_url, photo_url),
      last_login = CURRENT_TIMESTAMP,
      login_count = login_count + 1,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = v_user_id;
    
    -- Ensure identity mapping exists
    INSERT INTO user_identity_mapping (user_id, firebase_uid, email, provider)
    VALUES (v_user_id, p_firebase_uid, COALESCE(p_email, ''), p_provider)
    ON CONFLICT DO NOTHING;
  END IF;
  
  RETURN v_user_id;
END;
$$ LANGUAGE plpgsql;

-- Add comment for documentation
COMMENT ON FUNCTION upsert_user_from_firebase IS 'Creates or updates a user based on Firebase authentication data';
COMMENT ON COLUMN users.firebase_uid IS 'Firebase Authentication unique identifier';
COMMENT ON COLUMN users.mautic_contact_id IS 'Mautic CRM contact identifier for marketing integration';
COMMENT ON COLUMN users.display_name IS 'User display name from Firebase or user profile';
COMMENT ON COLUMN users.photo_url IS 'User profile photo URL';
COMMENT ON COLUMN users.last_mautic_sync IS 'Last time user data was synced with Mautic';