import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { authClient, db, go } from '@/lib/server'
import { PasswordInput, Submit } from '../ui'

async function login(fd) {
  'use server'
  const supabase = await authClient()
  // Email or username: a username is swapped for that user's email before signing in.
  let email = String(fd.get('login') || '').trim().toLowerCase()
  if (email && !email.includes('@')) {
    const { data: p } = await db().from('profiles').select('email').eq('username', email).maybeSingle()
    email = p?.email || ''
  }
  const { data, error } = email
    ? await supabase.auth.signInWithPassword({ email, password: String(fd.get('password') || '') })
    : { error: true }
  // Anything but a wrong password (bad API key, Auth down) says so, so a setup fault isn't mistaken for a typo.
  if (error) go('/login', 'error', error === true || error.code === 'invalid_credentials' ? 'Wrong email/username or password.' : `Sign-in failed: ${error.message}. Tell the admin.`)
  const { data: me } = await db().from('profiles').select('active').eq('id', data.user.id).maybeSingle()
  if (!me?.active) {
    await supabase.auth.signOut({ scope: 'local' })
    go('/login', 'error', 'Your account is not active. Ask the admin.')
  }
  revalidatePath('/', 'layout')
  redirect('/today')
}

export const metadata = { title: 'Sign in' }

export default async function LoginPage({ searchParams }) {
  const sp = await searchParams
  return (
    <div className="login-wrap">
      <div className="login-box">
        <div className="login-logo">
          {/* Same mark as the sidebar and the favicon */}
          <div className="logo-ic"><svg viewBox="12 16 40 34" aria-hidden="true"><path d="M12 50V30l11 7v-7l11 7v-7l11 7V16h7v34z" /></svg></div>
          <div>
            <h1>TAS OMS</h1>
            <p>TAS International Manufacturing Co.</p>
          </div>
        </div>
        <h2 className="login-ttl">Welcome back</h2>
        <div className="login-sub">Sign in with the account your admin created.</div>
        {sp.error && <div className="banner error shake" role="alert"><i className="ph ph-warning-circle" />{sp.error}</div>}
        <form action={login}>
          <div className="lg">
            <label htmlFor="login">Email or username</label>
            <input id="login" name="login" required autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="username or you@company.com" />
          </div>
          <div className="lg">
            <label htmlFor="password">Password</label>
            <PasswordInput id="password" name="password" required autoComplete="current-password" placeholder="Your password" />
          </div>
          <Submit label="Sign in" icon="ph-sign-in" cls="btn btn-primary" />
        </form>
      </div>
    </div>
  )
}
