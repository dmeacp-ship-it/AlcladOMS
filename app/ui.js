'use client'
// Small interactive pieces shared by the server-rendered pages (FMS look & feel).
import { createContext, useContext, useEffect, useId, useRef, useState, useTransition } from 'react'
import { useFormStatus } from 'react-dom'
import { useRouter } from 'next/navigation'
import { useLinkStatus } from 'next/link'
import { ROLES } from '@/lib/tas'

// Thin red bar along the top of the window while something is loading (FMS #topProgress).
function useBusy(busy) {
  useEffect(() => {
    if (!busy) return
    document.documentElement.dataset.busy = '1'
    return () => { delete document.documentElement.dataset.busy }
  }, [busy])
}
// Put inside a <Link> to show the bar while that link loads.
export function LinkBusy() {
  useBusy(useLinkStatus().pending)
  return null
}

const CloseCtx = createContext(() => {})

// FMS-style dialog on a native <dialog>: header / body / foot, closes on Esc, backdrop click or Cancel.
// Children are the form: <form action={...}><div className="modal-body">…</div><ModalFoot …/></form>
export function Modal({ title, icon = 'ph-info', label, btnIcon, btnClass = 'btn btn-primary btn-sm', size, children, ariaLabel, defaultOpen = false }) {
  const ref = useRef(null)
  const tid = useId()
  const [open, setOpen] = useState(defaultOpen)
  useEffect(() => { if (open && !ref.current.open) ref.current.showModal() }, [open])
  const close = () => ref.current?.close()
  // label can be JSX (DocView): only plain text may become an aria-label / tooltip.
  const name = ariaLabel || (typeof label === 'string' && label) || undefined
  return (
    <>
      <button type="button" className={btnClass} onClick={() => setOpen(true)} aria-label={name} title={name}>
        {btnIcon && <i className={`ph ${btnIcon}`} />}{label && <span className="btn-lbl">{label}</span>}
      </button>
      <dialog
        ref={ref}
        className={`modal${size ? ` ${size}` : ''}`}
        aria-labelledby={tid}
        onClose={() => setOpen(false)}
        onMouseDown={(e) => { if (e.target === ref.current) close() }}
      >
        {open && (
          <CloseCtx.Provider value={close}>
            <div className="modal-header">
              <div className="modal-ttl">
                <i className={`ph ${icon}`} /><span id={tid} className="modal-ttl-txt">{title}</span>
                <button type="button" className="btn-link x" onClick={close} aria-label="Close" tabIndex={-1}><i className="ph ph-x" /></button>
              </div>
            </div>
            {children}
          </CloseCtx.Provider>
        )}
      </dialog>
    </>
  )
}

// Cancel + submit row. The submit shows a spinner while the server action runs and closes the dialog when it is done.
export function ModalFoot({ label, icon, cls = 'btn-primary' }) {
  const close = useContext(CloseCtx)
  const { pending } = useFormStatus()
  const was = useRef(false)
  useEffect(() => {
    if (was.current && !pending) close()
    was.current = pending
  }, [pending, close])
  return (
    <div className="modal-foot">
      <button type="button" className="btn btn-ghost" onClick={close} disabled={pending}>Cancel</button>
      <button className={`btn ${cls}`} disabled={pending}>
        {pending ? <span className="spin" /> : icon && <i className={`ph ${icon}`} />}
        {pending ? 'Working…' : label}
      </button>
    </div>
  )
}

