/*
  # Restrict User Profile Role Updates

  - Drop permissive policy allowing users to update their profile including role changes
  - Add new policy preventing authenticated users from modifying their role
  - Ensure service role retains ability to manage user profiles for admin workflows
*/

-- Remove legacy self-update policy that allowed role changes
DROP POLICY IF EXISTS "Users update own profile" ON user_profiles;

-- Authenticated users can update their own profile details but must keep the same role
CREATE POLICY "Users update own profile details"
  ON user_profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND role = OLD.role
  );

-- Service role (used by edge functions and admin scripts) can manage all profile fields
CREATE POLICY "Service role manage user profiles"
  ON user_profiles FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);
