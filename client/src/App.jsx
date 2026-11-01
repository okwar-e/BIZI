import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createApi } from './api'
import { createEventTracker, observeVisibleCard } from './eventTracker'
import { estimatedOffer, formatMoney } from './campaignBudget'
import AuthPanel from './AuthPanel'
import FloatingAssistant from './FloatingAssistant'
import Methodology from './Methodology'
import CreatorWorkspace from './CreatorWorkspace'
import MlRecommendations from './MlRecommendations'
import './App.css'

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'
const goalNames = { balanced: 'Balanced', awareness: 'Awareness', engagement: 'Engagement', conversion: 'Conversion' }
const emptySettings = { goalKey: 'balanced', budgetMax: '', budgetCurrency: '', deliverableScope: '', targetFollowers: '' }
const readable = value => String(value).replaceAll('_', ' ')
const errorMessage = error => error.message || 'Something went wrong. Please try again.'

function Field({ label, ...props }) { return <label className="field"><span>{label}</span><input {...props} /></label> }
function Notice({ children, error = false }) { return children ? <p className={`notice ${error ? 'error' : ''}`} role={error ? 'alert' : 'status'}>{children}</p> : null }

function NewCampaign({ api, onCreated, onCancel }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [totalBudget, setTotalBudget] = useState(''), [currency, setCurrency] = useState('KES'), [targetCreatorCount, setTargetCreatorCount] = useState('1')
  const offerEstimate = estimatedOffer(totalBudget, targetCreatorCount)
  async function submit(event) {
    event.preventDefault(); if (busy) return
    const form = new FormData(event.currentTarget)
    const body = Object.fromEntries(['nicheText', 'targetAudience', 'preferredPlatforms', 'location', 'campaignGoal'].map(key => [key, String(form.get(key) || '').trim()]))
    Object.assign(body, { totalBudget: Number(totalBudget), currency, targetCreatorCount: Number(targetCreatorCount) })
    setBusy(true); setError('')
    try { const created = await api('/campaigns', { body }); onCreated(created.campaignId) }
    catch (e) { setError(errorMessage(e)) } finally { setBusy(false) }
  }
  return <section className="panel"><div className="section-head"><h2>Create a campaign</h2><button type="button" onClick={onCancel}>Close</button></div><form onSubmit={submit}><Field label="Campaign niche / brief" name="nicheText" required maxLength={2000} /><Field label="Target audience" name="targetAudience" maxLength={2000} /><div className="form-grid"><Field label="Preferred platforms (comma separated)" name="preferredPlatforms" maxLength={255} placeholder="Instagram, TikTok" /><Field label="Creator location (optional)" name="location" maxLength={255} /></div><Field label="Campaign objective in your own words" name="campaignGoal" maxLength={2000} /><div className="form-grid"><Field label="Total campaign budget" type="number" min="0.01" max="999999999999.99" step="0.01" required value={totalBudget} onChange={event => setTotalBudget(event.target.value)} /><label className="field"><span>Currency</span><select value={currency} onChange={event => setCurrency(event.target.value)}><option value="KES">KES</option><option value="USD">USD</option><option value="EUR">EUR</option><option value="GBP">GBP</option></select></label><Field label="Number of creators needed" type="number" min="1" max="10000" step="1" required value={targetCreatorCount} onChange={event => setTargetCreatorCount(event.target.value)} /></div><p className="small muted">Estimated offer per creator: <strong>{formatMoney(offerEstimate, currency)}</strong>. This is a starting offer derived from your budget, not a creator's market rate.</p><Notice error>{error}</Notice><button className="primary" disabled={busy}>{busy ? 'Creating…' : 'Create campaign'}</button></form></section>
}

