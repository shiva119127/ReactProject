import { createClient } from '@supabase/supabase-js';

const env =
  (typeof import.meta !== 'undefined' && import.meta.env) ||
  (typeof process !== 'undefined' && process.env) ||
  {};
const rawUrl = env.VITE_SUPABASE_URL?.trim();

const rawKey = env.VITE_SUPABASE_ANON_KEY?.trim();


// Verify that URL and key are provided and not default placeholders
export const isSupabaseConfigured = Boolean(
  rawUrl &&
    rawKey &&
    rawUrl.startsWith('http') &&
    !rawUrl.includes('your-project-id') &&
    !rawKey.includes('your-anon-or-publishable-key')
);

export const supabase = isSupabaseConfigured
  ? createClient(rawUrl, rawKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
