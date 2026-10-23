'use server'
import { db, go, requireRole } from '@/lib/server'
import { MASTERS, ROLES } from '@/lib/tas'

const str = (fd, k) => String(fd.get(k) || '').trim()
// Back to the list page the dialog was opened from (keeps its search and paging).
const back = (fd, table) => {
  const b = str(fd, 'back')
  return b.startsWith(`/admin/${table}`) ? b : `/admin/${table}`
}

// Optional sign-in name (see login): stored lowercase, unique.
function username(fd) {
  const u = str(fd, 'username').toLowerCase()
  if (u && !/^[a-z0-9._-]{3,30}$/.test(u)) go('/admin/users', 'error', 'Username: 3–30 letters, numbers, dots, dashes or underscores.')
  return u || null
}
const taken = (e) => (e.code === '23505' && /username/.test(e.message) ? 'That username is already taken.' : e.message)

export async function createUser(fd) {
  await requireRole('admin')
  const email = str(fd, 'email').toLowerCase()
  const uname = username(fd)
  const password = String(fd.get('password') || '')
  const role = str(fd, 'role')
  if (!ROLES.includes(role)) go('/admin/users', 'error', 'Pick a role.')
  if (password.length < 8) go('/admin/users', 'error', 'Password must be at least 8 characters.')

  // email_confirm: the admin vouches for the account, so no verification email is sent.
  const { data, error } = await db().auth.admin.createUser({ email, password, email_confirm: true })
  if (error) go('/admin/users', 'error', error.message)
  const { error: e2 } = await db().from('profiles').insert({
    id: data.user.id, email, username: uname, role, full_name: str(fd, 'full_name'), mobile: str(fd, 'mobile') || null,
  })
  if (e2) {
    await db().auth.admin.deleteUser(data.user.id)
    go('/admin/users', 'error', taken(e2))
  }
  go('/admin/users', 'ok', `User ${email} created.`)
}

export async function updateUser(fd) {
  const me = await requireRole('admin')
  const id = str(fd, 'id')
  const patch = { full_name: str(fd, 'full_name'), username: username(fd), mobile: str(fd, 'mobile') || null, role: str(fd, 'role'), active: fd.get('active') === 'on' }
  if (!ROLES.includes(patch.role)) go('/admin/users', 'error', 'Pick a role.')
  if (id === me.id && (patch.role !== 'admin' || !patch.active)) go('/admin/users', 'error', "You can't remove your own admin access.")
  const password = String(fd.get('password') || '')
  if (password && password.length < 8) go('/admin/users', 'error', 'Password must be at least 8 characters.')

  const { error } = await db().from('profiles').update(patch).eq('id', id)
  if (error) go('/admin/users', 'error', taken(error))
  if (password) {
    const { error: e2 } = await db().auth.admin.updateUserById(id, { password })
    if (e2) go('/admin/users', 'error', e2.message)
  }
  go('/admin/users', 'ok', `${patch.full_name} saved.`)
}

export async function saveMaster(fd) {
  await requireRole('admin')
  const table = str(fd, 'table')
  const cfg = MASTERS[table]
  if (!cfg) go('/orders', 'error', 'Unknown master.')
  const row = Object.fromEntries(cfg.cols.map((c) => [c, str(fd, c) || null]))
  const id = str(fd, 'id')
  const { error } = id ? await db().from(table).update(row).eq('id', id) : await db().from(table).insert(row)
  if (error) go(back(fd, table), 'error', error.message)
  go(back(fd, table), 'ok', `${cfg.title.slice(0, -1)} saved.`)
}

export async function deleteMaster(fd) {
  await requireRole('admin')
  const table = str(fd, 'table')
  if (!MASTERS[table]) go('/orders', 'error', 'Unknown master.')
  const { error } = await db().from(table).delete().eq('id', str(fd, 'id'))
  if (error) go(back(fd, table), 'error', error.message)
  go(back(fd, table), 'ok', 'Deleted.')
}