// One styled tooltip for the whole app. Any element with a title (or data-tip) gets it on hover and on
// keyboard focus; the title moves to data-tip so the plain browser tooltip doesn't show as well.
// position: fixed, so tables and dialogs can't clip it. Mounted once in the Shell.
export function Tooltips() {
  const [tip, setTip] = useState(null)
  useEffect(() => {
    let cur = null
    const show = (e) => {
      const el = e.target.closest?.('[title],[data-tip]')
      if (!el || el === cur) return
      if (el.title) { el.dataset.tip = el.title; el.removeAttribute('title') }
      const text = el.dataset.tip
      if (!text) return
      cur = el
      const r = el.getBoundingClientRect()
      const below = r.top < 48
      setTip({ text, x: Math.min(Math.max(r.left + r.width / 2, 90), innerWidth - 90), y: below ? r.bottom + 8 : r.top - 8, below })
    }
    const hide = (e) => {
      if (!cur || (e.type !== 'scroll' && e.relatedTarget && cur.contains(e.relatedTarget))) return
      cur = null
      setTip(null)
    }
    document.addEventListener('pointerover', show)
    document.addEventListener('focusin', show)
    document.addEventListener('pointerout', hide)
    document.addEventListener('focusout', hide)
    document.addEventListener('scroll', hide, true)
    document.addEventListener('pointerdown', hide)
    return () => {
      for (const [t, f] of [['pointerover', show], ['focusin', show], ['pointerout', hide], ['focusout', hide], ['pointerdown', hide]]) document.removeEventListener(t, f)
      document.removeEventListener('scroll', hide, true)
    }
  }, [])
  if (!tip) return null
  return <div className={`tip${tip.below ? ' below' : ''}`} role="tooltip" style={{ left: tip.x, top: tip.y }}>{tip.text}</div>
}

// Put inside a long form: once something is typed, leaving the page (link, back, refresh, closing the tab)
// asks first. Submitting the form clears it.
export function UnsavedGuard() {
  const ref = useRef(null)
  useEffect(() => {
    const form = ref.current?.closest('form')
    if (!form) return
    let dirty = false
    const mark = (e) => { if (e.isTrusted) dirty = true }
    const clear = () => { dirty = false }
    const unload = (e) => { if (dirty) { e.preventDefault(); e.returnValue = '' } }
    const leave = (e) => {
      const a = e.target.closest?.('a[href]')
      if (!dirty || !a || a.target === '_blank' || a.hasAttribute('download') || a.getAttribute('href').startsWith('#') || a.closest('dialog')) return
      if (window.confirm('Leave this page? Your changes are not saved.')) dirty = false
      else { e.preventDefault(); e.stopPropagation() }
    }
    form.addEventListener('input', mark)
    form.addEventListener('change', mark)
    form.addEventListener('submit', clear)
    window.addEventListener('beforeunload', unload)
    document.addEventListener('click', leave, true)
    return () => {
      form.removeEventListener('input', mark)
      form.removeEventListener('change', mark)
      form.removeEventListener('submit', clear)
      window.removeEventListener('beforeunload', unload)
      document.removeEventListener('click', leave, true)
    }
  }, [])
  return <span ref={ref} hidden />
}

// Secondary actions of a dialog footer, behind a "More" button so the footer keeps only the next step.
// The list stays mounted (and visible while open), because the confirm dialogs inside it can't open
// from a hidden element.
export function FootMore({ children }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const out = (e) => { if (!ref.current?.contains(e.target) && !e.target.closest?.('dialog')) setOpen(false) }
    // Esc closes the menu, not the order dialog around it (unless a confirm dialog is open on top).
    const esc = (e) => {
      if (e.key !== 'Escape' || document.querySelectorAll('dialog[open]').length > 1) return
      e.preventDefault()
      setOpen(false)
      ref.current?.querySelector('.foot-more-btn')?.focus()
    }
    document.addEventListener('mousedown', out)
    document.addEventListener('keydown', esc, true)
    return () => { document.removeEventListener('mousedown', out); document.removeEventListener('keydown', esc, true) }
  }, [open])
  return (
    <div ref={ref} className={`foot-more${open ? ' open' : ''}`}>
      <button type="button" className="btn btn-ghost neutral foot-more-btn" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen(!open)}>
        <i className="ph ph-dots-three-outline" />More<i className={`ph ${open ? 'ph-caret-down' : 'ph-caret-up'}`} />
      </button>
      <div className="foot-left">{children}</div>
    </div>
  )
}

