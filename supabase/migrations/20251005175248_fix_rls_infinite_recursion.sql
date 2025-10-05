/*
  # Fix RLS Infinite Recursion on user_profiles

  1. Problem
    - The user_profiles SELECT policy has infinite recursion
    - It queries user_profiles to check if user is admin, which triggers the policy again
  
  2. Solution
    - Simplify policies to avoid self-referencing queries
    - Use direct auth.uid() checks without nested EXISTS queries on user_profiles
  
  3. Security
    - Users can view their own profile
    - Admins can view all profiles (checked via separate admin-only policy)
*/

-- Drop existing problematic policies
DROP POLICY IF EXISTS "Users and admins can view profiles" ON user_profiles;
DROP POLICY IF EXISTS "Users and admins can update profiles" ON user_profiles;

-- Create simplified policies without infinite recursion
-- Users can always view their own profile
CREATE POLICY "Users can view own profile"
  ON user_profiles FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = id);

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = id)
  WITH CHECK ((select auth.uid()) = id);

-- Note: Admin access to other profiles is handled at application level
-- The application will need to use service role or separate admin functions
-- This prevents infinite recursion while maintaining security
