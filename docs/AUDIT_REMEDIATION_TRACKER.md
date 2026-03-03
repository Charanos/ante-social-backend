# Backend Audit Remediation Tracker

Last updated: 2026-02-22

This tracks each original audit finding as one of:
- `Fixed in code`
- `Fixed + validated`
- `External/manual action required`

## 1) Architecture and bootstrap
- 8 services + expected ports: `Fixed + validated`
- WebSocket Kafka microservice bootstrap: `Fixed + validated`
- Production bootstrap hardening (helmet, compression, validation, sanitization, exception filters, health/metrics): `Fixed + validated`

## 2) Shared libs and persistence
- `libs/database` repository abstraction layer: `Fixed in code` (base repository + user + wallet repositories, exported)
- Required schema references (`walletId` on User and Transaction): `Fixed in code`
- Market type `betrayal` replacing `syndicate`: `Fixed in code`
- Exchange rate pair constrained to USD/KSH: `Fixed in code`
- Required indexes (market category/close-time, transaction user+type+status+createdAt): `Fixed in code`

## 3) Auth and authorization
- Refresh-token rotation/revocation flow: `Fixed + validated`
- 2FA alignment to speakeasy: `Fixed in code` (with fallback if package missing)
- Roles guard and ownership checks: `Fixed + validated`

## 4) Security controls
- Global validation/sanitization and exception filters across services: `Fixed + validated`
- Redis-backed rate limiting guard in core services: `Fixed in code`
- API gateway rate-limiting middleware (Redis): `Fixed in code`
- WebSocket CORS restricted by env allowlist: `Fixed in code`
- XSS/NoSQL sanitization middleware: `Fixed in code`

## 5) Payments
- M-Pesa callback idempotent transaction mapping + status lifecycle: `Fixed in code`
- M-Pesa callback source checks (token/IP allowlist): `Fixed in code`
- NOWPayments USDT TRC20 flow + IPN signature validation + wallet crediting: `Fixed + validated`
- NOWPayments env compatibility (`NOWPAYMENTS_IPN_SECRET` / `NOWPAYMENTS_IPN_KEY`): `Fixed + validated`
- USDT TRC20 withdrawal address validation: `Fixed in code`

## 6) Wallet robustness
- Mongo sessions/transactions for state-changing wallet flows: `Fixed in code`
- Optimistic-lock update by `version`: `Fixed in code`
- Tier-based daily limits from user profile: `Fixed in code`
- Metadata alignment (`paymentMetadata`): `Fixed in code`
- Pending transaction reconciliation path: `Fixed in code`

## 7) Market engine
- Integrity-weighted consensus settlement: `Fixed + validated`
- Ladder exact-sequence matching: `Fixed + validated`
- Betrayal settlement implementation: `Fixed + validated`
- Auto close -> settle idempotent flow: `Fixed + validated`
- Daily bet-volume checks: `Fixed in code`
- Duplicate-placement protection: `Fixed in code` (unique index + duplicate refund path)

## 8) WebSocket and Kafka maturity
- WS Kafka consumer activation: `Fixed + validated`
- Authenticated user auto-join room strategy: `Fixed in code`
- Kafka retry + DLQ topics provisioning: `Fixed in code`
- Kafka retry + DLQ routing on consumer failure (WS/notification/reputation): `Fixed in code`
- Consumer-group governance via env per service: `Fixed in code`

## 9) Notifications
- In-app persistence and dispatch: `Fixed in code`
- SendGrid real provider path: `Fixed in code`
- Firebase FCM real provider path (firebase-admin): `Fixed in code`
- Notification preference filtering at dispatch (email/push): `Fixed in code`

## 10) Environment and config
- Per-service `.env.example` files: `Fixed in code`
- Central env validation at startup: `Fixed + validated`
- Env mismatch fixes (NOWPayments/Firebase compatibility): `Fixed + validated`
- Critical leaked secrets in tracked `.env`: `External/manual action required`
- Secret rotation and vault migration: `External/manual action required`

## 11) Docker and deployment artifacts
- Dockerfiles for all 8 services: `Fixed in code`
- `docker-compose.prod.yml` with health checks and service dependencies: `Fixed in code`
- Local compose syntax/runtime validation: `External/manual action required` (Docker CLI unavailable in current execution environment)

## 12) Testing
- Unit tests present: `Fixed + validated`
- E2E tests present: `Fixed + validated`
- Deterministic settlement math tests: `Fixed + validated`
- Full business-flow E2E suite (wallet/payments/market lifecycle/group bets): `External/manual action required`
- Load testing: `External/manual action required`

## 13) Observability
- Structured JSON logger usage: `Fixed in code`
- Sentry bootstrap wiring: `Fixed in code`
- `/health` and `/metrics` endpoints: `Fixed + validated`
- Full distributed tracing stack rollout: `External/manual action required`
