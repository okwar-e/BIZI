# Bizi

Bizi is a two-sided creator-marketing marketplace. Businesses create campaigns, publish them, review ML-ranked creator profiles, invite registered Bizi creators with budget-derived offers, and review applications. Creators manage a Bizi profile, discover open campaigns, apply, and accept or decline invitations.

## Architecture

- React/Vite frontend in `client/`
- Node.js/Express API in `server/`
- MySQL database
- Python/FastAPI creator recommendation service
- JWT authentication with Business and Creator roles

The browser stores the bearer token in `localStorage` and validates it through `GET /api/auth/session` on reload. Tokens expire after 24 hours and sign-out removes the stored session. Because `localStorage` is accessible to JavaScript, this is less resistant to XSS than an HttpOnly cookie.

The active business recommendation flow is `POST /api/campaigns/:campaignId/ml-recommendations`. Express checks campaign ownership, selects creator accounts with usable profile text, and sends their stored profile features to FastAPI. The 2,362 source rows can be seeded as ordinary Bizi creator test accounts with linked profiles; these are synthetic test identities, not verified or contactable real-world creators. Dataset-derived accounts are visible in the business creator directory and can be invited for end-to-end workflow testing. The model uses creator text and follower, following, and post counts; absent counts are shown as unlisted and treated as zero only in the model input. The missing-engagement indicator remains constant and does not distinguish candidates.

## Recommendation Model

The serving model is a trained Random Forest classifier selected by validation Recall@3. Its saved pipeline imputes missing values and uses this fixed feature order, matching `server/Bizi_model_export/feature_config.json` and `server/ml/app/predictor.py`:

1. `text_similarity`
2. `semantic_similarity`
3. `log_creator_followers`
4. `log_creator_following`
5. `log_creator_post_count`
6. `baseline_er_missing`

TF-IDF and the saved sentence-transformer produce text and semantic similarities. The six raw features are passed to the saved Random Forest pipeline, which handles missing values without a separate scaler. The current serving catalog has no creator-specific historical engagement-rate evidence, so `baseline_er_missing` is 1 for every catalog creator and does not distinguish rankings. Creator bio email/phone contact strings are removed before feature construction and from recommendation responses.

Random Forest class-1 scores are ranking values, not calibrated probabilities. The supplied comparison reports test ROC-AUC 0.6538, Recall@1 0.3675, Recall@3 0.7287, and Recall@5 0.8584; these offline metrics are not guarantees of live recommendation quality. Feature importances are global measures across the model's training data, not per-creator explanations. Recommendations do not guarantee performance, conversions, or campaign outcomes and do not replace business judgement.

### Local Model Artifacts

FastAPI expects these files under `server/Bizi_model_export/`:

- `final_model.joblib`
- `tfidf_vectorizer.joblib`
- `feature_config.json`
- `creator_profiles.csv`
- `all-MiniLM-L6-v2/`

These large/data-bearing artifacts are intentionally excluded from Git. No download URL is configured; a fresh checkout/deployment must receive approved artifacts through the project's controlled artifact handoff. The application does not retrain the model.

## Marketplace Workflow

Businesses set a campaign total budget, currency, and target creator count. The estimated offer is `totalBudget / targetCreatorCount`; it is a budget-derived starting point, not a creator market rate. Businesses may adjust each invitation amount. Active pending and accepted invitation offers reserve budget; declines and expirations release it. Accepted applications fill creator slots but have no offer amount and do not reserve offer budget. Pending invitations do not count as filled slots.

Only open campaigns can receive recommendations, creator applications, or business invitations. Businesses manage only their own campaigns. Creators see only their own applications and invitations.

## Geographic Suitability

Creator base location and audience locations are stored and shown separately. Audience locations are entered from a source by the creator, with optional source and date fields; Bizi does not infer or backfill geographic information. The creator can mark the reported audience-location list complete when the source provides a complete distribution.

Campaign location (where an in-person activation takes place) and target market (where the business wants to reach people) are distinct optional fields. Businesses can independently enable base-location and audience-market suitability signals. With both signals disabled, the campaign has no geographic restrictions.

