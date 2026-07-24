# Production release checklist

## Before deployment

- [ ] Database backup completed and the latest restore verification is `SUCCEEDED`.
- [ ] `SESSION_SECRET` and `EMAIL_CODE_SECRET` are independent values of at least 32 characters.
- [ ] `PUBLIC_APP_URL` is the production HTTPS origin and `SESSION_COOKIE_SECURE` is not disabled.
- [ ] PostgreSQL, Redis, COS, Ark, SMTP, and administrator identifiers are configured.
- [ ] `npm ci`, `npm run test:regression`, `npm run typecheck`, and `npm run build` pass.
- [ ] Database migration is reviewed and a rollback window is scheduled.

## After deployment

- [ ] Web, Worker, timers, PostgreSQL, and Redis are healthy.
- [ ] Upload confirmation returns `PENDING_REVIEW`, never `READY`.
- [ ] An administrator can approve and reject upload and output review records.
- [ ] Pending output cannot be previewed or downloaded by its owner or an unauthenticated request.
- [ ] Approval settles frozen points; rejection and execution failure refund exactly once.
- [ ] Complaint submission, administrator notes, closure, audit events, and email delivery work.
- [ ] User freeze revokes sessions; unfreeze allows a new login.
- [ ] Password reset revokes all previous sessions; login rate limiting returns HTTP 429.
- [ ] Account deletion is blocked while tasks or frozen points remain.
- [ ] `aigc-lifecycle-maintenance.timer` is active; a manual run reports zero unexpected failures.
- [ ] A queued task can be canceled exactly once and its frozen points are fully restored.
- [ ] Review and notification backlog checks appear as `up` in `/api/health/`.
- [ ] `npm run verify:ark-video` passes and its JSON report is archived with the release record.

## Rollback triggers

- Any access to a non-`READY` asset through user APIs.
- Wallet balance or ledger mismatch, duplicate settlement, or missing rejection refund.
- Worker cannot move generated output to `PENDING_REVIEW`.
- Authentication accepts a revoked, expired, suspended, or deleted session.
