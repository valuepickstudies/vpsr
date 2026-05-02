import type { CompanyReportData, QualityGateResult } from "./shared/reportTypes";
import { buildReportScorecard } from "./reportScoring";

export type ValidationStatus = "pass" | "warn" | "fail" | "skip";

export type DecisionValidationCheck = {
  id: string;
  group: string;
  label: string;
  status: ValidationStatus;
  detail: string;
};

export type RecommendationPolicyWeights = {
  quality: number;
  valuation: number;
  momentum: number;
  risk: number;
};

export type DecisionEngineValidationInput = {
  symbol: string | null;
  country: "IN" | "US";
  /** User has a generated report in session */
  hasSessionReport: boolean;
  /** Saved report exists (score / recommendation pipeline ran) */
  hasSavedReportScore: boolean;
  reportData: CompanyReportData | null;
  judgeData: QualityGateResult | null;
  recencyValidation: {
    symbol: string;
    latestAnnouncementDate: string | null;
    checkedAt: string;
  } | null;
  reportScore: {
    totalScore: number;
    verdict: "strong" | "watch" | "weak";
    breakdown: {
      quality: number;
      valuation: number;
      momentum: number;
      risk: number;
    };
    generatedAt: string;
  } | null;
  recommendation: {
    action: "buy" | "watch" | "avoid";
    confidencePct: number;
    horizonDays: number;
    riskClass: "low" | "medium" | "high";
    scoreSnapshotTotal?: number;
  } | null;
  policy: {
    version: string;
    weights: RecommendationPolicyWeights;
  } | null;
  calibration: {
    sampleCount: number;
    brierLikeScore: number | null;
    hitRateAtBand: number | null;
  } | null;
  positionSizing: {
    capital: number;
    riskBudgetPct: number;
    stopLossPct: number;
    suggestions: Array<{ symbol: string; score: number; targetWeightPct: number }>;
  } | null;
  thesis: {
    status: "active" | "invalidated";
    hasBody: boolean;
  } | null;
};

const SCORE_MATCH_TOLERANCE = 3;
const WEIGHT_SUM_TOLERANCE = 0.02;

function expectedActionFromScore(total: number): "buy" | "watch" | "avoid" {
  if (total >= 72) return "buy";
  if (total >= 52) return "watch";
  return "avoid";
}

function expectedVerdictFromScore(total: number): "strong" | "watch" | "weak" {
  if (total >= 70) return "strong";
  if (total >= 50) return "watch";
  return "weak";
}

function daysBetween(isoA: string, isoB: Date): number {
  const a = Date.parse(isoA);
  const b = isoB.getTime();
  if (!Number.isFinite(a)) return Number.POSITIVE_INFINITY;
  return Math.abs(b - a) / (24 * 60 * 60 * 1000);
}

function push(
  out: DecisionValidationCheck[],
  group: string,
  id: string,
  label: string,
  status: ValidationStatus,
  detail: string
) {
  out.push({ group, id, label, status, detail });
}

