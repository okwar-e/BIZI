// Memory-only per displayed run. Stable event ids make network retries idempotent.
export function createEventTracker({ api, campaignId, runId, uuid = () => crypto.randomUUID(), wait = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  const impressions = new Map()
  const controller = new AbortController()
  let active = true
  async function send(event) {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (!active) throw new Error('This recommendation view has closed.')
      try { return await api(`/recommendation-v1/${campaignId}/events`, { body: event, signal: controller.signal }) }
      catch (e) {
        if (!active || e.name === 'AbortError' || (e.status >= 400 && e.status < 500) || attempt === 2) throw e
        await wait(300 * 2 ** attempt)
      }
    }
  }
  function impression(profileId) {
    if (!active) return Promise.reject(new Error('This recommendation view has closed.'))
    let entry = impressions.get(profileId)
    if (!entry) {
      entry = { eventId: uuid(), promise: null }
      impressions.set(profileId, entry)
    }
    if (!entry.promise) {
      entry.promise = send({ eventId: entry.eventId, runId, profileId, eventType: 'impression', payload: {} })
        .then(() => entry.eventId).catch(e => { entry.promise = null; throw e })
    }
    return entry.promise
  }
  async function action(profileId, eventType) {
    if (!['click', 'shortlist', 'contact', 'dismiss'].includes(eventType)) throw new Error('Unsupported interaction.')
    const impressionId = await impression(profileId)
    if (!active) throw new Error('This recommendation view has closed.')
    await send({ eventId: uuid(), runId, profileId, eventType, impressionId, payload: {} })
  }
  return { impression, action, dispose: () => { active = false; controller.abort() } }
}

export function observeVisibleCard(element, callback, { documentObject = document, Observer = IntersectionObserver, schedule = setTimeout, cancel = clearTimeout } = {}) {
  let visible = false, timer = null, stopped = false, completed = false
  const reset = () => { if (timer !== null) cancel(timer); timer = null }
  const update = () => {
    reset()
    if (visible && documentObject.visibilityState === 'visible' && !stopped && !completed) timer = schedule(() => {
      timer = null
      if (!stopped && visible && documentObject.visibilityState === 'visible') { completed = true; callback() }
    }, 500)
  }
  const observer = new Observer(entries => { visible = entries.some(e => e.target === element && e.isIntersecting && e.intersectionRatio >= .5); update() }, { threshold: [.5] })
  observer.observe(element)
  documentObject.addEventListener('visibilitychange', update)
  return () => { stopped = true; reset(); observer.disconnect(); documentObject.removeEventListener('visibilitychange', update) }
}
