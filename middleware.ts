import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  // Create Supabase client for server-side auth
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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

  const { pathname } = request.nextUrl

  // Protect platform routes (require auth)
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

