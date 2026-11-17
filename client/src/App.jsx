import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createApi } from './api'
import { dashboardPathForRole, sessionRoles } from './authSession'
import { estimatedOffer, formatMoney } from './campaignBudget'
import AuthPanel from './AuthPanel'
import FloatingAssistant from './FloatingAssistant'
import Methodology from './Methodology'
import CreatorWorkspace from './CreatorWorkspace'
import MlRecommendations from './MlRecommendations'
import './App.css'

const BASE_URL = import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? 'http://localhost:5000' : '')
const SESSION_STORAGE_KEY = 'bizi.session'
const errorMessage = error => error.message || 'Something went wrong. Please try again.'

function readStoredSession() {
  try {
    const serialized = window.localStorage.getItem(SESSION_STORAGE_KEY)
    if (!serialized) return { token: null, error: '' }
    const saved = JSON.parse(serialized)
    if (typeof saved?.token !== 'string' || !saved.token) {
      return { token: null, error: 'The saved session is invalid. Please sign in again.' }
    }
    return { token: saved.token, error: '' }
  } catch {
    return { token: null, error: 'The saved session could not be read. Please sign in again.' }
  }
}

function Field({ label, hint, as: Control = 'input', ...props }) {
  const hintId = hint && props.name ? `${props.name}-hint` : undefined
  return <label className="field">
    <span>{label}{props.required && <span className="small muted"> (required)</span>}</span>
    <Control {...props} aria-describedby={hintId} />
    {hint && <span className="small muted" id={hintId}>{hint}</span>}
  </label>
}

function Notice({ children, error = false }) {
  return children ? <p className={`notice ${error ? 'error' : ''}`} role={error ? 'alert' : 'status'}>{children}</p> : null
}

function NewCampaign({ api, onCreated, onCancel }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [totalBudget, setTotalBudget] = useState('')
  const [currency, setCurrency] = useState('KES')
  const [targetCreatorCount, setTargetCreatorCount] = useState('1')
  const offerEstimate = estimatedOffer(totalBudget, targetCreatorCount)

  function campaignError(reason) {
    const message = errorMessage(reason)
    if (message === 'nicheText is required') return 'Add a short description of what you are promoting.'
    if (message.startsWith('totalBudget must')) return 'Enter a total budget of at least 0.01, with no more than 2 decimal places.'
    if (message.startsWith('targetCreatorCount must')) return 'Enter a whole number between 1 and 10,000 creators.'
    return message
  }

  async function submit(event) {
    event.preventDefault()
    if (busy) return
    const form = new FormData(event.currentTarget)
    const body = Object.fromEntries(['nicheText', 'targetAudience', 'preferredPlatforms', 'campaignGoal', 'campaignLocation', 'targetMarket']
      .map(key => [key, String(form.get(key) || '').trim()]))
    body.matchPhysicalLocation = form.get('matchPhysicalLocation') === 'on'
    body.matchAudienceMarket = form.get('matchAudienceMarket') === 'on'
    Object.assign(body, { totalBudget: Number(totalBudget), currency, targetCreatorCount: Number(targetCreatorCount) })
    setBusy(true)
    setError('')
    try {
      const created = await api('/campaigns', { body })
      onCreated(created.campaignId)
    } catch (reason) {
      setError(campaignError(reason))
    } finally {
      setBusy(false)
    }
  }

  return <section className="panel">
    <div className="section-head"><h2>Create a promotion</h2><button type="button" onClick={onCancel}>Close</button></div>
    <form onSubmit={submit}>
      <div>
        <h3>Promotion details</h3>
        <p className="small muted">Share what you are promoting and the kind of content it relates to. A clear description helps Bizi compare your campaign with creator profiles.</p>
        <Field as="textarea" label="Promotion or collaboration description" name="nicheText" required maxLength={2000} rows={3}
          hint="For example, describe your product or service and its content category." />
        <Field label="Who do you want to reach? (optional)" name="targetAudience" maxLength={2000}
          hint="Describe the people you hope will see this promotion." />
        <div className="form-grid">
          <Field label="Preferred platforms (optional)" name="preferredPlatforms" maxLength={255} placeholder="Instagram, TikTok"
            hint="Separate platform names with commas." />
        </div>
        <h3>Geographic suitability (optional)</h3>
        <p className="small muted">These are independent suitability signals, not hard filters or part of the trained ML relevance score. Place-name matching does not calculate physical distance.</p>
        <div className="form-grid">
          <Field label="Campaign location" name="campaignLocation" maxLength={255}
            hint="The named place where an in-person activation takes place." />
          <Field label="Target market" name="targetMarket" maxLength={255}
            hint="The named geographic market you want to reach. Use the same area label creators may report." />
        </div>
        <label className="field"><span><input type="checkbox" name="matchPhysicalLocation" /> Consider creator base-location alignment</span></label>
        <label className="field"><span><input type="checkbox" name="matchAudienceMarket" /> Consider audience-market alignment</span></label>
        <Field label="What do you want this promotion to achieve? (optional)" name="campaignGoal" maxLength={2000} />
      </div>
      <hr />
      <div>
        <h3>Budget and creators</h3>
        <p className="small muted">Set the total amount available and how many creators you hope to work with.</p>
        <div className="form-grid">
          <Field label="Total campaign budget" type="number" min="0.01" max="999999999999.99" step="0.01" required value={totalBudget} onChange={event => setTotalBudget(event.target.value)}
            hint="Enter an amount greater than zero." />
          <label className="field"><span>Currency</span><select value={currency} onChange={event => setCurrency(event.target.value)}><option value="KES">KES</option><option value="USD">USD</option><option value="EUR">EUR</option><option value="GBP">GBP</option></select></label>
          <Field label="How many creators do you need?" type="number" min="1" max="10000" step="1" required value={targetCreatorCount} onChange={event => setTargetCreatorCount(event.target.value)}
            hint="Enter a whole number from 1 to 10,000." />
        </div>
      </div>
      <p className="small muted">Estimated starting offer per creator: <strong>{formatMoney(offerEstimate, currency)}</strong>. This is based on your budget, not a creator's market rate.</p>
      <Notice error>{error}</Notice>
      <button className="primary" disabled={busy}>{busy ? 'Creating…' : 'Create promotion'}</button>
    </form>
  </section>
}

