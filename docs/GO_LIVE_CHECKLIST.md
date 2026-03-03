# Go-Live Checklist (Comprehensive)

## Security
- [ ] All exposed credentials rotated.
- [ ] `backend/.env` is not tracked in git.
- [ ] Git history rewritten if secrets were committed.
- [ ] JWT secrets are 32+ characters and non-placeholder.
- [ ] JWT refresh secret differs from access secret.
- [ ] Payment provider keys are production keys.
- [ ] Sentry DSN set for all services.
- [ ] Secret scanning enabled in CI.
- [ ] Principle of least privilege applied to service accounts.
- [ ] CORS restricted to production frontend domain.
- [ ] WS origins restricted to production frontend domain.

## Infrastructure
- [ ] MongoDB production cluster healthy.
- [ ] Redis production instance healthy.
- [ ] Kafka brokers healthy.
- [ ] Kafka topics exist (base/retry/dlq).
- [ ] Persistent volumes configured for data stores.
- [ ] `docker-compose.prod.yml` validated.
- [ ] All 8 service images build successfully.
- [ ] Health checks pass in container orchestration.
- [ ] Service restart policy configured.
- [ ] Internal networking between services verified.

## Configuration
- [ ] Per-service env variables populated.
- [ ] Port variables match runtime exposure.
- [ ] Inter-service URL variables are correct.
- [ ] RPC ports match callers and callees.
- [ ] Payment callback URLs point to production gateway.
- [ ] Kafka retry/DLQ env values configured.
- [ ] Feature flags set intentionally (`ENABLE_*_KAFKA`).
- [ ] SendGrid sender domain configured.
- [ ] Firebase credentials valid and scoped correctly.
- [ ] Exchange-rate provider keys set.

## Backend behavior
- [ ] Register flow creates wallet linkage correctly.
- [ ] Login flow handles 2FA-required path correctly.
- [ ] 2FA verify returns final auth tokens.
- [ ] Refresh token rotation and revocation tested.
- [ ] Logout clears refresh state and cookies.
- [ ] Role-based admin routes enforced.
- [ ] Ownership checks block cross-user access.
- [ ] Global validation blocks invalid DTOs.
- [ ] Sanitization blocks `$` and dotted-key payload injection.
- [ ] Rate limiting enforced on API paths.

## Payments and wallet
- [ ] M-Pesa STK initiation succeeds in sandbox/prod.
- [ ] M-Pesa callback maps idempotently to pending tx.
- [ ] B2C result/timeout handlers update status correctly.
- [ ] NOWPayments invoice uses `usdttrc20`.
- [ ] NOWPayments IPN signature verification succeeds.
- [ ] Confirmed crypto payments credit wallets exactly once.
- [ ] Failed/expired payments mark transactions failed.
- [ ] Withdrawal TRC20 address validation enforced.
- [ ] Wallet optimistic-lock retries handle contention.
- [ ] Daily limits enforce by user tier.
- [ ] Pending-transaction reconciliation job runs.

## Market engine
- [ ] Market close scheduler auto closes due markets.
- [ ] Auto-settlement runs and is idempotent.
- [ ] Consensus settlement is integrity-weighted.
- [ ] Ladder settlement requires exact sequence match.
- [ ] Betrayal settlement distributes correctly.
- [ ] Prediction duplicate placement is blocked.
- [ ] Daily bet volume limit enforced.
- [ ] Market events emitted to Kafka as expected.

## Real-time and notification
- [ ] WebSocket gateway starts Kafka consumer.
- [ ] WS clients authenticate and auto-join `user:{id}` room.
- [ ] Market/bet/wallet/notification WS broadcasts verified.
- [ ] Notification consumer handles retry topics.
- [ ] DLQ receives terminally failed consumer messages.
- [ ] SendGrid sends real email in production mode.
- [ ] FCM sends real push notifications in production mode.
- [ ] Notification preference filtering works (email/push).

## Observability
- [ ] JSON structured logs emitted by all services.
- [ ] `/health` endpoint present on all HTTP services.
- [ ] `/metrics` endpoint present on all HTTP services.
- [ ] Sentry receives exception events.
- [ ] Log aggregation wired (Railway/ELK/Datadog/etc.).
- [ ] Alerting rules configured for 5xx spikes and latency.

## Testing and release
- [ ] Unit tests pass in CI.
- [ ] E2E tests pass in CI.
- [ ] Critical payment workflow tested in staging.
- [ ] Critical market workflow tested in staging.
- [ ] Load test baseline captured.
- [ ] Rollback plan documented.
- [ ] Release notes prepared.
- [ ] On-call owner assigned for launch window.
- [ ] Post-launch monitoring dashboard reviewed.
- [ ] Incident response contact list available.
