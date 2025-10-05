/*
  # Fix All Recursive RLS Policies

  1. Problem
    - Multiple policies on user_profiles cause infinite recursion
    - Policies query user_profiles to check roles, causing loops
    - Auth cannot complete because it needs to query user_profiles
  
  2. Solution
    - Remove all admin-checking policies that query user_profiles
    - Keep only simple self-referencing policies for regular users
    - Admin operations will use service role key from application layer
  
  3. Security
    - Users can only view/update their own profile
    - Admin operations handled at application level with service role
*/

-- Drop ALL existing policies on user_profiles
DROP POLICY IF EXISTS "Users can view own profile" ON user_profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;
DROP POLICY IF EXISTS "Admins can insert profiles" ON user_profiles;
DROP POLICY IF EXISTS "Admins can delete profiles" ON user_profiles;

-- Create simple, non-recursive policies
-- SELECT: Users can view their own profile
CREATE POLICY "Users view own profile"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- UPDATE: Users can update their own profile
CREATE POLICY "Users update own profile"
  ON user_profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- INSERT: Allow system to create profiles via trigger
-- This uses anon key during signup
CREATE POLICY "System can insert profiles"
  ON user_profiles FOR INSERT
  TO authenticated, anon
  WITH CHECK (true);

-- DELETE: No direct deletes allowed via RLS
-- Deletes must be done via service role or admin API
-- This prevents accidental self-deletion and ensures proper cleanup

-- Drop the helper functions as they cause recursion
DROP FUNCTION IF EXISTS is_admin();
DROP FUNCTION IF EXISTS is_manager_or_admin();
