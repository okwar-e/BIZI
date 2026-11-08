import { useEffect, useState } from 'react'

export default function Methodology({ api }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    api('/assistant/methodology', { signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) setData(value) })
      .catch(reason => { if (!controller.signal.aborted) setError(reason.message) })
    return () => controller.abort()
  }, [api])

  return <details className="panel methodology">
    <summary>How Bizi recommends creators</summary>
    {error && <p role="alert">{error}</p>}
    {!data && !error && <p role="status">Loading methodology…</p>}
    {data && <>
      <p className="small muted">{data.modelType} · {data.version}</p>
      <p>{data.formula}</p>
      <h3>Model features</h3>
      <dl className="components">{data.features.map(feature => <div key={feature.id}>
        <dt>{feature.id}</dt><dd>{feature.text}</dd>
      </div>)}</dl>
      <h3>Limitations</h3>
      <ul>{data.limitations.map(item => <li key={item}>{item}</li>)}</ul>
    </>}
  </details>
}
