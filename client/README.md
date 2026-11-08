# Bizi Client

This is the React/Vite frontend for the Bizi creator marketplace. It supports Business and Creator sessions, campaign management, ML recommendations, applications, and invitations. The client does not connect to Instagram or process payments.

For full architecture, model artifact requirements, setup, environment variables, migrations, and limitations, see the root [README](../README.md).

From `client/`:

```powershell
npm install
npm run dev
npm test
npm run build
```

Set `VITE_API_BASE_URL` when the Express API is not at `http://localhost:5000`.
