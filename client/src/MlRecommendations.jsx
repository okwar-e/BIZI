import { useEffect, useState } from 'react'
import './MlRecommendations.css'
import BusinessMarketplace from './BusinessMarketplace'
import { estimatedOffer, formatMoney } from './campaignBudget'

const featureLabels = {
  text_similarity: 'Text similarity',
  semantic_similarity: 'Semantic similarity',
  log_creator_followers: 'Followers',
  log_creator_following: 'Following',
  log_creator_post_count: 'Post count',
}

function MlRecommendationCard({ recommendation }) {
  const explanation = recommendation.explanation || {}
  const contributions = explanation.model_contributions || recommendation.model_contributions || []

  return <article className="creator-card ml-creator-card">
    <div className="section-head">
      <div className="creator-heading">
        <span className="avatar" aria-hidden="true">{String(recommendation.rank).padStart(2, '0')}</span>
        <div>
          <h3>{recommendation.creator_display_name || recommendation.creator_username}</h3>
          <p className="muted small">@{recommendation.creator_username} · ML catalog identity, not a linked Bizi account</p>
        </div>
      </div>
      <div className="ml-score">
        <span className="metric-label">Model score</span>
        <strong>{Number(recommendation.score).toFixed(4)}</strong>
      </div>
    </div>

    <div className="ml-profile-facts">
      <p><strong>{recommendation.creator_category || 'Category unavailable'}</strong></p>
      {recommendation.creator_bio && <p>{recommendation.creator_bio}</p>}
      <p className="muted small">
        Followers: {Number(recommendation.creator_followers).toLocaleString()} · Following: {Number(recommendation.creator_following).toLocaleString()} · Posts: {Number(recommendation.creator_post_count).toLocaleString()}
      </p>
      {recommendation.creator_website && <a href={recommendation.creator_website} target="_blank" rel="noreferrer">Catalog website</a>}
    </div>

    <details className="ml-explanation">
      <summary>Why recommended?</summary>
      <p>{explanation.why_recommended || 'Ranked by the trained creator recommendation model.'}</p>
      {explanation.strengths?.length > 0 && <>
        <h4>Model evidence</h4>
        <ul>{explanation.strengths.map(item => <li key={item}>{item}</li>)}</ul>
      </>}
      <h4>Contribution to ranking score</h4>
      <dl className="ml-contributions">
        {contributions.map(item => <div key={item.feature}>
          <dt>{featureLabels[item.feature] || item.feature}</dt>
          <dd>{Number(item.contribution) >= 0 ? '+' : ''}{Number(item.contribution).toFixed(4)}</dd>
        </div>)}
      </dl>
      <p className="small muted">Contributions are standardized feature values multiplied by the fitted Logistic Regression coefficients; they describe the model score, not causal effects. The intercept is {Number(recommendation.model_intercept).toFixed(4)}.</p>
      <p className="small muted">Engagement-rate evidence is unavailable across the current serving catalog. The missingness feature is constant for all candidates and does not distinguish their ranking.</p>
      <h4>Evidence available</h4>
      {explanation.evidence_available?.length ? <ul>{explanation.evidence_available.map(item => <li key={item}>{item}</li>)}</ul> : <p className="muted small">No additional profile evidence was returned.</p>}
      <h4>What we don't know</h4>
      {explanation.unknowns?.length ? <ul>{explanation.unknowns.map(item => <li key={item}>{item}</li>)}</ul> : <p className="muted small">No additional unknowns were reported.</p>}
      <ul className="ml-limitations">{explanation.limitations?.map(item => <li key={item}>{item}</li>)}</ul>
      <details className="ml-sources">
        <summary>Sources and provenance</summary>
        <ul>{explanation.sources?.map(source => <li key={source.id}><strong>{source.title}</strong><span>{source.id}</span><code>{source.text}</code></li>)}</ul>
      </details>
    </details>
    <p className="small muted ml-identity-note">This catalog profile is not linked to a Bizi creator account. Account-based actions are unavailable until a verified link exists.</p>
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

  return <div className="workspace">
    <section className="panel ml-campaign-brief">
      <p className="eyebrow">CAMPAIGN {campaign.campaignId}</p>
      <h2>{campaign.nicheText}</h2>
      <p className="muted">{campaign.targetAudience || 'Target audience not specified'}</p>
      <p className="small muted">{campaign.preferredPlatforms || 'Platform not specified'} · {campaign.location || 'Target location not specified'}</p>
      {campaign.campaignGoal && <p className="small">Objective: {campaign.campaignGoal}</p>}
      <p className="small muted">Creator discovery: {publicationStatus}</p>
      {publicationError && <p className="notice error" role="alert">{publicationError}</p>}
      <button type="button" disabled={publicationBusy} onClick={togglePublication}>
        {publicationBusy ? 'Updating…' : publicationStatus === 'open' ? 'Close campaign to creators' : 'Open campaign to creators'}
      </button>
    </section>

    <CampaignBudget campaign={campaign} api={api} refreshKey={budgetRefresh} onSaved={values => setBudgetCampaign(current => ({ ...current, ...values }))} />
    <section aria-label="Creator recommendations">
      <div className="section-head ml-results-head">
        <div><p className="eyebrow">CREATOR RECOMMENDATIONS</p><h2>{data ? `${data.recommendations.length} creators to consider` : 'Recommended creators'}</h2></div>
        <span className="badge">Model ranking</span>
      </div>
      <p className="small muted">Creators are ranked by the trained Logistic Regression recommendation model using campaign/business text and creator profile characteristics. Scores are model ranking values, not calibrated probabilities or performance guarantees. ML catalog identities are separate from registered Bizi creator accounts.</p>
      {publicationStatus !== 'open' && <p className="notice">Open this campaign to request creator recommendations.</p>}
      {publicationStatus === 'open' && loading && <p className="panel empty" role="status">Finding suitable creators…</p>}
      {publicationStatus === 'open' && error && <div className="panel empty"><p className="notice error" role="alert">{error}</p><button onClick={retry}>Retry</button></div>}
      {publicationStatus === 'open' && !loading && !error && data?.recommendations?.length === 0 && <div className="panel empty">No creator catalog matches were returned.</div>}
      {publicationStatus === 'open' && !loading && !error && data?.recommendations?.length > 0 && <div className="cards">{data.recommendations.map(recommendation => <MlRecommendationCard key={recommendation.creator_username} recommendation={recommendation} />)}</div>}
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
  const remainingSlots = Math.max(0, Number(values.targetCreatorCount || 0) - filled)

  async function save(event) {
    event.preventDefault()
    if (busy) return
    setBusy(true); setError(''); setNotice('')
    try {
      await api(`/campaigns/${campaign.campaignId}`, { method: 'PUT', body: {
        nicheText: campaign.nicheText, targetAudience: campaign.targetAudience, budgetRange: campaign.budgetRange,
        preferredPlatforms: campaign.preferredPlatforms, location: campaign.location, campaignGoal: campaign.campaignGoal,
        totalBudget: Number(values.totalBudget), currency: values.currency, targetCreatorCount: Number(values.targetCreatorCount),
      } })
      onSaved?.({ totalBudget: Number(values.totalBudget), currency: values.currency, targetCreatorCount: Number(values.targetCreatorCount) })
      setNotice('Campaign budget updated.')
    } catch (reason) { setError(reason.message || 'Campaign budget could not be updated.') }
    finally { setBusy(false) }
  }

  return <section className="panel campaign-budget-panel" aria-label="Campaign budget">
    <div className="section-head"><div><p className="eyebrow">CREATOR OFFERS</p><h2>Campaign budget</h2></div></div>
    <dl className="budget-summary"><div><dt>Total budget</dt><dd>{formatMoney(values.totalBudget, values.currency)}</dd></div><div><dt>Allocated</dt><dd>{formatMoney(allocated, values.currency)}</dd></div><div><dt>Remaining</dt><dd>{formatMoney(remainingBudget, values.currency)}</dd></div><div><dt>Creator slots filled</dt><dd>{filled} / {values.targetCreatorCount || 0}</dd></div><div><dt>Slots remaining</dt><dd>{remainingSlots}</dd></div></dl>
    <form className="budget-edit-form" onSubmit={save}>
      <label className="field"><span>Total campaign budget</span><input type="number" min="0.01" max="999999999999.99" step="0.01" required value={values.totalBudget} onChange={event => setValues(old => ({ ...old, totalBudget: event.target.value }))} /></label>
      <label className="field"><span>Currency</span><select value={values.currency} onChange={event => setValues(old => ({ ...old, currency: event.target.value }))}><option value="KES">KES</option><option value="USD">USD</option><option value="EUR">EUR</option><option value="GBP">GBP</option></select></label>
      <label className="field"><span>Number of creators needed</span><input type="number" min="1" max="10000" step="1" required value={values.targetCreatorCount} onChange={event => setValues(old => ({ ...old, targetCreatorCount: event.target.value }))} /></label>
      <p className="small muted">Estimated offer per creator: <strong>{formatMoney(estimate, values.currency)}</strong>. This is a starting offer derived from the campaign budget, not a creator's market rate.</p>
      {error && <p className="notice error" role="alert">{error}</p>}{notice && <p className="notice" role="status">{notice}</p>}
      <button disabled={busy}>{busy ? 'Saving…' : 'Save budget'}</button>
    </form>
  </section>
}