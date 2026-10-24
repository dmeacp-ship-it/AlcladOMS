import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

// Refreshes the Supabase session cookie on every request and sends signed-out visitors to /login.
// The user it verified is passed on in the x-tas-user request header, so pages and actions don't
// ask Supabase a second time (see sessionUserId in lib/server.js). Any x-tas-user sent by the
// browser is dropped first, so the header can only come from here.
export async function proxy(request) {
  let response = NextResponse.next({ request })
  const supabase = createServerClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
      },
    },
  })
  // getClaims verifies the session token locally (JWT signing keys) instead of asking Supabase Auth each request;
  // it refreshes an expired token itself. Deactivated users are still stopped by currentUser (profiles.active).
  const { data } = await supabase.auth.getClaims()
  const user = data?.claims?.sub ? { id: data.claims.sub } : null
  if (!user && request.nextUrl.pathname !== '/login') {
    return NextResponse.redirect(new URL('/login', request.url))
  }
  const headers = new Headers(request.headers) // includes any refreshed session cookie
  headers.delete('x-tas-user')
  if (user) headers.set('x-tas-user', user.id)
  const out = NextResponse.next({ request: { headers } })
  response.cookies.getAll().forEach((c) => out.cookies.set(c))
  return out
}

// Static files, the app icons and the install manifest (fetched without cookies) skip the check.
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon|manifest.webmanifest|pwa-icon|.*\\.png$).*)'] }
