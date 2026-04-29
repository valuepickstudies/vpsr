import { readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

type OutcomeRefreshJob = {
  id: string;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  status: string;
  input: { country: string; horizons: number[]; limit: number };
  result?: { processedReports: number; refreshedOutcomes: number; horizons: number[] };
  error?: string;
};

type RecommendationRec = {
  reportId: number | null;
  symbol: string;
  country: "IN" | "US";
  recommendationAction: "buy" | "watch" | "avoid";
  confidencePct: number;
  horizonDays: number;
  riskClass: "low" | "medium" | "high";
  explainability: { positive: string[]; negative: string[]; caveats: string[] };
  scoreSnapshot: {
    totalScore: number;
    verdict: "strong" | "watch" | "weak";
    breakdown: { quality: number; valuation: number; momentum: number; risk: number };
  };
  policyVersion: string;
};

/**
 * Optional SQLite → Postgres dual-write. Set POSTGRES_URL to enable.
 * Failures are logged; they do not fail the primary SQLite request.
 */
export class PostgresMirror {
  constructor(private pool: pg.Pool) {}

  async close(): Promise<void> {
    await this.pool.end();
  }

  async upsertJob(job: OutcomeRefreshJob): Promise<void> {
    await this.pool.query(
      `INSERT INTO jobs (id, type, status, input_json, result_json, error, created_at, started_at, finished_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8::timestamptz, $9::timestamptz)
       ON CONFLICT (id) DO UPDATE SET
         status = EXCLUDED.status,
         result_json = EXCLUDED.result_json,
         error = EXCLUDED.error,
         started_at = EXCLUDED.started_at,
         finished_at = EXCLUDED.finished_at`,
      [
        job.id,
        "outcomes_refresh",
        job.status,
        JSON.stringify(job.input),
        job.result ? JSON.stringify(job.result) : null,
        job.error || null,
        job.createdAt,
        job.startedAt,
        job.finishedAt,
      ]
    );
  }

  async insertSavedReport(
    id: number,
    input: { companyName: string; symbol?: string | null; country: string; sourceUrl: string; reportJson: string; createdAt: string }
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO saved_reports (id, company_name, symbol, country, source_url, report_json, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz)
       ON CONFLICT (id) DO UPDATE SET
         company_name = EXCLUDED.company_name,
         symbol = EXCLUDED.symbol,
         country = EXCLUDED.country,
         source_url = EXCLUDED.source_url,
         report_json = EXCLUDED.report_json,
         created_at = EXCLUDED.created_at`,
      [id, input.companyName, input.symbol || null, input.country, input.sourceUrl, input.reportJson, input.createdAt]
    );
  }

  async insertRecommendation(id: number, rec: RecommendationRec, createdAt: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO recommendations
         (id, report_id, symbol, country, recommendation_action, confidence_pct, horizon_days, risk_class, explainability_json, score_snapshot_json, policy_version, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::timestamptz)
       ON CONFLICT (id) DO UPDATE SET
         report_id = EXCLUDED.report_id,
         symbol = EXCLUDED.symbol,
         country = EXCLUDED.country,
         recommendation_action = EXCLUDED.recommendation_action,
         confidence_pct = EXCLUDED.confidence_pct,
         horizon_days = EXCLUDED.horizon_days,
         risk_class = EXCLUDED.risk_class,
         explainability_json = EXCLUDED.explainability_json,
         score_snapshot_json = EXCLUDED.score_snapshot_json,
         policy_version = EXCLUDED.policy_version,
         created_at = EXCLUDED.created_at`,
      [
        id,
        rec.reportId,
        rec.symbol,
        rec.country,
        rec.recommendationAction,
        rec.confidencePct,
        rec.horizonDays,
        rec.riskClass,
        JSON.stringify(rec.explainability),
        JSON.stringify(rec.scoreSnapshot),
        rec.policyVersion,
        createdAt,
      ]
    );
  }

  async upsertReportOutcome(
    id: number,
    row: {
      recommendationId: number | null;
      reportId: number;
      symbol: string;
      country: string;
      horizonDays: number;
      reportDate: string;
      entryDate: string | null;
      entryPrice: number | null;
      targetDate: string | null;
      targetPrice: number | null;
      returnPct: number | null;
      status: string;
      createdAt: string;
      updatedAt: string;
    }
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO report_outcomes
        (id, recommendation_id, report_id, symbol, country, horizon_days, report_date, entry_date, entry_price, target_date, target_price, return_pct, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::timestamptz, $15::timestamptz)
       ON CONFLICT (report_id, horizon_days) DO UPDATE SET
         id = EXCLUDED.id,
         recommendation_id = EXCLUDED.recommendation_id,
         symbol = EXCLUDED.symbol,
         country = EXCLUDED.country,
         report_date = EXCLUDED.report_date,
         entry_date = EXCLUDED.entry_date,
         entry_price = EXCLUDED.entry_price,
         target_date = EXCLUDED.target_date,
         target_price = EXCLUDED.target_price,
         return_pct = EXCLUDED.return_pct,
         status = EXCLUDED.status,
         updated_at = EXCLUDED.updated_at`,
      [
        id,
        row.recommendationId,
        row.reportId,
        row.symbol,
        row.country,
        row.horizonDays,
        row.reportDate,
        row.entryDate,
        row.entryPrice,
        row.targetDate,
        row.targetPrice,
        row.returnPct,
        row.status,
        row.createdAt,
        row.updatedAt,
      ]
    );
  }

  async insertRecommendationAction(
    id: number,
    row: {
      recommendationId: number;
      actionType: string;
      actorType: string;
      actorId: string | null;
      executionPrice: number | null;
      executionDate: string | null;
      sizeValue: number | null;
      notes: string | null;
      createdAt: string;
    }
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO recommendation_actions
        (id, recommendation_id, action_type, actor_type, actor_id, execution_price, execution_date, size_value, notes, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::timestamptz)
       ON CONFLICT (id) DO UPDATE SET
         recommendation_id = EXCLUDED.recommendation_id,
         action_type = EXCLUDED.action_type,
         actor_type = EXCLUDED.actor_type,
         actor_id = EXCLUDED.actor_id,
         execution_price = EXCLUDED.execution_price,
         execution_date = EXCLUDED.execution_date,
         size_value = EXCLUDED.size_value,
         notes = EXCLUDED.notes,
         created_at = EXCLUDED.created_at`,
      [
        id,
        row.recommendationId,
        row.actionType,
        row.actorType,
        row.actorId,
        row.executionPrice,
        row.executionDate,
        row.sizeValue,
        row.notes,
        row.createdAt,
      ]
    );
  }

  async upsertPolicyVersion(version: string, weightsJson: string, metricsJson: string | null, notes: string, createdAt: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO policy_versions (version, weights_json, metrics_json, notes, created_at)
       VALUES ($1, $2, $3, $4, $5::timestamptz)
       ON CONFLICT (version) DO UPDATE SET
         weights_json = EXCLUDED.weights_json,
         metrics_json = EXCLUDED.metrics_json,
         notes = EXCLUDED.notes,
         created_at = EXCLUDED.created_at`,
      [version, weightsJson, metricsJson, notes, createdAt]
    );
  }

  async upsertThesis(args: {
    symbol: string;
    country: string;
    thesis: string;
    triggersJson: string;
    createdAt: string;
    updatedAt: string;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO company_thesis_memory
        (symbol, country, thesis, invalidation_triggers_json, status, invalidated_reason, invalidated_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'active', NULL, NULL, $5::timestamptz, $6::timestamptz)
       ON CONFLICT (symbol, country) DO UPDATE SET
         thesis = EXCLUDED.thesis,
         invalidation_triggers_json = EXCLUDED.invalidation_triggers_json,
         status = 'active',
         invalidated_reason = NULL,
         invalidated_at = NULL,
         updated_at = EXCLUDED.updated_at`,
      [args.symbol, args.country, args.thesis, args.triggersJson, args.createdAt, args.updatedAt]
    );
  }

  async invalidateThesis(symbol: string, country: string, reason: string, invalidatedAt: string, updatedAt: string): Promise<void> {
    await this.pool.query(
      `UPDATE company_thesis_memory
       SET status = 'invalidated', invalidated_reason = $3, invalidated_at = $4, updated_at = $5::timestamptz
       WHERE symbol = $1 AND country = $2`,
      [symbol, country, reason, invalidatedAt, updatedAt]
    );
  }

  async upsertStrategyPerfCache(id: number, symbol: string, startDate: string, payloadJson: string, createdAt: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO strategy_perf_cache (id, symbol, start_date, payload_json, created_at)
       VALUES ($1, $2, $3, $4, $5::timestamptz)
       ON CONFLICT (symbol, start_date) DO UPDATE SET
         id = EXCLUDED.id,
         payload_json = EXCLUDED.payload_json,
         created_at = EXCLUDED.created_at`,
      [id, symbol, startDate, payloadJson, createdAt]
    );
  }
}

export async function createPostgresMirror(): Promise<PostgresMirror | null> {
  const url = process.env.POSTGRES_URL?.trim();
  if (!url) {
    return null;
  }
  const pool = new pg.Pool({ connectionString: url, max: 4 });
  try {
    const schemaPath = join(process.cwd(), "sql", "postgres-schema.sql");
    const sql = readFileSync(schemaPath, "utf8");
    await pool.query(sql);
  } catch (e) {
    console.error("[PG] Schema/init failed; dual-write disabled:", e);
    await pool.end().catch(() => {});
    return null;
  }
  console.log("[PG] Dual-write mirror ready.");
  return new PostgresMirror(pool);
}

export function fireMirror(label: string, work: Promise<void>): void {
  work.catch((err: unknown) => {
    console.warn(`[PG mirror ${label}]`, err instanceof Error ? err.message : err);
  });
}
