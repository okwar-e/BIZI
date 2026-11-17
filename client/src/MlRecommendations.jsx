import { useEffect, useState } from 'react'
import './MlRecommendations.css'
import BusinessMarketplace from './BusinessMarketplace'
import CampaignEmptyState from './CampaignEmptyState'
import { estimatedOffer, formatMoney } from './campaignBudget'

function catalogNumber(value) {
  const number = Number(value)
  return value !== null && value !== undefined && value !== '' && Number.isFinite(number)
    ? number.toLocaleString()
    : 'Not listed'
}

function MlRecommendationCard({ recommendation }) {
  const displayName = recommendation.creator_display_name || recommendation.creator_username
  const initials = displayName.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase()
  const score = Number(recommendation.score)
  return <article className="creator-card ml-creator-card">
    <div className="recommendation-card-head">
      <span className="creator-avatar" aria-hidden="true">{initials || 'C'}</span>
      <div className="recommendation-identity">
        <h3>{displayName}</h3>
        <p>{recommendation.creator_category || 'Category not listed'}</p>
        <span className="muted small">@{recommendation.creator_username}</span>
      </div>
      {Number.isFinite(score) && <span className="recommendation-score" title="Ranking score, not a probability">Score {score.toFixed(4)}</span>}
    </div>

    <div className="recommendation-stats" aria-label="Creator statistics">
      <div><span>Followers</span><strong>{catalogNumber(recommendation.creator_followers)}</strong></div>
      <div><span>Following</span><strong>{catalogNumber(recommendation.creator_following)}</strong></div>
      <div><span>Posts</span><strong>{catalogNumber(recommendation.creator_post_count)}</strong></div>
    </div>

    <p className="recommendation-bio">{recommendation.creator_bio || 'Profile description not provided.'}</p>
    {recommendation.missing_model_metrics?.length > 0 && <p className="muted small">Some profile counts are unlisted and were treated as zero for ranking.</p>}
    {recommendation.creator_website && <a className="recommendation-link" href={recommendation.creator_website} target="_blank" rel="noreferrer">View website</a>}
    <a className="recommendation-invite" href="#invite-creator">Invite creator</a>
  </article>
}

