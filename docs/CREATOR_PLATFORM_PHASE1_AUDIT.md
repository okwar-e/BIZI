# Creator Platform Phase 1 Audit

## Existing Foundation

- Authentication: business/creator registration and email/password login, bcrypt hashes, 24-hour JWTs, bearer middleware, and role middleware.
- Identity tables: `users` with `businesses` and `creators`; creator-facing account identity is `creators.publicHandle`.
- Creator profiles: `creator_profiles` already stores niche, audience description, platform/location, follower count, self-reported/verified engagement, and embedding data.
- Campaigns: business-owned campaigns store brief, audience, platform, location, budget range, and goal. There is no publication state.
- Recommendations: legacy `recommendations` and V1 run/event tables are recommendation evidence/snapshots, not applications or invitations.
- APIs: auth, business campaign CRUD, creator profile (`/api/creator-profile`), ML proxy, V1 recommendations, and assistant routes.
- Frontend: Vite renders one React application. There was no route tree; creators saw a basic profile panel, businesses saw the campaign workspace.
- Authorization: JWT role middleware exists. V1 and assistant also reload the current database role; creator-platform routes should use live role checks and resolve creator identity from the authenticated user.
- ML: Node proxies to FastAPI; the trained Logistic Regression and its catalog are the business ranking authority. ML catalog usernames are not mapped to application creator IDs.
- Assistant: role-scoped retrieval, hybrid/lexical fallback, cited generation with validation and extractive fallback. It must not be used for creator ranking or lifecycle state.
- Tests: Node built-in `node:test` on server and client. Existing tests cover registration, ML proxy, V1, RAG, and client auth/events; no creator campaign lifecycle tests existed.

## Minimum Additions

- Add an additive migration for creator profile bio/portfolio/availability/preferences, campaign draft/open/closed publication state, and separate campaign application/invitation relations.
- Default current campaigns to draft so existing private/business campaign records do not become creator-visible implicitly. Add an owner-only publication endpoint and control.
- Creator discovery returns only open campaigns and uses allowlisted public campaign/business fields.
- Applications/invitations reference real `campaignId` and `creatorId`; profile fields are not copied into lifecycle rows. Status transitions are conditional and creator-scoped.
- Add creator routes and a small routed creator dashboard; keep business workspace and ML endpoints unchanged.

## Known Risks / Deferred Decisions

- Existing one-to-one relationships (`businesses.userId`, `creators.userId`, `creator_profiles.creatorId`) are assumed by code but not uniquely constrained. This phase will not add constraints that could reject existing data.
- Minimum creator rates and currencies are not represented consistently in the current product. Do not invent a rate field yet.
- Invitation creation and business-side application management are not among this creator-foundation phase’s endpoints; creator read/respond APIs and storage are added, while business lifecycle APIs can follow.
- The ML catalog has no verified mapping to Bizi creator IDs. Applications and invitations must use registered `creatorId` only and must not be triggered from ML cards.
- Existing campaigns remain private/draft until their owning business opens them.
