'use client'
// Customers / Items table and its Add / Edit / Delete dialogs, built in the browser from the row data.
// Client components on purpose: with a dialog per row, sending the rows as plain data is several times
// smaller than sending every cell and two dialogs per row from the server.
import Link from 'next/link'
import { colLabel as label, money } from '@/lib/tas'
import { deleteMaster, saveMaster } from '../actions'
import { Modal, ModalFoot } from '../../ui'

const WIDE = ['address', 'description']
// Phone keyboards and browser checks for the contact fields.
const TYPES = { email: { type: 'email', autoComplete: 'off' }, mobile: { type: 'tel', inputMode: 'tel' } }

// cfg = { cols, required, numbers }; people = salespersons for the customer pick-list (customers only).
export default function MasterFields({ cfg, row, people }) {
  const key = row?.id ?? 'new'
  return (
    <div className="fgrid-2">
      {cfg.cols.map((c) => (
        <div className={`fg${WIDE.includes(c) ? ' full' : ''}`} key={c}>
          <label htmlFor={`${c}-${key}`}>
            {label(c)}{c === 'credit_limit' && <span className="hint"> — SAR incl. VAT, blank = no limit</span>} {cfg.required.includes(c) && <span className="req">*</span>}
          </label>
          <input id={`${c}-${key}`} name={c} defaultValue={row?.[c] ?? ''} required={cfg.required.includes(c)}
            {...((cfg.numbers || []).includes(c) && { type: 'number', inputMode: 'decimal', min: 0, step: 'any' })} {...TYPES[c]} />
        </div>
      ))}
      {people && (
        <div className="fg">
          <label htmlFor={`sp-${key}`}>Assigned salesperson</label>
          <select id={`sp-${key}`} name="salesperson_id" defaultValue={row?.salesperson_id || ''}>
            <option value="">Anyone</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </select>
        </div>
      )}
    </div>
  )
}

// rows: the page's rows (form columns + salesperson name); table: 'customers' | 'items'; here: list URL to return to.
// sorts: { [column]: { href, dir } } for the sortable headers; dir is 'ascending' on the current sort.
export function MasterTable({ cfg, rows, people, table, title, search, here, sorts = {} }) {
  const one = title.slice(0, -1)
  const num = (c) => (cfg.numbers || []).includes(c)
  const hidden = (r) => (
    <>
      <input type="hidden" name="table" value={table} />
      <input type="hidden" name="id" value={r.id} />
      <input type="hidden" name="back" value={here} />
    </>
  )
  return (
    <table className="tbl master-tbl">
      <thead>
        <tr>
          {cfg.cols.map((c) => (
            <th key={c} className={num(c) ? 'r' : undefined} aria-sort={sorts[c] ? sorts[c].dir : undefined}>
              {sorts[c]
                ? <Link prefetch={false} href={sorts[c].href} className="th-sort">{label(c)}<i className={`ph ${sorts[c].dir === 'ascending' ? 'ph-caret-up' : 'ph-caret-up-down'}`} aria-hidden="true" /></Link>
                : label(c)}
            </th>
          ))}
          {people && <th>Salesperson</th>}<th className="r">Actions</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            {cfg.cols.map((c) => (
              <td key={c} className={`c-${c} ${c === 'name' || c === 'description' ? 'desc' : c === 'address' ? 'text-sm' : num(c) ? 'num' : 'nowrap'}`}
                style={c === 'address' ? { minWidth: 220 } : c === 'description' ? { minWidth: 260 } : undefined}>
                {r[c] == null ? <span className="muted">—</span> : c === 'credit_limit' ? money(r[c]) : r[c]}
              </td>
            ))}
            {people && <td className="nowrap c-sp">{r.sp_name || <span className="muted">Anyone</span>}</td>}
            <td className="c-act">
              <div className="row-acts">
                <Modal title={`Edit ${one}`} icon="ph-pencil-simple" btnIcon="ph-pencil-simple" ariaLabel={`Edit ${r[search] || one}`}
                  btnClass="btn btn-ghost btn-sm act-icon-btn">
                  <form action={saveMaster}>
                    {hidden(r)}
                    <div className="modal-body"><MasterFields cfg={cfg} row={r} people={people} /></div>
                    <ModalFoot label="Save changes" icon="ph-check" />
                  </form>
                </Modal>
                <Modal title={`Delete ${one}?`} icon="ph-warning-circle" btnIcon="ph-trash" ariaLabel={`Delete ${r[search] || one}`}
                  btnClass="btn btn-ghost danger btn-sm act-icon-btn" size="small">
                  <form action={deleteMaster}>
                    {hidden(r)}
                    <div className="modal-body">
                      <p><b>{r[search] || `#${r.id}`}</b> will be removed from the {title.toLowerCase()} master.</p>
                      <p>Existing quotations keep their own copy of the details.</p>
                    </div>
                    <ModalFoot label="Delete" icon="ph-trash" cls="btn-danger" />
                  </form>
                </Modal>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
