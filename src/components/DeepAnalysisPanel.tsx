import React, { useMemo } from "react";
import { AlertTriangle, CheckCircle2, ChevronRight, CircleDot, Loader2, MinusCircle } from "lucide-react";
import type { CompanyReportData, QualityGateResult } from "../../shared/reportTypes";
import type { ReportScoreData, RecommendationPolicyData, ThesisMemoryData } from "../services/reportService";
import type { PositionSizingData } from "../services/portfolioService";
import {
  validateDecisionEngine,
  type DecisionValidationCheck,
  type ValidationStatus,
} from "../../decisionEngineValidation";

export type DeepAnalysisBundle = {
  symbol: string | null;
  country: "IN" | "US";
  loadingJudge: boolean;
  loadingScoreAndOutcomes: boolean;
  reportData: CompanyReportData | null;
  showReport: boolean;
  judgeData: QualityGateResult | null;
  recencyValidation: {
    symbol: string;
    latestAnnouncementDate: string | null;
    checkedAt: string;
  } | null;
  reportScore: ReportScoreData["scorecard"] | null;
  recommendation: {
    action: "buy" | "watch" | "avoid";
    confidencePct: number;
    horizonDays: number;
    riskClass: "low" | "medium" | "high";
    explainability: { positive: string[]; negative: string[]; caveats: string[] };
    scoreSnapshotTotal?: number;
  } | null;
  recommendationPolicy: RecommendationPolicyData | null;
  recommendationCalibration: {
    sampleCount: number;
    brierLikeScore: number | null;
    hitRateAtBand: number | null;
  } | null;
  positionSizing: PositionSizingData | null;
  thesisMemory: ThesisMemoryData | null;
  savedReportsCount: number;
};

function statusIcon(status: ValidationStatus) {
  switch (status) {
    case "pass":
      return <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" aria-hidden />;
    case "warn":
      return <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" aria-hidden />;
    case "fail":
      return <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" aria-hidden />;
    default:
      return <MinusCircle className="h-4 w-4 text-gray-400 shrink-0" aria-hidden />;
  }
}

function statusBadgeClass(status: ValidationStatus): string {
  switch (status) {
    case "pass":
      return "bg-emerald-50 text-emerald-800 border-emerald-200";
    case "warn":
      return "bg-amber-50 text-amber-900 border-amber-200";
    case "fail":
      return "bg-red-50 text-red-800 border-red-200";
    default:
      return "bg-gray-50 text-gray-600 border-gray-200";
  }
}

function groupChecks(checks: DecisionValidationCheck[]): Map<string, DecisionValidationCheck[]> {
  const m = new Map<string, DecisionValidationCheck[]>();
  for (const c of checks) {
    const list = m.get(c.group) || [];
    list.push(c);
    m.set(c.group, list);
  }
  return m;
}

export default function DeepAnalysisPanel({ data }: { data: DeepAnalysisBundle }) {
  const loading = data.loadingJudge || data.loadingScoreAndOutcomes;

  const result = useMemo(() => {
    const thesis =
      data.thesisMemory != null
        ? {
            status: data.thesisMemory.status,
            hasBody: data.thesisMemory.thesis.trim().length > 0,
          }
        : null;

    return validateDecisionEngine({
      symbol: data.symbol,
      country: data.country,
      hasSessionReport: Boolean(data.reportData && data.showReport),
      hasSavedReportScore: Boolean(data.reportScore),
      reportData: data.reportData,
      judgeData: data.judgeData,
      recencyValidation: data.recencyValidation,
      reportScore: data.reportScore,
      recommendation: data.recommendation
        ? {
            action: data.recommendation.action,
            confidencePct: data.recommendation.confidencePct,
            horizonDays: data.recommendation.horizonDays,
            riskClass: data.recommendation.riskClass,
            scoreSnapshotTotal: data.recommendation.scoreSnapshotTotal,
          }
        : null,
      policy: data.recommendationPolicy
        ? { version: data.recommendationPolicy.version, weights: data.recommendationPolicy.weights }
        : null,
      calibration: data.recommendationCalibration,
      positionSizing: data.positionSizing,
      thesis,
    });
  }, [
    data.symbol,
    data.country,
    data.reportData,
    data.showReport,
    data.judgeData,
    data.recencyValidation,
    data.reportScore,
    data.recommendation,
    data.recommendationPolicy,
    data.recommendationCalibration,
    data.positionSizing,
    data.thesisMemory,
  ]);

  const grouped = useMemo(() => groupChecks(result.checks), [result.checks]);
  const groupOrder = ["Policy", "Calibration", "Context", "Quality gate", "Recency", "Scorecard", "Recommendation", "Position sizing", "Thesis"];

  return (
    <section className="rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50/40 to-white overflow-hidden">
      <div className="border-b border-indigo-100 bg-white/80 px-5 py-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-indigo-900 font-semibold">
            <CircleDot className="h-5 w-5 text-indigo-600" />
            Deep analysis — decision engine validation
          </div>
          <p className="text-sm text-gray-600 mt-1 max-w-3xl">
            Validates policy weights, calibration, quality gate, exchange recency, scorecard math, recommendation consistency,
            position sizing, and thesis memory for the active symbol. Open a company and generate a report for full coverage.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-medium">
          <span className="rounded-full bg-emerald-100 text-emerald-800 px-2 py-1">Pass {result.summary.pass}</span>
          <span className="rounded-full bg-amber-100 text-amber-900 px-2 py-1">Warn {result.summary.warn}</span>
          <span className="rounded-full bg-red-100 text-red-800 px-2 py-1">Fail {result.summary.fail}</span>
          <span className="rounded-full bg-gray-100 text-gray-700 px-2 py-1">Skip {result.summary.skip}</span>
        </div>
      </div>

      <div className="p-5 space-y-6">
        {loading && (
          <div className="flex items-center gap-2 text-sm text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading judge / score / calibration…
          </div>
        )}

        {!data.symbol && (
          <div className="text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
            Select a company from Discover, Results, Directory, or Scanners — then open this tab to validate decision parameters for that symbol.
          </div>
        )}

        {data.symbol && data.savedReportsCount === 0 && !data.reportScore && (
          <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
            No saved report for this symbol yet. Generate a report and ensure it is persisted so score, recommendation, and sizing checks can run.
          </div>
        )}

        {groupOrder.map((g) => {
          const rows = grouped.get(g);
          if (!rows?.length) return null;
          return (
            <div key={g}>
              <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2 flex items-center gap-1">
                <ChevronRight className="h-3.5 w-3.5" />
                {g}
              </h3>
              <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
                    <tr>
                      <th className="px-3 py-2 font-medium w-[38%]">Check</th>
                      <th className="px-3 py-2 font-medium w-[14%]">Status</th>
                      <th className="px-3 py-2 font-medium">Detail</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {rows.map((row) => (
                      <tr key={row.id} className="hover:bg-gray-50/80">
                        <td className="px-3 py-2.5 text-gray-900">{row.label}</td>
                        <td className="px-3 py-2.5">
                          <span
                            className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-semibold ${statusBadgeClass(row.status)}`}
                          >
                            {statusIcon(row.status)}
                            {row.status}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-gray-600 text-xs leading-relaxed">{row.detail}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