function RecommendationCard({ recommendation: r, tracker }) {
  const card = useRef(null), active = useRef(false)
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('')
  useEffect(() => {
    active.current = true
    const stop = observeVisibleCard(card.current, () => { tracker.impression(r.profileId).catch(e => { if (active.current) setError(`Activity could not be saved: ${errorMessage(e)}`) }) })
    return () => { active.current = false; stop() }
  }, [r.profileId, tracker])
  async function act(type) {
    if (busy) return
    setBusy(true); setError('')
    try { await tracker.action(r.profileId, type); if (active.current) setMessage({ click: 'Profile interest recorded.', shortlist: 'Shortlist interest recorded.', contact: 'Contact interest recorded. No message has been sent.', dismiss: 'Dismissal feedback recorded.' }[type]) }
    catch (e) { if (active.current) setError(errorMessage(e)) }
    finally { if (active.current) setBusy(false) }
  }
  return <article className="creator-card" ref={card}><div className="section-head"><div className="creator-heading"><span className="avatar" aria-hidden="true">{r.rank.toString().padStart(2, '0')}</span><div><h3>{r.publicHandle || `Creator ${r.profileId}`}</h3><p className="muted small">Rank {r.rank} · Profile {r.profileId}</p></div></div><span className={`badge ${r.priceStatus === 'price_unverified' ? 'warning' : ''}`}>{r.priceStatus === 'price_unverified' ? 'Price unverified' : 'Price verified'}</span></div>{r.dataOrigin === 'synthetic' && <p className="synthetic-note">Synthetic demo creator · populated fields are simulated, not verified evidence.</p>}{r.profileSummary && <p className="profile-facts">{r.profileSummary.niche} · {r.profileSummary.platforms} · {r.profileSummary.location}<br />Followers: {r.profileSummary.followers ?? 'unknown'} · Self-reported engagement: {r.profileSummary.selfReportedEngagement == null ? 'unknown' : `${r.profileSummary.selfReportedEngagement}%`}<br />Quote: {r.profileSummary.quote ?? 'unknown'} {r.profileSummary.currency || ''} · {r.profileSummary.scope || 'scope unknown'}<br />Field completeness: {r.fieldCompleteness}% · separate from evidence coverage</p>}<div className="score-grid"><div><span className="metric-label">Suitability</span><strong>{r.suitabilityScore}<small>/100</small></strong></div><div><span className="metric-label">Evidence coverage</span><strong>{r.evidenceCoverage}<small>%</small></strong></div></div><p className="small muted">{r.explanationText}</p><details><summary>Review evidence and uncertainty</summary><dl className="components">{Object.entries(r.components).map(([name, component]) => <div key={name}><dt>{readable(name)}</dt><dd>{Math.round(component.score * 100)} /100 · {readable(component.status)}</dd></div>)}</dl>{r.warnings.length > 0 && <ul className="warnings">{r.warnings.map((warning, i) => <li key={`${warning}-${i}`}>{readable(warning)}</li>)}</ul>}</details><div className="card-actions"><button disabled={busy} onClick={() => act('click')}>Record profile interest</button><button disabled={busy} onClick={() => act('shortlist')}>Shortlist</button><button disabled={busy} onClick={() => act('contact')}>Contact interest</button><button disabled={busy} onClick={() => act('dismiss')}>Dismiss</button></div><Notice>{message}</Notice><Notice error>{error}</Notice></article>
}

function RunCards({ run, campaignId, api }) {
  // Set up in the effect so StrictMode cleanup cannot dispose the next mount's tracker.
  const [tracker, setTracker] = useState(null)
  useEffect(() => { const value = createEventTracker({ api, campaignId, runId: run.runId }); setTracker(value); return () => value.dispose() }, [api, campaignId, run.runId])
  return <section aria-label="Creator recommendations"><div className="section-head"><div><p className="eyebrow">YOUR RECOMMENDATIONS</p><h2>{run.recommendations.length} creators to consider</h2></div><span className="badge">{goalNames[run.goal] || run.goal}</span></div><p className="muted small run-meta">{run.algorithmVersion} · Generated {new Date(run.generatedAt).toLocaleString()} · Historical snapshot</p>{run.recommendations.length === 0 ? <div className="panel empty">No eligible creators were found. Review the campaign constraints or add creator profiles.</div> : tracker && <div className="cards">{run.recommendations.map(r => <RecommendationCard key={r.profileId} recommendation={r} tracker={tracker} />)}</div>}</section>
}

