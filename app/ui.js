'use client'
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  const origError = console.error
  console.error = (...args) => {
    if (typeof args[0] === 'string' && args[0].includes('Encountered a script tag')) return
    origError.apply(console, args)
  }
}
// Small interactive pieces shared by the server-rendered pages (FMS look & feel).
import { createContext, useContext, useEffect, useId, useLayoutEffect, useRef, useState, useTransition } from 'react'
import { createPortal, useFormStatus } from 'react-dom'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import Link, { useLinkStatus } from 'next/link'
import { ROLES, day, prodLabel, prodStatus, splitName, today } from '@/lib/tas'

// Same breakpoint as the phone layout in globals.css (narrow, or a phone held sideways).
export const PHONE = '(max-width: 768px), (max-height: 500px) and (pointer: coarse)'
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches

// Thin red bar along the top of the window while something is loading (FMS #topProgress).
function useBusy(busy) {
  useEffect(() => {
    if (!busy) return
    document.documentElement.dataset.busy = '1'
    return () => { delete document.documentElement.dataset.busy }
  }, [busy])
}
// Put inside a <Link> to show the bar while that link loads, plus a small spinner on tiles, tabs, sort
// headers and buttons (.link-busy in globals.css).
export function LinkBusy() {
  const { pending } = useLinkStatus()
  useBusy(pending)
  return pending ? <span className="link-busy" aria-hidden="true" /> : null
}

// Prefetches on hover / touch (150-300 ms head start before click).
// staleTimes.dynamic: 30 in next.config.mjs keeps the dynamic page ready for 30s.
export function IntentLink({ href, prefetch = false, onPointerEnter, onTouchStart, children, ...props }) {
  const router = useRouter()
  const lastPrefetched = useRef(null)
  const prefetchOnIntent = () => {
    if (href && typeof href === 'string' && href.startsWith('/') && lastPrefetched.current !== href) {
      lastPrefetched.current = href
      try { router.prefetch(href) } catch {}
    }
  }
  return (
    <Link
      href={href}
      prefetch={prefetch}
      onPointerEnter={(e) => {
        prefetchOnIntent()
        onPointerEnter?.(e)
      }}
      onTouchStart={(e) => {
        prefetchOnIntent()
        onTouchStart?.(e)
      }}
      {...props}
    >
      {children}
    </Link>
  )
}

// Plays the dialog's closing animation (shorter than its opening one), then closes it.
export function closeAnimated(d, done) {
  if (!d?.open || d.classList.contains('closing')) return
  if (reducedMotion()) { d.close(); return done?.() }
  d.classList.add('closing')
  setTimeout(() => { d.classList.remove('closing'); d.close(); done?.() }, 170)
}

// Phones: drag a sheet down by its header to close it, like the grab handle suggests.
function useSheetDrag(ref, onClose) {
  useEffect(() => {
    const d = ref.current
    const head = d?.querySelector('.modal-header')
    if (!head) return
    let y0 = null
    let x0 = 0
    let dy = 0
    const down = (e) => {
      if (!matchMedia(PHONE).matches || e.button || e.target.closest('button,a,input,select,textarea')) return
      y0 = e.clientY; x0 = e.clientX; dy = 0
    }
    const move = (e) => {
      if (y0 == null) return
      dy = e.clientY - y0
      if (Math.abs(e.clientX - x0) > Math.abs(dy) && dy < 12) { y0 = null; return } // sideways: the tracker scrolls
      if (dy > 0) { d.style.transition = 'none'; d.style.transform = `translateY(${dy}px)` }
    }
    const up = () => {
      if (y0 == null) return
      y0 = null
      d.style.transition = ''
      d.style.transform = ''
      if (dy > 90) onClose()
    }
    head.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      head.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  })
}

// close(): Cancel / after saving. request(): Esc, backdrop, ✕ and drag, which ask first when something was typed.
const CloseCtx = createContext({ close: () => {}, request: () => {} })

