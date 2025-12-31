import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { cache } from 'react'

/**
 * Get Supabase client for server-side operations
 * Uses React cache to ensure single instance per request
 */
export const getSupabaseServerClient = cache(() => {
  const cookieStore = cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  )
})

/**
 * Get the current authenticated user's session on the server
 * Returns null if not authenticated
 */
export async function getServerSession() {
  const supabase = getSupabaseServerClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  return session
}

/**
 * Get the current authenticated user on the server
 * Returns null if not authenticated
 */
export async function getServerUser() {
  const session = await getServerSession()
  return session?.user ?? null
}

/**
 * Require authentication - throws error if not authenticated
 * Use in Server Components or Server Actions
 */
export async function requireAuth() {
  const session = await getServerSession()
  if (!session) {
    throw new Error('Unauthorized')
  }
  return session
}

