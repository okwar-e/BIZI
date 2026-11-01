import { useEffect, useState } from 'react'
import { estimatedOffer, formatMoney } from './campaignBudget'
import './BusinessMarketplace.css'

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
  return <div className="market-creator-summary">
    <div><h3>{creator.displayName || creator.username}</h3><p className="muted small">{creator.username ? `@${creator.username}` : 'Username not provided'} · Bizi creator account</p></div>
    <p>{creator.niche || 'Niche not provided'}{creator.location ? ` · ${creator.location}` : ''}</p>
    {creator.bio && <p>{creator.bio}</p>}
    {creator.audienceDescription && <p><strong>Audience:</strong> {creator.audienceDescription}</p>}
    <p className="muted small">{creator.platforms || 'Platforms not provided'}{creator.portfolioUrl ? ` · ${creator.portfolioUrl}` : ''}</p>
    {(creator.followerCount != null || creator.selfReportedEngagement != null) && <p className="muted small">{creator.followerCount != null ? `Self-reported followers: ${Number(creator.followerCount).toLocaleString()}` : ''}{creator.followerCount != null && creator.selfReportedEngagement != null ? ' · ' : ''}{creator.selfReportedEngagement != null ? `Self-reported engagement: ${creator.selfReportedEngagement}%` : ''}</p>}
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

  return <section className="marketplace-panel" aria-label="Creator marketplace actions">
    <div className="section-head"><div><p className="eyebrow">MARKETPLACE</p><h2>Applications and invitations</h2></div></div>
    <p className="small muted">ML catalog creators are not linked to Bizi accounts. Invitations below can only target registered Bizi creator profiles. Open campaigns are visible to creators.</p>
    {error && <p className="notice error" role="alert">{error}</p>}{notice && <p className="notice" role="status">{notice}</p>}

    <details className="marketplace-section" open>
      <summary>Applications ({applications.data?.length ?? '…'})</summary>
      {applications.loading && <p role="status">Loading applications…</p>}
      {applications.error && <p className="notice error" role="alert">{applications.error}</p>}
      {!applications.loading && !applications.error && !applications.data?.length && <p className="muted">No creators have applied to this campaign.</p>}
      <div className="marketplace-records">{applications.data?.map(application => <article className="marketplace-record" key={application.applicationId}>
        <ApplicantSummary creator={application} />
        <div className="market-record-meta"><span className={`badge ${application.status === 'pending' ? 'warning' : ''}`}>{application.status}</span><span className="muted small">Applied {new Date(application.createdAt).toLocaleDateString()}</span></div>
        {application.applicationMessage && <blockquote>{application.applicationMessage}</blockquote>}
        {application.status === 'pending' && <div className="market-actions">
          <button disabled={busy === `application-${application.applicationId}`} onClick={() => decide(application.applicationId, 'accepted')}>Accept</button>
          <button disabled={busy === `application-${application.applicationId}`} onClick={() => decide(application.applicationId, 'rejected')}>Reject</button>
        </div>}
      </article>)}</div>
    </details>

    <details className="marketplace-section">
      <summary>Invitations ({invitations.data?.length ?? '…'})</summary>
      {invitations.loading && <p role="status">Loading invitations…</p>}
      {invitations.error && <p className="notice error" role="alert">{invitations.error}</p>}
      {!invitations.loading && !invitations.error && !invitations.data?.length && <p className="muted">No invitations have been sent for this campaign.</p>}
      <div className="marketplace-records">{invitations.data?.map(invitation => <article className="marketplace-record compact" key={invitation.invitationId}>
        <ApplicantSummary creator={invitation} />
        <div className="market-record-meta"><span className={`badge ${invitation.status === 'pending' ? 'warning' : ''}`}>{invitation.status}</span><span className="muted small">Invited {new Date(invitation.createdAt).toLocaleDateString()}</span></div>
        {invitation.invitationMessage && <blockquote>{invitation.invitationMessage}</blockquote>}
        <p><strong>Offer:</strong> {formatMoney(invitation.offeredAmount, invitation.currency)}</p>
      </article>)}</div>
    </details>

    <details className="marketplace-section" open={publicationStatus === 'open'}>
      <summary>Invite a Bizi creator</summary>
      {publicationStatus !== 'open' ? <p className="muted">Open the campaign before inviting creators.</p> : <form className="market-invite-form" onSubmit={invite}>
        <label className="field"><span>Find a registered creator</span><input value={creatorSearch} maxLength={100} onChange={event => { setCreatorSearch(event.target.value); setDirectorySearch(event.target.value) }} placeholder="Search name, username, or niche" /></label>
        {directory.loading && <p role="status">Loading creator accounts…</p>}
        {directory.error && <p className="notice error" role="alert">{directory.error}</p>}
        <label className="field"><span>Creator profile</span><select required value={selectedCreator} onChange={event => setSelectedCreator(event.target.value)}><option value="">Select a Bizi creator</option>{directory.data?.map(creator => <option value={creator.creatorId} key={creator.creatorId}>{creator.displayName} · @{creator.username || 'no username'} · {creator.niche || 'niche not provided'}</option>)}</select></label>
        {selectedCreator && directory.data?.find(creator => String(creator.creatorId) === selectedCreator) && <ApplicantSummary creator={directory.data.find(creator => String(creator.creatorId) === selectedCreator)} />}
        <p className="small muted">Suggested offer: <strong>{formatMoney(suggestedOffer, campaign?.currency)}</strong>. Starting amount derived from campaign budget, not the creator's market rate.</p>
        <label className="field"><span>Offer amount</span><input type="number" min="0.01" max="999999999999.99" step="0.01" value={offeredAmount} placeholder={suggestedOffer.toFixed(2)} onChange={event => setOfferedAmount(event.target.value)} /></label>
        <label className="field"><span>Invitation note (optional)</span><textarea rows={3} maxLength={2000} value={inviteMessage} onChange={event => setInviteMessage(event.target.value)} /></label>
        <button className="primary" disabled={!selectedCreator || busy === 'invite'}>{busy === 'invite' ? 'Sending…' : 'Send invitation'}</button>
      </form>}
    </details>
  </section>
}
