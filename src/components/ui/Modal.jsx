import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export default function Modal({ open, onClose, title, description, children, footer, size = '', initialFocus }) {
  const ref = useRef(null)
  const titleId = useId()
  const lastFocus = useRef(null)

  useEffect(() => {
    if (!open) return
    lastFocus.current = document.activeElement
    const el = ref.current
    const first = initialFocus?.current || el?.querySelector('[data-autofocus]') || el?.querySelector(FOCUSABLE)
    first?.focus()
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose?.() }
      if (e.key === 'Tab' && el) {
        const nodes = [...el.querySelectorAll(FOCUSABLE)].filter((n) => n.offsetParent !== null)
        if (!nodes.length) return
        const [a, b] = [nodes[0], nodes[nodes.length - 1]]
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); b.focus() }
        else if (!e.shiftKey && document.activeElement === b) { e.preventDefault(); a.focus() }
      }
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      lastFocus.current?.focus?.()
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null
  return createPortal(
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div ref={ref} className={`modal ${size}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        {title && (
          <div className="modal-header">
            <div>
              <h2 id={titleId}>{title}</h2>
              {description && <p>{description}</p>}
            </div>
            <button className="icon-btn sm" onClick={onClose} aria-label="Close dialog"><X size={18} /></button>
          </div>
        )}
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

export function ConfirmDialog({ open, onClose, onConfirm, title, body, confirmLabel = 'Confirm', danger }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} data-autofocus onClick={() => { onConfirm(); onClose() }}>{confirmLabel}</button>
        </>
      }
    >
      <p className="muted">{body}</p>
    </Modal>
  )
}
