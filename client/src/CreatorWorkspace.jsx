import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { formatMoney } from './campaignBudget'
import './CreatorWorkspace.css'

const navItems = [
  ['Overview', '/creator/dashboard'], ['My Profile', '/creator/profile'],
  ['Discover Campaigns', '/creator/campaigns'], ['Applications', '/creator/applications'],
  ['Invitations', '/creator/invitations'], ['Active Collaborations', '/creator/collaborations'],
  ['Messages', '/creator/messages'], ['Analytics', '/creator/analytics'],
]
const errorText = error => error.message || 'Something went wrong. Please try again.'

function useLoad(api, path) {
  const [state, setState] = useState({ loading: true, data: null, error: '' })
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    api(path, { signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) setState({ loading: false, data, error: '' })
    }).catch(error => {
      if (!controller.signal.aborted) setState({ loading: false, data: null, error: errorText(error) })
    })
    return () => controller.abort()
  }, [api, path, refresh])
  return { ...state, reload: () => setRefresh(value => value + 1) }
}

function Notice({ children, error = false }) {
  return children ? <p className={`notice ${error ? 'error' : ''}`} role={error ? 'alert' : 'status'}>{children}</p> : null
}

function CreatorOverview({ api }) {
  const { data: profile, loading: profileLoading } = useLoad(api, '/creator/profile')
  const { data: overview, loading: overviewLoading, error } = useLoad(api, '/creator/overview')
  return <section className="creator-page"><p className="eyebrow">CREATOR OVERVIEW</p><h1>Welcome to your creator workspace</h1>
    {(profileLoading || overviewLoading) && <p role="status">Loading your overview…</p>}
    {!profileLoading && profile && <>
      <p className="creator-progress">Profile completion: <strong>{profile.profileCompletion}%</strong></p>
      {profile.profileCompletion < 100 && <p className="muted">Complete your profile so businesses have current information when reviewing applications and invitations.</p>}
    </>}
    {overview && <div className="creator-stat-grid">
        <Link to="/creator/campaigns"><strong>{overview.openCampaigns}</strong><span>Open campaigns</span></Link>
        <Link to="/creator/applications"><strong>{overview.pendingApplications}</strong><span>Pending applications</span></Link>
        <Link to="/creator/invitations"><strong>{overview.pendingInvitations}</strong><span>Pending invitations</span></Link>
        <div><strong>Coming soon</strong><span>Active collaborations</span></div>
      </div>}
    {error && <Notice error>{error}</Notice>}
    <div className="creator-quick-links">{navItems.slice(1, 5).map(([label, to]) => <Link className="creator-quick-link" key={to} to={to}>{label}</Link>)}</div>
  </section>
}

