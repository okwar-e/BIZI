import { useEffect, useRef, useState } from 'react'

const settings = { goalKey: 'balanced', budgetMax: null, budgetCurrency: null, deliverableScope: null, targetFollowers: null }
function template(name, context) {
  switch (name) {
    case 'create_campaign': return { nicheText: '', targetAudience: null, preferredPlatforms: null, location: null, campaignGoal: null, settings }
    case 'update_campaign_settings': return { campaignId: context.campaignId || 0, settings }
    case 'generate_recommendations': return { campaignId: context.campaignId || 0 }
    case 'update_creator_profile': return { niche: '', audienceDescription: '', platforms: '', location: null }
    default: return { selfReportedEngagement: 0, followerCount: 0 }
  }
}
const label = name => name.replaceAll('_', ' ')
const fieldLabels = { campaignId: 'Campaign number', nicheText: 'Campaign niche / brief', targetAudience: 'Target audience', preferredPlatforms: 'Preferred platforms', location: 'Location (optional)', campaignGoal: 'Campaign objective', goalKey: 'Ranking goal', budgetMax: 'Maximum budget', budgetCurrency: 'Currency code', deliverableScope: 'Deliverable scope', targetFollowers: 'Target follower count', niche: 'Your niche', audienceDescription: 'Your audience', platforms: 'Your platforms', selfReportedEngagement: 'Self-reported engagement (%)', followerCount: 'Follower count' }
const numbers = new Set(['campaignId', 'budgetMax', 'targetFollowers', 'selfReportedEngagement', 'followerCount'])
function ActionFields({ value, onChange, disabled }) {
  return <div className="form-grid">{Object.entries(value).map(([key, item]) => key === 'settings' ? <fieldset className="settings-fields" key={key}><legend>Ranking settings</legend><ActionFields value={item} onChange={next => onChange({ ...value, settings: next })} disabled={disabled} /></fieldset> : <label className="field" key={key}><span>{fieldLabels[key] || label(key)}</span>{key === 'goalKey' ? <select value={item || 'balanced'} onChange={e => onChange({ ...value, [key]: e.target.value })} disabled={disabled}>{['balanced', 'awareness', 'engagement', 'conversion'].map(goal => <option key={goal}>{goal}</option>)}</select> : <input type={numbers.has(key) ? 'number' : 'text'} min={numbers.has(key) ? 0 : undefined} step={key === 'selfReportedEngagement' || key === 'budgetMax' ? 'any' : '1'} value={item ?? ''} disabled={disabled} maxLength={key === 'budgetCurrency' ? 3 : 2000} onChange={e => onChange({ ...value, [key]: numbers.has(key) ? e.target.value === '' ? null : Number(e.target.value) : key === 'budgetCurrency' ? e.target.value.toUpperCase() || null : e.target.value || null })} />}</label>)}</div>
}
function PreviewFields({ value }) {
  return <dl className="preview-fields">{Object.entries(value).map(([key, item]) => <div key={key}><dt>{fieldLabels[key] || label(key)}</dt><dd>{item && typeof item === 'object' ? <PreviewFields value={item} /> : item == null ? 'Not specified' : String(item)}</dd></div>)}</dl>
}
export default function BiziAssistant({ api, role, context = {}, onExecuted }) {
  const [question, setQuestion] = useState(''), [result, setResult] = useState(null), [status, setStatus] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [proposal, setProposal] = useState(null), [action, setAction] = useState(''), [actionArgs, setActionArgs] = useState({}), [completed, setCompleted] = useState(null)
  const pending = useRef(null), alive = useRef(false), inFlight = useRef(false)
  const campaignId = context.campaignId, runId = context.runId
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
    request('/assistant/chat', { question: question.trim(), context: { ...(campaignId ? { campaignId } : {}), ...(runId ? { runId } : {}) } }, data => { setResult(data); if (data.proposal) setProposal(data.proposal) })
  }
  function prepare(event) {
    event.preventDefault()
    request('/assistant/proposals', { action, arguments: actionArgs }, data => { setProposal(data); setCompleted(null) })
  }
  function finish() {
    request(`/assistant/proposals/${proposal.proposalId}/confirm`, { confirm: true }, data => { setCompleted(data); setProposal(null); onExecuted(data) })
  }
  return <section className="panel bizi-assistant" aria-label="Bizi assistant"><div className="section-head"><div><p className="eyebrow">BIZI ASSISTANT · {role.toUpperCase()}</p><h2>Understand the evidence. Get things done.</h2></div><span className="badge">{status?.chatConfigured ? 'Live RAG configured' : 'Local evidence mode'}</span></div><p className="muted small">Ask about your account, profile, campaigns or recommendation scoring. Changes always need your review and confirmation. {campaignId ? `Current campaign: ${campaignId}.` : ''}</p>
    <form onSubmit={ask}><label className="field"><span>Your question or request</span><textarea value={question} onChange={e => setQuestion(e.target.value)} maxLength={2000} required disabled={busy} placeholder={role === 'business' ? 'Explain the scoring, or help me create a fitness campaign…' : 'Help me complete my profile, or update my follower count…'} /></label><button className="primary" disabled={busy || !question.trim()}>{busy ? 'Working…' : 'Ask Bizi'}</button></form>
    {error && <p className="notice error" role="alert">{error}</p>}
    {result && <div className="assistant-result"><p className="small muted">{label(result.mode)} · {label(result.retrievalMode)} · No changes executed by this answer</p><p className="answer-text">{result.answer}</p>{result.notice && <p className="notice">{result.notice}</p>}{result.citations.map(source => <details key={source.id}><summary>{source.title || source.id}</summary><p className="small">Source: {source.id}</p><p className="answer-text">{source.text}</p></details>)}</div>}
    {proposal && <section className="action-preview" aria-label="Review proposed change"><h3>Review: {label(proposal.action)}</h3><p className="small">Nothing has changed yet. This preview expires at {new Date(proposal.expiresAt).toLocaleTimeString()}.</p><PreviewFields value={proposal.arguments} /><div className="form-actions"><button className="primary" disabled={busy} onClick={finish}>Confirm this change</button><button disabled={busy} onClick={() => request(`/assistant/proposals/${proposal.proposalId}/cancel`, {}, () => setProposal(null))}>Cancel</button></div></section>}
    {completed && <div className="notice" role="status"><strong>{completed.message}</strong>{completed.campaignId && <p>Campaign {completed.campaignId}{completed.runId ? ` · Run ${completed.runId}` : ''}</p>}{completed.recommendations && <ul>{completed.recommendations.map(r => <li key={r.profileId}>{r.publicHandle || `Creator ${r.profileId}`}: suitability {r.suitabilityScore}/100 · evidence {r.evidenceCoverage}%</li>)}</ul>}</div>}
    <details className="action-builder"><summary>Prepare an app action directly</summary><p className="small muted">Fill in the fields, review the preview, and confirm when ready. Leave unknown optional values empty.</p><form onSubmit={prepare}><label className="field"><span>Action</span><select value={action} disabled={busy} onChange={e => { setAction(e.target.value); setActionArgs(template(e.target.value, context)) }}><option value="">Choose an action</option>{status?.actions.map(item => <option value={item.name} key={item.name}>{label(item.name)}</option>)}</select></label>{action && <ActionFields value={actionArgs} onChange={setActionArgs} disabled={busy} />}<button disabled={busy || !action}>Prepare preview</button></form></details>
  </section>
}
