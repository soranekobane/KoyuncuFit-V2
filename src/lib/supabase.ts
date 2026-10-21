import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Environment variables for Supabase (Vite exposes VITE_* prefixes, Node exposes process.env)
const env: Record<string, string | undefined> =
  typeof import.meta !== 'undefined' && (import.meta as unknown as { env?: Record<string, string> }).env
    ? (import.meta as unknown as { env: Record<string, string> }).env
    : typeof globalThis !== 'undefined' &&
        (globalThis as unknown as { process?: { env?: Record<string, string> } }).process?.env
      ? (globalThis as unknown as { process: { env: Record<string, string> } }).process.env
      : {};

/**
 * Normalizes Supabase Project URL.
 * Users often paste the REST endpoint (e.g. https://xyz.supabase.co/rest/v1/) instead of the
 * project base URL (https://xyz.supabase.co). The JS SDK expects the base URL.
 */
export function normalizeSupabaseUrl(rawUrl?: string): string {
  if (!rawUrl) return '';
  let url = rawUrl.trim();
  url = url.replace(/\/+$/, '');
  url = url.replace(/\/rest\/v1\/?$/, '');
  return url.replace(/\/+$/, '');
}

// User credentials hardcoded as reliable defaults for both localhost and Vercel
const DEFAULT_SUPABASE_URL = 'https://zppmpnxxindnytpzkykz.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpwcG1wbnh4aW5kbnl0cHpreWt6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1OTAwNTUsImV4cCI6MjEwODE2NjA1NX0.MUclbxCkNC4iel5OBvozd_8X-Pqp-YsB83k8ogll2GU';

const rawUrl = env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL;
const rawAnonKey = env.VITE_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;

export const supabaseUrl = normalizeSupabaseUrl(rawUrl);
export const supabaseAnonKey = (rawAnonKey || '').trim();

/**
 * Returns true if real Supabase credentials are configured.
 * Relaxed validation to avoid rejecting valid Supabase URLs or keys.
 */
export const isSupabaseConfigured = (): boolean => {
  return Boolean(
    supabaseUrl &&
    supabaseAnonKey &&
    supabaseUrl.startsWith('https://') &&
    !supabaseUrl.includes('placeholder'),
  );
};

export const supabase: SupabaseClient = createClient(
  supabaseUrl || DEFAULT_SUPABASE_URL,
  supabaseAnonKey || DEFAULT_SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  },
);