// FMS-style dialog on a native <dialog>: header / body / foot, closes on Esc, backdrop click or Cancel.
// Children are the form: <form action={...}><div className="modal-body">…</div><ModalFoot …/></form>
export function Modal({ title, icon = 'ph-info', label, btnIcon, btnClass = 'btn btn-primary btn-sm', size, children, ariaLabel, defaultOpen = false }) {
  const ref = useRef(null)
  const tid = useId()
  const [open, setOpen] = useState(defaultOpen)
  const dirty = useRef(false)
  useEffect(() => {
    if (!open) return
    if (!ref.current.open) ref.current.showModal()
    // Typed text inside the dialog's form: closing by accident asks first. data-nodirty fields don't count.
    const d = ref.current
    const mark = (e) => { if (e.isTrusted && e.target.closest('form') && !e.target.closest('[data-nodirty]')) dirty.current = true }
    d.addEventListener('input', mark)
    d.addEventListener('change', mark)
    return () => { d.removeEventListener('input', mark); d.removeEventListener('change', mark) }
  }, [open])
  const close = () => closeAnimated(ref.current)
  const request = () => {
    if (!dirty.current) return close()
    askConfirm('Discard what you typed?', { ok: 'Discard', danger: true }).then((y) => y && close())
  }
  useSheetDrag(ref, request)
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
        onCancel={(e) => { if (e.target === ref.current) { e.preventDefault(); request() } }}
        onClose={(e) => { if (e.target === ref.current) { dirty.current = false; setOpen(false) } }}
        onMouseDown={(e) => { if (e.target === ref.current) request() }}
      >
        {open && (
          <CloseCtx.Provider value={{ close, request }}>
            <div className="modal-header no-print">
              <div className="modal-ttl">
                <i className={`ph ${icon}`} /><span id={tid} className="modal-ttl-txt">{title}</span>
                <button type="button" className="btn-link x" onClick={request} aria-label="Close"><i className="ph ph-x" /></button>
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
export function ModalFoot({ label, icon, cls = 'btn-primary', disabled = false }) {
  const { close } = useContext(CloseCtx)
  const { pending } = useFormStatus()
  const was = useRef(false)
  useEffect(() => {
    if (was.current && !pending) close()
    was.current = pending
  }, [pending, close])
  return (
    <div className="modal-foot">
      <button type="button" className="btn btn-ghost" onClick={close} disabled={pending}>Cancel</button>
      <button className={`btn ${cls}`} disabled={pending || disabled}>
        {pending ? <span className="spin" /> : icon && <i className={`ph ${icon}`} />}
        {pending ? 'Working…' : label}
      </button>
    </div>
  )
}

// Body + footer of a destructive dialog. With a word, the button stays off until that word is typed.
export function TypeToConfirm({ word, label, icon = 'ph-trash', children }) {
  const [v, setV] = useState('')
  const id = useId()
  const ok = !word || v.trim().toUpperCase() === word.toUpperCase()
  return (
    <>
      <div className="modal-body">
        {children}
        {word && (
          <div className="fg" data-nodirty>
            <label htmlFor={id}>Type <b>{word}</b> to confirm</label>
            <input id={id} value={v} onChange={(e) => setV(e.target.value)} autoComplete="off" autoCapitalize="characters" spellCheck={false} />
          </div>
        )}
      </div>
      <ModalFoot label={label} icon={icon} cls="btn-danger" disabled={!ok} />
    </>
  )
}

// The app's own yes/no dialog instead of the browser's grey confirm(). Resolves true when the action is chosen.
// Built with plain DOM so it works from event handlers anywhere, including on top of another open dialog.
export function askConfirm(message, { ok = 'OK', danger = false } = {}) {
  return new Promise((resolve) => {
    const d = document.createElement('dialog')
    d.className = 'modal small confirm-dlg'
    d.innerHTML = `<div class="modal-body"><p class="confirm-msg"></p></div>
      <div class="modal-foot"><button type="button" class="btn btn-ghost" data-v="0">Cancel</button>
      <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-v="1"></button></div>`
    d.querySelector('.confirm-msg').textContent = message
    d.querySelector('[data-v="1"]').textContent = ok
    let answer = false
    d.addEventListener('click', (e) => {
      const b = e.target.closest('[data-v]')
      if (b) { answer = b.dataset.v === '1'; d.close() } else if (e.target === d) d.close()
    })
    d.addEventListener('close', () => { d.remove(); resolve(answer) })
    document.body.append(d)
    d.showModal()
    // Enter on a destructive question must not do the destructive thing: focus starts on Cancel there.
    d.querySelector(danger ? '[data-v="0"]' : '[data-v="1"]').focus()
  })
}

// A submit button that asks first (small destructive actions inside plain forms).
export function ConfirmButton({ message, children, ...props }) {
  const yes = useRef(false)
  return (
    <button {...props} onClick={(e) => {
      if (yes.current) { yes.current = false; return }
      e.preventDefault()
      const b = e.currentTarget
      askConfirm(message, { ok: 'Remove', danger: true }).then((y) => { if (y) { yes.current = true; b.click() } })
    }}>{children}</button>
  )
}

// One styled tooltip for the whole app. Any element with a title (or data-tip) gets it on mouse hover and on
// keyboard focus; the title moves to data-tip so the plain browser tooltip doesn't show as well.
// Skipped when the element already shows the same words (sidebar labels) and on touch screens, where a tap
// would leave it hanging over the next thing. position: fixed and kept inside the window.
// Phones show tables as cards (globals.css "Phones: every other table"); each cell gets its column name
// from the header as data-label. Runs again whenever the page changes (navigation, dialogs, new rows).
export function TableLabels() {
  useEffect(() => {
    let raf = 0
    let retry = 0
    // Rows still streaming in aren't hydrated by React yet; touching them would make React report a
    // mismatch, so those tables are labelled a moment later.
    const hydrated = (el) => Object.keys(el).some((k) => k.startsWith('__reactFiber'))
    const label = () => {
      raf = 0
      for (const t of document.querySelectorAll('table.tbl')) {
        if (t.classList.contains('lines')) continue // quote lines label their own cells
        if (!hydrated(t)) { clearTimeout(retry); retry = setTimeout(label, 150); continue }
        const heads = [...(t.tHead?.rows[0]?.cells || [])].map((th) => th.textContent.trim())
        for (const tr of t.tBodies[0]?.rows || []) {
          let i = 0
          for (const td of tr.cells) {
            const l = heads[i] || ''
            if (td.dataset.label !== l) td.dataset.label = l
            i += td.colSpan
          }
        }
      }
    }
    const mo = new MutationObserver((list) => {
      if (list.every((m) => m.target.closest?.('.tip'))) return
      raf ||= requestAnimationFrame(label)
    })
    label()
    mo.observe(document.body, { childList: true, subtree: true })
    return () => { mo.disconnect(); cancelAnimationFrame(raf); clearTimeout(retry) }
  }, [])
  return null
}

export function Tooltips() {
  const [tip, setTip] = useState(null)
  const tipRef = useRef(null)
  useEffect(() => {
    let cur = null
    const hover = matchMedia('(hover: hover) and (pointer: fine)')
    const show = (e) => {
      const el = e.target.closest?.('[title],[data-tip]')
      if (!el || el === cur) return
      if (el.title) { el.dataset.tip = el.title; el.removeAttribute('title') }
      if (e.type === 'pointerover' && (e.pointerType !== 'mouse' || !hover.matches)) return
      if (e.type === 'focusin' && !el.matches(':focus-visible')) return
      const text = el.dataset.tip
      if (!text) return
      const shown = (el.innerText || '').split('\n')[0].trim().toLowerCase()
      if (shown && text.toLowerCase().startsWith(shown)) return
      cur = el
      const r = el.getBoundingClientRect()
      const below = r.top < 48
      setTip({ text, x: r.left + r.width / 2, y: below ? r.bottom + 8 : r.top - 8, below })
    }
    const hide = (e) => {
      if (!cur || (e.type !== 'scroll' && e.relatedTarget && cur.contains(e.relatedTarget))) return
      cur = null
      setTip(null)
    }
    const evts = [['pointerover', show], ['focusin', show], ['pointerout', hide], ['focusout', hide], ['pointerdown', hide]]
    for (const [t, f] of evts) document.addEventListener(t, f)
    document.addEventListener('scroll', hide, true)
    return () => {
      for (const [t, f] of evts) document.removeEventListener(t, f)
      document.removeEventListener('scroll', hide, true)
    }
  }, [])
  // Centre on the element, but never past the window edges.
  useLayoutEffect(() => {
    const t = tipRef.current
    if (!t || !tip) return
    const w = t.offsetWidth
    t.style.left = `${Math.min(Math.max(tip.x - w / 2, 8), innerWidth - w - 8)}px`
    t.style.setProperty('--arrow', `${Math.min(Math.max(tip.x - parseFloat(t.style.left), 10), w - 10)}px`)
  }, [tip])
  if (!tip) return null
  return <div ref={tipRef} className={`tip${tip.below ? ' below' : ''}`} role="tooltip" style={{ top: tip.y }}>{tip.text}</div>
}

// Put inside a long form: once something is typed, leaving the page (link, back, refresh, closing the tab)
// asks first. Submitting the form clears it.
export function UnsavedGuard() {
  const ref = useRef(null)
  useEffect(() => {
    const form = ref.current?.closest('form')
    if (!form) return
    let dirty = false
    const mark = (e) => { if (e.isTrusted) dirty = true; form.dataset.dirty = dirty ? '1' : '' }
    const clear = () => { dirty = false; delete form.dataset.dirty }
    const unload = (e) => { if (dirty) { e.preventDefault(); e.returnValue = '' } }
    const leave = (e) => {
      const a = e.target.closest?.('a[href]')
      if (!dirty || !a || a.target === '_blank' || a.hasAttribute('download') || a.getAttribute('href').startsWith('#') || a.closest('dialog')) return
      e.preventDefault()
      e.stopPropagation()
      askConfirm('Leave this page? Your changes are not saved.', { ok: 'Leave', danger: true }).then((y) => {
        if (y) { dirty = false; a.click() }
      })
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
        src={`${href}${href.includes('?') ? '&' : '?'}embed=1`}
        title="Document"
        className="doc-frame"
        onLoad={(e) => { try { e.currentTarget.contentDocument.documentElement.classList.add('embed') } catch {} }}
      />
      <div className="modal-foot no-print">
        <a className="btn btn-ghost" href={href} target="_blank" rel="noreferrer"><i className="ph ph-arrow-square-out" />Open in a new tab</a>
        <button type="button" className="btn btn-primary" onClick={(e) => {
          const f = e.currentTarget.closest('dialog').querySelector('iframe')
          try { f.contentWindow.print() } catch { window.open(href, '_blank') }
        }}><i className="ph ph-printer" />Print or save as PDF</button>
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
    <Modal title={`Documents for ${o.quote_no}`} icon="ph-files" label={`Docs (${n})`} btnIcon="ph-files" btnClass="chip-link" size="small">
      <div className="modal-body docs-menu">
        <div className="docs-grp"><div className="docs-ttl">Quotation</div><DocView href={`${base}/print/quote`} icon="ph-file-text" label="Quote" /></div>
        {groups.map((g) => (
          <div key={g.key} className="docs-grp">
            <div className="docs-ttl doc-ref">{g.title}</div>
            <div className="docs">{g.docs.map((d) => <DocView key={d.href} {...d} />)}{g.pending && <span className="muted text-sm">{g.pending}</span>}</div>
          </div>
        ))}
      </div>
    </Modal>
  )
}

// Plant status pill for an order line that saves as soon as it changes (FMS .status-sel).
// Coil N/A asks for the expected date. Ready pieces are not a status: they come from Mark ready.
const PILL = { Pending: 's-planning', 'Under Production': 's-prod', 'Coil N/A': 's-coil' }
export function PlantStatus({ id, value, coil, options }) {
  const [v, setV] = useState(prodStatus(value))
  useEffect(() => { setV(prodStatus(value)) }, [value])
  const { pending } = useFormStatus()
  const save = (e) => e.currentTarget.form.requestSubmit()
  return (
    <div className="plant-st">
      <select
        name={`production_${id}`}
        value={v}
        disabled={pending}
        aria-label="Production"
        className={`status-sel ${PILL[v] || ''}`}
        onChange={(e) => { setV(e.target.value); save(e) }}
      >
        {options.map((o) => <option key={o} value={o}>{prodLabel(o)}</option>)}
      </select>
      {v === 'Coil N/A' && (
        <input type="date" name={`coil_${id}`} defaultValue={coil || ''} disabled={pending} aria-label="Coil expected on"
          title="Coil expected on" onChange={(e) => e.target.value >= '2000' && save(e)} />
      )}
    </div>
  )
}

// Drag-and-drop / click file picker (FMS .file-drop). maxMB: too-big files are refused before uploading.
export function FileDrop({ name, accept, hint, required = true, maxMB }) {
  const [file, setFile] = useState(null)
  const [drag, setDrag] = useState(false)
  const mb = file ? file.size / 1048576 : 0
  const tooBig = maxMB && mb > maxMB
  return (
    <label className={`file-drop${drag ? ' drag' : ''}${tooBig ? ' bad' : ''}`} onDragEnter={() => setDrag(true)} onDragLeave={() => setDrag(false)} onDrop={() => setDrag(false)}>
      <input type="file" name={name} accept={accept} required={required} onChange={(e) => {
        const f = e.target.files[0] || null
        setFile(f)
        const big = maxMB && f && f.size / 1048576 > maxMB
        e.target.setCustomValidity(big ? `This file is ${(f.size / 1048576).toFixed(1)} MB; the limit is ${maxMB} MB.` : '')
      }} />
      <i className={`ph ${tooBig ? 'ph-warning-circle' : file ? 'ph-file-text' : 'ph-upload-simple'}`} />
      <p>{file ? file.name : 'Click to choose, or drop a file here'}</p>
      <small role={tooBig ? 'alert' : undefined}>
        {tooBig ? `${mb.toFixed(1)} MB is over the ${maxMB} MB limit. Choose a smaller file.` : file ? `${mb.toFixed(2)} MB` : hint}
      </small>
    </label>
  )
}

// What shows the moment an order is clicked, until its dialog arrives from the server.
function DialogSkeleton() {
  return createPortal(
    <div className="dlg-skel" role="status" aria-label="Opening order…">
      <div className="dlg-skel-box">
        <div className="skeleton" style={{ width: '42%', height: 18 }} />
        <div className="dlg-skel-steps">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="skeleton" />)}</div>
        <div className="skeleton" style={{ height: 44 }} />
        <div className="skeleton" style={{ height: 120 }} />
        <div className="skeleton" style={{ width: '70%', height: 14 }} />
      </div>
    </div>,
    document.body,
  )
}

// Whole table row opens the order (FMS tr.clickable); links inside the row still work on their own.
// The quote number link goes the same way, so the row shows it is opening; Ctrl / ⌘ click still opens a tab.
export function ClickRow({ href, onOpen, children }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  useBusy(pending)
  const open = () => {
    if (onOpen) return onOpen()
    // Lets the dialog close with Back instead of adding the list to the history a second time.
    try { sessionStorage.dlgFrom = JSON.stringify({ url: location.pathname + location.search, at: Date.now() }) } catch {}
    start(() => router.push(href, { scroll: false }))
  }
  return (
    <tr
      className={`clickable${pending ? ' opening' : ''}`}
      aria-busy={pending || undefined}
      onClickCapture={(e) => {
        if (!e.target.closest('a.qno') || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button) return
        e.preventDefault()
        e.stopPropagation()
        open()
      }}
      onClick={(e) => { if (!e.target.closest('a,button,input,select,textarea,label,dialog')) open() }}
    >
      {children}
      {pending && <DialogSkeleton />}
    </tr>
  )
}

// A dialog that is its own URL (?view=…), like the FMS order profile: Esc, backdrop or Close go back to the list.
// Opened from the list, closing steps Back (no duplicate history entry); opened from a link or after an
// action inside it, closing replaces the URL with the list.
export function RouteDialog({ title, icon, header, footer, closeHref, onClose, children }) {
  const ref = useRef(null)
  const tid = useId()
  const router = useRouter()
  const [pending, start] = useTransition()
  const back = useRef(null)
  useBusy(pending)
  useEffect(() => {
    if (!ref.current.open) ref.current.showModal()
    // Read, not removed here (React runs this twice in development); a marker older than 15 s is stale.
    let from = null
    try { from = JSON.parse(sessionStorage.dlgFrom || 'null') } catch {}
    back.current = from?.url === closeHref && Date.now() - from.at < 15000 ? history.length : null
  }, [closeHref])
  const leave = () => {
    if (onClose) return onClose()
    start(() => {
      try { sessionStorage.removeItem('dlgFrom') } catch {}
      if (back.current === history.length) router.back()
      else router.replace(closeHref, { scroll: false })
    })
  }
  // Every way of closing ends in the dialog's close event, which updates the URL.
  const close = () => closeAnimated(ref.current)
  useSheetDrag(ref, close)
  return (
    <dialog
      ref={ref}
      className="modal xl route"
      aria-labelledby={tid}
      onCancel={(e) => { if (e.target === ref.current) { e.preventDefault(); close() } }}
      // Also covers browsers closing it without a cancel event (e.g. one Esc closing grouped dialogs).
      onClose={(e) => { if (e.target === ref.current) leave() }}
      onMouseDown={(e) => { if (e.target === ref.current) close() }}
    >
      <div className="modal-header no-print">
        <div className="modal-ttl">
          <i className={`ph ${icon}`} /><span id={tid} className="modal-ttl-txt">{title}</span>
          <button type="button" className="btn-link x" onClick={close} aria-label="Close"><i className="ph ph-x" /></button>
        </div>
        {header}
      </div>
      <div className="modal-body">{children}</div>
      <div className="modal-foot no-print">
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

export function PrintButton({ cls = 'btn btn-primary btn-sm' } = {}) {
  return (
    <button type="button" className={cls} onClick={() => window.print()}>
      <i className="ph ph-printer" />Print or save as PDF
    </button>
  )
}

// Live filter for a long chip list (Items → Color): hides chips whose text doesn't match.
export function ChipFilter({ target, label }) {
  const [q, setQ] = useState('')
  useEffect(() => {
    const t = q.trim().toLowerCase()
    for (const c of document.querySelectorAll(`#${target} .vchip`)) c.hidden = !!t && !c.textContent.toLowerCase().includes(t)
  }, [q, target])
  return (
    <div className="sw chip-filter">
      <i className="ph ph-magnifying-glass" />
      <input className="tsearch" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={label} aria-label={label} data-nodirty />
    </div>
  )
}

// ── Searchable combobox ──
// The menu is fixed to the window (not to the field's box), so dialogs and scrolling cards can't cut it
// off; it opens upward when there is more room above.
export function Combobox({
  id,
  name,
  value,
  defaultValue = '',
  onChange,
  options = [],
  placeholder = 'Select…',
  required = false,
  requiredMsg = 'Choose one of the options.',
  disabled = false,
  className = '',
  wide = false,
}) {
  const isControlled = value !== undefined
  const [selectedVal, setSelectedVal] = useState(isControlled ? value : defaultValue)
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlightIdx, setHighlightIdx] = useState(0)
  const [invalid, setInvalid] = useState(false)
  const [pos, setPos] = useState(null)
  const wrapRef = useRef(null)
  const boxRef = useRef(null)
  const inputRef = useRef(null)
  const menuRef = useRef(null)
  const triggerRef = useRef(null)
  const refocus = useRef(false)
  const listId = useId()
  const errId = useId()

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
  useEffect(() => { if (selectedVal) setInvalid(false) }, [selectedVal])

  // Place the menu under (or over) the field, and keep it there while the page or a dialog scrolls.
  useLayoutEffect(() => {
    if (!isOpen) return
    const place = () => {
      const r = boxRef.current.getBoundingClientRect()
      const below = innerHeight - r.bottom - 12
      const above = r.top - 12
      const up = below < 400 && above > below
      const width = Math.min(Math.max(r.width, wide ? 440 : 0), innerWidth - 16)
      const left = Math.min(Math.max(r.left, 8), innerWidth - width - 8)
      setPos({ left, width, maxHeight: Math.min(400, up ? above : below), ...(up ? { bottom: innerHeight - r.top + 6 } : { top: r.bottom + 6 }) })
    }
    place()
    addEventListener('resize', place)
    addEventListener('scroll', place, true)
    return () => { removeEventListener('resize', place); removeEventListener('scroll', place, true) }
  }, [isOpen, wide])

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
      {/* Real (not type=hidden) input so the browser's required check still runs; it sits invisibly under the field.
          Its own error bubble would point at nothing, so the field shows the message itself. */}
      {name && <input className="combobox-req" tabIndex={-1} aria-hidden="true" name={name} value={selectedVal || ''} required={required}
        onChange={() => {}} onInvalid={(e) => {
          e.preventDefault()
          setInvalid(true)
          if (!document.activeElement?.closest('.combobox-box.invalid')) triggerRef.current?.focus()
        }} />}
      <div
        ref={boxRef}
        className={`combobox-box ${isOpen ? 'open' : ''} ${disabled ? 'disabled' : ''} ${invalid ? 'invalid' : ''}`}
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
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? errId : undefined}
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
      {invalid && <span className="field-err" id={errId} role="alert"><i className="ph ph-warning-circle" />{requiredMsg}</span>}

      {isOpen && pos && (
        <div className="combobox-menu" ref={menuRef} role="listbox" id={listId} style={pos}>
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
                      <span className="combobox-opt-label"><bdi>{opt.label}</bdi></span>
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
  }))
  return (
    <Combobox
      id={id}
      name={name}
      defaultValue={value || defaultValue || 'sales'}
      options={options}
      required={required}
      requiredMsg="Choose a role."
      placeholder="Select role…"
    />
  )
}

// Customer name: English on the first line, Arabic (right-to-left) under it, so neither script reorders the other.
export function CustName({ name, className = '' }) {
  const { en, ar } = splitName(name)
  return (
    <span className={`cn ${className}`}>
      <bdi className="cn-en">{en}</bdi>
      {ar && <span className="cn-ar" dir="rtl" lang="ar">{ar}</span>}
    </span>
  )
}

// Dropdown menus built on <details class="dl-menu">: Esc closes the open one (focus back on its button),
// a press outside closes it, and so does any navigation. Mounted once in the Shell.
export function MenuCloser() {
  const pathname = usePathname()
  const sp = useSearchParams()
  useEffect(() => {
    for (const d of document.querySelectorAll('details.dl-menu[open]')) d.open = false
  }, [pathname, sp])
  useEffect(() => {
    const open = () => [...document.querySelectorAll('details.dl-menu[open]')]
    const esc = (e) => {
      if (e.key !== 'Escape') return
      const list = open()
      if (!list.length) return
      e.preventDefault()
      e.stopPropagation()
      for (const d of list) { d.open = false; d.querySelector('summary')?.focus() }
    }
    const out = (e) => { for (const d of open()) if (!d.contains(e.target)) d.open = false }
    document.addEventListener('keydown', esc, true)
    document.addEventListener('pointerdown', out, true)
    return () => { document.removeEventListener('keydown', esc, true); document.removeEventListener('pointerdown', out, true) }
  }, [])
  return null
}

// The one period picker: a button showing the range; it opens quick choices and From / To fields.
// Put it inside the page's GET form; it submits fields named from and to. children: extra filters for the panel.
export function DateRange({ from, to, children }) {
  const ref = useRef(null)
  const iso = (d) => d.toISOString().slice(0, 10)
  const t = today()
  const [y, m] = t.split('-').map(Number)
  const presets = [
    ['Today', t, t],
    ['Last 7 days', iso(new Date(Date.parse(t) - 6 * 864e5)), t],
    ['This month', `${t.slice(0, 7)}-01`, t],
    ['Last month', iso(new Date(Date.UTC(y, m - 2, 1))), iso(new Date(Date.UTC(y, m - 1, 0)))],
  ]
  const pick = (f, to2) => {
    const form = ref.current?.closest('form')
    if (!form) return
    form.elements.namedItem('from').value = f
    form.elements.namedItem('to').value = to2
    form.requestSubmit()
  }
  return (
    <details className="dl-menu q-menu date-range" ref={ref} onToggle={(e) => {
      // Open under the button, towards whichever side has room
      const list = e.currentTarget.querySelector('.dl-list')
      if (!e.currentTarget.open || !list) return
      list.style.left = '0'; list.style.right = 'auto'
      if (list.getBoundingClientRect().right > innerWidth - 8) { list.style.left = 'auto'; list.style.right = '0' }
    }}>
      <summary className="btn btn-ghost btn-sm" aria-label="Change the period">
        <i className="ph ph-calendar-blank" /><span className="q-label">{from || to ? `${from ? day(from) : '…'} – ${to ? day(to) : '…'}` : 'Any date'}</span><i className="ph ph-caret-down q-caret" />
      </summary>
      <div className="dl-list dr-panel">
        <div className="dr-presets">
          {presets.map(([l, f, to2]) => (
            <button key={l} type="button" className={`chip-btn${f === from && to2 === to ? ' on' : ''}`} onClick={() => pick(f, to2)}>{l}</button>
          ))}
        </div>
        <div className="dr-fields">
          <label>From<input type="date" name="from" defaultValue={from} max={t} /></label>
          <label>To<input type="date" name="to" defaultValue={to} max={t} /></label>
        </div>
        {children}
        <button type="submit" className="btn btn-primary btn-sm">Show this period</button>
      </div>
    </details>
  )
}

// "What is this page for" box. Got it folds it to one link, remembered in this browser per page.
export function HelpBox({ id, icon, text, steps }) {
  const [open, setOpen] = useState(true)
  useEffect(() => {
    try { if (localStorage.getItem(`help:${id}`) === '0') setOpen(false) } catch {}
  }, [id])
  const set = (v) => {
    setOpen(v)
    try { localStorage.setItem(`help:${id}`, v ? '1' : '0') } catch {}
  }
  if (!open) {
    return (
      <button type="button" className="help-link" onClick={() => set(true)}>
        <i className="ph ph-question" />How this page works
      </button>
    )
  }
  return (
    <div className="page-help">
      <i className={`ph ${icon} page-help-ic`} aria-hidden="true" />
      <div className="page-help-txt">
        <p>{text}</p>
        {steps && <ol>{steps.map((s) => <li key={s}>{s}</li>)}</ol>}
      </div>
      <button type="button" className="btn btn-ghost btn-sm page-help-x" onClick={() => set(false)}>Got it</button>
    </div>
  )
}
