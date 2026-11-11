# Bizi Development Status

This file records the repository state, not the original proposal. The user-facing overview, setup, model contract, local artifact requirements, limitations, and verification commands are maintained in [README.md](README.md).

## Current implementation

- React/Vite client, Express API, MySQL database, and Python/FastAPI recommendation service.
- Business and Creator roles use JWT authentication and server-side authorization.
- Businesses create campaigns, set total budget/currency/creator target, publish/open campaigns, request ML recommendations, invite registered Bizi creators with offers, and review applications.
- Creators maintain a profile, discover open campaigns with budget/target information, apply, and accept or decline their own invitations.
- The active business recommendation endpoint is `POST /api/campaigns/:campaignId/ml-recommendations`; it proxies the trained Random Forest model in FastAPI.
- The 2,362-profile ML catalog is a separate identity system from Bizi creator accounts. No mapping is implemented.
- Legacy recommendation run/event tables remain for existing records and optional demo metadata; their route and service implementation is retired.
- The ROI training direction, dataset, and generated ROI models are removed. ROI/outcome prediction is not implemented.
- Instagram API integration, messaging, active-collaboration tracking, analytics dashboards, payments, and escrow are not implemented.

## Data snapshot

A read-only database query on 2026-11-02 counted 360 synthetic/demo creators and 1 ordinary creator. Campaigns were 58 draft and 1 open. These are point-in-time database counts and will change with application data.