function CreatorProfileEditor({ api, data }) {
  const [fields, setFields] = useState(() => ({ ...data, preferencesText: JSON.stringify(data.preferences || {}, null, 2) }))
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('')
  function change(key, value) { setFields(old => ({ ...old, [key]: value })); setError(''); setMessage('') }
  async function submit(event) {
    event.preventDefault()
    if (busy || !fields) return
    let preferences
    try { preferences = JSON.parse(fields.preferencesText || '{}') } catch { setError('Preferences must be valid JSON.'); return }
    if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) { setError('Preferences must be a JSON object.'); return }
    setBusy(true); setError(''); setMessage('')
    try {
      const saved = await api('/creator/profile', { method: 'PATCH', body: {
        displayName: fields.displayName, username: fields.username, bio: fields.bio || '', niche: fields.niche || '',
        audienceDescription: fields.audienceDescription || null,
        platforms: fields.platforms || null, location: fields.location || null, portfolioUrl: fields.portfolioUrl || null,
        availability: fields.availability || null, preferences,
      } })
      setFields({ ...saved, preferencesText: JSON.stringify(saved.preferences || {}, null, 2) })
      setMessage('Profile updated.')
    } catch (reason) { setError(errorText(reason)) }
    finally { setBusy(false) }
  }
  return <section className="creator-page"><p className="eyebrow">MY PROFILE</p><h1>Your creator profile</h1><p className="muted">Profile completion: {data.profileCompletion}%</p>
    <form className="creator-form" onSubmit={submit}>
      <label className="field"><span>Display name</span><input maxLength={255} required value={fields.displayName || ''} onChange={event => change('displayName', event.target.value)} /></label>
      <label className="field"><span>Username</span><input maxLength={255} required value={fields.username || ''} onChange={event => change('username', event.target.value)} /></label>
      <label className="field"><span>Bio</span><textarea maxLength={5000} rows={4} value={fields.bio || ''} onChange={event => change('bio', event.target.value)} /></label>
      <label className="field"><span>Category / niche</span><input maxLength={255} value={fields.niche || ''} onChange={event => change('niche', event.target.value)} /></label>
      <label className="field"><span>Audience description</span><textarea maxLength={2000} rows={3} value={fields.audienceDescription || ''} onChange={event => change('audienceDescription', event.target.value)} /></label>
      <label className="field"><span>Platforms</span><input maxLength={255} placeholder="Instagram, TikTok" value={fields.platforms || ''} onChange={event => change('platforms', event.target.value)} /></label>
      <label className="field"><span>Location</span><input maxLength={255} value={fields.location || ''} onChange={event => change('location', event.target.value)} /></label>
      <label className="field"><span>Portfolio URL</span><input type="url" maxLength={2048} value={fields.portfolioUrl || ''} onChange={event => change('portfolioUrl', event.target.value)} /></label>
      <label className="field"><span>Availability</span><select value={fields.availability || ''} onChange={event => change('availability', event.target.value)}><option value="">Not specified</option><option value="available">Available</option><option value="limited">Limited</option><option value="unavailable">Unavailable</option></select></label>
      <label className="field creator-preferences"><span>Preferences (JSON)</span><textarea rows={4} value={fields.preferencesText} onChange={event => change('preferencesText', event.target.value)} /></label>
      {(data.followerCount != null || data.selfReportedEngagement != null) && <p className="muted small">Existing self-reported metrics: {data.followerCount != null ? `${Number(data.followerCount).toLocaleString()} followers` : 'follower count not provided'}{data.selfReportedEngagement != null ? ` · ${data.selfReportedEngagement}% engagement` : ''}. These are not verified platform analytics.</p>}
      <p className="muted small">This profile form does not create or verify audience metrics.</p>
      <Notice error>{error}</Notice><Notice>{message}</Notice><button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</button>
    </form>
  </section>
}

function CreatorProfile({ api }) {
  const { data, loading, error, reload } = useLoad(api, '/creator/profile')
  if (loading) return <p role="status">Loading your profile…</p>
  if (error) return <div className="creator-page"><Notice error>{error}</Notice><button onClick={reload}>Retry</button></div>
  return <CreatorProfileEditor key={data.username} api={api} data={data} />
}

function CampaignList({ api }) {
  const [filters, setFilters] = useState({ category: '', platform: '', location: '', objective: '' })
  const [applied, setApplied] = useState(filters)
  const query = new URLSearchParams(Object.entries(applied).filter(([, value]) => value.trim()).map(([key, value]) => [key, value.trim()])).toString()
  const { data: campaigns, loading, error, reload } = useLoad(api, `/creator/campaigns${query ? `?${query}` : ''}`)
  return <section className="creator-page"><p className="eyebrow">DISCOVER</p><h1>Open campaigns</h1>
    <form className="creator-filter-form" onSubmit={event => { event.preventDefault(); setApplied(filters) }}>
      <label className="field"><span>Category</span><input value={filters.category} onChange={event => setFilters(old => ({ ...old, category: event.target.value }))} /></label>
      <label className="field"><span>Platform</span><input value={filters.platform} onChange={event => setFilters(old => ({ ...old, platform: event.target.value }))} /></label>
      <label className="field"><span>Location</span><input value={filters.location} onChange={event => setFilters(old => ({ ...old, location: event.target.value }))} /></label>
      <label className="field"><span>Objective</span><input value={filters.objective} onChange={event => setFilters(old => ({ ...old, objective: event.target.value }))} /></label>
      <button>Filter campaigns</button>
    </form>
    {loading && <p role="status">Loading open campaigns…</p>}{error && <><Notice error>{error}</Notice><button onClick={reload}>Retry</button></>}
    {!loading && !error && !campaigns?.length && <div className="creator-empty"><h2>No open campaigns yet</h2><p className="muted">Campaigns appear here when a business publishes them.</p></div>}
    <div className="creator-campaign-list">{campaigns?.map(campaign => <article className="creator-campaign-row" key={campaign.campaignId}>
      <div><h2>{campaign.nicheText}</h2><p>{campaign.businessName}{campaign.industry ? ` · ${campaign.industry}` : ''}</p><p className="muted small">{campaign.campaignGoal || 'Objective not specified'} · {campaign.preferredPlatforms || 'Platform not specified'} · {campaign.location || 'Location not specified'}</p>{campaign.budgetRange && <p className="muted small">Budget range: {campaign.budgetRange}</p>}{campaign.applicationStatus && <span className="badge">Application: {campaign.applicationStatus}</span>}</div>
      <Link className="button-link" to={`/creator/campaigns/${campaign.campaignId}`}>View campaign</Link>
    </article>)}</div>
  </section>
}

