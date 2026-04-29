# Platform Hardening Checklist

## Queue and Background Jobs

- Outcomes refresh now supports async queue mode via `POST /api/reports/outcomes/refresh`.
- Poll queued work with `GET /api/reports/outcomes/jobs/:jobId`.
- Queue jobs are now persisted in the `jobs` table for restart-safe operational visibility.
- Use `x-admin-key` for all sensitive operational endpoints.

## SQLite to Postgres Migration Path

1. **Schema parity:** mirror `announcements`, `saved_reports`, `report_outcomes`, `recommendations`, `recommendation_actions`, `policy_versions`, `jobs`, `company_thesis_memory`, and cache tables in Postgres.
2. **Dual-write phase:** write to SQLite and Postgres for operational endpoints, compare row counts/checksums daily.
3. **Read shadowing:** compare sampled Postgres reads against SQLite results.
4. **Cutover:** switch reads to Postgres behind an env flag.
5. **Rollback plan:** preserve SQLite writes for one release window.

## Metrics and Alerting

- Metrics endpoint: `GET /api/metrics` (`x-admin-key` required).
- Track at minimum:
  - `requestsTotal`, `errorsTotal`, `avgLatencyMs`
  - `queueEnqueued`, `queueCompleted`, `queueFailed`, queue depth
  - Decision metrics: recommendation calibration sample count, brier-like score, and per-band hit-rate
- Recommended alerts:
  - Error rate > 5% over 5 minutes
  - Queue depth > 25 for 10 minutes
  - `queueFailed` incrementing continuously
  - Avg latency > 2500ms sustained for 10 minutes

## Authz Hardening

- Protect all write-heavy/report-refresh/thesis mutation endpoints with `x-admin-key`.
- Keep `ADMIN_API_KEY` only in server env, never in frontend bundles.
- Rotate key on compromise or personnel change.