export default function MlRecommendations({ campaign, api }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [publicationStatus, setPublicationStatus] = useState(campaign.publicationStatus || 'draft')
  const [publicationBusy, setPublicationBusy] = useState(false)
  const [publicationError, setPublicationError] = useState('')
  const [budgetRefresh, setBudgetRefresh] = useState(0)
  const [budgetCampaign, setBudgetCampaign] = useState(campaign)

  useEffect(() => {
    if (publicationStatus !== 'open') return undefined
    const controller = new AbortController()
    api(`/campaigns/${campaign.campaignId}/ml-recommendations?top_n=10`, {
      method: 'POST',
      body: {},
      signal: controller.signal,
    })
      .then(result => { if (!controller.signal.aborted) setData(result) })
      .catch(reason => { if (!controller.signal.aborted) setError(reason.message || 'Recommendations could not be loaded.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [api, campaign.campaignId, publicationStatus, refresh])

  function retry() {
    setLoading(true)
    setError('')
    setRefresh(value => value + 1)
  }

  async function togglePublication() {
    if (publicationBusy) return
    const nextStatus = publicationStatus === 'open' ? 'closed' : 'open'
    if (nextStatus === 'open') { setLoading(true); setError(''); setData(null) }
    setPublicationBusy(true)
    setPublicationError('')
    try {
      const result = await api(`/campaigns/${campaign.campaignId}/publication`, {
        method: 'PATCH', body: { publicationStatus: nextStatus },
      })
      setPublicationStatus(result.publicationStatus)
    } catch (reason) {
      setPublicationError(reason.message || 'Campaign publication could not be updated.')
    } finally { setPublicationBusy(false) }
  }

  return <div className="workspace campaign-page">
    <section className="panel ml-campaign-brief">
      <div className="campaign-brief-heading">
        <div><p className="campaign-kicker">Campaign</p><h1>{campaign.nicheText}</h1></div>
        <span className={`campaign-status ${publicationStatus === 'open' ? 'is-open' : 'is-closed'}`}>{publicationStatus === 'open' ? 'Open' : 'Closed to creators'}</span>
      </div>
      {campaign.targetAudience && <p><strong>Who you want to reach:</strong> {campaign.targetAudience}</p>}
      {(campaign.preferredPlatforms || campaign.location) && <p className="small muted">
        {campaign.preferredPlatforms && <>Preferred platforms: {campaign.preferredPlatforms}</>}
        {campaign.preferredPlatforms && campaign.location && ' · '}
        {campaign.location && <>Location: {campaign.location}</>}
      </p>}
      {(campaign.campaignLocation || campaign.targetMarket) && <p className="small">
        {campaign.campaignLocation && <>Campaign location: {campaign.campaignLocation}{campaign.matchPhysicalLocation ? ' (base-location signal enabled)' : ''}</>}
        {campaign.campaignLocation && campaign.targetMarket && ' · '}
        {campaign.targetMarket && <>Target market: {campaign.targetMarket}{campaign.matchAudienceMarket ? ' (audience-market signal enabled)' : ''}</>}
      </p>}
      {campaign.campaignGoal && <p className="small"><strong>Promotion goal:</strong> {campaign.campaignGoal}</p>}
      {publicationError && <p className="campaign-error" role="alert">Campaign visibility could not be updated. Please try again.</p>}
      <button className="secondary-button" type="button" disabled={publicationBusy} onClick={togglePublication}>
        {publicationBusy ? 'Updating…' : publicationStatus === 'open' ? 'Close promotion to creators' : 'Open promotion to creators'}
      </button>
    </section>

    <CampaignBudget campaign={campaign} api={api} refreshKey={budgetRefresh} onSaved={values => setBudgetCampaign(current => ({ ...current, ...values }))} />
    <section className="campaign-section" aria-label="Creator recommendations">
      <div className="campaign-section-heading">
        <div><h2>Recommended creators</h2><p>Curated creators based on your brand profile and campaign goals.</p></div>
        <span className="campaign-info" title="Creator matches are ranked by a machine learning model. Location suitability is evaluated separately." aria-label="Creator matches are ranked by a machine learning model. Location suitability is evaluated separately.">i</span>
      </div>
      {publicationStatus !== 'open' && <CampaignEmptyState title="Open this campaign to see matches">Creator recommendations will appear when the campaign is open to applications.</CampaignEmptyState>}
      {publicationStatus === 'open' && loading && <CampaignEmptyState title="Preparing creator matches">We’re checking creator profiles against this campaign. This can take a little while.</CampaignEmptyState>}
      {publicationStatus === 'open' && error && <CampaignEmptyState title="Creator matches are taking longer than usual" action={<button className="secondary-button" onClick={retry}>Try again</button>}>Please try again shortly.</CampaignEmptyState>}
      {publicationStatus === 'open' && !loading && !error && data?.recommendations?.length === 0 && <CampaignEmptyState title="No recommendations yet">You can still invite a creator from the directory below.</CampaignEmptyState>}
      {publicationStatus === 'open' && !loading && !error && data?.recommendations?.length > 0 && <div className="recommendation-grid">{data.recommendations.map(recommendation => <MlRecommendationCard key={recommendation.creator_username} recommendation={recommendation} />)}</div>}
    </section>
    <BusinessMarketplace api={api} campaignId={campaign.campaignId} publicationStatus={publicationStatus} campaign={budgetCampaign} onChanged={() => setBudgetRefresh(value => value + 1)} />
  </div>
}

function CampaignBudget({ campaign, api, refreshKey, onSaved }) {
  const [values, setValues] = useState({ totalBudget: campaign.totalBudget || '', currency: campaign.currency || 'KES', targetCreatorCount: campaign.targetCreatorCount || 1 })
  const [current, setCurrent] = useState(campaign)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    api(`/campaigns/${campaign.campaignId}`, { signal: controller.signal }).then(value => {
      if (!controller.signal.aborted) { setCurrent(value); setValues({ totalBudget: value.totalBudget, currency: value.currency, targetCreatorCount: value.targetCreatorCount }) }
    }).catch(() => {})
    return () => controller.abort()
  }, [api, campaign.campaignId, refreshKey])
  const estimate = estimatedOffer(values.totalBudget, values.targetCreatorCount)
  const allocated = Number(current.allocatedBudget || 0)
  const filled = Number(current.filledCreatorSlots || 0)
  const remainingBudget = Math.max(0, Number(values.totalBudget || 0) - allocated)
  const targetCount = Number(values.targetCreatorCount || 0)

  async function save(event) {
    event.preventDefault()
    if (busy) return
    setBusy(true); setError(''); setNotice('')
    try {
      await api(`/campaigns/${campaign.campaignId}`, { method: 'PUT', body: {
        nicheText: campaign.nicheText, targetAudience: campaign.targetAudience, budgetRange: campaign.budgetRange,
        preferredPlatforms: campaign.preferredPlatforms, location: campaign.location, campaignGoal: campaign.campaignGoal,
        campaignLocation: campaign.campaignLocation, targetMarket: campaign.targetMarket,
        matchPhysicalLocation: Boolean(campaign.matchPhysicalLocation), matchAudienceMarket: Boolean(campaign.matchAudienceMarket),
        totalBudget: Number(values.totalBudget), currency: values.currency, targetCreatorCount: Number(values.targetCreatorCount),
      } })
      onSaved?.({ totalBudget: Number(values.totalBudget), currency: values.currency, targetCreatorCount: Number(values.targetCreatorCount) })
      setNotice('Campaign budget updated.')
    } catch { setError('Your budget could not be updated. Please try again.') }
    finally { setBusy(false) }
  }

  return <section className="panel campaign-budget-panel" aria-label="Campaign budget">
    <div className="budget-summary-layout">
      <div className="budget-total"><span>Total budget</span><strong>{formatMoney(values.totalBudget, values.currency)}</strong></div>
      <dl className="budget-metrics">
        <div><dt>Allocated</dt><dd>{formatMoney(allocated, values.currency)}</dd></div>
        <div className="budget-remaining"><dt>Remaining</dt><dd>{formatMoney(remainingBudget, values.currency)}</dd></div>
        <div><dt>Slots filled</dt><dd>{filled} of {targetCount}</dd></div>
      </dl>
    </div>
    <p className="suggested-offer">Suggested offer per creator: <strong>{formatMoney(estimate, values.currency)}</strong>. Adjustable.</p>
    <details className="budget-edit">
      <summary className="secondary-button">Edit budget</summary>
      <form className="budget-edit-form" onSubmit={save}>
        <label className="field"><span>Total campaign budget</span><input type="number" min="0.01" max="999999999999.99" step="0.01" required value={values.totalBudget} onChange={event => setValues(old => ({ ...old, totalBudget: event.target.value }))} /></label>
        <label className="field"><span>Currency</span><select value={values.currency} onChange={event => setValues(old => ({ ...old, currency: event.target.value }))}><option value="KES">KES</option><option value="USD">USD</option><option value="EUR">EUR</option><option value="GBP">GBP</option></select></label>
        <label className="field"><span>Number of creators needed</span><input type="number" min="1" max="10000" step="1" required value={values.targetCreatorCount} onChange={event => setValues(old => ({ ...old, targetCreatorCount: event.target.value }))} /></label>
        {error && <p className="campaign-error" role="alert">{error}</p>}{notice && <p className="campaign-success" role="status">{notice}</p>}
        <button className="primary-button" disabled={busy}>{busy ? 'Saving…' : 'Save budget'}</button>
      </form>
    </details>
  </section>
}