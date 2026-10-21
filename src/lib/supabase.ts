import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Environment variables for Supabase (Vite exposes VITE_* prefixes, Node exposes process.env)
const env: Record<string, string | undefined> =
  typeof import.meta !== 'undefined' && (import.meta as unknown as { env?: Record<string, string> }).env
    ? (import.meta as unknown as { env: Record<string, string> }).env
    : typeof globalThis !== 'undefined' &&
        (globalThis as unknown as { process?: { env?: Record<string, string> } }).process?.env
      ? (globalThis as unknown as { process: { env: Record<string, string> } }).process.env
      : {};

const supabaseUrl = (env.VITE_SUPABASE_URL || '').trim();
const supabaseAnonKey = (env.VITE_SUPABASE_ANON_KEY || '').trim();

/**
 * Returns true if real Supabase credentials are provided in the environment.
 * If false, the application safely operates in offline/local fallback mode without crashing.
 */
export const isSupabaseConfigured = (): boolean => {
  return Boolean(
    supabaseUrl &&
    supabaseAnonKey &&
    supabaseUrl.startsWith('https://') &&
    !supabaseUrl.includes('placeholder'),
  );
};

// Safe fallback credentials so createClient never throws on launch or build
const FALLBACK_URL = 'https://placeholder-project.supabase.co';
const FALLBACK_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.placeholder-anon-key-koyuncufit-fallback';

export const supabase: SupabaseClient = createClient(
  isSupabaseConfigured() ? supabaseUrl : FALLBACK_URL,
  isSupabaseConfigured() ? supabaseAnonKey : FALLBACK_ANON_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  },
);
