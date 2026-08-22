import { createServerClient } from '@supabase/ssr'
import type { User } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'

export default async function middleware(request: NextRequest) {
  // Cheap, auth-free redirects first. Both used to sit below a Supabase client
  // construction plus a getSession() JWT verification they never consulted.
  const url = request.nextUrl

  // Supabase sometimes bounces OAuth to the Site URL (/) with ?code= instead of
  // /auth/callback — hand it to the callback route so it can exchange the code.
  if (url.pathname === '/' && url.searchParams.has('code')) {
    const callbackUrl = new URL('/auth/callback', request.url)
    url.searchParams.forEach((value, key) => callbackUrl.searchParams.set(key, value))
    return NextResponse.redirect(callbackUrl, 307)
  }

  // Legacy onboarding URL -> profile.
  if (url.pathname === '/onboarding') {
    return NextResponse.redirect(new URL('/profile', request.url))
  }

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

  // Single auth call per request to reduce Supabase egress (getSession is enough for redirect logic).
  let user: User | null = null
  let supabaseUnreachable = false
  try {
    const { data: sessionData } = await supabase.auth.getSession()
    if (sessionData?.session != null) {
      user = sessionData.session.user
    }
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      supabaseUnreachable = true
      console.warn('[middleware] Supabase auth unavailable:', (err as Error).message)
    }
  }

  const pathname = url.pathname

  // Protect platform (require auth): dashboard, profile, search, checkout, billing, admin.
  // /greenroom is here so an invited partner arriving at a room link logged out
  // gets sent to /login with the room URL preserved, and lands back in the room
  // after signing in. Without it the room just hangs on its skeleton forever.
  const protectedPaths = ['/dashboard', '/profile', '/search', '/checkout', '/billing', '/admin', '/greenroom']
  const isProtected = protectedPaths.some((p) => pathname.startsWith(p))
  if (isProtected) {
    if (!user) {
      // In dev, if Supabase was unreachable from middleware, allow the request through:
      // the client has the session and will render; avoids "login then redirect back" when
      // only the server can't reach Supabase (e.g. network/DNS).
      if (supabaseUnreachable && process.env.NODE_ENV === 'development') {
        return supabaseResponse
      }
      const redirectUrl = new URL('/login', request.url)
      // Preserve full path (including query, e.g. /checkout?tier=plus&period=monthly) so after login we land back on the same page
      const fullPath = pathname + (request.nextUrl.search || '')
      redirectUrl.searchParams.set('redirect', fullPath)
      return NextResponse.redirect(redirectUrl)
    }
  }

  // (Redirecting signed-in users away from /login and /signup moved to
  // <RedirectIfAuthed> on those pages — see the matcher note below.)

  return supabaseResponse
}

export const config = {
  /*
   * Only the paths this middleware actually acts on. It used to match nearly
   * every request, which meant all ~12k crawlable /monologues/* pages paid for
   * a Supabase client + getSession() (JWT decode) they never used. Middleware
   * runs before the ISR cache, so `revalidate` on those pages did not save it.
   * That was burning the Fluid Active CPU allowance.
   *
   * Keep this list in sync with `protectedPaths` above, plus the three special
   * cases: `/` for the OAuth ?code= fallback, `/login` + `/signup` for
   * redirecting signed-in users away, and `/onboarding` for the legacy
   * redirect. `:path*` matches zero or more segments, so it covers the bare
   * path too (`/admin` as well as `/admin/users/1`).
   */
  matcher: [
    /*
     * `/` is matched ONLY when Supabase has bounced an OAuth login back to the
     * Site URL with ?code=. Every other visit to the homepage — 769 pageviews
     * in August, the second busiest path on the site — used to run this
     * middleware for nothing.
     *
     * This is the fix for the Fluid Active CPU ceiling. Middleware runs BEFORE
     * the CDN cache, so a static page still pays for it, and Next fires ~7
     * segment requests per pageview. `/` plus `/login` (861 pageviews) came to
     * roughly 13,000 invocations a month, each constructing a Supabase server
     * client and verifying a JWT, for a redirect that almost never fires.
     */
    { source: '/', has: [{ type: 'query', key: 'code' }] },
    /*
     * `/login` and `/signup` are deliberately NOT here. Bouncing an already
     * signed-in visitor to the dashboard is a nicety, not a security control,
     * and it now happens client-side in <RedirectIfAuthed>. The private routes
     * below still gate on the server, where it matters.
     */
    '/onboarding',
    '/dashboard/:path*',
    '/profile/:path*',
    '/search/:path*',
    '/checkout/:path*',
    '/billing/:path*',
    '/admin/:path*',
    '/greenroom/:path*',
  ],
}

