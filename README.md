# Bizi

Bizi is a two-sided creator-marketing marketplace. Businesses create campaigns, publish them, review ML-ranked creator profiles, invite registered Bizi creators with budget-derived offers, and review applications. Creators manage a Bizi profile, discover open campaigns, apply, and accept or decline invitations.

## Architecture

- React/Vite frontend in `client/`
- Node.js/Express API in `server/`
- MySQL database
- Python/FastAPI creator recommendation service
- JWT authentication with Business and Creator roles

The browser stores the bearer token in `localStorage` and validates it through `GET /api/auth/session` on reload. Tokens expire after 24 hours and sign-out removes the stored session. Because `localStorage` is accessible to JavaScript, this is less resistant to XSS than an HttpOnly cookie.

The active business recommendation flow is `POST /api/campaigns/:campaignId/ml-recommendations`. Express checks ownership and sends campaign/business text to FastAPI. FastAPI ranks a separate 2,362-profile ML catalog. Those catalog identities are not registered Bizi creator accounts; no identity mapping exists. Invitations target actual Bizi `creatorId` values only.

## Recommendation Model

The serving model is a trained Logistic Regression classifier. It uses this fixed feature order, matching `server/Bizi_model_export/feature_config.json` and `server/ml/app/predictor.py`:

1. `text_similarity`
2. `semantic_similarity`
3. `log_creator_followers`
4. `log_creator_following`
5. `log_creator_post_count`
6. `baseline_er_missing`

TF-IDF and the saved sentence-transformer produce text and semantic similarities. The saved scaler transforms all six features before the model produces ranking scores. The current serving catalog has no creator-specific historical engagement-rate evidence, so `baseline_er_missing` is 1 for every catalog creator and does not distinguish rankings. Creator bio email/phone contact strings are removed before feature construction and from recommendation responses.

Scores are model ranking values, not calibrated probabilities. Recommendations do not guarantee performance, conversions, or campaign outcomes and do not replace business judgement. The repository does not establish the candidate-set methodology behind offline Recall@ claims, so no Recall figure is presented as accuracy.

### Local Model Artifacts

FastAPI expects these files under `server/Bizi_model_export/`:

- `final_model.joblib`
- `scaler.joblib`
- `tfidf_vectorizer.joblib`
- `feature_config.json`
- `creator_profiles.csv`
- `all-MiniLM-L6-v2/`

These large/data-bearing artifacts are intentionally excluded from Git. No download URL is configured; a fresh checkout/deployment must receive approved artifacts through the project's controlled artifact handoff. The application does not retrain the model.

## Marketplace Workflow

Businesses set a campaign total budget, currency, and target creator count. The estimated offer is `totalBudget / targetCreatorCount`; it is a budget-derived starting point, not a creator market rate. Businesses may adjust each invitation amount. Active pending and accepted invitation offers reserve budget; declines and expirations release it. Accepted applications fill creator slots but have no offer amount and do not reserve offer budget. Pending invitations do not count as filled slots.

Only open campaigns can receive recommendations, creator applications, or business invitations. Businesses manage only their own campaigns. Creators see only their own applications and invitations.

## Setup

Install Node dependencies in both `client/` and `server/`. Provide a local `server/.env` with MySQL settings and a JWT secret, and install `server/ml/requirements.txt` in a Python environment. Keep secrets in environment files; never commit them.

From `server/`, run the required migrations after the base schema:

```powershell
npm run migrate
npm run migrate:creator-platform
npm run migrate:campaign-offers
npm run migrate:assistant
```

For the optional complete synthetic demo seed/provenance tables, also run `npm run migrate:demo-support`, then `node scripts/seedCompleteDemo.js`. Historical recommendation V1 tables are retained for existing data/demo support, but V1 recommendation routes and ranking code have been retired.

The optional older `npm run seed` development seeder requires `BIZI_TEST_SEED_PASSWORD` to be set in the local environment; the repository contains no default seed password.


Start MySQL, then start FastAPI from `server/`:

```powershell
.venv\Scripts\python.exe -m uvicorn ml.app.main:app --host 127.0.0.1 --port 8001
```

Start Express with `node server.js` in `server/`, and Vite with `npm run dev` in `client/`. Express uses `BIZI_ML_SERVICE_URL` if set, otherwise `http://127.0.0.1:8001`.

## Current Limitations

- Instagram API integration is not configured and is not required for the marketplace workflow. Platform text is profile/campaign information, not a connected account or live metric.
- Payments, escrow, and payment processing are not implemented.
- ROI, revenue, and campaign-outcome prediction are not implemented.
- ML catalog profiles are not linked to marketplace creator accounts.
- Most current Bizi creator accounts in the local database are synthetic/demo. At the 2026-11-02 database audit: 360 synthetic/demo and 1 ordinary creator; campaigns were 58 draft and 1 open. These point-in-time totals change as data changes.
- Messaging, active-collaboration tracking, and creator analytics dashboards are not implemented.

## Checks

From the repository root:

```powershell
npm --prefix server test
npm --prefix client test
npm --prefix client run lint
npm --prefix client run build
server/.venv/Scripts/python.exe -m unittest discover -s server/ml/app -p test_*.py
```

FastAPI health is available at `GET /health`.
