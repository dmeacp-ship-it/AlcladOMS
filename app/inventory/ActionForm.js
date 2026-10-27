'use client'
import { startTransition, useActionState, useEffect, useRef } from 'react'
import { UnsavedGuard } from '../ui'

// A form whose server action returns { error }: the error shows on top and every typed value stays (a plain
// <form action> would reset the fields after the error, so the action is started from onSubmit). On success
// the action redirects. submit = { label, icon, cls }; className styles the form (QC is a card).
export default function ActionForm({ action, submit, className, children }) {
  const [state, formAction, pending] = useActionState(action, null)
  const errRef = useRef(null)
  useEffect(() => { if (state?.error) errRef.current?.focus() }, [state])
  const send = (e) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startTransition(() => formAction(fd))
  }
  return (
    <form onSubmit={send} className={className}>
      <UnsavedGuard />
      {state?.error && <div ref={errRef} tabIndex={-1} role="alert" className="banner error shake"><i className="ph ph-warning-circle" /><span><b>Not saved.</b> {state.error}</span></div>}
      {children}
      <div className="row" style={{ justifyContent: 'flex-end', ...(className && { padding: '12px 20px' }) }}>
        <button className={submit.cls || 'btn btn-primary btn-lg'} disabled={pending}>
          {pending ? <span className="spin" /> : <i className={`ph ${submit.icon}`} />}{pending ? 'Saving…' : submit.label}
        </button>
      </div>
    </form>
  )
}
