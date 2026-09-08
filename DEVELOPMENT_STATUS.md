# Bizi Development Status

## Current Stage

Bizi is currently at the end of Increment 2: Creator Profile Management.

The project has a React/Vite frontend, a Node.js/Express backend, and a MariaDB/MySQL-compatible database.

## Completed

### Project Structure

- `client/` contains the Vite + React application.
- `server/` contains the Express API.
- `client/src/pages/` and `client/src/services/` are ready for frontend feature work.
- `server/config/`, `server/routes/`, `server/controllers/`, `server/models/`, and `server/middleware/` organize backend code.

### Database

The migration schema creates these tables:

- `users`
- `businesses`
- `creators`
- `administrators`
- `creator_profiles`

The migration is idempotent because every table uses `CREATE TABLE IF NOT EXISTS`.

Run the migration from the server directory:

```powershell
cd server
npm run migrate
```

The local database configuration belongs in `server/.env`, which is intentionally ignored by git. Use `server/.env.example` as the template.

### Increment 1: User Authentication

Implemented backend authentication for business and creator users:

- Business registration
- Creator registration
- Login with bcrypt password hashing
- JWT tokens with a 24-hour expiry
- Token verification middleware
- Role authorization middleware
- Basic request validation

Auth endpoints:

- `POST /api/auth/register/business`
- `POST /api/auth/register/creator`
- `POST /api/auth/login`

### Increment 2: Creator Profile Management

Implemented creator profile operations:

- Create or update a creator profile
- Fetch the authenticated creator's profile
- Update self-reported engagement and follower metrics
- Creator-only route protection

Creator profile endpoints:

- `PUT /api/creator-profile`
- `GET /api/creator-profile/me`
- `PUT /api/creator-profile/metrics`

Profile creation currently handles these fields:

- `niche`
- `audienceDescription`
- `platforms`
- `location`

Self-reported metrics currently handle:

- `selfReportedEngagement`
- `followerCount`

Embedding generation, verification logic, and admin profile review are not implemented yet.

## How To Run The Backend

From the repository root:

```powershell
cd server
node server.js
```

The API runs on the port configured by `PORT` in `server/.env`, defaulting to `5000`.

## How To Run The Frontend

In a second terminal:

```powershell
cd client
npm install
npm run dev
```

Vite will print the local frontend URL in the terminal.

## Next Development Stage

Increment 3 is Campaign Management. It should add campaign creation and management without adding AI extraction or recommendation scoring yet.

Planned later increments:

1. Campaign Management
2. AI Campaign Assistant using Gemini for structured campaign field extraction
3. Hybrid Recommendation Engine and template-based explanations

The recommendation engine must remain separate from the AI campaign extraction logic. LLM calls must not be used for scoring, ranking, or explanation generation.

## GitHub

Repository: https://github.com/okwar-e/BIZI

The `main` branch is the active development branch.
