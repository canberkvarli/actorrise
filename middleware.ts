import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export default async function middleware(request: NextRequest) {
  const supabaseResponse = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  // Create Supabase client for server-side auth (use empty string if unset so build/prerender can succeed)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value)
            supabaseResponse.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  // Refresh session if expired (can fail if Supabase is unreachable from Edge)
  let user: Awaited<ReturnType<typeof supabase.auth.getUser>>['data']['user'] = null
  let supabaseUnreachable = false
  try {
    const { data } = await supabase.auth.getUser()
    user = data.user
  } catch (err) {
    // Supabase unreachable (e.g. network, wrong URL) – continue without auth for this request.
    if (process.env.NODE_ENV === 'development') {
      supabaseUnreachable = true
      console.warn('[middleware] Supabase auth unavailable:', (err as Error).message)
    }
  }

  // If getUser() returned no user (e.g. timeout, edge cold start), check for session in cookies.
  // This avoids redirecting logged-in users to login when Supabase is slow or briefly unreachable.
  if (!user) {
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      if (sessionData?.session != null) {
        user = sessionData.session.user
      }
    } catch {
      // ignore
    }
  }

  const { pathname, searchParams } = request.nextUrl

  // Supabase sometimes redirects OAuth to Site URL (/) with ?code=... instead of /auth/callback – fix it so the callback route can exchange the code
  if (pathname === '/' && searchParams.has('code')) {
    const callbackUrl = new URL('/auth/callback', request.url)
    searchParams.forEach((value, key) => callbackUrl.searchParams.set(key, value))
    return NextResponse.redirect(callbackUrl, 307)
  }

  // Redirect legacy onboarding URL to profile (complete your profile in one place)
  if (pathname === '/onboarding') {
    return NextResponse.redirect(new URL('/profile', request.url))
  }

  // Protect platform (require auth)
  if (pathname.startsWith('/dashboard') ||
      pathname.startsWith('/profile') ||
      pathname.startsWith('/search')) {
    if (!user) {
      // In dev, if Supabase was unreachable from middleware, allow the request through:
      // the client has the session and will render; avoids "login then redirect back" when
      // only the server can't reach Supabase (e.g. network/DNS).
      if (supabaseUnreachable && process.env.NODE_ENV === 'development') {
        return supabaseResponse
      }
      const redirectUrl = new URL('/login', request.url)
      redirectUrl.searchParams.set('redirect', pathname)
      return NextResponse.redirect(redirectUrl)
    }
  }

  // Redirect authenticated users away from auth pages
  if ((pathname === '/login' || pathname === '/signup') && user) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     * - api routes (handled separately)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$|api).*)',
  ],
}