export function validateDecisionEngine(input: DecisionEngineValidationInput): {
  checks: DecisionValidationCheck[];
  summary: { pass: number; warn: number; fail: number; skip: number };
} {
  const checks: DecisionValidationCheck[] = [];

  // --- Policy (global) ---
  if (input.policy) {
    const w = input.policy.weights;
    const sum = w.quality + w.valuation + w.momentum + w.risk;
    const ok = Math.abs(sum - 1) <= WEIGHT_SUM_TOLERANCE;
    push(
      checks,
      "Policy",
      "policy_weights_sum",
      "Policy score weights sum to 1",
      ok ? "pass" : "fail",
      ok
        ? `v${input.policy.version}: Σ=${sum.toFixed(3)} (quality ${w.quality}, valuation ${w.valuation}, momentum ${w.momentum}, risk ${w.risk})`
        : `Weights sum to ${sum.toFixed(3)}; expected ~1.0`
    );
    const dimsOk =
      [w.quality, w.valuation, w.momentum, w.risk].every((x) => x >= 0 && x <= 1);
    push(
      checks,
      "Policy",
      "policy_weight_ranges",
      "Each policy weight in [0, 1]",
      dimsOk ? "pass" : "fail",
      dimsOk ? "All dimensions within range" : "One or more weights outside [0, 1]"
    );
  } else {
    push(checks, "Policy", "policy_loaded", "Latest recommendation policy loaded", "skip", "No policy returned from API");
  }

  // --- Calibration (global) ---
  if (input.calibration) {
    const n = input.calibration.sampleCount;
    push(
      checks,
      "Calibration",
      "calibration_sample",
      "Calibration sample size",
      n >= 30 ? "pass" : n >= 10 ? "warn" : "warn",
      n >= 30
        ? `${n} outcomes in rolling window`
        : n > 0
          ? `${n} samples — wider confidence intervals; continue collecting outcomes`
          : "No calibration rows yet"
    );
    if (input.calibration.brierLikeScore != null) {
      const b = input.calibration.brierLikeScore;
      push(
        checks,
        "Calibration",
        "calibration_brier",
        "Brier-like score (lower is sharper)",
        "pass",
        Number.isFinite(b) ? b.toFixed(4) : String(b)
      );
    }
    if (input.recommendation && input.calibration.hitRateAtBand != null) {
      push(
        checks,
        "Calibration",
        "calibration_hit_band",
        "Hit rate in confidence band",
        "pass",
        `${input.calibration.hitRateAtBand.toFixed(1)}% (for current recommendation confidence)`
      );
    } else if (input.recommendation) {
      push(
        checks,
        "Calibration",
        "calibration_hit_band",
        "Hit rate in confidence band",
        "skip",
        "Could not map confidence to a bucket or no hits in band"
      );
    }
  } else {
    push(checks, "Calibration", "calibration_loaded", "Calibration summary available", "skip", "Not loaded");
  }

  const sym = input.symbol?.trim().toUpperCase() || null;
  if (!sym) {
    push(checks, "Context", "symbol", "Ticker / symbol", "skip", "Select a company to validate stock-specific parameters");
    const summary = summarize(checks);
    return { checks, summary };
  }

  // --- Session / saved report context ---
  push(
    checks,
    "Context",
    "session_report",
    "Report data in session",
    input.hasSessionReport ? "pass" : "warn",
    input.hasSessionReport ? "Company report payload present" : "Open Generate Report for full scorecard recomputation checks"
  );
  push(
    checks,
    "Context",
    "saved_report_pipeline",
    "Saved report & score pipeline",
    input.hasSavedReportScore ? "pass" : "warn",
    input.hasSavedReportScore
      ? "Latest saved report found — score, sizing, and recommendation validated against DB"
      : "Save a report (or open after save) to persist score / recommendation / sizing"
  );

  // --- Quality gate ---
  if (input.judgeData) {
    const j = input.judgeData;
    push(
      checks,
      "Quality gate",
      "qg_passed",
      "Judge quality gate passed",
      j.passed ? "pass" : "fail",
      j.passed
        ? `Completeness ${j.completenessScore}%`
        : `Failed completeness ${j.completenessScore}% — missing: ${j.missingComponents.slice(0, 6).join(", ")}${j.missingComponents.length > 6 ? "…" : ""}`
    );
    push(
      checks,
      "Quality gate",
      "qg_completeness_range",
      "Completeness score sensible",
      j.completenessScore >= 0 && j.completenessScore <= 100 ? "pass" : "fail",
      `${j.completenessScore}%`
    );
  } else {
    push(
      checks,
      "Quality gate",
      "qg_present",
      "Quality gate (judge) run",
      input.hasSessionReport ? "warn" : "skip",
      input.hasSessionReport ? "Awaiting judge results — refresh or re-open report" : "Generate a report to run the judge"
    );
  }

  // --- Recency ---
  if (input.recencyValidation) {
    const r = input.recencyValidation;
    const symMatch = r.symbol.toUpperCase() === sym;
    push(
      checks,
      "Recency",
      "recency_symbol",
      "Recency check symbol matches",
      symMatch ? "pass" : "fail",
      symMatch ? `Symbol ${r.symbol}` : `Expected ${sym}, got ${r.symbol}`
    );
    if (r.latestAnnouncementDate) {
      const days = daysBetween(r.latestAnnouncementDate, new Date());
      push(
        checks,
        "Recency",
        "recency_freshness",
        "Latest announcement freshness",
        days <= 120 ? "pass" : days <= 270 ? "warn" : "warn",
        days <= 120
          ? `Latest filing/event ~${Math.round(days)}d ago`
          : `Latest ~${Math.round(days)}d ago — stale inputs may weaken momentum / event signals`
      );
    } else {
      push(checks, "Recency", "recency_freshness", "Latest announcement freshness", "warn", "No announcement date returned");
    }
  } else {
    push(checks, "Recency", "recency_run", "Exchange recency validation", "skip", "Not loaded — open report with judge run");
  }

  // --- Scorecard ---
  if (input.reportScore) {
    const s = input.reportScore;
    const br = s.breakdown;
    const rangesOk =
      [br.quality, br.valuation, br.momentum, br.risk].every((x) => x >= 0 && x <= 100);
    push(
      checks,
      "Scorecard",
      "sc_ranges",
      "Score breakdown dimensions ∈ [0, 100]",
      rangesOk ? "pass" : "fail",
      rangesOk
        ? `Q ${br.quality} · V ${br.valuation} · M ${br.momentum} · R ${br.risk}`
        : "One or more breakdown values out of range"
    );

    const weighted =
      br.quality * 0.35 + br.valuation * 0.2 + br.momentum * 0.25 + br.risk * 0.2;
    const rounded = Math.max(0, Math.min(100, Math.round(weighted)));
    const totalOk = Math.abs(rounded - s.totalScore) <= 1;
    push(
      checks,
      "Scorecard",
      "sc_total_weights",
      "Total score matches weighted blend (0.35Q/0.2V/0.25M/0.2R)",
      totalOk ? "pass" : "warn",
      totalOk
        ? `totalScore ${s.totalScore} (recomputed ${rounded})`
        : `Stored total ${s.totalScore} vs recomputed ${rounded} from breakdown — check rounding / policy drift`
    );

    const ev = expectedVerdictFromScore(s.totalScore);
    const verdictOk = ev === s.verdict;
    push(
      checks,
      "Scorecard",
      "sc_verdict",
      "Verdict aligns with total score bands (≥70 strong, ≥50 watch)",
      verdictOk ? "pass" : "fail",
      verdictOk
        ? `${s.verdict} at ${s.totalScore}`
        : `Verdict ${s.verdict} but score ${s.totalScore} implies ${ev}`
    );

    if (input.reportData && input.judgeData) {
      const recomputed = buildReportScorecard(input.reportData, input.judgeData);
      const delta = Math.abs(recomputed.totalScore - s.totalScore);
      push(
        checks,
        "Scorecard",
        "sc_recompute_session",
        "Session report recomputes to same scorecard (sanity)",
        delta <= SCORE_MATCH_TOLERANCE ? "pass" : "warn",
        delta <= SCORE_MATCH_TOLERANCE
          ? `Recomputed total ${recomputed.totalScore} vs stored ${s.totalScore} (Δ${delta})`
          : `Recomputed ${recomputed.totalScore} vs stored ${s.totalScore} (Δ${delta}) — data may have changed since save`
      );
    } else {
      push(
        checks,
        "Scorecard",
        "sc_recompute_session",
        "Session report recomputes to same scorecard (sanity)",
        "skip",
        "Needs live report + judge data in session"
      );
    }
  } else {
    push(checks, "Scorecard", "sc_present", "Persisted scorecard", "skip", "No saved report score — save after generate");
  }

  // --- Recommendation ---
  if (input.recommendation && input.reportScore) {
    const rec = input.recommendation;
    const exp = expectedActionFromScore(input.reportScore.totalScore);
    const actionOk = rec.action === exp;
    push(
      checks,
      "Recommendation",
      "rec_action_vs_score",
      "Action matches score thresholds (buy ≥72, watch ≥52)",
      actionOk ? "pass" : "fail",
      actionOk
        ? `${rec.action} at total ${input.reportScore.totalScore}`
        : `Action ${rec.action} but score ${input.reportScore.totalScore} implies ${exp}`
    );

    const confOk = rec.confidencePct >= 5 && rec.confidencePct <= 95;
    push(
      checks,
      "Recommendation",
      "rec_confidence_range",
      "Confidence in [5, 95]%",
      confOk ? "pass" : "fail",
      `${rec.confidencePct}%`
    );

    const snap = rec.scoreSnapshotTotal;
    if (snap != null) {
      const snapOk = Math.abs(snap - input.reportScore.totalScore) <= 1;
      push(
        checks,
        "Recommendation",
        "rec_snapshot_total",
        "Recommendation snapshot total matches scorecard",
        snapOk ? "pass" : "warn",
        snapOk
          ? `snapshot ${snap} ≈ scorecard ${input.reportScore.totalScore}`
          : `snapshot ${snap} vs scorecard ${input.reportScore.totalScore}`
      );
    }

    const riskFromBreakdown =
      input.reportScore.breakdown.risk >= 70 ? "low" : input.reportScore.breakdown.risk >= 45 ? "medium" : "high";
    const riskOk = rec.riskClass === riskFromBreakdown;
    push(
      checks,
      "Recommendation",
      "rec_risk_class",
      "Risk class aligns with scorecard risk pillar",
      riskOk ? "pass" : "warn",
      riskOk
        ? `${rec.riskClass} (risk pillar ${input.reportScore.breakdown.risk})`
        : `Stored ${rec.riskClass} vs pillar-implied ${riskFromBreakdown}`
    );

    push(
      checks,
      "Recommendation",
      "rec_horizon",
      "Investment horizon set",
      rec.horizonDays > 0 ? "pass" : "fail",
      `${rec.horizonDays} days`
    );
  } else if (input.recommendation) {
    push(checks, "Recommendation", "rec_full", "Recommendation vs scorecard", "skip", "Scorecard missing — cannot cross-check");
  } else {
    push(checks, "Recommendation", "rec_present", "Stored recommendation", "skip", input.hasSavedReportScore ? "Could not load recommendation row" : "Save report first");
  }

  // --- Position sizing ---
  if (input.positionSizing && sym) {
    const ps = input.positionSizing;
    push(
      checks,
      "Position sizing",
      "ps_capital_risk",
      "Sizing inputs positive",
      ps.capital > 0 && ps.riskBudgetPct > 0 && ps.stopLossPct > 0 ? "pass" : "fail",
      `capital ${ps.capital}, risk ${ps.riskBudgetPct}%, stop ${ps.stopLossPct}%`
    );
    const stripEx = (x: string) => x.replace(/\s/g, "").toUpperCase().replace(/\.(NS|NSE|BSE|BO|NASDAQ|NYSE)$/i, "");
    const row = ps.suggestions.find((x) => {
      const a = stripEx(x.symbol);
      const b = stripEx(sym);
      return a === b || a.includes(b) || b.includes(a);
    });
    if (row) {
      push(
        checks,
        "Position sizing",
        "ps_symbol_row",
        "Symbol appears in sizing suggestions",
        "pass",
        `target weight ${row.targetWeightPct.toFixed(2)}% at score ${row.score}`
      );
    } else {
      push(
        checks,
        "Position sizing",
        "ps_symbol_row",
        "Symbol appears in sizing suggestions",
        "warn",
        `No row for ${sym} — check symbol format vs Yahoo/NSE`
      );
    }
  } else {
    push(checks, "Position sizing", "ps_present", "Position sizing output", "skip", "No sizing payload");
  }

  // --- Thesis memory ---
  if (input.thesis) {
    push(
      checks,
      "Thesis",
      "thesis_status",
      "Thesis memory status",
      input.thesis.status === "invalidated" ? "warn" : "pass",
      input.thesis.status === "invalidated" ? "Thesis marked invalidated — review before acting" : "Thesis active"
    );
    push(
      checks,
      "Thesis",
      "thesis_body",
      "Thesis text present",
      input.thesis.hasBody ? "pass" : "warn",
      input.thesis.hasBody ? "Narrative captured" : "Empty thesis — add via thesis workflow when available"
    );
  } else {
    push(checks, "Thesis", "thesis_loaded", "Thesis memory", "skip", "None stored for this symbol");
  }

  return { checks, summary: summarize(checks) };
}

function summarize(checks: DecisionValidationCheck[]) {
  let pass = 0,
    warn = 0,
    fail = 0,
    skip = 0;
  for (const c of checks) {
    if (c.status === "pass") pass++;
    else if (c.status === "warn") warn++;
    else if (c.status === "fail") fail++;
    else skip++;
  }
  return { pass, warn, fail, skip };
}
