# Bizi complete demo and RAG delivery

Installed October 19, 2026 in C:\Users\colli\Desktop\BIZI.

## Try it

Open http://127.0.0.1:5174/ and refresh the page. Sign out of a previous demo account, then use the account in BIZI_COMPLETE_300/local-login.json. This account owns the complete 300-creator lab. Earlier demo logins still own their earlier campaigns; they do not automatically become the 300-creator lab.

Select one of the 12 lab campaigns, generate recommendations and expand the evidence. Cards show synthetic origin, field completeness, suitability, evidence coverage, niche, platform/location, followers, self-reported engagement and quote/scope. The methodology disclosure explains the exact weights and transforms.

The shared Bizi assistant is below the workspace, replacing the old campaign-only panel. Example questions:

- Explain engagement scoring and evidence coverage. Is a complete synthetic profile verified evidence?
- Explain why this quote is price-unverified even though the amount is populated.
- Help me create a campaign. (Supply the brief and settings when asked.)
- Prepare a ranking-settings change for campaign [your campaign number]: awareness, budget 50000 KES, deliverable one Instagram reel, follower target 50000. I will confirm the preview.

Review each proposed change before confirming. Direct action forms work independently of model planning. Creators have their own workspace and can create/update their own profile and self-reported metrics through the same preview-confirmation flow. No messages, bookings, payments, role changes, verification assertions or account deletion are exposed as assistant tools.

## 300-creator lab

There are exactly 300 tagged lab profiles, with 10 categories, 3 platforms, 5 locations, varied audience descriptions, follower counts, engagement percentages/definitions, quote amounts/currencies/scopes/expiry, synthetic latent vectors and vector provenance. Simulated review timestamps/values are kept in scenario provenance. Real verifiedEngagement/lastVerifiedAt remain unset and priceVerified remains false. This avoids falsely presenting invented measurements as real verification.

The generator is deterministic for its seed and timestamp, uses stable database keys, preserves existing users and records, and can be rerun without duplicating the cohort. Exported manifests read back persisted records on rerun. Generation, source tags and demo traffic are identifiable for exclusion from future real-data learning.

Tagged lab campaigns use exactly this 300-profile pool. Other demo cohorts retain their own pool, and ordinary non-demo campaigns exclude tagged/synthetic-test profiles. Live checks confirmed the lab candidate count is 300 and all five returned cards have 100% field completeness. Completeness is distinct from evidence coverage: there is no genuine calibrated reference distribution, so v1 remains conservative. Synthetic latent vectors are not provider embeddings or real semantic calibration evidence.

Run from server: `node scripts/seedCompleteDemo.js`. Set BIZI_DEMO_OUTPUT to the existing output folder to reuse the same local credentials. Do not commit generated local credentials. Existing lab credentials are saved in the task's outputs/BIZI_COMPLETE_300 folder, not the repository.

## Exact recommendation contract

Version: bizi-v1.1.0. The weights/formula are unchanged from v1; this version adds simulation isolation/guards and completeness/profile metadata. The original 50/50 algorithm remains the shadow baseline.

Suitability = 100 × Σ(weight × component score). Evidence coverage = 100 × Σ(weight × component coverage). Missing weights are not redistributed.

| Goal | Semantic | Engagement | Reach | Budget |
|---|---:|---:|---:|---:|
| awareness | .35 | .15 | .30 | .20 |
| engagement | .35 | .35 | .10 | .20 |
| conversion | .45 | .25 | .05 | .25 |
| balanced | .40 | .25 | .15 | .20 |

Semantic uses genuine measured anchors only with valid matching vector provenance and hashes. Otherwise it is .35 × campaign-niche token overlap with .25 coverage. Engagement uses a genuine cohort's empirical midrank percentile, discounting self reports by .5; without a valid cohort its score is zero. Reach is .5 × min(1,log(1+followers)/log(1+target)). Budget scores one only for fresh verified comparable quotes within a numeric cap; otherwise zero, with unknown prices eligible. Known platform/location mismatches, flagged creators and verified comparable over-budget quotes are excluded. Ties use coverage then profile id. Audience description is not independently asserted as verified alignment. These are heuristic defaults, not probability/ROI estimates or research-validated weights.

## RAG and OpenRouter

Live chat model: google/gemini-2.5-flash-lite. Retrieval embedding model: google/gemini-embedding-001 (3072 dimensions in the live test). Both are configurable in server/.env. The replacement key was read from local configuration, never copied into source code, exported reports or the browser. server/.env is ignored by Git. The key originally pasted into chat was not reused by the setup scripts.

The knowledge base contains curated product/methodology help plus authorized live campaign/settings/run or self-profile data. Role/ownership filtering precedes retrieval. Lexical retrieval chooses bounded candidates; configured embeddings add vector similarity. A persistent cache includes actor id, embedding model and content hash, with expiry. Chat receives the top sources and returns cited answers; unknown source ids are rejected. Invalid/unavailable generation falls back to retrieved extracts. Citation checking establishes that source ids exist; it cannot prove every model claim is entailed, and prompt-injection resistance is not an absolute guarantee.

There is no need to ingest tonnes of unrelated text. Add reviewed procedures, policies, explanations and relevant live records, evaluate question coverage, then expand the corpus where evidence is actually missing. The campaign CSV does not become an authority on creator prices, engagement rates or ROI simply because it has many rows.

## Assistant action enforcement

Supported actions: create_campaign, update_campaign_settings, generate_recommendations, update_creator_profile, update_creator_metrics. Server validation rejects other tools and extra fields. Proposals are actor/role bound, expire after ten minutes, and record the target's content hash. Confirmation rechecks live role, ownership, expiry and resource hash under a database transaction/lock. A committed proposal returns its stored result on repeat confirmation. Audit records track proposals and confirmations/failures. Model tool calls can only prepare previews; no model text executes SQL, code, arbitrary URLs or system commands.

The UI and API make no claim that a preview has already changed the app. A natural-language request is model interpretation and may be declined or misunderstood; the visible fields and explicit confirmation remain essential. Direct typed forms provide a deterministic alternative.

## Validation

- 43 automated tests passed: 34 backend and 9 client.
- Production build passed; lint has no errors and retains two pre-existing state-in-effect warnings.
- Additive assistant tables migrated successfully; existing data preserved.
- Repeated seeding confirmed exactly 300 lab profiles and 12 seed campaigns without duplication.
- Live MySQL/API checks exercised all five actions, both roles, duplicate confirmation, stale previews, cancellation, cross-tenant denial, cohort isolation, saved ranking snapshots and citations.
- Live OpenRouter checks verified embeddings, generated cited answers, hybrid retrieval and model-produced previews. The live model-generated test preview was cancelled without mutation.
- Frontend HTTP response is 200 with the rebuilt bundle.
- Automated browser inspection was blocked by browser security policy. Visual layout and the complete browser walkthrough remain manual checks.

No trained outcome model, genuine production calibration dataset, ROI forecast, payment/messaging feature, deployment or unrestricted autonomous agent was added.

Source documentation: [OpenRouter RAG](https://openrouter.ai/docs/cookbook/evaluate-and-optimize/rag), [embeddings API](https://openrouter.ai/docs/api/api-reference/embeddings/submit-an-embedding-request), [tool calling](https://openrouter.ai/blog/tutorials/tool-calling/).