Suitability is a transparent, qualitative signal shown for registered Bizi creators, separate from the trained ML relevance score. Place labels are compared after trimming and case-folding; this is exact label comparison, not geocoding or a distance/radius estimate. An absent creator base location is unknown. An absent audience-market match is only a confirmed mismatch if the creator marked the reported distribution complete; otherwise it is unknown. Legacy campaign `location` values are preserved but are not mapped to either new campaign concept.

For existing databases, run `npm run migrate:geographic-suitability` from `server/` after the other migrations. The migration adds nullable geographic fields and disabled-by-default flags without backfilling existing data. To roll back, first back up the database, then set `$env:BIZI_CONFIRM_GEOGRAPHIC_ROLLBACK='1'` and run `npm run rollback:geographic-suitability` from `server/`. Rollback drops the new columns and therefore permanently removes any geographic data entered since migration.

## Setup

Install Node dependencies in both `client/` and `server/`. Provide a local `server/.env` with MySQL settings and a JWT secret, and install `server/ml/requirements.txt` in a Python environment. Keep secrets in environment files; never commit them.

From `server/`, run the required migrations after the base schema:

```powershell
npm run migrate
npm run migrate:creator-platform
npm run migrate:campaign-offers
npm run migrate:assistant
npm run migrate:geographic-suitability
```

To seed the model's source catalogue as creator test accounts, run `npm run migrate:dataset-samples`, then set the local environment variable `BIZI_DATASET_SAMPLE_PASSWORD` to a password of at least 12 characters and run `npm run seed:dataset-samples`. The seed uses the source `creator_username` as its stable internal identifier, stores no source contact details, and marks generated audience descriptions or fallback model counts in provenance. Missing follower/following/post counts are generated deterministically for each source record; locations and engagement rates are left unset rather than invented. Seeded accounts use `.invalid` email addresses, share the configured local test password, and are blocked from production seeding. The script is safe to rerun. If you need to remove these accounts before they have applications, invitations, or recommendation evidence, run `npm run rollback:dataset-samples`. Historical recommendation V1 tables are retained for existing data/demo support, but V1 recommendation routes and ranking code have been retired.

To find a seeded test account's login email without exposing source contact data, query the local database:

```sql
SELECT c.publicHandle, u.email
FROM demo_dataset_records d
JOIN creators c ON c.creatorId = CAST(d.entityId AS UNSIGNED)
JOIN users u ON u.userId = c.userId
WHERE d.namespace = 'bizi-dataset-samples-v1'
  AND d.entityType = 'creator'
ORDER BY d.recordKey;
```

The optional older `npm run seed` development seeder requires `BIZI_TEST_SEED_PASSWORD` to be set in the local environment; the repository contains no default seed password.


## Container Deployment

For separate frontend, API, ML, and MySQL containers locally or a Railway free-trial deployment, see [Container Deployment](docs/CONTAINER_DEPLOYMENT.md).

## Start Bizi on Windows

1. Start MySQL using the XAMPP Control Panel.
2. Double-click [`start-bizi.bat`](./start-bizi.bat). It checks the Python environment, model artifacts, service ports, and MySQL, then opens separate terminals for FastAPI and Express. Keep both terminals open to see logs and errors. If either service is already responding, the script does not start another copy. On startup, FastAPI embeds the local creator catalog, so the first health check can take a few minutes.
3. In a separate terminal, start the React frontend:

   ```powershell
   cd client
   npm run dev
   ```

4. Open the Vite URL printed in the frontend terminal (normally `http://localhost:5173`).

The script starts FastAPI from `server/` with `.venv\Scripts\python.exe -m uvicorn ml.app.main:app --host 127.0.0.1 --port 8001`, so model paths resolve relative to the project. Express uses `npm start` in `server/` and its configured `PORT` (default `5000`). Its recommendation client uses `BIZI_ML_SERVICE_URL` if set, otherwise `http://127.0.0.1:8001`.

## Current Limitations

- Instagram API integration is not configured and is not required for the marketplace workflow. Platform text is profile/campaign information, not a connected account or live metric.
- Payments, escrow, and payment processing are not implemented.
- ROI, revenue, and campaign-outcome prediction are not implemented.
- Dataset-backed sample profiles are linked to system-managed Bizi records for recommendation serving, but are not real registered creators and are excluded from creator discovery and invitations.
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
