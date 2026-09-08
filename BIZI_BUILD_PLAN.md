# Bizi — Master Build Plan
Reference document for guiding GitHub Copilot through implementation. This mirrors Chapter 3 of the proposal exactly — no architectural decisions here should contradict it.

## Stack (Section 3.8)
- Frontend: React.js
- Backend: Node.js + Express.js
- Database: MySQL
- LLM API: Google Gemini API — campaign requirement extraction only
- Embeddings: Google Gemini embeddings model (`text-embedding-004` / `gemini-embedding-001` — confirm current model name in AI Studio docs at build time) — semantic scoring only. Free tier: up to 1,500 requests/day, sufficient for this project's scale (one embedding per profile save, one per campaign creation — not per recommendation call, since embeddings are precomputed and stored).
- Note: both the LLM extraction (Increment 4) and embeddings (Increment 5) can share a single Gemini API key, simplifying config to one GEMINI_API_KEY env var instead of two separate providers.
- Version control: Git + GitHub

## Increment Order (Section 3.9) — build strictly in this order
1. **User Authentication** — business/creator/admin registration, login, roles, access control
2. **Creator Profile Management** — profile creation, public handle submission, verification fields
3. **Campaign Management** — structured form campaign creation
4. **AI Campaign Assistant** — natural-language extraction (LLM, structured JSON output only)
5. **Hybrid Recommendation Engine + Explanation Module** — hard filter → semantic score → rule score → weighted final score → template explanation

Each increment must be a working, testable slice before starting the next. Do not build Increment N+1 logic inside Increment N.

## Database Schema (Section 3.5.5) — build in Increment 1–2
Tables: `users`, `businesses`, `creators`, `creator_profiles`, `campaigns`, `recommendations`, `administrators`

Key fields to preserve:
- `creator_profiles`: stores BOTH `self_reported_engagement` and `verified_engagement` (never overwrite one with the other — Section 3.3.3 discrepancy-flagging depends on keeping both)
- `creator_profiles.niche_embedding` and `campaigns.niche_embedding`: stored as JSON/vector, computed once (at profile save / campaign creation), never recomputed per recommendation call
- `recommendations`: stores `semantic_score`, `rule_score`, `final_score`, `explanation_text` separately — never store only the final score, traceability is a stated design requirement (3.5.5, 3.7.6)

## Recommendation Engine logic (Section 3.7) — build in Increment 5, in this exact order
1. **Hard-constraint filter** (3.7.2): budget, platform, location — pass/fail, not scored
2. **Semantic score** (3.7.3): cosine similarity between campaign embedding and creator embedding → `s_semantic` (0–1)
3. **Rule score** (3.7.4): weighted match on verified engagement rate + follower bracket → `s_rules` (0–1), formula `s_rules = Σ(wᵢ×sᵢ)/Σwᵢ`
4. **Final score** (3.7.5): `final = (0.5 × s_semantic) + (0.5 × s_rules)` — weights must be config constants, not hardcoded inline, since they're tunable per 3.10.2
5. **Explanation** (3.7.6): template-based only, built directly from the three stored scores. **Never call an LLM here.**

## AI Campaign Assistant logic (Section 3.6) — build in Increment 4
- Single LLM call per campaign creation (not per recommendation)
- Output MUST be constrained JSON: `{niche, target_audience, location, preferred_platforms, budget_range, campaign_goal}`, nulls for missing fields
- If output is ambiguous/incomplete, UI must prompt business for the missing field directly — do not let the LLM guess

## Creator Verification (Section 3.3.3) — build in Increment 2, admin-only feature
- Admin reviews live public profile manually (no automated scraping/API in this scope)
- Admin-entered inputs: likes+comments for last 5 posts, current follower count
- System computes: `verified_engagement = (Σ(likes+comments) over 5 posts) / (followers × 5) × 100`
- If self-reported vs. verified diverges beyond a threshold, flag record for review (store a boolean/flag field, don't auto-reject)
- Creators with fewer than 5 posts: mark `verification_status = 'unverified'`, still usable in recommendations with reduced confidence weighting (per our earlier cold-start patch)

## Non-negotiable architectural rules (don't let Copilot drift from these)
- LLM is used ONLY for campaign extraction (Increment 4). It never scores, ranks, or writes explanations.
- Embeddings model is used ONLY for niche/audience text. Never embed structured fields (budget, platform, location).
- Explanation generation is template-based, zero API calls.
- Recommendation weights (`w_semantic`, `w_rules`) live in one config location, not hardcoded in multiple places.
- Every recommendation row stores its score breakdown, not just the final number.

## Testing/evaluation targets to keep in mind while building (Section 3.10)
- Sample dataset: ~50–100 synthetic creator profiles, ~15–20 test campaigns (Section 3.3.4)
- Split sample data into tuning subset (weight tuning) and held-out test subset (final reporting) — keep these separate from day one, don't reuse the same rows for both
- Metrics to compute later: Precision@5, NDCG, vs. rule-based-only baseline and random baseline