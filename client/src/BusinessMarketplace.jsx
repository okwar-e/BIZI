import { useEffect, useState } from 'react'
import { estimatedOffer, formatMoney } from './campaignBudget'
import {
  audienceLocationList,
  geographicSuitability,
  hasCompleteAudienceLocationDistribution,
  hasGeographicRequirements,
} from './geographicSuitability'
import CampaignEmptyState from './CampaignEmptyState'
import './BusinessMarketplace.css'
import './CampaignPage.css'

const messageOf = error => error.message || 'Something went wrong. Please try again.'

function useResource(api, path) {
  const [state, setState] = useState({ loading: true, data: null, error: '' })
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    api(path, { signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) setState({ loading: false, data, error: '' })
    }).catch(error => {
      if (!controller.signal.aborted) setState({ loading: false, data: null, error: messageOf(error) })
    })
    return () => controller.abort()
  }, [api, path, revision])
  return { ...state, reload: () => setRevision(value => value + 1) }
}

function ApplicantSummary({ creator }) {
  const audienceLocations = audienceLocationList(creator.audienceLocations)
  return <div className="market-creator-summary">
    <div><h3>{creator.displayName || creator.username}</h3><p className="muted small">{creator.username ? `@${creator.username}` : 'Username not provided'} · Bizi creator account</p></div>
    <p>{creator.niche || 'Niche not provided'}</p>
    <p><strong>Creator base location:</strong> {creator.location || 'Not provided'}</p>
    {audienceLocations.length > 0 && <p><strong>Reported audience locations:</strong> {audienceLocations.join(', ')}</p>}
    {audienceLocations.length > 0 && <>
      <p className="muted small">Audience distribution coverage: {hasCompleteAudienceLocationDistribution(creator) ? 'marked complete by the creator' : 'incomplete or not confirmed complete'}</p>
      <p className="muted small">
        Creator-provided audience-location source: {creator.audienceLocationSource || 'Not provided'}
        {creator.audienceLocationAsOf ? ` · Data as of ${String(creator.audienceLocationAsOf).slice(0, 10)}` : ' · Date not provided'}
      </p>
    </>}
    {creator.bio && <p>{creator.bio}</p>}
    {creator.audienceDescription && <p><strong>Audience:</strong> {creator.audienceDescription}</p>}
    <p className="muted small">{creator.platforms || 'Platforms not provided'}{creator.portfolioUrl ? ` · ${creator.portfolioUrl}` : ''}</p>
    {(creator.followerCount != null || creator.selfReportedEngagement != null) && <p className="muted small">{creator.followerCount != null ? `Self-reported followers: ${Number(creator.followerCount).toLocaleString()}` : ''}{creator.followerCount != null && creator.selfReportedEngagement != null ? ' · ' : ''}{creator.selfReportedEngagement != null ? `Self-reported engagement: ${creator.selfReportedEngagement}%` : ''}</p>}
  </div>
}

function GeographicSuitability({ creator, campaign }) {
  if (!hasGeographicRequirements(campaign)) return null
  const result = geographicSuitability(campaign, creator)
  return <div className={`geo-suitability geo-${result.status}`}>
    <p><strong>Geographic suitability:</strong> {result.label}</p>
    {result.checks?.map(check => <p className="small" key={check.key}>
      <strong>{check.key === 'physical' ? 'Base-location signal' : 'Audience-market signal'}:</strong> {check.explanation}
    </p>)}
  </div>
}

