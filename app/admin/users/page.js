import { db, requireRole } from '@/lib/server'
import { stamp } from '@/lib/activity'
import { createUser, signOutUser, updateUser } from '../actions'
import { Modal, ModalFoot, PasswordInput, RoleSelect } from '../../ui'

const initials = (n) => n.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase()
// Same rule as the database check (migrate-007): 3–30 of a-z 0-9 . _ -  (saved lowercase).
const userField = (id, value) => (
  <input id={id} name="username" defaultValue={value || ''} pattern={String.raw`[A-Za-z0-9._\-]{3,30}`} maxLength={30}
    autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="ahmed.k"
    title="3–30 letters, numbers, dots, dashes or underscores" />
)

export const metadata = { title: 'Users' }

export default async function Users() {
  const me = await requireRole('admin')
  const [{ data: users }, { data: seen }] = await Promise.all([
    db().from('profiles').select('*').order('full_name'),
    db().rpc('user_last_sign_in'), // migrate-008; null before it runs
  ])
  const lastSeen = Object.fromEntries((seen || []).map((r) => [r.id, r.last_sign_in_at]))
  const ago = (t) => {
    if (!t) return null
    const m = Math.round((Date.now() - new Date(t)) / 60000)
    return m < 60 ? `${Math.max(m, 1)} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : m < 43200 ? `${Math.round(m / 1440)} days ago` : stamp(t)
  }

  return (
    <div className="card">
      <div className="tbl-top">
        <h2 className="tbl-ttl"><i className="ph ph-users-three" />Users <span className="badge b-none">{users?.length ?? 0}</span></h2>
        <div className="tbl-filters">
          <Modal title="Add User" icon="ph-user-plus" label="Add User" btnIcon="ph-user-plus">
            <form action={createUser}>
              <div className="modal-body">
                <div className="fgrid-2">
                  <div className="fg"><label htmlFor="nu-name">Full name <span className="req">*</span></label><input id="nu-name" name="full_name" required /></div>
                  <div className="fg"><label htmlFor="nu-user">Username <span className="hint">— optional, to sign in without the email</span></label>{userField('nu-user')}</div>
                  <div className="fg"><label htmlFor="nu-email">Email <span className="req">*</span></label><input id="nu-email" name="email" type="email" required autoComplete="off" /></div>
                  <div className="fg"><label htmlFor="nu-mobile">Mobile</label><input id="nu-mobile" name="mobile" type="tel" inputMode="tel" /></div>
                  <div className="fg full">
                    <label htmlFor="nu-pw">Password <span className="req">*</span> <span className="hint">— at least 8 characters</span></label>
                    <PasswordInput id="nu-pw" name="password" minLength={8} required autoComplete="new-password" />
                  </div>
                  <div className="fg full"><label htmlFor="nu-role">Role <span className="req">*</span></label><RoleSelect id="nu-role" defaultValue="sales" /></div>
                </div>
              </div>
              <ModalFoot label="Create User" icon="ph-user-plus" />
            </form>
          </Modal>
        </div>
      </div>
      <div className="tbl-wrap">
        <table className="tbl users-tbl">
          <thead>
            <tr><th>Name</th><th>Username</th><th>Email</th><th>Mobile</th><th>Role</th><th>Status</th><th>Last sign-in</th><th className="r">Actions</th></tr>
          </thead>
          <tbody>
            {users?.map((u) => (
              <tr key={u.id}>
                <td className="c-name">
                  <div className="row" style={{ flexWrap: 'nowrap' }}>
                    <div className="av sm" aria-hidden="true">{initials(u.full_name)}</div>
                    <span className="desc">{u.full_name}{u.id === me.id && <span className="muted text-sm"> (you)</span>}</span>
                  </div>
                </td>
                <td className="c-user">{u.username || <span className="muted">—</span>}</td>
                <td className="c-email">{u.email}</td>
                <td className="c-mobile">{u.mobile || <span className="muted">—</span>}</td>
                <td className="c-role"><span className={`rtag rt-${u.role}`} style={{ marginTop: 0 }}>{u.role}</span></td>
                <td className="c-status"><span className={`badge ${u.active ? 'b-ok' : 'b-none'}`}>{u.active ? 'Active' : 'Disabled'}</span></td>
                <td className="nowrap muted c-seen" title={lastSeen[u.id] ? stamp(lastSeen[u.id]) : undefined}>{ago(lastSeen[u.id]) || '—'}</td>
                <td className="c-act">
                  <div className="row-acts">
                    <Modal title={`Edit ${u.full_name}`} icon="ph-pencil-simple" btnIcon="ph-pencil-simple" ariaLabel={`Edit ${u.full_name}`}
                      btnClass="btn btn-ghost btn-sm act-icon-btn">
                      <form action={updateUser}>
                        <input type="hidden" name="id" value={u.id} />
                        <div className="modal-body">
                          <div className="fgrid-2">
                            <div className="fg"><label htmlFor={`n-${u.id}`}>Full name <span className="req">*</span></label><input id={`n-${u.id}`} name="full_name" defaultValue={u.full_name} required /></div>
                            <div className="fg"><label htmlFor={`u-${u.id}`}>Username</label>{userField(`u-${u.id}`, u.username)}</div>
                            <div className="fg"><label>Email</label><div className="ro">{u.email}</div></div>
                            <div className="fg"><label htmlFor={`m-${u.id}`}>Mobile</label><input id={`m-${u.id}`} name="mobile" type="tel" inputMode="tel" defaultValue={u.mobile || ''} /></div>
                            <div className="fg full"><label htmlFor={`r-${u.id}`}>Role <span className="req">*</span></label><RoleSelect id={`r-${u.id}`} defaultValue={u.role} /></div>
                            <div className="fg full">
                              <label htmlFor={`p-${u.id}`}>New password <span className="hint">— leave blank to keep the current one</span></label>
                              <PasswordInput id={`p-${u.id}`} name="password" minLength={8} autoComplete="new-password" />
                            </div>
                            <label className="check full"><input type="checkbox" name="active" defaultChecked={u.active} />Active — can sign in</label>
                          </div>
                        </div>
                        <ModalFoot label="Save changes" icon="ph-check" />
                      </form>
                    </Modal>
                    {u.id !== me.id && (
                      <Modal title={`Sign out ${u.full_name}?`} icon="ph-sign-out" btnIcon="ph-sign-out" ariaLabel={`Sign out ${u.full_name} everywhere`}
                        btnClass="btn btn-ghost btn-sm act-icon-btn" size="small">
                        <form action={signOutUser}>
                          <input type="hidden" name="id" value={u.id} />
                          <div className="modal-body">
                            <p>Ends <b>{u.full_name}</b>'s sessions on every device. They can sign in again with their password.</p>
                            <p>To stop them signing in at all, untick <b>Active</b> in Edit instead.</p>
                          </div>
                          <ModalFoot label="Sign out everywhere" icon="ph-sign-out" cls="btn-danger" />
                        </form>
                      </Modal>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
