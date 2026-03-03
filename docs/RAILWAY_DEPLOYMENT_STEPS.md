# Railway Deployment Steps (8 Services)

## 1) Prerequisites
- Railway account with project billing enabled.
- GitHub repo connected to Railway.
- MongoDB, Redis, and Kafka strategy decided:
  - Option A: managed providers (recommended for production).
  - Option B: self-hosted containers.

## 2) Create Railway project and services
- Create one Railway project.
- Create services:
  - `api-gateway`
  - `auth-service`
  - `market-engine`
  - `wallet-service`
  - `notification-service`
  - `websocket-gateway`
  - `admin-service`
  - `reputation-engine`

## 3) Build/deploy configuration per service
- Root directory: `backend`
- Dockerfile path:
  - `apps/api-gateway/Dockerfile`
  - `apps/auth-service/Dockerfile`
  - `apps/market-engine/Dockerfile`
  - `apps/wallet-service/Dockerfile`
  - `apps/notification-service/Dockerfile`
  - `apps/websocket-gateway/Dockerfile`
  - `apps/admin-service/Dockerfile`
  - `apps/reputation-engine/Dockerfile`

## 4) Required variables (minimum)
- Shared:
  - `NODE_ENV=production`
  - `DATABASE_URL=...`
  - `REDIS_URL=...`
  - `KAFKA_BROKERS=...`
  - `JWT_SECRET=...` (strong, 32+ chars)
  - `JWT_REFRESH_SECRET=...` (strong, distinct)
  - `SENTRY_DSN=...`
- Service ports:
  - `API_GATEWAY_PORT=3001`
  - `AUTH_SERVICE_PORT=3002`
  - `MARKET_ENGINE_PORT=3003`
  - `WALLET_SERVICE_PORT=3004`
  - `NOTIFICATION_SERVICE_PORT=3005`
  - `WEBSOCKET_GATEWAY_PORT=3006`
  - `ADMIN_SERVICE_PORT=3007`
  - `REPUTATION_ENGINE_PORT=3008`
- RPC ports:
  - `AUTH_SERVICE_RPC_PORT=4002`
  - `MARKET_ENGINE_RPC_PORT=4003`
  - `WALLET_RPC_PORT=4004`
  - `NOTIFICATION_RPC_PORT=4005`
  - `ADMIN_SERVICE_RPC_PORT=4007`
- Kafka resiliency:
  - `KAFKA_MAX_RETRIES=3`
  - `KAFKA_RETRY_SUFFIX=.retry`
  - `KAFKA_DLQ_SUFFIX=.dlq`

## 5) Public routing
- Expose `api-gateway` publicly.
- Expose `websocket-gateway` publicly (if direct socket endpoint is needed).
- Keep other services internal/private.

## 6) Inter-service URLs
- Set in `api-gateway`:
  - `AUTH_SERVICE_URL=http://auth-service:3002`
  - `MARKET_SERVICE_URL=http://market-engine:3003`
  - `WALLET_SERVICE_URL=http://wallet-service:3004`
  - `NOTIFICATION_SERVICE_URL=http://notification-service:3005`
  - `ADMIN_SERVICE_URL=http://admin-service:3007`
- Set CORS/WS origins:
  - `FRONTEND_URL=https://<frontend-domain>`
  - `CORS_ORIGINS=https://<frontend-domain>`
  - `WS_ALLOWED_ORIGINS=https://<frontend-domain>`

## 7) Post-deploy checks
- `GET /health` returns healthy for each HTTP service.
- `GET /metrics` returns Prometheus output.
- Auth register/login/refresh/logout succeeds.
- Wallet deposit/withdrawal flows are consistent in sandbox.
- WS auth + room join + broadcast events work.

## 8) Rollback strategy
- Keep previous successful deployment pin.
- Roll back by redeploying previous commit SHA.
- Preserve DB migration compatibility before rollback.
