# Phase 0 Security Runbook (Critical)

Use this runbook before production launch.

## 1) Rotate all leaked credentials immediately
- Rotate MongoDB credentials.
- Rotate Redis credentials.
- Rotate JWT secrets (`JWT_SECRET`, `JWT_REFRESH_SECRET`).
- Rotate all payment credentials (Daraja + NOWPayments).
- Rotate SendGrid and Firebase credentials.
- Rotate Sentry DSN if it was exposed with project access.

## 2) Move secrets to managed secret storage
- Railway: service-level variables in Railway Secrets.
- Alternative: AWS Secrets Manager / GCP Secret Manager / Doppler / Vault.
- Keep `.env` for local development only with fake/sandbox credentials.

## 3) Remove tracked `.env` from git history

Warning: history rewrite is destructive. Coordinate with the team first.

```bash
# from repository root
git checkout main
git pull --rebase

# remove tracked env files from all history
git filter-repo --path backend/.env --invert-paths

# force-push rewritten history
git push --force --all
git push --force --tags
```

Team follow-up after rewrite:
- Everyone reclones or resets local history to new origin.
- Revoke any previously cloned/deployed credentials anyway.

## 4) Enforce security checks in CI
- Fail CI if placeholder JWT secrets are used in production config.
- Fail CI on accidental `.env` commits.
- Add secret scanning (Gitleaks/TruffleHog/GitHub secret scanning).

## 5) Immediate verification checklist
- [ ] No live secrets in tracked files.
- [ ] No live secrets in build artifacts/logs.
- [ ] Production variables set in secret manager.
- [ ] Secret rotation ticket closed with audit evidence.