function CampaignDetail({ api, campaignId }) {
  const { data: campaign, loading, error, reload } = useLoad(api, `/creator/campaigns/${campaignId}`)
  const [message, setMessage] = useState(''), [busy, setBusy] = useState(false), [feedback, setFeedback] = useState(''), [failure, setFailure] = useState('')
  async function apply() {
    if (busy) return
    setBusy(true); setFailure(''); setFeedback('')
    try { await api(`/creator/campaigns/${campaignId}/apply`, { body: { message } }); setFeedback('Application submitted.'); reload() }
    catch (reason) { setFailure(errorText(reason)) }
    finally { setBusy(false) }
  }
  if (loading) return <p role="status">Loading campaign…</p>
  if (error) return <section className="creator-page"><Notice error>{error}</Notice><Link to="/creator/campaigns">Back to campaigns</Link></section>
  return <section className="creator-page"><Link to="/creator/campaigns">Back to campaigns</Link><p className="eyebrow">CAMPAIGN DETAILS</p><h1>{campaign.nicheText}</h1>
    <p><strong>{campaign.businessName}</strong>{campaign.industry ? ` · ${campaign.industry}` : ''}</p>
    {campaign.industry && <p><strong>Category:</strong> {campaign.industry}</p>}
    {campaign.targetAudience && <p><strong>Target audience:</strong> {campaign.targetAudience}</p>}{campaign.campaignGoal && <p><strong>Objective:</strong> {campaign.campaignGoal}</p>}
    {campaign.budgetRange && <p><strong>Budget range:</strong> {campaign.budgetRange}</p>}<p className="muted">{campaign.preferredPlatforms || 'Platform not specified'} · {campaign.location || 'Location not specified'}</p>
    {campaign.applicationStatus ? <p className="notice">Application status: {campaign.applicationStatus}{campaign.applicationCreatedAt ? ` · Applied ${new Date(campaign.applicationCreatedAt).toLocaleDateString()}` : ''}</p> : <>
      <label className="field"><span>Application message (optional)</span><textarea maxLength={2000} rows={4} value={message} onChange={event => setMessage(event.target.value)} /></label>
      <Notice error>{failure}</Notice><Notice>{feedback}</Notice><button className="primary" disabled={busy} onClick={apply}>{busy ? 'Submitting…' : 'Apply to campaign'}</button>
    </>}
  </section>
}

