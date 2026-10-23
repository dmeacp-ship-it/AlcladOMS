import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { authClient, db, go } from '@/lib/server'
import { PasswordInput, Submit } from '../ui'

async function login(fd) {
  'use server'
  const supabase = await authClient()
  const { data, error } = await supabase.auth.signInWithPassword({
    email: String(fd.get('email') || '').trim(),
    password: String(fd.get('password') || ''),
  })
  if (error) go('/login', 'error', 'Wrong email or password.')
  const { data: me } = await db().from('profiles').select('active').eq('id', data.user.id).maybeSingle()
  if (!me?.active) {
    await supabase.auth.signOut()
    go('/login', 'error', 'Your account is not active. Ask the admin.')
  }
  revalidatePath('/', 'layout')
  redirect('/orders')
}

export const metadata = { title: 'Sign in' }

export default async function LoginPage({ searchParams }) {
  const sp = await searchParams
  return (
    <div className="login-wrap">
      <div className="login-box">
        <div className="login-logo">
          <div className="logo-ic"><i className="ph ph-factory" /></div>
          <div>
            <h2>TAS OMS</h2>
            <p>TAS International Manufacturing Co.</p>
          </div>
        </div>
        <div className="login-ttl">Welcome back</div>
        <div className="login-sub">Sign in with the account your admin created.</div>
        {sp.error && <div className="banner error shake"><i className="ph ph-warning-circle" />{sp.error}</div>}
        <form action={login}>
          <div className="lg">
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" required autoComplete="username" placeholder="you@company.com" />
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
