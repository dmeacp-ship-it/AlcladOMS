import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

// Refreshes the Supabase session cookie on every request and sends signed-out visitors to /login.
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
  const { data: { user } } = await supabase.auth.getUser()
  if (!user && request.nextUrl.pathname !== '/login') {
    return NextResponse.redirect(new URL('/login', request.url))
  }
  return response
}

// Static files and the app icons (so the sign-in page has its favicon) skip the check.
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon|.*\\.png$).*)'] }
