# EQRReports 100X Roadmap Tracker

This tracker converts the review into implementation checkpoints with ownership and verification gates.

## Phase 0 - Baseline and Safety

- [x] Contract normalization layer for report, market, portfolio, and saved-report APIs
- [x] Core unit/contract test suite (`npm run test:core`)
- [x] Structured backend request logging and request IDs
- [x] Remove insecure admin fallback behavior

## Phase 1 - Trust and Stability

- [x] Stronger typing and service extraction in frontend
- [x] Shared runtime validation for payload shape drift
- [x] Parser fallback matrix for additional Screener layout drift variants
- [x] Frontend degraded-source banner when upstream data falls back to stale/partial data

## Phase 2 - Structural Refactor

- [x] Extract scanner/report/fundamental/chart panels from `App.tsx`
- [x] Final decomposition of snapshot modal and residual portfolio custom-strategy UI
- [x] Eliminate remaining non-critical `any` in UI state and adapters

## Phase 3 - Moat Features

- [x] Outcome tracking foundations:
  - [x] `report_outcomes` table and persistence
  - [x] Refresh endpoint to compute 30/90/180d outcomes from saved reports
  - [x] Aggregate hit-rate/avg-return endpoint
  - [x] Wire outcomes into UI scorecards
- [x] Unified scoring engine with quality + valuation + momentum + risk buckets
- [x] Thesis memory and invalidation triggers persisted per company
- [x] Position sizing/rebalance suggestions with risk budgets

## Phase 4 - Platform and Scale

- [x] Queue/background job split for ingestion and heavy analytics
- [x] SQLite → Postgres migration path: `sql/postgres-schema.sql`, optional `POSTGRES_URL` dual-write mirror (`server/postgresMirror.ts`) for operational tables; compare row counts before cutover.
- [x] Production metrics + operational dashboard: `GET /api/metrics` (includes queue + decision calibration fields) and `GET /api/metrics/dashboard` (HTML view; both require `x-admin-key`). Wire external alerting to the JSON metrics endpoint.
- [x] Hardened backend authz around sensitive operations

## Verification Gates

- Lint: `npm run lint`
- Tests: `npm run test:core`
- Optional: set `POSTGRES_URL` and confirm dual-write logs (`[PG]`) without errors.
- Manual API checks:
  - `POST /api/reports/outcomes/refresh`
  - `GET /api/reports/outcomes?horizonDays=90`
  - `GET /api/metrics` and `GET /api/metrics/dashboard` (with `x-admin-key`)