// Document chip that opens the printable page in a dialog instead of a new tab.
export function DocView({ href, icon, label, title, cls = 'chip-link' }) {
  return (
    <Modal title={title || label} icon={icon} label={label} btnIcon={cls === 'doc-no' ? undefined : icon} btnClass={cls} size="large">
      <iframe
        src={href}
        title="Document"
        style={{ width: '100%', height: '75vh', border: 0, display: 'block' }}
        onLoad={(e) => { try { e.currentTarget.contentDocument.documentElement.classList.add('embed') } catch {} }}
      />
      <div className="modal-foot">
        <button type="button" className="btn btn-primary" onClick={(e) => {
          const f = e.currentTarget.closest('dialog').querySelector('iframe')
          try { f.contentWindow.print() } catch { window.open(href, '_blank') }
        }}><i className="ph ph-download-simple" />Download PDF</button>
      </div>
    </Modal>
  )
}

// One "Docs (n)" button per order: every document grouped by DO, each opening in the viewer.
export function DocsMenu({ o }) {
  const batches = o.batches || []
  const base = `/orders/${o.id}`
  const groups = batches.length
    ? batches.map((b) => ({ key: b.id, title: b.do_no || `Batch #${b.batch_no}`, docs: [
        { href: `${base}/print/do?batch=${b.id}`, icon: 'ph-truck', label: 'Delivery Order' },
        b.pi_no && { href: `${base}/print/pi?batch=${b.id}`, icon: 'ph-receipt', label: 'Proforma Invoice' },
        b.tax_invoice_path && { href: `${base}/tax-invoice?batch=${b.id}`, icon: 'ph-paperclip', label: 'Tax Invoice' },
      ].filter(Boolean), pending: !b.pi_no ? 'PI pending' : !b.tax_invoice_path ? 'Tax invoice pending' : '' }))
    : [{ key: 'o', title: o.doc_no || 'Order', docs: [
        o.do_date && { href: `${base}/print/do`, icon: 'ph-truck', label: 'Delivery Order' },
        o.pi_date && { href: `${base}/print/pi`, icon: 'ph-receipt', label: 'Proforma Invoice' },
        o.tax_invoice_path && { href: `${base}/tax-invoice`, icon: 'ph-paperclip', label: 'Tax Invoice' },
      ].filter(Boolean), pending: '' }].filter((g) => g.docs.length)
  const n = 1 + groups.reduce((t, g) => t + g.docs.length, 0)
  return (
    <Modal title={`Documents — ${o.quote_no}`} icon="ph-files" label={`Docs (${n})`} btnIcon="ph-files" btnClass="chip-link" size="small">
      <div className="modal-body docs-menu">
        <div className="docs-grp"><div className="docs-ttl">Quotation</div><DocView href={`${base}/print/quote`} icon="ph-file-text" label="Quote" /></div>
        {groups.map((g) => (
          <div key={g.key} className="docs-grp">
            <div className="docs-ttl">{g.title}</div>
            <div className="docs">{g.docs.map((d) => <DocView key={d.href} {...d} />)}{g.pending && <span className="muted text-sm">{g.pending}</span>}</div>
          </div>
        ))}
      </div>
    </Modal>
  )
}

