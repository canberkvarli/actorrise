import { createBrowserClient } from '@supabase/ssr';

// Allow build to succeed when env vars are not set (e.g. Vercel build before env is configured).
// Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel for auth to work.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Use browser client for client-side components (handles cookies properly)
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);