export function LegacyCampaignWorkspace({ campaign, api, initialRunId, onRun }) {
  const [settings, setSettings] = useState(emptySettings), [ready, setReady] = useState(false), [busy, setBusy] = useState(''), [error, setError] = useState(''), [message, setMessage] = useState(''), [run, setRun] = useState(null), [dirty, setDirty] = useState(false)
  const mounted = useRef(false), pending = useRef(null)
  useEffect(() => {
    mounted.current = true
    const controller = new AbortController()
    api(`/recommendation-v1/${campaign.campaignId}/settings`, { signal: controller.signal }).then(value => { if (!controller.signal.aborted) { setSettings(Object.fromEntries(Object.entries(value).map(([k, v]) => [k, v ?? '']))); setReady(true) } }).catch(e => { if (!controller.signal.aborted) setError(errorMessage(e)) })
    return () => { mounted.current = false; controller.abort(); pending.current?.abort() }
  }, [api, campaign.campaignId])
  useEffect(() => {
    if (!initialRunId) return
    const controller = new AbortController()
    api(`/recommendation-v1/${campaign.campaignId}/runs/${initialRunId}`, { signal: controller.signal }).then(data => { if (!controller.signal.aborted) setRun(data) }).catch(e => { if (!controller.signal.aborted) setError(errorMessage(e)) })
    return () => controller.abort()
  }, [api, campaign.campaignId, initialRunId])
  const change = (key, value) => { setSettings(old => ({ ...old, [key]: value })); setDirty(true); setMessage('') }
  async function operate(type) {
    if (busy || !ready) return
    if (type === 'generate' && dirty) { setError('Save your ranking settings before generating.'); return }
    const controller = new AbortController(); pending.current = controller
    setBusy(type); setError(''); setMessage('')
    try {
      if (type === 'save') {
        const body = { goalKey: settings.goalKey, budgetMax: settings.budgetMax === '' ? null : Number(settings.budgetMax), targetFollowers: settings.targetFollowers === '' ? null : Number(settings.targetFollowers), budgetCurrency: settings.budgetCurrency.trim().toUpperCase() || null, deliverableScope: settings.deliverableScope.trim() || null }
        await api(`/recommendation-v1/${campaign.campaignId}/settings`, { method: 'PUT', body, signal: controller.signal })
        if (mounted.current) { setDirty(false); setMessage('Ranking settings saved. Generate a new run to use them.') }
      } else {
        const next = await api(`/recommendation-v1/${campaign.campaignId}/runs`, { body: {}, signal: controller.signal })
        if (mounted.current) { setRun(next); onRun?.(next.runId) }
      }
    } catch (e) { if (mounted.current && e.name !== 'AbortError') setError(errorMessage(e)) }
    finally { if (mounted.current) setBusy('') }
  }
  return <div className="workspace"><section className="panel"><p className="eyebrow">CAMPAIGN {campaign.campaignId}</p><h2>{campaign.nicheText}</h2><p className="muted">{campaign.targetAudience || 'Target audience not specified'}</p><p className="small muted">{campaign.preferredPlatforms || 'No platform constraint'} · {campaign.location || 'No location constraint'}</p><hr /><form onSubmit={e => { e.preventDefault(); operate('save') }}><div className="form-grid"><label className="field"><span>Ranking goal</span><select value={settings.goalKey} onChange={e => change('goalKey', e.target.value)} disabled={!ready || !!busy}>{Object.entries(goalNames).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label><Field label="Maximum budget (optional)" type="number" min="0" max="1000000000000" step="any" value={settings.budgetMax} disabled={!ready || !!busy} onChange={e => change('budgetMax', e.target.value)} /><Field label="Currency code (optional)" placeholder="KES" pattern="[A-Za-z]{3}" maxLength={3} value={settings.budgetCurrency} disabled={!ready || !!busy} onChange={e => change('budgetCurrency', e.target.value)} /><Field label="Deliverable scope (optional)" placeholder="One Instagram reel" maxLength={200} value={settings.deliverableScope} disabled={!ready || !!busy} onChange={e => change('deliverableScope', e.target.value)} /><Field label="Target follower count (optional)" type="number" min="1" max="1000000000000" step="1" value={settings.targetFollowers} disabled={!ready || !!busy} onChange={e => change('targetFollowers', e.target.value)} /></div><p className="small muted">Leave unknown values empty. Prices require matching currency and deliverables to be comparable. Missing evidence lowers suitability; it is never filled with invented metrics.</p><Notice error>{error}</Notice><Notice>{message}</Notice><div className="form-actions"><button disabled={!ready || !!busy}>{busy === 'save' ? 'Saving…' : 'Save settings'}</button><button className="primary" type="button" disabled={!ready || !!busy || dirty} onClick={() => operate('generate')}>{busy === 'generate' ? 'Finding creators…' : 'Generate recommendations'}</button></div>{!ready && !error && <p role="status">Loading campaign settings…</p>}</form></section>{run && <RunCards key={run.runId} run={run} campaignId={campaign.campaignId} api={api} />}</div>
}

function CampaignWorkspace({ campaign, api }) {
  return <MlRecommendations campaign={campaign} api={api} />
}

function BusinessWorkspace({ api, preferredCampaignId, preferredRunId, onContext }) {
  const [campaigns, setCampaigns] = useState([]), [selected, setSelected] = useState(null), [loading, setLoading] = useState(true), [error, setError] = useState(''), [creating, setCreating] = useState(false), [refresh, setRefresh] = useState(0)
  const createdId = useRef(preferredCampaignId || null)
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError('')
    api('/campaigns', { signal: controller.signal }).then(rows => {
      if (controller.signal.aborted) return
      setCampaigns(rows); setSelected(old => createdId.current || (rows.some(c => c.campaignId === old) ? old : rows[0]?.campaignId || null)); createdId.current = null
    }).catch(e => { if (!controller.signal.aborted) setError(errorMessage(e)) }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [api, refresh])
  useEffect(() => { onContext(selected ? { campaignId: selected, ...(preferredRunId && selected === preferredCampaignId ? { runId: preferredRunId } : {}) } : {}) }, [selected, onContext, preferredCampaignId, preferredRunId])
  const campaign = campaigns.find(c => c.campaignId === selected)
  return <main className="dashboard"><aside className="sidebar"><p className="eyebrow">YOUR WORKSPACE</p><h2>Campaigns</h2><button className="primary" onClick={() => setCreating(true)}>+ New campaign</button><Notice error>{error}</Notice>{error && <button onClick={() => setRefresh(x => x + 1)}>Retry</button>}{loading && <p role="status" className="muted">Loading campaigns…</p>}<nav aria-label="Campaign selection">{campaigns.map(c => <button key={c.campaignId} className={`campaign-option ${c.campaignId === selected ? 'selected' : ''}`} aria-current={c.campaignId === selected ? 'page' : undefined} onClick={() => { setSelected(c.campaignId); setCreating(false) }}><strong>{c.nicheText}</strong><span>{c.preferredPlatforms || 'Platforms open'} · #{c.campaignId}</span></button>)}</nav></aside><div className="main-content">{creating ? <NewCampaign api={api} onCancel={() => setCreating(false)} onCreated={id => { createdId.current = id; setCreating(false); setRefresh(x => x + 1) }} /> : campaign ? <CampaignWorkspace key={campaign.campaignId} campaign={campaign} api={api} /> : !loading && !error ? <section className="panel empty"><p className="eyebrow">LET’S GET STARTED</p><h1>Your next creator partnership starts here.</h1><p>Create a campaign to compare creators against your goals.</p><button className="primary" onClick={() => setCreating(true)}>Create your first campaign</button></section> : <div className="panel empty">Your campaign workspace will appear here.</div>}</div></main>
}

export default function App() {
  const navigate = useNavigate()
  const [session, setSession] = useState(null), [context, setContext] = useState({}), [revision, setRevision] = useState(0), [lastAction, setLastAction] = useState({})
  const onContext = useCallback(value => setContext(value), [])
  const api = useMemo(() => createApi({ baseUrl: BASE_URL, token: session?.token, onUnauthorized: () => setSession(null) }), [session?.token])
  function executed(result) { setLastAction(result); setRevision(value => value + 1); if (result.campaignId) setContext({ campaignId: result.campaignId, ...(result.runId ? { runId: result.runId } : {}) }) }
  return <><header className="app-header"><a className="brand" href="#">bizi<span>.</span></a><span className="header-label">Creator discovery workspace</span>{session && <button onClick={() => { setSession(null); setContext({}); setLastAction({}); navigate('/') }}>Sign out</button>}</header>{session && lastAction.message && <p className="notice action-success" role="status">{lastAction.message}</p>}{!session ? <AuthPanel onLogin={value => { setSession(value); navigate(value.role === 'creator' ? '/creator/dashboard' : '/') }} /> : <>{session.role === 'business' ? <BusinessWorkspace key={revision} api={api} preferredCampaignId={lastAction.campaignId} preferredRunId={lastAction.runId} onContext={onContext} /> : session.role === 'creator' ? <CreatorWorkspace key={revision} api={api} /> : <main className="panel role-message"><h1>Admin workspace</h1><p>Administration tools are not available here yet.</p></main>}<div className="assistant-layout"><Methodology api={api} />{['business','creator'].includes(session.role) && <FloatingAssistant api={api} role={session.role} context={session.role === 'business' ? context : {}} onExecuted={executed} />}</div></>}<footer>Built around suitability and evidence. No guaranteed outcomes or ROI predictions.</footer></>
}