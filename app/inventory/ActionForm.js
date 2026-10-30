'use client'
import { startTransition, useActionState, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { UnsavedGuard } from '../ui'

// A form whose server action returns { error }: the error shows on top and every typed value stays (a plain
// <form action> would reset the fields after the error, so the action is started from onSubmit). On success
// the action redirects. submit = { label, icon, cls }; className styles the form (QC is a card).
// Inside a page dialog (RouteDialog) the submit button moves to the dialog's footer, next to Close, so it is
// always in view instead of at the end of a long scroll.
export default function ActionForm({ action, submit, className, children }) {
  const [state, formAction, pending] = useActionState(action, null)
  const errRef = useRef(null)
  const formRef = useRef(null)
  const id = useId()
  const [foot, setFoot] = useState(null)
  useEffect(() => { setFoot(formRef.current?.closest('dialog.route')?.querySelector('.modal-foot') || null) }, [])
  useEffect(() => { if (state?.error) errRef.current?.focus() }, [state])
  const send = (e) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startTransition(() => formAction(fd))
  }
  const button = (
    <button form={id} className={submit.cls || 'btn btn-primary btn-lg'} disabled={pending}>
      {pending ? <span className="spin" /> : <i className={`ph ${submit.icon}`} />}{pending ? 'Saving…' : submit.label}
    </button>
  )
  return (
    <form id={id} ref={formRef} onSubmit={send} className={className}>
      <UnsavedGuard />
      {state?.error && <div ref={errRef} tabIndex={-1} role="alert" className="banner error shake"><i className="ph ph-warning-circle" /><span><b>Not saved.</b> {state.error}</span></div>}
      {children}
      {foot ? createPortal(button, foot) : (
        <div className="row" style={{ justifyContent: 'flex-end', ...(className && { padding: '12px 20px' }) }}>{button}</div>
      )}
    </form>
  )
}
