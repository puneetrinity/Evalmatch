-- Remove legacy password field from users table
-- This field is unused since Firebase handles all authentication

-- Drop the password column if it exists
ALTER TABLE users DROP COLUMN IF EXISTS password;

-- Update table comment to reflect Firebase-only authentication
COMMENT ON TABLE users IS 'User profiles - authentication handled by Firebase Auth';