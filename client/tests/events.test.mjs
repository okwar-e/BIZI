import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createEventTracker, observeVisibleCard } from '../src/eventTracker.js'
import { createApi } from '../src/api.js'

test('concurrent impressions share one saved UUID; retry preserves it', async () => {
  const sent = []; let failures = 1, sequence = 0
  const tracker = createEventTracker({ campaignId: 4, runId: 'run', uuid: () => `id-${++sequence}`, wait: async () => {}, api: async (_, options) => { sent.push(options.body); if (failures > 0) { failures--; throw Object.assign(new Error('unreachable'), { status: 0 }) } } })
  const [a, b] = await Promise.all([tracker.impression(8), tracker.impression(8)])
  assert.equal(a, b); assert.equal(sent.length, 2); assert.equal(sent[0].eventId, sent[1].eventId)
  await tracker.action(8, 'click')
  assert.equal(sent.at(-1).impressionId, a); assert.equal(sent.at(-1).eventType, 'click'); tracker.dispose()
})
test('terminal impression errors do not send orphan actions', async () => {
  const sent = []
  const tracker = createEventTracker({ campaignId: 4, runId: 'run', api: async (_, options) => { sent.push(options.body); throw Object.assign(new Error('forbidden'), { status: 403 }) } })
  await assert.rejects(tracker.action(8, 'shortlist')); assert.equal(sent.length, 1); assert.equal(sent[0].eventType, 'impression')
  tracker.dispose(); await assert.rejects(tracker.action(8, 'click')); assert.equal(sent.length, 1)
})
test('visibility duration, hidden tab, cleanup and duplicate callbacks are guarded', () => {
  const element = {}, timers = new Map(); let callback, listener, sequence = 0, count = 0
  const doc = { visibilityState: 'visible', addEventListener: (_, value) => { listener = value }, removeEventListener: () => {} }
  class Observer { constructor(fn) { callback = fn } observe() {} disconnect() {} }
  const stop = observeVisibleCard(element, () => count++, { documentObject: doc, Observer, schedule: fn => { timers.set(++sequence, fn); return sequence }, cancel: id => timers.delete(id) })
  callback([{ target: element, isIntersecting: true, intersectionRatio: .4 }]); assert.equal(timers.size, 0)
  callback([{ target: element, isIntersecting: true, intersectionRatio: .6 }]); assert.equal(timers.size, 1)
  doc.visibilityState = 'hidden'; listener(); assert.equal(timers.size, 0)
  doc.visibilityState = 'visible'; listener(); assert.equal(timers.size, 1)
  const tick = [...timers.values()][0]; timers.clear(); tick(); assert.equal(count, 1)
  callback([{ target: element, isIntersecting: true, intersectionRatio: 1 }]); assert.equal(timers.size, 0)
  stop(); tick(); assert.equal(count, 1)
})
test('unmount before dwell expires cancels impression', () => {
  let callback, tick, cancelled = false, count = 0
  const element = {}, doc = { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} }
  class Observer { constructor(fn) { callback = fn } observe() {} disconnect() {} }
  const stop = observeVisibleCard(element, () => count++, { documentObject: doc, Observer, schedule: fn => { tick = fn; return 1 }, cancel: () => { cancelled = true } })
  callback([{ target: element, isIntersecting: true, intersectionRatio: .6 }]); stop(); tick()
  assert.equal(cancelled, true); assert.equal(count, 0)
})
test('API passes bearer token, triggers logout on 401, and honors aborts', async () => {
  let loggedOut = false, options
  const api = createApi({ token: 'test-only', onUnauthorized: () => { loggedOut = true }, fetchImpl: async (_, opts) => { options = opts; return { ok: false, status: 401, json: async () => ({ error: 'Unauthorized' }) } } })
  await assert.rejects(api('/campaigns'), { status: 401 }); assert.equal(loggedOut, true); assert.equal(options.headers.Authorization, 'Bearer test-only')
  const aborted = createApi({ fetchImpl: async () => { throw Object.assign(new Error('aborted'), { name: 'AbortError' }) } })
  await assert.rejects(aborted('/campaigns'), { name: 'AbortError' })
})
