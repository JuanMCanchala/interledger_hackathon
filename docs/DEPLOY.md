# Deploying to Railway

MiPlante runs as three Railway services in one project:

| Service    | Source                                    | Public URL                          | Notes                                                          |
| ---------- | ----------------------------------------- | ----------------------------------- | -------------------------------------------------------------- |
| `Postgres` | Railway PostgreSQL template               | —                                   | Provides `DATABASE_URL`                                        |
| `backend`  | `backend/` (Dockerfile + `railway.json`)  | `https://<backend>.up.railway.app`  | Applies Prisma migrations on start, health check `/api/health` |
| `frontend` | `frontend/` (Dockerfile + `railway.json`) | `https://<frontend>.up.railway.app` | What people open: pages and `/api` are proxied to the backend  |

People only ever use the **frontend URL**: the QR codes, the wallet consent callbacks and the API
all go through it, so the phone needs no tunnel.

## 1. Log in and create the project

```bash
npm install -g @railway/cli        # or prefix every command with: npx @railway/cli
railway login                      # opens the browser (railway login --browserless prints a code)
railway init --name miplante
railway add --database postgres
```

## 2. Backend

```bash
railway add --service backend
railway domain --service backend   # note the URL: BACKEND_URL
```

Variables (`railway variables --service backend --set "KEY=value"`, or the dashboard):

| Variable                   | Value                                                                        |
| -------------------------- | ---------------------------------------------------------------------------- |
| `DATABASE_URL`             | `${{Postgres.DATABASE_URL}}`                                                 |
| `OP_CLIENT_WALLET_ADDRESS` | `https://ilp.interledger-test.dev/tienda-billeticos`                         |
| `OP_KEY_ID`                | Key ID from the test wallet                                                  |
| `OP_PRIVATE_KEY`           | The private key in base64: `base64 -w0 private.key`                          |
| `OP_ALLOWED_WALLET_HOSTS`  | `ilp.interledger-test.dev`                                                   |
| `PUBLIC_BASE_URL`          | The **frontend** URL (consent callbacks reach the backend through its proxy) |
| `FRONTEND_URL`             | The **frontend** URL                                                         |

Deploy from the service folder, so `backend/` is the build root:

```bash
cd backend && railway up --service backend --detach
```

## 3. Frontend

```bash
railway add --service frontend
railway domain --service frontend  # FRONTEND_URL
railway variables --service frontend --set "BACKEND_INTERNAL_URL=<BACKEND_URL>"
cd frontend && railway up --service frontend --detach
```

`BACKEND_INTERNAL_URL` is read when Next.js builds (the rewrites are compiled in), so redeploy the
frontend whenever the backend URL changes. After creating the frontend domain, set it as
`PUBLIC_BASE_URL` and `FRONTEND_URL` on the backend; Railway redeploys it.

## 4. Check

```bash
curl https://<frontend>/api/health                       # {"ok":true}
railway run --service backend npx tsx scripts/check-wallet.ts
```

Then onboard the shop at `https://<frontend>/onboard.html`, approve in the wallet and pay a sale from
a phone by scanning the QR.

## Notes

- **One backend replica is enough.** Settlement is claimed atomically in PostgreSQL, so more replicas
  would not split a sale twice, but the background sweeper would run once per replica.
- **Secrets** live only in Railway variables: the private key is never in the image (`.dockerignore`)
  or in git.
- **Local development is unchanged:** `npm run docker:up` overrides both images' commands with the
  watch-mode servers.