function BusinessWorkspace({ api, preferredCampaignId, onContext }) {
  const [campaigns, setCampaigns] = useState([])
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const createdId = useRef(preferredCampaignId || null)

  useEffect(() => {
    const controller = new AbortController()
    api('/campaigns', { signal: controller.signal }).then(rows => {
      if (controller.signal.aborted) return
      setCampaigns(rows)
      const preferred = createdId.current
      setSelected(old => preferred || (rows.some(c => c.campaignId === old) ? old : rows[0]?.campaignId || null))
      createdId.current = null
    }).catch(reason => {
      if (!controller.signal.aborted) setError(errorMessage(reason))
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false)
    })
    return () => controller.abort()
  }, [api, refresh])

  useEffect(() => {
    onContext(selected ? { campaignId: selected } : {})
  }, [selected, onContext])

  const campaign = campaigns.find(item => item.campaignId === selected)
  return <main className="dashboard">
    <aside className="sidebar">
      <p className="eyebrow">BUSINESS WORKSPACE</p>
      <h2>Promotions</h2>
      <button className="primary" onClick={() => setCreating(true)}>+ New promotion</button>
      <Notice error>{error}</Notice>
      {error && <button onClick={() => { setLoading(true); setError(''); setRefresh(value => value + 1) }}>Retry</button>}
      {loading && <p role="status" className="muted">Loading campaigns…</p>}
      <nav aria-label="Campaign selection">{campaigns.map(item => <button key={item.campaignId}
        className={`campaign-option ${item.campaignId === selected ? 'selected' : ''}`}
        aria-current={item.campaignId === selected ? 'page' : undefined}
        onClick={() => { setSelected(item.campaignId); setCreating(false) }}>
        <strong>{item.nicheText}</strong><span>{item.preferredPlatforms || 'Platforms open'} · #{item.campaignId}</span>
      </button>)}</nav>
    </aside>
    <div className="main-content">
      {creating ? <NewCampaign api={api} onCancel={() => setCreating(false)} onCreated={id => {
        createdId.current = id
        setCreating(false)
        setLoading(true)
        setRefresh(value => value + 1)
      }} /> : campaign ? <MlRecommendations key={campaign.campaignId} campaign={campaign} api={api} /> : !loading && !error ? <section className="panel empty">
        <p className="eyebrow">PROMOTIONS</p><h1>Create a promotion or collaboration brief</h1>
        <p>Tell us what you are promoting, who you hope to reach, and your budget. You can then review creator suggestions and open the promotion to creators.</p>
        <button className="primary" onClick={() => setCreating(true)}>Create promotion</button>
      </section> : <div className="panel empty" role="status">Campaign workspace loading…</div>}
    </div>
  </main>
}