// Plant status pill for an order line that saves as soon as it changes (FMS .status-sel).
// Coil N/A asks for expected date; Ready for Dispatch asks for ready quantity.
const PILL = { Pending: 's-planning', 'Under Production': 's-prod', 'Ready for Dispatch': 's-ready', 'Coil N/A': 's-coil' }
export function PlantStatus({ id, value, coil, options, readyQty, balance }) {
  const [v, setV] = useState(value)
  useEffect(() => { setV(value) }, [value])
  const { pending } = useFormStatus()
  const save = (e) => e.currentTarget.form.requestSubmit()
  return (
    <div className="plant-st">
      <select
        name={`production_${id}`}
        value={v}
        disabled={pending}
        aria-label="Plant status"
        className={`status-sel ${PILL[v] || ''}`}
        onChange={(e) => { setV(e.target.value); save(e) }}
      >
        {options.map((o) => <option key={o}>{o}</option>)}
      </select>
      {v === 'Coil N/A' && (
        <input type="date" name={`coil_${id}`} defaultValue={coil || ''} disabled={pending} aria-label="Coil expected on"
          title="Coil expected on" onChange={(e) => e.target.value >= '2000' && save(e)} />
      )}
    </div>
  )
}

// Drag-and-drop / click file picker (FMS .file-drop).
export function FileDrop({ name, accept, hint, required = true }) {
  const [file, setFile] = useState(null)
  const [drag, setDrag] = useState(false)
  return (
    <label className={`file-drop${drag ? ' drag' : ''}`} onDragEnter={() => setDrag(true)} onDragLeave={() => setDrag(false)} onDrop={() => setDrag(false)}>
      <input type="file" name={name} accept={accept} required={required} onChange={(e) => setFile(e.target.files[0] || null)} />
      <i className={`ph ${file ? 'ph-file-text' : 'ph-upload-simple'}`} />
      <p>{file ? file.name : 'Click to choose, or drop a file here'}</p>
      <small>{file ? `${(file.size / 1048576).toFixed(2)} MB` : hint}</small>
    </label>
  )
}

// Whole table row opens the order (FMS tr.clickable); links inside the row still work on their own.
export function ClickRow({ href, children }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  useBusy(pending)
  return (
    <tr className="clickable" onClick={(e) => { if (!e.target.closest('a,button,input,select,textarea,label,dialog')) start(() => router.push(href, { scroll: false })) }}>
      {children}
    </tr>
  )
}

// A dialog that is its own URL (?view=…), like the FMS order profile: Esc, backdrop or Close go back to the list.
export function RouteDialog({ title, icon, header, footer, closeHref, children }) {
  const ref = useRef(null)
  const tid = useId()
  const router = useRouter()
  const [pending, start] = useTransition()
  useBusy(pending)
  useEffect(() => { if (!ref.current.open) ref.current.showModal() }, [])
  const close = () => start(() => router.replace(closeHref, { scroll: false }))
  return (
    <dialog
      ref={ref}
      className="modal xl"
      aria-labelledby={tid}
      onCancel={(e) => { if (e.target === ref.current) { e.preventDefault(); close() } }}
      // Browsers may close it without a cancel event (e.g. one Esc closing grouped dialogs): keep the URL in step.
      onClose={(e) => { if (e.target === ref.current) close() }}
      onMouseDown={(e) => { if (e.target === ref.current) close() }}
    >
      <div className="modal-header">
        <div className="modal-ttl">
          <i className={`ph ${icon}`} /><span id={tid} className="modal-ttl-txt">{title}</span>
          <button type="button" className="btn-link x" onClick={close} aria-label="Close" tabIndex={-1}><i className="ph ph-x" /></button>
        </div>
        {header}
      </div>
      <div className="modal-body">{children}</div>
      <div className="modal-foot">
        {footer}
        <button type="button" className="btn btn-ghost neutral" onClick={close}>Close</button>
      </div>
    </dialog>
  )
}

// Submit button for plain (non-dialog) forms, with the same spinner.
export function Submit({ label, icon, cls = 'btn btn-primary' }) {
  const { pending } = useFormStatus()
  return (
    <button className={cls} disabled={pending}>
      {pending ? <span className="spin" /> : icon && <i className={`ph ${icon}`} />}
      {pending ? 'Working…' : label}
    </button>
  )
}

export function PasswordInput(props) {
  const [show, setShow] = useState(false)
  return (
    <div className="pw-wrap">
      <input {...props} type={show ? 'text' : 'password'} />
      <button type="button" className="pw-eye" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'}>
        <i className={`ph ${show ? 'ph-eye-slash' : 'ph-eye'}`} />
      </button>
    </div>
  )
}