function RecordList({ api, kind }) {
  const { data, loading, error, reload } = useLoad(api, `/creator/${kind}`)
  const [busy, setBusy] = useState(null), [failure, setFailure] = useState('')
  async function respond(id, action) {
    setBusy(id); setFailure('')
    try { await api(`/creator/invitations/${id}/${action}`, { body: {} }); reload() }
    catch (reason) { setFailure(errorText(reason)) }
    finally { setBusy(null) }
  }
  async function withdraw(applicationId) {
    setBusy(applicationId); setFailure('')
    try { await api(`/creator/applications/${applicationId}/withdraw`, { body: {} }); reload() }
    catch (reason) { setFailure(errorText(reason)) }
    finally { setBusy(null) }
  }
  if (loading) return <p role="status">Loading {kind}…</p>
  if (error) return <><Notice error>{error}</Notice><button onClick={reload}>Retry</button></>
  if (!data?.length) return <div className="creator-empty"><h2>No {kind} yet</h2><p className="muted">New {kind} will appear here when available.</p></div>
  return <div className="creator-record-list"><Notice error>{failure}</Notice>{data.map(item => <article className="creator-record" key={item.applicationId || item.invitationId}>
    <div><p className="eyebrow">{item.status}</p><h2>{item.nicheText}</h2><p>{item.businessName}</p><p className="muted small">{kind === 'applications' && item.createdAt ? `Applied ${new Date(item.createdAt).toLocaleDateString()}` : kind === 'invitations' && item.createdAt ? `Invited ${new Date(item.createdAt).toLocaleDateString()}` : ''}</p>{item.invitationId != null && <p><strong>Offer:</strong> {formatMoney(item.offeredAmount, item.currency)}</p>}{item.invitationId != null && <><p className="muted small">{item.targetAudience || 'Target audience not specified'}</p><p className="muted small">{item.campaignGoal || 'Objective not specified'} · {item.preferredPlatforms || 'Platforms not specified'} · {item.location || 'Location not specified'}</p>{item.budgetRange && <p className="muted small">Budget range: {item.budgetRange}</p>}</>}{item.applicationMessage && <p>{item.applicationMessage}</p>}{item.invitationMessage && <p>{item.invitationMessage}</p>}</div>
    {kind === 'invitations' && item.status === 'pending' && <div className="creator-actions"><button disabled={busy === item.invitationId} onClick={() => respond(item.invitationId, 'accept')}>Accept</button><button disabled={busy === item.invitationId} onClick={() => respond(item.invitationId, 'decline')}>Decline</button></div>}
    {kind === 'applications' && item.status === 'pending' && <div className="creator-actions"><button disabled={busy === item.applicationId} onClick={() => withdraw(item.applicationId)}>Withdraw application</button></div>}
  </article>)}</div>
}

function EmptySection({ title }) {
  return <section className="creator-page"><p className="eyebrow">CREATOR WORKSPACE</p><h1>{title}</h1><div className="creator-empty"><p className="muted">This section is not available yet. No activity or performance is being simulated.</p></div></section>
}

export default function CreatorWorkspace({ api }) {
  const location = useLocation(), navigate = useNavigate()
  useEffect(() => { if (!location.pathname.startsWith('/creator/')) navigate('/creator/dashboard', { replace: true }) }, [location.pathname, navigate])
  const campaignDetail = location.pathname.match(/^\/creator\/campaigns\/(\d+)$/)
  let page
  if (location.pathname === '/creator/profile') page = <CreatorProfile api={api} />
  else if (location.pathname === '/creator/campaigns') page = <CampaignList api={api} />
  else if (campaignDetail) page = <CampaignDetail api={api} campaignId={campaignDetail[1]} />
  else if (location.pathname === '/creator/applications') page = <section className="creator-page"><p className="eyebrow">APPLICATIONS</p><h1>Your applications</h1><RecordList api={api} kind="applications" /></section>
  else if (location.pathname === '/creator/invitations') page = <section className="creator-page"><p className="eyebrow">INVITATIONS</p><h1>Business invitations</h1><RecordList api={api} kind="invitations" /></section>
  else if (location.pathname === '/creator/collaborations') page = <EmptySection title="Active collaborations" />
  else if (location.pathname === '/creator/messages') page = <EmptySection title="Messages" />
  else if (location.pathname === '/creator/analytics') page = <EmptySection title="Analytics" />
  else page = <CreatorOverview api={api} />
  return <main className="creator-dashboard"><aside className="creator-sidebar"><p className="eyebrow">CREATOR WORKSPACE</p><h1>Bizi Creators</h1><nav aria-label="Creator navigation">
    {navItems.map(([label, to]) => <NavLink key={to} to={to} className={({ isActive }) => `creator-nav-link${isActive ? ' active' : ''}`}>{label}</NavLink>)}
  </nav></aside><div className="creator-main">{page}</div></main>
}
