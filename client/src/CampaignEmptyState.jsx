export default function CampaignEmptyState({ title, children, action }) {
  return <div className="campaign-empty-state">
    <span className="campaign-empty-mark" aria-hidden="true" />
    <h3>{title}</h3>
    <p>{children}</p>
    {action}
  </div>
}
