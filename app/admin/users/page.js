import { db, requireRole } from '@/lib/server'
import { createUser, updateUser } from '../actions'
import { Modal, ModalFoot, PasswordInput, RoleSelect } from '../../ui'

const initials = (n) => n.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase()

export const metadata = { title: 'Users' }

export default async function Users() {
  const me = await requireRole('admin')
  const { data: users } = await db().from('profiles').select('*').order('full_name')

  return (
    <div className="card">
      <div className="tbl-top">
        <div className="tbl-ttl"><i className="ph ph-users-three" />Users <span className="badge b-none">{users?.length ?? 0}</span></div>
        <div className="tbl-filters">
          <Modal title="Add User" icon="ph-user-plus" label="Add User" btnIcon="ph-user-plus">
            <form action={createUser}>
              <div className="modal-body">
                <div className="fgrid-2">
                  <div className="fg"><label htmlFor="nu-name">Full name <span className="req">*</span></label><input id="nu-name" name="full_name" required /></div>
                  <div className="fg"><label htmlFor="nu-mobile">Mobile</label><input id="nu-mobile" name="mobile" /></div>
                  <div className="fg full"><label htmlFor="nu-email">Email <span className="req">*</span></label><input id="nu-email" name="email" type="email" required autoComplete="off" /></div>
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
        <table className="tbl">
          <thead>
            <tr><th>Name</th><th>Email</th><th>Mobile</th><th>Role</th><th>Status</th><th className="r">Actions</th></tr>
          </thead>
          <tbody>
            {users?.map((u) => (
              <tr key={u.id}>
                <td>
                  <div className="row" style={{ flexWrap: 'nowrap' }}>
                    <div className="av sm" aria-hidden="true">{initials(u.full_name)}</div>
                    <span className="desc">{u.full_name}{u.id === me.id && <span className="muted text-sm"> (you)</span>}</span>
                  </div>
                </td>
                <td>{u.email}</td>
                <td>{u.mobile || <span className="muted">—</span>}</td>
                <td><span className={`rtag rt-${u.role}`} style={{ marginTop: 0 }}>{u.role}</span></td>
                <td><span className={`badge ${u.active ? 'b-ok' : 'b-none'}`}>{u.active ? 'Active' : 'Disabled'}</span></td>
                <td>
                  <div className="row-acts">
                    <Modal title={`Edit ${u.full_name}`} icon="ph-pencil-simple" btnIcon="ph-pencil-simple" ariaLabel={`Edit ${u.full_name}`}
                      btnClass="btn btn-ghost btn-sm act-icon-btn">
                      <form action={updateUser}>
                        <input type="hidden" name="id" value={u.id} />
                        <div className="modal-body">
                          <div className="fgrid-2">
                            <div className="fg"><label htmlFor={`n-${u.id}`}>Full name <span className="req">*</span></label><input id={`n-${u.id}`} name="full_name" defaultValue={u.full_name} required /></div>
                            <div className="fg"><label htmlFor={`m-${u.id}`}>Mobile</label><input id={`m-${u.id}`} name="mobile" defaultValue={u.mobile || ''} /></div>
                            <div className="fg full"><label>Email</label><div className="ro">{u.email}</div></div>
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
