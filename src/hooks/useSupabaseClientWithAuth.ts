import { useCallback } from 'react';
import { supabase } from '../lib/supabase';

export function useSupabaseClientWithAuth() {
  const fetchWithAuth = useCallback(async (input: string, init: RequestInit = {}) => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    const headers = new Headers(init.headers ?? {});
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    return fetch(input, { ...init, headers });
  }, []);

  return { supabase, fetchWithAuth };
}
