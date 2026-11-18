# Container Deployment

Bizi is split into three application containers:

- `frontend`: Vite-built React app served by Nginx; Nginx proxies `/api/` to Express.
- `api`: Express service, connected privately to MySQL and FastAPI.
- `ml`: FastAPI recommendation service and its CPU-only PyTorch runtime.

The local Compose stack adds a MySQL container. In Railway, use its MySQL service and deploy the three application services separately. Never publish MySQL or the ML service to the public internet.

## Run locally with Docker Compose

Install Docker Desktop, make sure the approved artifacts exist in `server/Bizi_model_export/`, then from the repository root:

```powershell
Copy-Item .env.example .env
```

Replace the example database passwords and JWT secret in `.env`, then start the stack:

```powershell
docker compose up --build
```

The site is available at `http://localhost:8080`. Nginx serves the frontend and forwards API requests to the internal `api` service. MySQL data persists in the `mysql_data` volume.

Apply the project schema and migrations once the database is healthy. From another terminal:

```powershell
docker compose exec api npm run migrate
docker compose exec api npm run migrate:creator-platform
docker compose exec api npm run migrate:campaign-offers
docker compose exec api npm run migrate:assistant
docker compose exec api npm run migrate:geographic-suitability
```

To stop the app while preserving its database:

```powershell
docker compose down
```

`docker compose down -v` removes the database volume and all data in it.

## Deploy on Railway

Railway supports Dockerfile-based services, a MySQL service, and private service networking. Create four services in the same Railway project/environment:

1. **MySQL**: add Railway's MySQL template/service. Keep it private and retain its persistent volume.
2. **API**: deploy this repository with root directory `/server` and Dockerfile `Dockerfile`.
3. **ML**: deploy this repository with root directory `/server` and Dockerfile `ml/Dockerfile`.
4. **Frontend**: deploy this repository with root directory `/client` and Dockerfile `Dockerfile`. Generate a public domain for this service only.

Set the following variables on the API service. Use Railway variable references, selecting the exact MySQL and ML service names if they differ:

```text
PORT=5000
NODE_ENV=production
DB_HOST=${{mysql.MYSQLHOST}}
DB_PORT=${{mysql.MYSQLPORT}}
DB_USER=${{mysql.MYSQLUSER}}
DB_PASSWORD=${{mysql.MYSQLPASSWORD}}
DB_NAME=${{mysql.MYSQLDATABASE}}
JWT_SECRET=<generate a unique random secret of at least 32 characters>
BIZI_ML_SERVICE_URL=http://${{ml.RAILWAY_PRIVATE_DOMAIN}}:8000
BIZI_ML_SERVICE_TIMEOUT_MS=90000
```

Set these variables on the ML service and configure its health check path to `/health`:

```text
PORT=8000
```

Create a persistent volume for the ML service mounted at `/app/Bizi_model_export`. Model artifacts are excluded from Git and Docker build contexts. Upload the approved local model export directly to that volume with the Railway CLI; do not make creator data or model artifacts public:

```powershell
railway volume files upload .\server\Bizi_model_export /
```

Use the CLI's `--volume` option if Railway asks which volume to use. The uploaded directory must include `feature_config.json`, `final_model.joblib`, `tfidf_vectorizer.joblib`, `creator_profiles.csv`, and the complete `all-MiniLM-L6-v2` directory. The ML container checks these files before starting.

Set the frontend variables and configure its health check path to `/healthz`:

```text
PORT=8080
API_UPSTREAM=http://${{api.RAILWAY_PRIVATE_DOMAIN}}:5000
```

The frontend is the only service that needs a public domain; its Nginx proxy calls the API over Railway private networking. The API calls ML and MySQL over private networking.

After all services are healthy, run the schema and migrations once from the API service's Railway shell:

```sh
npm run migrate
npm run migrate:creator-platform
npm run migrate:campaign-offers
npm run migrate:assistant
npm run migrate:geographic-suitability
```

Do not run schema migrations automatically on every container start.

## Trial and artifact constraints

Railway's [free trial](https://docs.railway.com/pricing/free-trial) currently provides a one-time $5 credit for up to 30 days, then reverts to the Free plan. Trial projects are limited to five services, 1 GB RAM per service, and shared CPU; this deployment uses four services. The ML container's RAM and startup time are the main trial risks. Check usage and set billing alerts before leaving it deployed. Free-tier credits and service limits can change.

The model export is intentionally excluded from Git. The ML service requires the separate model volume and has a slower initial startup while it loads the local sentence-transformer model and warms creator embeddings. If the trial instance cannot keep the ML service healthy within its memory or startup limits, use a larger plan or a host with enough RAM. Export/backup MySQL data before trial credits or database resources expire.

## Deploy on Render with FreeDB MySQL

The zero-cost layout uses three Render services: a public React frontend, a public Express API, and a public FastAPI model web service. The model service accepts prediction and warmup requests only with a shared bearer token; its health endpoint is public for Render's health check. MySQL remains on FreeDB. Do not use Render Private Services for the model on the free tier.

The model export is excluded from Git. Keep it in a **private Hugging Face model repository** and set these environment variables on the Render model service:

```text
HF_MODEL_REPO_ID=<owner/private-model-repository>
HF_TOKEN=<read token for that private repository>
BIZI_ML_SERVICE_TOKEN=<generated long random shared secret>
```

The model container downloads the export from the private repository at each cold start into its ephemeral filesystem. Free Render services sleep when idle and lose local files when they restart, so startup includes downloading about 109 MB of artifacts before loading the model. The optimized FP16 model measured about 366 MB RSS / 432 MB peak locally; validate actual Render memory and startup logs before relying on the free instance.

Deploy the services from this repository's `main` branch (or the chosen deployment branch):

1. **Model API** — Render Web Service, Docker runtime; root directory `server`, Dockerfile `ml/Dockerfile`, health check `/health`, Free instance. Set the three model-service variables above.
2. **Business API** — Render Web Service, Node runtime; root directory `server`, build `npm ci`, start `npm start`, Free instance. Set `NODE_ENV=production`, `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, and `DB_SSL_CA` from FreeDB's connection details and CA certificate. Also set `JWT_SECRET`, `BIZI_ML_SERVICE_URL` to the model service's `https://<service>.onrender.com`, and `BIZI_ML_SERVICE_TOKEN` to the same shared random secret set on the model service. Health check `/health`.
3. **Frontend** — Render Web Service, Docker runtime; root directory `client`, Dockerfile `Dockerfile`, Free instance. Set `API_UPSTREAM=https://<api-service>.onrender.com`; health check `/healthz`.

Render free web services sleep after 15 minutes without traffic; initial requests after sleep can take about a minute. Their filesystem is ephemeral, so the model artifact download repeats after sleep/restart. Render's free services are for testing and hobby projects, not production. FreeDB's sandbox is limited to 100 MB and auto-deletes after 30 days; export the database before expiry. Do not seed synthetic test accounts in a production database.

After the API can connect to FreeDB, run the base schema and migrations once from the API service shell:

```sh
npm run migrate
npm run migrate:creator-platform
npm run migrate:campaign-offers
npm run migrate:assistant
npm run migrate:geographic-suitability
```