export function PrintButton() {
  return (
    <button type="button" className="btn btn-primary btn-sm" onClick={() => window.print()}>
      <i className="ph ph-printer" />Print / Save as PDF
    </button>
  )
}

// ── Beautiful Searchable Combobox & Dropdown ──
export function Combobox({
  id,
  name,
  value,
  defaultValue = '',
  onChange,
  options = [],
  placeholder = 'Select…',
  required = false,
  disabled = false,
  className = '',
}) {
  const isControlled = value !== undefined
  const [selectedVal, setSelectedVal] = useState(isControlled ? value : defaultValue)
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlightIdx, setHighlightIdx] = useState(0)
  const wrapRef = useRef(null)
  const inputRef = useRef(null)
  const menuRef = useRef(null)
  const triggerRef = useRef(null)
  const refocus = useRef(false)
  const listId = useId()

  // Opening moves focus into the search box; closing with a key or a pick hands it back to the trigger.
  useEffect(() => {
    if (isOpen) inputRef.current?.focus()
    else if (refocus.current) { refocus.current = false; triggerRef.current?.focus() }
  }, [isOpen])
  const openMenu = () => { setIsOpen(true); setHighlightIdx(0) }
  const close = (back) => { refocus.current = back; setIsOpen(false); setQuery('') }

  useEffect(() => {
    if (isControlled) setSelectedVal(value)
  }, [isControlled, value])

  const normOptions = options.map((opt) =>
    typeof opt === 'object' && opt !== null
      ? {
          value: String(opt.value),
          label: String(opt.label ?? opt.value),
          sub: opt.sub ? String(opt.sub) : undefined,
          badge: opt.badge ? String(opt.badge) : undefined,
        }
      : { value: String(opt), label: String(opt) }
  )

  const selectedOpt = normOptions.find((o) => o.value === String(selectedVal))

  const filtered = query.trim()
    ? normOptions.filter((o) => {
        const q = query.toLowerCase()
        return (
          o.label.toLowerCase().includes(q) ||
          (o.badge && o.badge.toLowerCase().includes(q)) ||
          (o.sub && o.sub.toLowerCase().includes(q)) ||
          o.value.toLowerCase().includes(q)
        )
      })
    : normOptions

  useEffect(() => {
    function handleDocClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setIsOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handleDocClick)
    return () => document.removeEventListener('mousedown', handleDocClick)
  }, [])

  useEffect(() => {
    if (isOpen && menuRef.current) {
      const items = menuRef.current.querySelectorAll('.combobox-opt')
      if (items[highlightIdx]) {
        items[highlightIdx].scrollIntoView({ block: 'nearest' })
      }
    }
  }, [highlightIdx, isOpen])

  const select = (opt) => {
    if (!isControlled) setSelectedVal(opt.value)
    onChange?.(opt.value, opt)
    close(true)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Tab') close(false)
    else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIdx((prev) => (prev + 1 < filtered.length ? prev + 1 : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIdx((prev) => (prev - 1 >= 0 ? prev - 1 : filtered.length - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filtered[highlightIdx]) {
        select(filtered[highlightIdx])
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation() // keep Esc from also closing the dialog the field sits in
      close(true)
    }
  }

  return (
    <div className={`combobox-wrap ${className}`} ref={wrapRef}
      onBlur={(e) => { if (isOpen && !wrapRef.current.contains(e.relatedTarget)) close(false) }}>
      {/* Real (not type=hidden) input so the browser's required check still runs; it sits invisibly under the field. */}
      {name && <input className="combobox-req" tabIndex={-1} aria-hidden="true" name={name} value={selectedVal || ''} required={required} onChange={() => {}} />}
      <div
        className={`combobox-box ${isOpen ? 'open' : ''} ${disabled ? 'disabled' : ''}`}
        onMouseDown={(e) => { if (isOpen && e.target !== inputRef.current) e.preventDefault() }} // keep focus in the search box
        onClick={() => { if (!disabled) isOpen ? close(true) : openMenu() }}
      >
        {isOpen ? (
          <input
            ref={inputRef}
            id={id}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={filtered[highlightIdx] ? `${listId}-${highlightIdx}` : undefined}
            className="combobox-search-input"
            value={query}
            placeholder={selectedOpt ? selectedOpt.label : placeholder}
            onChange={(e) => {
              setQuery(e.target.value)
              setHighlightIdx(0)
            }}
            onKeyDown={handleKeyDown}
            onClick={(e) => e.stopPropagation()}
            autoComplete="off"
          />
        ) : (
          <button
            ref={triggerRef}
            id={id}
            type="button"
            role="combobox"
            aria-haspopup="listbox"
            aria-expanded="false"
            aria-controls={listId}
            disabled={disabled}
            className={`combobox-display ${!selectedOpt ? 'placeholder' : ''}`}
            onKeyDown={(e) => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); openMenu() } }}
          >
            {selectedOpt ? selectedOpt.label : placeholder}
          </button>
        )}
        <div className="combobox-icons">
          {selectedOpt && !required && !disabled && (
            <button
              type="button"
              className="combobox-clear"
              title="Clear selection"
              aria-label="Clear selection"
              onClick={(e) => {
                e.stopPropagation()
                if (!isControlled) setSelectedVal('')
                onChange?.('', null)
                triggerRef.current?.focus()
              }}
            >
              <i className="ph ph-x" />
            </button>
          )}
          <i className={`ph ph-caret-down combobox-arrow ${isOpen ? 'rotated' : ''}`} aria-hidden="true" />
        </div>
      </div>

      {isOpen && (
        <div className="combobox-menu" ref={menuRef} role="listbox" id={listId}>
          {filtered.length === 0 ? (
            <div className="combobox-empty">
              <i className="ph ph-magnifying-glass" /> No matching options
            </div>
          ) : (
            filtered.map((opt, idx) => {
              const isSelected = String(opt.value) === String(selectedVal)
              const isHighlighted = idx === highlightIdx
              return (
                <div
                  key={opt.value}
                  id={`${listId}-${idx}`}
                  role="option"
                  aria-selected={isSelected}
                  className={`combobox-opt ${isSelected ? 'selected' : ''} ${isHighlighted ? 'focused' : ''}`}
                  onMouseEnter={() => setHighlightIdx(idx)}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    select(opt)
                  }}
                >
                  <div className="combobox-opt-text">
                    <div className="combobox-opt-line">
                      <span className="combobox-opt-label">{opt.label}</span>
                      {opt.badge && <span className="badge b-blue">{opt.badge}</span>}
                    </div>
                    {opt.sub && <div className="combobox-opt-sub">{opt.sub}</div>}
                  </div>
                  {isSelected && <i className="ph ph-check combobox-check" />}
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}

const ROLE_HELP = {
  admin: 'Full system access, masters & users',
  manager: 'Every workflow step, no settings, masters, users or edits',
  sales: 'Creates quotations, sees only their own',
  approver: 'Approves, rejects and cancels orders',
  operations: 'Issues Delivery Orders (DO)',
  accounts: 'Issues Proforma Invoices & tax invoices',
  plant: 'Plant status & dispatch of DO lines',
}

export function RoleSelect({ id, name = 'role', value, defaultValue, required = true }) {
  const options = ROLES.map((r) => ({
    value: r,
    label: r.charAt(0).toUpperCase() + r.slice(1),
    sub: ROLE_HELP[r] || r,
    badge: r,
  }))
  return (
    <Combobox
      id={id}
      name={name}
      defaultValue={value || defaultValue || 'sales'}
      options={options}
      required={required}
      placeholder="Select role…"
    />
  )
}
