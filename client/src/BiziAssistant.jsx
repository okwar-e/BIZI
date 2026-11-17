import { useEffect, useRef, useState } from 'react'

function template(name) {
  switch (name) {
    case 'update_creator_profile': return { niche: '', audienceDescription: '', platforms: '', location: null }
    default: return { selfReportedEngagement: 0, followerCount: 0 }
  }
}
const label = name => name.replaceAll('_', ' ')
const displayAnswer = answer => String(answer || '').replace(/\s*\[[A-Za-z][\w-]*:[^\]]+\]/g, '').trim()
const actionLabels = { update_creator_profile: 'Update creator profile', update_creator_metrics: 'Update creator stats' }
const fieldLabels = { niche: 'Your niche', audienceDescription: 'Your audience', platforms: 'Your platforms', location: 'Location (optional)', selfReportedEngagement: 'Self-reported engagement (%)', followerCount: 'Follower count' }
const numbers = new Set(['selfReportedEngagement', 'followerCount'])
function ActionFields({ value, onChange, disabled }) {
  return <div className="form-grid">{Object.entries(value).map(([key, item]) => key === 'settings' ? <fieldset className="settings-fields" key={key}><legend>Ranking settings</legend><ActionFields value={item} onChange={next => onChange({ ...value, settings: next })} disabled={disabled} /></fieldset> : <label className="field" key={key}><span>{fieldLabels[key] || label(key)}</span>{key === 'goalKey' ? <select value={item || 'balanced'} onChange={e => onChange({ ...value, [key]: e.target.value })} disabled={disabled}>{['balanced', 'awareness', 'engagement', 'conversion'].map(goal => <option key={goal}>{goal}</option>)}</select> : <input type={numbers.has(key) ? 'number' : 'text'} min={numbers.has(key) ? 0 : undefined} step={key === 'selfReportedEngagement' || key === 'budgetMax' ? 'any' : '1'} value={item ?? ''} disabled={disabled} maxLength={key === 'budgetCurrency' ? 3 : 2000} onChange={e => onChange({ ...value, [key]: numbers.has(key) ? e.target.value === '' ? null : Number(e.target.value) : key === 'budgetCurrency' ? e.target.value.toUpperCase() || null : e.target.value || null })} />}</label>)}</div>
}
function PreviewFields({ value }) {
  return <dl className="preview-fields">{Object.entries(value).map(([key, item]) => <div key={key}><dt>{fieldLabels[key] || label(key)}</dt><dd>{item && typeof item === 'object' ? <PreviewFields value={item} /> : item == null ? 'Not specified' : String(item)}</dd></div>)}</dl>
}
export default function BiziAssistant({ api, role, context = {}, onExecuted }) {
  const [question, setQuestion] = useState(''), [result, setResult] = useState(null), [status, setStatus] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [proposal, setProposal] = useState(null), [action, setAction] = useState(''), [actionArgs, setActionArgs] = useState({}), [completed, setCompleted] = useState(null)
  const pending = useRef(null), alive = useRef(false), inFlight = useRef(false)
  const campaignId = context.campaignId
  useEffect(() => {
    alive.current = true; const controller = new AbortController()
    api('/assistant/status', { signal: controller.signal }).then(data => { if (!controller.signal.aborted) setStatus(data) }).catch(e => { if (!controller.signal.aborted) setError(e.message) })
    return () => { alive.current = false; controller.abort(); pending.current?.abort() }
  }, [api])
  async function request(path, body, receive) {
    if (inFlight.current) return
    inFlight.current = true; setBusy(true); setError(''); const controller = new AbortController(); pending.current = controller
    try { const data = await api(path, { body, signal: controller.signal }); if (alive.current && !controller.signal.aborted) receive(data) }
    catch (e) { if (alive.current && !controller.signal.aborted) setError(e.message) }
    finally { inFlight.current = false; if (alive.current && !controller.signal.aborted) setBusy(false) }
  }
  function ask(event) {
    event.preventDefault(); if (!question.trim()) return
    setResult(null); setCompleted(null)
    request('/assistant/chat', { question: question.trim(), context: { ...(campaignId ? { campaignId } : {}) } }, data => { setResult(data); if (data.proposal) setProposal(data.proposal) })
  }
  function prepare(event) {
    event.preventDefault()
    request('/assistant/proposals', { action, arguments: actionArgs }, data => { setProposal(data); setCompleted(null) })
  }
  function finish() {
    request(`/assistant/proposals/${proposal.proposalId}/confirm`, { confirm: true }, data => { setCompleted(data); setProposal(null); onExecuted(data) })
  }
  return <section className="panel bizi-assistant" aria-label="Bizi assistant"><div className="section-head"><div><p className="eyebrow">BIZI ASSISTANT · {role.toUpperCase()}</p><h2>Understand your Bizi information</h2></div><span className="badge">{status?.chatConfigured ? 'AI answers available' : 'Basic answers only'}</span></div><p className="muted small">{role === 'business' ? 'Ask about your promotions or creator suggestions. This assistant can explain available information, but it cannot create promotions or send invitations.' : 'Ask about your account, creator profile or campaigns.'} {campaignId ? `Current promotion: ${campaignId}.` : ''}</p>
    <form onSubmit={ask}><label className="field"><span>Your question</span><textarea value={question} onChange={e => setQuestion(e.target.value)} maxLength={2000} required disabled={busy} placeholder={role === 'business' ? 'How does the match score help me compare creators?' : 'How can I update my profile or follower count?'} /></label><button className="primary" disabled={busy || !question.trim()}>{busy ? 'Working…' : 'Ask Bizi'}</button></form>
    {error && <p className="notice error" role="alert">{error}</p>}
    {result && <div className="assistant-result"><p className="small muted">{result.mode === 'grounded_extracts' ? 'Answer unavailable' : 'This answer does not change your account or promotion.'}</p><p className="answer-text">{result.mode === 'grounded_extracts' ? `I couldn’t prepare a plain-language answer just now. ${role === 'business' ? 'Try asking again, or review the promotion details and creator suggestions in this workspace.' : 'Try asking again, or review your profile and campaign pages.'}` : displayAnswer(result.answer)}</p></div>}
    {proposal && <section className="action-preview" aria-label="Review proposed change"><h3>Review: {label(proposal.action)}</h3><p className="small">Nothing has changed yet. This preview expires at {new Date(proposal.expiresAt).toLocaleTimeString()}.</p><PreviewFields value={proposal.arguments} /><div className="form-actions"><button className="primary" disabled={busy} onClick={finish}>Confirm this change</button><button disabled={busy} onClick={() => request(`/assistant/proposals/${proposal.proposalId}/cancel`, {}, () => setProposal(null))}>Cancel</button></div></section>}
    {completed && <div className="notice" role="status"><strong>{completed.message}</strong></div>}
    {status?.actions?.length > 0 && <details className="action-builder"><summary>Prepare a profile update</summary><p className="small muted">Fill in the fields, review the preview, and confirm when ready. Profile metrics remain self-reported.</p><form onSubmit={prepare}><label className="field"><span>Action</span><select value={action} disabled={busy} onChange={e => { setAction(e.target.value); setActionArgs(template(e.target.value)) }}><option value="">Choose an action</option>{status.actions.map(item => <option value={item.name} key={item.name}>{actionLabels[item.name] || label(item.name)}</option>)}</select></label>{action && <ActionFields value={actionArgs} onChange={setActionArgs} disabled={busy} />}<button disabled={busy || !action}>Prepare preview</button></form></details>}
  </section>
}