export default function App() {
  const navigate = useNavigate()
  const navigateRef = useRef(navigate)
  const [storedSession] = useState(readStoredSession)
  const [session, setSession] = useState(null)
  const [authReady, setAuthReady] = useState(() => !storedSession.token)
  const [authError, setAuthError] = useState(storedSession.error)
  const [authChange, setAuthChange] = useState(0)
  const [context, setContext] = useState({})
  const [revision, setRevision] = useState(0)
  const [lastAction, setLastAction] = useState({})
  const onContext = useCallback(value => setContext(value), [])
  const clearSession = useCallback(() => {
    setAuthChange(value => value + 1)
    window.localStorage.removeItem(SESSION_STORAGE_KEY)
    setSession(null)
    setAuthReady(true)
    setContext({})
    setLastAction({})
    navigate('/')
  }, [navigate])
  const api = useMemo(() => createApi({ baseUrl: BASE_URL, token: session?.token, onUnauthorized: clearSession }), [session?.token, clearSession])

  useEffect(() => {
    navigateRef.current = navigate
  }, [navigate])

  useEffect(() => {
    let active = true
    if (authChange > 0) return () => { active = false }
    if (storedSession.error) {
      window.localStorage.removeItem(SESSION_STORAGE_KEY)
      return () => { active = false }
    }
    if (!storedSession.token) return () => { active = false }

    const restoreSession = async () => {
      try {
        const identity = await createApi({ baseUrl: BASE_URL, token: storedSession.token })('/auth/session')
        if (!active) return
        if (!sessionRoles.includes(identity.role) || !Number.isInteger(identity.userId)) {
          window.localStorage.removeItem(SESSION_STORAGE_KEY)
          setAuthError('The saved session is invalid. Please sign in again.')
          return
        }
        const restored = { token: storedSession.token, userId: identity.userId, role: identity.role }
        window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(restored))
        setSession(restored)
        navigateRef.current(dashboardPathForRole(identity.role))
      } catch (error) {
        if (!active) return
        if (error.status === 401) {
          window.localStorage.removeItem(SESSION_STORAGE_KEY)
        } else {
          setAuthError(`Could not restore your saved session: ${errorMessage(error)}`)
        }
      } finally {
        if (active) setAuthReady(true)
      }
    }
    restoreSession()

    return () => { active = false }
  }, [authChange, storedSession])

  const completeLogin = useCallback(value => {
    setAuthChange(current => current + 1)
    const dashboardPath = dashboardPathForRole(value.role)
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(value))
    setAuthError('')
    setSession(value)
    setAuthReady(true)
    navigate(dashboardPath)
  }, [navigate])

  function executed(result) {
    setLastAction(result)
    setRevision(value => value + 1)
    if (result.campaignId) setContext({ campaignId: result.campaignId })
  }

  return <>
    <header className="app-header">
      <a className="brand" href="#">bizi<span>.</span></a>
      <span className="header-label">Creator marketplace and ML recommendations</span>
      {session && <button onClick={clearSession}>Sign out</button>}
    </header>
    {session && lastAction.message && <p className="notice action-success" role="status">{lastAction.message}</p>}
    {!authReady ? <main className="panel empty" role="status">Restoring your session…</main> : !session ? <>
      {authError && <p className="notice error" role="alert">{authError}</p>}
      <AuthPanel onLogin={completeLogin} />
    </> : <>
      {session.role === 'business' ? <BusinessWorkspace key={revision} api={api} preferredCampaignId={lastAction.campaignId} onContext={onContext} />
        : session.role === 'creator' ? <CreatorWorkspace key={revision} api={api} />
          : <main className="panel role-message"><h1>Admin workspace</h1><p>Administration tools are not available here.</p></main>}
      <div className="assistant-layout"><Methodology />{['business', 'creator'].includes(session.role) && <FloatingAssistant api={api} role={session.role} context={session.role === 'business' ? context : {}} onExecuted={executed} />}</div>
    </>}
    <footer>Bizi ranks available creator profiles to inform decisions; recommendations are not performance guarantees.</footer>
  </>
}