export default function BusinessMarketplace({ api, campaignId, publicationStatus, campaign, onChanged }) {
  const base = `/business/campaigns/${campaignId}`
  const applications = useResource(api, `${base}/applications`)
  const invitations = useResource(api, `${base}/invitations`)
  const [directorySearch, setDirectorySearch] = useState('')
  const [creatorSearch, setCreatorSearch] = useState('')
  const [selectedCreator, setSelectedCreator] = useState('')
  const [inviteMessage, setInviteMessage] = useState('')
  const [offeredAmount, setOfferedAmount] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const suggestedOffer = estimatedOffer(campaign?.totalBudget, campaign?.targetCreatorCount)
  const directoryPath = `/business/creators${directorySearch ? `?search=${encodeURIComponent(directorySearch)}` : ''}`
  const directory = useResource(api, directoryPath)

  async function decide(applicationId, status) {
    setBusy(`application-${applicationId}`); setError(''); setNotice('')
    try {
      await api(`${base}/applications/${applicationId}`, { method: 'PATCH', body: { status } })
      setNotice(`Application ${status}.`)
      applications.reload()
      invitations.reload()
      onChanged?.()
    } catch (reason) { setError(messageOf(reason)) }
    finally { setBusy('') }
  }

  async function invite(event) {
    event.preventDefault()
    if (!selectedCreator || busy) return
    setBusy('invite'); setError(''); setNotice('')
    try {
      await api(`${base}/invitations`, { body: { creatorId: Number(selectedCreator), message: inviteMessage.trim() || undefined, ...(offeredAmount === '' ? {} : { offeredAmount: Number(offeredAmount) }) } })
      setNotice('Invitation sent to the Bizi creator account.')
      setInviteMessage(''); setSelectedCreator(''); setOfferedAmount('')
      invitations.reload()
      onChanged?.()
    } catch (reason) { setError(messageOf(reason)) }
    finally { setBusy('') }
  }

  return <section className="marketplace-panel campaign-marketplace" aria-label="Applications and invitations">
    <div className="marketplace-feedback" aria-live="polite">
      {error && <p className="campaign-error" role="alert">{error}</p>}
      {notice && <p className="campaign-success" role="status">{notice}</p>}
    </div>

    <section className="campaign-table-section" aria-labelledby="applications-heading">
      <div className="campaign-section-heading">
        <div><h2 id="applications-heading">Applications</h2><p>Review and respond to creator applications.</p></div>
        {!applications.loading && !applications.error && <span className="section-count">{applications.data?.length ?? 0}</span>}
      </div>
      <div className="campaign-table-wrap">
        {applications.loading && <CampaignEmptyState title="Loading applications">Your campaign applications are on their way.</CampaignEmptyState>}
        {applications.error && <CampaignEmptyState title="Applications couldn’t load" action={<button className="secondary-button" onClick={applications.reload}>Try again</button>}>Please refresh the list in a moment.</CampaignEmptyState>}
        {!applications.loading && !applications.error && !applications.data?.length && <CampaignEmptyState title="No applications yet">New creator applications will appear here.</CampaignEmptyState>}
        {!applications.loading && !applications.error && applications.data?.length > 0 && <div className="campaign-table-scroll"><table className="campaign-table">
          <thead><tr><th scope="col">Creator</th><th scope="col">Date applied</th><th scope="col">Status</th><th scope="col">Application</th><th scope="col">Actions</th></tr></thead>
          <tbody>{applications.data.map(application => <tr key={application.applicationId}>
            <td><div className="table-creator"><span className="table-avatar" aria-hidden="true">{(application.displayName || application.username || 'C').slice(0, 1).toUpperCase()}</span><div><strong>{application.displayName || application.username}</strong><span>@{application.username || 'creator'}</span><small>{application.niche || 'Niche not listed'}</small><GeographicSuitability creator={application} campaign={campaign} /></div></div></td>
            <td data-label="Date applied">{new Date(application.createdAt).toLocaleDateString()}</td>
            <td data-label="Status"><span className={`market-status status-${application.status}`}>{application.status}</span></td>
            <td data-label="Application">{application.applicationMessage || 'No note'}</td>
            <td data-label="Actions">{application.status === 'pending' ? <div className="table-actions">
              <button className="primary-button" disabled={busy === `application-${application.applicationId}`} onClick={() => decide(application.applicationId, 'accepted')}>Accept</button>
              <button className="secondary-button" disabled={busy === `application-${application.applicationId}`} onClick={() => decide(application.applicationId, 'rejected')}>Reject</button>
            </div> : <span className="muted small">Reviewed</span>}</td>
          </tr>)}</tbody>
        </table></div>}
      </div>
    </section>

    <section className="campaign-table-section" aria-labelledby="invitations-heading">
      <div className="campaign-section-heading invitation-heading">
        <div><h2 id="invitations-heading">Invitations</h2><p>Track creators invited to this campaign.</p></div>
        <div className="invitation-heading-actions">
          {!invitations.loading && !invitations.error && <span className="section-count">{invitations.data?.length ?? 0}</span>}
          {publicationStatus === 'open' && <details className="invite-details" id="invite-creator">
            <summary className="primary-button">Invite creator</summary>
            <form className="market-invite-form" onSubmit={invite}>
              <label className="field"><span>Find a registered creator</span><input value={creatorSearch} maxLength={100} onChange={event => { setCreatorSearch(event.target.value); setDirectorySearch(event.target.value) }} placeholder="Search name, username, or niche" /></label>
              {directory.loading && <p className="small muted" role="status">Loading creator accounts…</p>}
              {directory.error && <CampaignEmptyState title="Creator directory couldn’t load" action={<button className="secondary-button" type="button" onClick={directory.reload}>Try again</button>}>Please try again shortly.</CampaignEmptyState>}
              {!directory.loading && !directory.error && !directory.data?.length && <p className="small muted">No creators match that search.</p>}
              <label className="field"><span>Creator profile</span><select required value={selectedCreator} onChange={event => setSelectedCreator(event.target.value)}><option value="">Select a creator</option>{directory.data?.map(creator => <option value={creator.creatorId} key={creator.creatorId}>{creator.displayName} · @{creator.username || 'no username'} · {creator.niche || 'niche not listed'}</option>)}</select></label>
              {selectedCreator && directory.data?.find(creator => String(creator.creatorId) === selectedCreator) && <>
                <ApplicantSummary creator={directory.data.find(creator => String(creator.creatorId) === selectedCreator)} />
                <GeographicSuitability creator={directory.data.find(creator => String(creator.creatorId) === selectedCreator)} campaign={campaign} />
              </>}
              <p className="suggested-offer">Suggested offer per creator: <strong>{formatMoney(suggestedOffer, campaign?.currency)}</strong>. Adjustable.</p>
              <label className="field"><span>Offer amount</span><input type="number" min="0.01" max="999999999999.99" step="0.01" value={offeredAmount} placeholder={suggestedOffer.toFixed(2)} onChange={event => setOfferedAmount(event.target.value)} /></label>
              <label className="field"><span>Invitation note (optional)</span><textarea rows={3} maxLength={2000} value={inviteMessage} onChange={event => setInviteMessage(event.target.value)} /></label>
              <button className="primary-button" disabled={!selectedCreator || busy === 'invite'}>{busy === 'invite' ? 'Sending…' : 'Send invitation'}</button>
            </form>
          </details>}
        </div>
      </div>
      <div className="campaign-table-wrap">
        {invitations.loading && <CampaignEmptyState title="Loading invitations">Your campaign invitations are on their way.</CampaignEmptyState>}
        {invitations.error && <CampaignEmptyState title="Invitations couldn’t load" action={<button className="secondary-button" onClick={invitations.reload}>Try again</button>}>Please refresh the list in a moment.</CampaignEmptyState>}
        {!invitations.loading && !invitations.error && !invitations.data?.length && <CampaignEmptyState title="No invitations sent yet">Invitations you send will appear here.</CampaignEmptyState>}
        {!invitations.loading && !invitations.error && invitations.data?.length > 0 && <div className="campaign-table-scroll"><table className="campaign-table">
          <thead><tr><th scope="col">Creator</th><th scope="col">Offer</th><th scope="col">Status</th><th scope="col">Date sent</th></tr></thead>
          <tbody>{invitations.data.map(invitation => <tr key={invitation.invitationId}>
            <td><div className="table-creator"><span className="table-avatar" aria-hidden="true">{(invitation.displayName || invitation.username || 'C').slice(0, 1).toUpperCase()}</span><div><strong>{invitation.displayName || invitation.username}</strong><span>@{invitation.username || 'creator'}</span><small>{invitation.niche || 'Niche not listed'}</small><GeographicSuitability creator={invitation} campaign={campaign} /></div></div></td>
            <td data-label="Offer">{formatMoney(invitation.offeredAmount, invitation.currency)}</td>
            <td data-label="Status"><span className={`market-status status-${invitation.status}`}>{invitation.status}</span></td>
            <td data-label="Date sent">{new Date(invitation.createdAt).toLocaleDateString()}</td>
          </tr>)}</tbody>
        </table></div>}
      </div>
    </section>
  </section>
}
