import { useEffect, useRef, useState } from 'react'
import BiziAssistant from './BiziAssistant'

function Avatar() {
  return <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false"><path d="M14 13h20a7 7 0 0 1 7 7v12a7 7 0 0 1-7 7H14a7 7 0 0 1-7-7V20a7 7 0 0 1 7-7Z" fill="currentColor" /><path d="M24 7v6" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /><circle cx="24" cy="6" r="3" fill="#b8d797" /><circle cx="17" cy="25" r="3" fill="#244d3c" /><circle cx="31" cy="25" r="3" fill="#244d3c" /><path d="M18 32q6 5 12 0" stroke="#244d3c" strokeWidth="2.5" fill="none" strokeLinecap="round" /></svg>
}

export default function FloatingAssistant({ api, role, context, onExecuted }) {
  const [open, setOpen] = useState(false)
  const launcher = useRef(null), closeButton = useRef(null)
  function close() { setOpen(false); launcher.current?.focus() }
  useEffect(() => {
    if (!open) return
    closeButton.current?.focus()
    const escape = event => { if (event.key === 'Escape') { event.preventDefault(); setOpen(false); launcher.current?.focus() } }
    document.addEventListener('keydown', escape)
    return () => document.removeEventListener('keydown', escape)
  }, [open])
  return <div className="assistant-widget">
    <section id="bizi-assistant-window" className="assistant-window" role="dialog" aria-modal="false" aria-labelledby="bizi-assistant-title" hidden={!open}>
      <header className="assistant-window-header"><span className="assistant-avatar-small"><Avatar /></span><div><h2 id="bizi-assistant-title">Bizi assistant</h2><p>Answers and help with your workspace</p></div><button ref={closeButton} type="button" className="assistant-close" aria-label="Minimize Bizi assistant" onClick={close}>×</button></header>
      <div className="assistant-window-body"><BiziAssistant key={`${role}-${context?.campaignId || 0}`} api={api} role={role} context={context} onExecuted={onExecuted} /></div>
    </section>
    <button ref={launcher} className="assistant-launcher" type="button" aria-label={open ? 'Minimize Bizi assistant' : 'Open Bizi assistant'} aria-expanded={open} aria-controls="bizi-assistant-window" onClick={() => { if (open) close(); else setOpen(true) }}><Avatar /><span className="assistant-launcher-tooltip" aria-hidden="true">Ask Bizi</span></button>
  </div>
}
