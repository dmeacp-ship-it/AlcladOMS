'use client'
// Master table (customers, plants, stores, materials, vendors) and its Add / Edit / Delete dialogs, built in the browser from the row data.
// Client components on purpose: with a dialog per row, sending the rows as plain data is several times
// smaller than sending every cell and two dialogs per row from the server.
import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { colLabel as label, money } from '@/lib/tas'
import { deleteMaster, loadMasterRows, saveMaster } from '../actions'
import { LinkBusy, Modal, ModalFoot } from '../../ui'

const WIDE = ['address', 'description']
// Phone keyboards and browser checks for the contact fields.
const TYPES = { email: { type: 'email', autoComplete: 'off' }, mobile: { type: 'tel', inputMode: 'tel' } }

// cfg = { cols, required, numbers, options, defaults (new rows) }; people = salespersons for the customer pick-list (customers only).
// lists = { column: [codes] } for columns picked from another master (Stores → plant).
export default function MasterFields({ cfg, row, people, lists }) {
  const key = row?.id ?? 'new'
  return (
    <div className="fgrid-2">
      {cfg.cols.map((c) => {
        const id = `${c}-${key}`
        const req = cfg.required.includes(c)
        const pick = cfg.options?.[c] || lists?.[c]
        return (
          <div className={`fg${WIDE.includes(c) ? ' full' : ''}`} key={c}>
            <label htmlFor={id}>
              {label(c)}{c === 'credit_limit' && <span className="hint"> — SAR incl. VAT, blank = no limit</span>} {req && <span className="req">*</span>}
            </label>
            {pick ? (
              <select id={id} name={c} defaultValue={row ? row[c] ?? '' : cfg.defaults?.[c] ?? ''} required={req}>
                <option value="">{req ? 'Select…' : '—'}</option>
                {pick.map((v) => <option key={v} value={v}>{cfg.labels?.[c]?.[v] || v}</option>)}
              </select>
            ) : (
              <input id={id} name={c} defaultValue={row ? row[c] ?? '' : cfg.defaults?.[c] ?? ''} required={req}
                {...((cfg.numbers || []).includes(c) && { type: 'number', inputMode: 'decimal', min: 0, step: 'any' })} {...TYPES[c]} />
            )}
          </div>
        )
      })}
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

// Continuous scroll: loads rows in batches as the user scrolls down, replacing manual paging.
// initialRows: first 50 rows; totalCount: total count from DB; table: 'customers' | 'materials' | ...
export function MasterTable({
  cfg,
  rows: initialRows = [],
  totalCount = 0,
  people,
  lists,
  table,
  title,
  search,
  term = '',
  sort = 'id',
  kind = null,
  here,
  sorts = {}
}) {
  const [rows, setRows] = useState(initialRows)
  const [total, setTotal] = useState(totalCount || initialRows.length)
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(initialRows.length < (totalCount || initialRows.length))

  const tableRef = useRef(null)
  const sentinelRef = useRef(null)
  const loadingRef = useRef(false)

  // Reset when search, sort, kind or initialRows change
  useEffect(() => {
    setRows(initialRows)
    setTotal(totalCount || initialRows.length)
    setHasMore(initialRows.length < (totalCount || initialRows.length))
  }, [initialRows, totalCount, term, sort, kind])

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMore) return
    loadingRef.current = true
    setLoading(true)
    try {
      const res = await loadMasterRows({
        table,
        offset: rows.length,
        limit: 50,
        term,
        sort,
        kind
      })
      if (res && res.rows) {
        setRows((prev) => {
          const seen = new Set(prev.map((r) => r.id))
          const fresh = res.rows.filter((r) => !seen.has(r.id))
          return [...prev, ...fresh]
        })
        setHasMore(res.hasMore)
        if (res.total != null) setTotal(res.total)
      }
    } catch (err) {
      console.error('Failed to load more master rows:', err)
    } finally {
      loadingRef.current = false
      setLoading(false)
    }
  }, [hasMore, rows.length, table, term, sort, kind])

  // Preload next batch 350px before sentinel enters viewport
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          loadMore()
        }
      },
      { root: null, rootMargin: '350px' }
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [loadMore])

  // Scroll event on container (.tbl-wrap) as instant fallback
  useEffect(() => {
    const wrap = tableRef.current?.closest('.tbl-wrap')
    if (!wrap) return
    const onScroll = () => {
      if (wrap.scrollHeight - wrap.scrollTop - wrap.clientHeight < 300) {
        loadMore()
      }
    }
    wrap.addEventListener('scroll', onScroll, { passive: true })
    return () => wrap.removeEventListener('scroll', onScroll)
  }, [loadMore])

  const one = title.slice(0, -1)
  const num = (c) => (cfg.numbers || []).includes(c)
  const totalCols = (cfg.listCols || cfg.cols).length + (people ? 2 : 1)
  const hidden = (r) => (
    <>
      <input type="hidden" name="table" value={table} />
      <input type="hidden" name="id" value={r.id} />
      <input type="hidden" name="back" value={here} />
    </>
  )

  return (
    <>
      <table ref={tableRef} className="tbl master-tbl">
        <thead>
          <tr>
            {(cfg.listCols || cfg.cols).map((c) => (
              <th key={c} className={`c-${c}${num(c) ? ' r' : ''}`} aria-sort={sorts[c] ? sorts[c].dir : undefined}>
                {sorts[c]
                  ? <Link prefetch={false} href={sorts[c].href} className="th-sort"><LinkBusy />{label(c)}<i className={`ph ${sorts[c].dir === 'ascending' ? 'ph-caret-up' : 'ph-caret-up-down'}`} aria-hidden="true" /></Link>
                  : label(c)}
              </th>
            ))}
            {people && <th>Salesperson</th>}<th className="r c-act">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              {(cfg.listCols || cfg.cols).map((c) => (
                <td key={c} className={`c-${c} ${c === 'name' || c === 'description' ? 'desc' : c === 'address' ? 'text-sm' : num(c) ? 'num' : 'nowrap'}`}
                  style={c === 'address' ? { minWidth: 220 } : c === 'description' ? { minWidth: 260 } : undefined}>
                  {r[c] == null ? <span className="muted">—</span> : c === 'credit_limit' ? money(r[c]) : cfg.labels?.[c]?.[r[c]] || r[c]}
                </td>
              ))}
              {people && <td className="nowrap c-sp">{r.sp_name || <span className="muted">Anyone</span>}</td>}
              <td className="c-act">
                <div className="row-acts">
                  <Modal title={`Edit ${one}`} icon="ph-pencil-simple" btnIcon="ph-pencil-simple" ariaLabel={`Edit ${r[search] || one}`}
                    btnClass="btn btn-ghost btn-sm act-icon-btn">
                    <form action={saveMaster}>
                      {hidden(r)}
                      <div className="modal-body"><MasterFields cfg={cfg} row={r} people={people} lists={lists} /></div>
                      <ModalFoot label="Save changes" icon="ph-check" />
                    </form>
                  </Modal>
                  <Modal title={`Delete ${one}?`} icon="ph-warning-circle" btnIcon="ph-trash" ariaLabel={`Delete ${r[search] || one}`}
                    btnClass="btn btn-ghost danger btn-sm act-icon-btn" size="small">
                    <form action={deleteMaster}>
                      {hidden(r)}
                      <div className="modal-body">
                        <p><b>{r[search] || `#${r.id}`}</b> will be removed from the {title.toLowerCase()} master.</p>
                        <p>{table === 'customers' ? 'Existing quotations keep their own copy of the details.' : "One that is already used on a PO, GRN or stock entry can't be deleted."}</p>
                      </div>
                      <ModalFoot label="Delete" icon="ph-trash" cls="btn-danger" />
                    </form>
                  </Modal>
                </div>
              </td>
            </tr>
          ))}
          {/* Sentinel row triggers next batch when scrolled near bottom */}
          {hasMore && (
            <tr ref={sentinelRef} style={{ height: 1 }}>
              <td colSpan={totalCols} style={{ padding: 0, border: 0, height: 1 }} />
            </tr>
          )}
        </tbody>
      </table>

      {rows.length > 0 && (
        <div className="tbl-foot center" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px 16px' }}>
          {loading ? (
            <span className="muted text-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              <span className="spin" style={{ width: 14, height: 14 }} /> Loading more {title.toLowerCase()}...
            </span>
          ) : hasMore ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={loadMore}
              style={{ fontSize: '0.8125rem', color: 'var(--sub)', padding: '4px 12px' }}
            >
              Showing {rows.length} of {total} · Scroll down or click to load more
            </button>
          ) : (
            <span className="muted text-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <i className="ph ph-check-circle" style={{ color: 'var(--green)' }} />
              All {total} {title.toLowerCase()} loaded
            </span>
          )}
        </div>
      )}
    </>
  )
}
