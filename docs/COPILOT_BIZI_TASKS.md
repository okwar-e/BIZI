# Bounded Copilot handoff

Paste Task 1 first. Return Copilot's changed-file summary, build/lint results and diff to this chat before the next task. Use the existing repository at `C:\Users\colli\Desktop\BIZI`, client under `client`.

## Task 1 — React business recommendation UI

Implement only routine React UI and API wiring under client. Read `docs/BIZI_V1_DESIGN.md` and the v1 routes as contracts. Do not modify server scoring, calibration, authorization, SQL, event validation, baseline or tests. Do not install new dependencies. The client currently contains the Vite starter screen; replace it with a clear responsive Bizi business workflow using existing React/React Router.

Add an API helper with base URL from VITE_API_BASE_URL, default http://localhost:5000, bearer token kept in memory, JSON errors, and graceful network handling. Add login using existing POST /api/auth/login `{email,password}`; clear token/UI on logout and 401. Route UI by returned role: business sees campaign/recommendation tools; creator/admin see an honest message explaining this UI is currently for businesses. Client role checks are presentation only; server authorization is authoritative. Do not hardcode credentials or seed tokens.

Read server campaignRoutes/campaignController for the existing owned campaign list/create endpoints. Implement campaign list/selection and a basic campaign creation form using existing fields. Do not infer a goalKey from free-text campaignGoal.

For selected campaigns use `/api/recommendation-v1/:campaignId/settings` GET and PUT. Edit goalKey with awareness, engagement, conversion, balanced; show balanced as documented default. Fields: numeric budgetMax or null, uppercase budgetCurrency or null, explicit deliverableScope or null, numeric targetFollowers > 0 or null. Send all five fields. Do not parse budgetRange into numeric settings or convert currency.

POST `/api/recommendation-v1/:campaignId/runs` only on explicit Generate action. Disable repeated submits while pending. Use response.recommendations and runId. On campaign switching cancel/ignore stale requests. Show empty/error/loading states distinctly. Recommendation cards must show creator publicHandle/profileId, suitabilityScore /100, evidenceCoverage %, priceStatus (price_unverified visibly), warnings, explanationText, component statuses/scores, goal and algorithmVersion. Label score 'Suitability', coverage 'Evidence coverage'; neither is confidence, match probability or ROI. Explain fallback status clearly. Do not rescore/reorder/filter cards client-side or substitute invented data. Display the generation time to make historical snapshots clear.

Add shortlist/contact/dismiss controls as recorded interest actions only. 'Contact' must not send messages or claim a conversation was sent. These actions are not booking/payment. Actual event wiring belongs to Task 2; leave clean handlers ready for it. Do not use fake model predictions, claimed calibrated distributions or fabricated prices.

Use accessible labels/focus, keyboard-friendly buttons and plain CSS. Build and lint with the existing scripts. Return files changed, commands/results and remaining limitations. Do not change backend code to work around API errors.

## Task 2 — Visible impression and interaction wiring

After Task 1 is reviewed, implement client-only event wiring. POST `/api/recommendation-v1/:campaignId/events` using crypto.randomUUID() for eventId, response runId and integer profileId. Impression body: `{eventId,runId,profileId,eventType:'impression',payload:{}}`. Log only when a recommendation card has at least 50% visible area for 500ms while document.visibilityState is visible. Use IntersectionObserver and cancel pending timers on unmount, campaign/run changes, hidden tab or loss of visibility. Do not log at generation or for offscreen cards. Keep one impression per card per displayed run; preserve UUIDs for retries; React StrictMode must not create duplicates.

Click, shortlist, contact and dismiss require the matching impressionId: `{eventId,runId,profileId,eventType,impressionId,payload:{}}`. Await successful impression storage before interactions. If a user interacts before the visibility timer completes, the click itself demonstrates visibility: record an impression first, await it, then record the action. Keep an event UUID stable across retries. Bound retries and queue size; show a quiet error on logging failure. Do not retry 400/403/404/409 indefinitely. Do not add rank, score, propensity, businessId or userId to payload. Do not report interactions as confirmed deals or completed campaigns. No outcome form in this task.

Return implementation summary and manually check: invisible card emits no event; visible card emits once; switching campaign does not attribute stale events; duplicate network retries reuse UUID; interaction waits for impression; failed impression never yields orphan click. Run build/lint. Do not edit server logic or tests.

## Task 3 — Grounded assistant panel

After the first two tasks are reviewed, add a client-only assistant panel for selected owned campaign and optional current run. POST `/api/recommendation-v1/:campaignId/assistant` with `{question,runId}` if a run is selected, otherwise `{question}`. Render response.answer as text, render citations as expandable source text, and show response.mode/limitations in plain language ('Answers from campaign and recommendation evidence'). Use 'Not enough evidence' when abstained is true. Handle ownership and operational errors honestly. Ignore stale responses after changing campaign/run. Do not render model output as raw HTML, fetch arbitrary citation URLs, or add an LLM API key to the browser. Do not imply that deterministic extracts are generated reasoning or that ROI is predicted.

Run build/lint and return diff plus manual checks for supported scoring/price questions, irrelevant questions, stale responses, forbidden run and source display. Keep backend scoring, logging, auth, migrations and assistant retrieval unchanged.

## Forbidden scope across all tasks

No model training, no ROI claims, no synthetic calibration references, no direct database writes, no secret printing, no baseline deletion, no editing the v1 score/weights to make cards look better, no new admin verification UI, no sending external messages. If an API seems missing or broken, report the exact request/status and stop that dependent feature; paste results back for the core logic owner to handle.
