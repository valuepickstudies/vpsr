import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ChevronDown, ChevronRight, Download, Sparkles } from "lucide-react";
import Markdown from "react-markdown";
import type { QualityGateResult, ReportType } from "../../shared/reportTypes";
import type { LatestTrackedOutcome } from "../services/reportService";
import type { OutcomesMethodology } from "../../shared/outcomesTransparency";

type SavedReportItem = {
  id: string | number;
  companyName: string;
  createdAt: string;
};

type ReportInsightsPanelProps = {
  aiReportMarkdown: string;
  hideCompanyNameInReport: boolean;
  reportCompanyNameRevealed: boolean;
  selectedCompanyName: string;
  symbol: string;
  country: "IN" | "US";
  isPaidCustomer: boolean;
  setIsPaidCustomer: (v: boolean) => void;
  setReportCompanyNameRevealed: (v: boolean) => void;
  onDownloadMarkdown: () => void;
  onDownloadHTML: () => void;
  loadingJudge: boolean;
  judgeData: QualityGateResult | null;
  recencyValidation: { latestAnnouncementDate: string | null } | null;
  onRunJudgeValidation: () => void;
  loadingSavedReports: boolean;
  savedReports: SavedReportItem[];
  onRefreshSavedReports: () => void;
  reportScore: {
    totalScore: number;
    verdict: "strong" | "watch" | "weak";
    breakdown: { quality: number; valuation: number; momentum: number; risk: number };
  } | null;
  outcomesSummary: {
    horizonDays: number;
    hitRatePct: number | null;
    avgReturnPct: number | null;
    usableRows: number;
    totalRows?: number;
    asOf?: string;
    methodology?: OutcomesMethodology;
  } | null;
  latestTrackedOutcome: LatestTrackedOutcome | null;
  loadingScoreAndOutcomes: boolean;
  /** Parsing issues, gate failures, and other reader-facing warnings */
  readerIntegrityNotes: string[];
  thesisMemory: { thesis: string; status: "active" | "invalidated"; invalidationTriggers: string[] } | null;
  positionSizing: { riskBudgetPct: number; stopLossPct: number; suggestions: Array<{ symbol: string; targetWeightPct: number; maxPositionValue: number }> } | null;
  recommendation: {
    action: "buy" | "watch" | "avoid";
    confidencePct: number;
    horizonDays: number;
    riskClass: "low" | "medium" | "high";
    explainability: { positive: string[]; negative: string[]; caveats: string[] };
  } | null;
  recommendationCalibration: {
    sampleCount: number;
    brierLikeScore: number | null;
    hitRateAtBand: number | null;
  } | null;
  recommendationPolicyVersion: string | null;
  snapshotStrip: {
    reportGeneratedAt: string | null;
    priceAsOf: string | null;
    judgeCheckedAt: string | null;
    sourceUrl?: string | null;
    reportType?: ReportType | null;
    quoteSummary?: {
      price?: string;
      marketCap?: string;
      pe?: string;
      source?: string;
    } | null;
  };
};

function formatMoney(v: number | null | undefined, country: "IN" | "US") {
  if (v == null || !Number.isFinite(v)) return "—";
  const cur = country === "US" ? "USD" : "INR";
  try {
    return new Intl.NumberFormat(country === "US" ? "en-US" : "en-IN", {
      style: "currency",
      currency: country === "US" ? "USD" : "INR",
      maximumFractionDigits: v >= 100 ? 0 : 2,
    }).format(v);
  } catch {
    return `${cur} ${v.toFixed(2)}`;
  }
}

export default function ReportInsightsPanel(props: ReportInsightsPanelProps) {
  const {
    aiReportMarkdown,
    hideCompanyNameInReport,
    reportCompanyNameRevealed,
    selectedCompanyName,
    symbol,
    country,
    isPaidCustomer,
    setIsPaidCustomer,
    setReportCompanyNameRevealed,
    onDownloadMarkdown,
    onDownloadHTML,
    loadingJudge,
    judgeData,
    recencyValidation,
    onRunJudgeValidation,
    loadingSavedReports,
    savedReports,
    onRefreshSavedReports,
    reportScore,
    outcomesSummary,
    latestTrackedOutcome,
    loadingScoreAndOutcomes,
    readerIntegrityNotes,
    thesisMemory,
    positionSizing,
    recommendation,
    recommendationCalibration,
    recommendationPolicyVersion,
    snapshotStrip,
  } = props;

  const [snapshotOpen, setSnapshotOpen] = useState(false);

  const reproducibilityPayload = useMemo(() => {
    const q = snapshotStrip.quoteSummary;
    return {
      identity: {
        displayName: selectedCompanyName,
        symbol: symbol.toUpperCase(),
        country,
        sourceUrl: snapshotStrip.sourceUrl ?? null,
        reportType: snapshotStrip.reportType ?? null,
      },
      timestamps: {
        reportGeneratedAt: snapshotStrip.reportGeneratedAt,
        technicalPriceBarAsOf: snapshotStrip.priceAsOf,
        judgeRanAt: snapshotStrip.judgeCheckedAt,
      },
      quote: q
        ? {
            price: q.price ?? null,
            marketCap: q.marketCap ?? null,
            pe: q.pe ?? null,
            source: q.source ?? null,
          }
        : null,
      scorecard: reportScore
        ? {
            totalScore: reportScore.totalScore,
            verdict: reportScore.verdict,
            breakdown: reportScore.breakdown,
          }
        : null,
      recommendation: recommendation
        ? {
            action: recommendation.action,
            confidencePct: recommendation.confidencePct,
            horizonDays: recommendation.horizonDays,
            riskClass: recommendation.riskClass,
            policyVersion: recommendationPolicyVersion,
          }
        : null,
      calibration:
        recommendationCalibration && recommendation
          ? {
              sampleCount: recommendationCalibration.sampleCount,
              hitRateAtConfidenceBandPct: recommendationCalibration.hitRateAtBand,
              brierLike: recommendationCalibration.brierLikeScore,
            }
          : null,
      aggregateOutcomes: outcomesSummary
        ? {
            horizonDays: outcomesSummary.horizonDays,
            hitRatePct: outcomesSummary.hitRatePct,
            avgReturnPct: outcomesSummary.avgReturnPct,
            usableRows: outcomesSummary.usableRows,
            totalRows: outcomesSummary.totalRows ?? null,
            refreshedAsOf: outcomesSummary.asOf ?? null,
          }
        : null,
      latestSymbolOutcome: latestTrackedOutcome
        ? {
            reportId: latestTrackedOutcome.reportId,
            horizonDays: latestTrackedOutcome.horizonDays,
            status: latestTrackedOutcome.status,
            returnPct: latestTrackedOutcome.returnPct,
            entryDate: latestTrackedOutcome.entryDate,
            entryPrice: latestTrackedOutcome.entryPrice,
          }
        : null,
      thesis: thesisMemory
        ? { status: thesisMemory.status, invalidationTriggerCount: thesisMemory.invalidationTriggers.length }
        : null,
      judge: judgeData
        ? {
            completenessPct: judgeData.completenessScore,
            passed: judgeData.passed,
            missingComponentsCount: judgeData.missingComponents.length,
          }
        : null,
      recency: recencyValidation?.latestAnnouncementDate ?? null,
    };
  }, [
    selectedCompanyName,
    symbol,
    country,
    snapshotStrip,
    reportScore,
    recommendation,
    recommendationPolicyVersion,
    recommendationCalibration,
    outcomesSummary,
    latestTrackedOutcome,
    thesisMemory,
    judgeData,
    recencyValidation,
  ]);

  const snapshotJson = useMemo(() => JSON.stringify(reproducibilityPayload, null, 2), [reproducibilityPayload]);

  const snapshotInsightLines = useMemo(() => {
    const lines: string[] = [];
    const id = `${symbol.toUpperCase()} (${country})`;
    lines.push(`${id}${snapshotStrip.reportType ? ` · ${snapshotStrip.reportType} report` : ""}`);
    if (snapshotStrip.sourceUrl) {
      lines.push(`Source: ${snapshotStrip.sourceUrl}`);
    }
    const qs = snapshotStrip.quoteSummary;
    if (qs?.price && qs.price !== "N/A") {
      lines.push(`Quote snapshot: CMP ${qs.price}${qs.pe && qs.pe !== "N/A" ? ` · P/E ${qs.pe}` : ""}${qs.marketCap && qs.marketCap !== "N/A" ? ` · MCap ${qs.marketCap}` : ""}`);
    } else if (snapshotStrip.priceAsOf) {
      lines.push(`Last price bar date: ${snapshotStrip.priceAsOf} (use quote panel when live CMP missing)`);
    }
    if (reportScore) {
      lines.push(`Scorecard: ${reportScore.totalScore}/100 (${reportScore.verdict}) — Q${reportScore.breakdown.quality} V${reportScore.breakdown.valuation} M${reportScore.breakdown.momentum} R${reportScore.breakdown.risk}`);
    }
    if (recommendation) {
      lines.push(
        `Decision engine: ${recommendation.action.toUpperCase()} · ${recommendation.confidencePct}% conf · ${recommendation.horizonDays}d · ${recommendation.riskClass} risk`
      );
    }
    if (outcomesSummary?.usableRows && outcomesSummary.hitRatePct != null) {
      lines.push(
        `Workspace outcomes (${outcomesSummary.horizonDays}d): ${outcomesSummary.hitRatePct.toFixed(1)}% hit rate, ${outcomesSummary.avgReturnPct?.toFixed(2) ?? "—"}% avg return (${outcomesSummary.usableRows} rows)`
      );
    }
    if (latestTrackedOutcome?.status === "ok" && latestTrackedOutcome.returnPct != null) {
      lines.push(`Latest priced outcome for symbol: ${latestTrackedOutcome.returnPct.toFixed(2)}% over ${latestTrackedOutcome.horizonDays}d (report #${latestTrackedOutcome.reportId})`);
    }
    if (judgeData && !judgeData.passed) {
      lines.push(`Quality gate: ${judgeData.completenessScore}% complete — verify missing sections before sizing`);
    }
    return lines;
  }, [
    symbol,
    country,
    snapshotStrip,
    reportScore,
    recommendation,
    outcomesSummary,
    latestTrackedOutcome,
    judgeData,
  ]);

  const methodology = outcomesSummary?.methodology;

  return (
    <>
      {readerIntegrityNotes.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-semibold">Read this before acting</p>
          <p className="mt-1 text-amber-900/95">
            Data quality or gate checks flagged issues. Treat scores and AI narrative as provisional until resolved.
          </p>
          <ul className="list-disc pl-5 mt-2 space-y-0.5">
            {readerIntegrityNotes.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden relative">
        {!isPaidCustomer && (
          <div className="absolute inset-x-0 bottom-0 top-[100px] z-10 bg-gradient-to-t from-white via-white/95 to-transparent flex flex-col items-center justify-center p-12 text-center">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-6">
              <Sparkles className="h-8 w-8 text-blue-600" />
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-3">Unlock Full AI Analysis</h3>
            <p className="text-gray-600 max-w-md mb-8">Get deep institutional-grade research, growth catalysts, and risk assessments for this company.</p>
            <button
              onClick={() => setIsPaidCustomer(true)}
              className="px-8 py-3 bg-blue-600 text-white rounded-xl font-bold text-lg hover:bg-blue-700 transition-all shadow-lg hover:shadow-blue-200"
            >
              Upgrade to Premium
            </button>
          </div>
        )}
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-indigo-600" />
            <h3 className="font-semibold text-gray-900">AI Research Report</h3>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={onDownloadMarkdown} className="flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors bg-white px-3 py-1.5 rounded-md border border-blue-200 shadow-sm hover:shadow">
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Markdown</span>
              <span className="sm:hidden">MD</span>
            </button>
            <button onClick={onDownloadHTML} className="flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors bg-white px-3 py-1.5 rounded-md border border-blue-200 shadow-sm hover:shadow">
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">HTML</span>
              <span className="sm:hidden">HTML</span>
            </button>
          </div>
        </div>
        <div className="p-8 markdown-body">
          <Markdown>{aiReportMarkdown}</Markdown>
          {hideCompanyNameInReport && (
            <div className="mt-8 rounded-xl border border-indigo-200 bg-indigo-50/60 p-5 not-prose">
              <p className="text-sm font-semibold text-indigo-950">Company name reveal</p>
              {!reportCompanyNameRevealed ? (
                <div className="mt-2 space-y-3 text-sm text-indigo-900/90">
                  <p>The company identity is hidden in this report. Reveal is available at the end with Premium.</p>
                  {isPaidCustomer ? (
                    <button onClick={() => setReportCompanyNameRevealed(true)} className="inline-flex items-center justify-center px-4 py-2 rounded-lg text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors">
                      Reveal Company Name
                    </button>
                  ) : (
                    <button onClick={() => setIsPaidCustomer(true)} className="inline-flex items-center justify-center px-4 py-2 rounded-lg text-sm font-semibold bg-amber-600 text-white hover:bg-amber-700 transition-colors">
                      Upgrade to Premium to Reveal
                    </button>
                  )}
                </div>
              ) : (
                <p className="mt-2 text-sm text-indigo-900">
                  Revealed company: <span className="font-bold">{selectedCompanyName}</span>
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-900 mb-1">Decision memo</h3>
          <p className="text-xs text-gray-500 mb-3">Rule-based action from the scorecard; not personalized advice.</p>
          {recommendation ? (
            <div className="space-y-3 text-sm">
              <p className="text-gray-800">
                <span className="font-semibold uppercase text-gray-900">{recommendation.action}</span>
                <span className="text-gray-600">
                  {" "}
                  · {recommendation.horizonDays}d horizon · {recommendation.riskClass} risk · policy {recommendationPolicyVersion || "rules_v1"}
                </span>
              </p>
              <p className="text-gray-700">
                Confidence <span className="font-semibold">{recommendation.confidencePct}%</span>
                {recommendationCalibration?.hitRateAtBand != null && recommendationCalibration.sampleCount >= 10 ? (
                  <span className="text-gray-600">
                    {" "}
                    — historically ~{recommendationCalibration.hitRateAtBand.toFixed(1)}% of calls in this confidence band showed a positive forward return (
                    {recommendationCalibration.sampleCount} samples).
                  </span>
                ) : (
                  <span className="text-gray-600"> — calibration still thin; use band hit-rate when sample count grows.</span>
                )}
              </p>
              {(recommendation.explainability.positive || []).length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Drivers</p>
                  <ul className="list-disc pl-5 text-emerald-800 mt-1">
                    {recommendation.explainability.positive.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                </div>
              )}
              {(recommendation.explainability.negative || []).length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Headwinds</p>
                  <ul className="list-disc pl-5 text-red-800 mt-1">
                    {recommendation.explainability.negative.map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                  </ul>
                </div>
              )}
              {(recommendation.explainability.caveats || []).length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Caveats</p>
                  <ul className="list-disc pl-5 text-gray-700 mt-1">
                    {recommendation.explainability.caveats.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                </div>
              )}
              {thesisMemory && thesisMemory.invalidationTriggers.length > 0 && (
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                  <p className="text-xs font-semibold text-gray-700">Kill thesis if</p>
                  <ul className="list-disc pl-5 text-gray-700 mt-1">
                    {thesisMemory.invalidationTriggers.map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-500">Recommendation will appear after scoring completes.</p>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-900 mb-1">Alpha scorecard & outcomes</h3>
          <p className="text-xs text-gray-500 mb-3">Aggregate track record is across saved reports in your workspace, not a guarantee for this name.</p>
          {loadingScoreAndOutcomes ? (
            <p className="text-sm text-gray-500">Computing score and outcomes...</p>
          ) : (
            <div className="space-y-2 text-sm">
              <p className="text-gray-700">
                Total / verdict:{" "}
                <span className="font-semibold">
                  {reportScore?.totalScore ?? "N/A"} ({reportScore?.verdict ?? "N/A"})
                </span>
              </p>
              <p className="text-gray-700">
                Pillars Q/V/M/R:{" "}
                <span className="font-semibold">
                  {reportScore ? `${reportScore.breakdown.quality} · ${reportScore.breakdown.valuation} · ${reportScore.breakdown.momentum} · ${reportScore.breakdown.risk}` : "N/A"}
                </span>
              </p>
              <p className="text-gray-700">
                Hit-rate ({outcomesSummary?.horizonDays ?? 90}d):{" "}
                <span className="font-semibold">{outcomesSummary?.hitRatePct == null ? "N/A" : `${outcomesSummary.hitRatePct.toFixed(1)}%`}</span>
              </p>
              <p className="text-gray-700">
                Avg return ({outcomesSummary?.horizonDays ?? 90}d):{" "}
                <span className="font-semibold">{outcomesSummary?.avgReturnPct == null ? "N/A" : `${outcomesSummary.avgReturnPct.toFixed(2)}%`}</span>
              </p>
              {outcomesSummary?.totalRows != null && (
                <p className="text-xs text-gray-500">
                  Based on {outcomesSummary.usableRows} priced outcomes / {outcomesSummary.totalRows} rows · refreshed{" "}
                  {outcomesSummary.asOf ? format(new Date(outcomesSummary.asOf), "MMM d, yyyy HH:mm") : "—"}
                </p>
              )}
              {methodology && (
                <div className="mt-3 pt-3 border-t border-gray-100 space-y-2 text-xs text-gray-600 leading-relaxed">
                  <p>
                    <span className="font-semibold text-gray-700">What counts as a hit:</span> {methodology.hitDefinition}
                  </p>
                  <p>
                    <span className="font-semibold text-gray-700">Entry rule:</span> {methodology.entryRule}
                  </p>
                  <p>
                    <span className="font-semibold text-gray-700">Benchmarks:</span> {methodology.benchmarkNote}
                  </p>
                </div>
              )}
              {latestTrackedOutcome && (
                <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 leading-relaxed">
                  <p className="font-semibold text-slate-900">Latest tracked outcome for this symbol ({latestTrackedOutcome.horizonDays}d)</p>
                  {latestTrackedOutcome.status === "ok" && latestTrackedOutcome.returnPct != null ? (
                    <p className="mt-1">
                      Forward return from entry {latestTrackedOutcome.entryDate ? format(new Date(latestTrackedOutcome.entryDate), "MMM d, yyyy") : "—"} at{" "}
                      {formatMoney(latestTrackedOutcome.entryPrice, country)} to target bar {latestTrackedOutcome.targetDate ? format(new Date(latestTrackedOutcome.targetDate), "MMM d, yyyy") : "—"}:{" "}
                      <span className="font-semibold">{latestTrackedOutcome.returnPct.toFixed(2)}%</span> (report #{latestTrackedOutcome.reportId}).
                    </p>
                  ) : (
                    <p className="mt-1">
                      Outcome status: <span className="font-mono">{latestTrackedOutcome.status}</span> — refresh outcomes after prices load if this persists.
                    </p>
                  )}
                </div>
              )}
              {(outcomesSummary?.usableRows === 0 || outcomesSummary?.hitRatePct == null) && (
                <p className="text-xs text-gray-500 mt-2">
                  Portfolio-wide metrics stay N/A until saved reports exist and the outcomes job prices forward returns.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-900">Accuracy & Recency Validator</h3>
            <button onClick={onRunJudgeValidation} className="text-xs px-2 py-1 border border-gray-300 rounded">
              Re-run
            </button>
          </div>
          {loadingJudge ? (
            <p className="text-sm text-gray-500">Running judge...</p>
          ) : (
            <div className="space-y-2 text-sm">
              <p className="text-gray-700">
                Completeness score: <span className="font-semibold">{judgeData?.completenessScore ?? "N/A"}</span>
              </p>
              <p className="text-gray-700">
                Latest announcement:{" "}
                <span className="font-semibold">
                  {(() => {
                    const raw = recencyValidation?.latestAnnouncementDate || judgeData?.latestAnnouncementDate;
                    return raw ? format(new Date(raw), "MMM dd, yyyy") : "N/A";
                  })()}
                </span>
              </p>
              {(judgeData?.missingComponents || []).length > 0 ? (
                <ul className="list-disc pl-5 text-red-600">
                  {(judgeData?.missingComponents || []).map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-emerald-700">No major missing components detected.</p>
              )}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-900">Saved Reports</h3>
            <button onClick={onRefreshSavedReports} className="text-xs px-2 py-1 border border-gray-300 rounded">
              Refresh
            </button>
          </div>
          {loadingSavedReports ? (
            <p className="text-sm text-gray-500">Loading saved reports...</p>
          ) : savedReports.length === 0 ? (
            <p className="text-sm text-gray-500">No saved reports found for this symbol yet.</p>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {savedReports.map((r) => (
                <div key={r.id} className="text-sm border border-gray-100 rounded p-2 flex items-center justify-between">
                  <div>
                    <div className="font-medium text-gray-900">
                      #{r.id} {r.companyName}
                    </div>
                    <div className="text-xs text-gray-500">{format(new Date(r.createdAt), "MMM dd, yyyy HH:mm")}</div>
                  </div>
                  <a href={`/api/reports/saved/${r.id}`} target="_blank" rel="noreferrer" className="text-blue-600 text-xs">
                    Open JSON
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <button
          type="button"
          onClick={() => setSnapshotOpen((o) => !o)}
          className="flex items-center gap-2 w-full text-left font-semibold text-gray-900"
        >
          {snapshotOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
          Decision snapshot (inputs & engine state)
        </button>
        <p className="text-xs text-gray-500 mt-1 mb-2">
          Plain-language cues plus a structured payload you can diff against a saved report JSON — still not investment advice.
        </p>
        {snapshotOpen && (
          <div className="space-y-3">
            <ul className="text-sm text-gray-800 space-y-1.5 list-disc pl-5 leading-snug">
              {snapshotInsightLines.map((line, idx) => (
                <li key={`snap-${idx}-${line.slice(0, 48)}`}>{line}</li>
              ))}
            </ul>
            <pre className="text-xs bg-slate-50 border border-slate-200 rounded-lg p-3 overflow-x-auto text-slate-900">{snapshotJson}</pre>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-900 mb-2">Calibration & Trust</h3>
        {recommendationCalibration ? (
          <div className="space-y-2 text-sm">
            <p className="text-gray-700">
              Samples: <span className="font-semibold">{recommendationCalibration.sampleCount}</span>
            </p>
            <p className="text-gray-700">
              Expected precision at this band:{" "}
              <span className="font-semibold">
                {recommendationCalibration.hitRateAtBand == null ? "N/A" : `${recommendationCalibration.hitRateAtBand.toFixed(1)}%`}
              </span>
            </p>
            <p className="text-gray-700">
              Calibration loss (brier-like):{" "}
              <span className="font-semibold">
                {recommendationCalibration.brierLikeScore == null ? "N/A" : recommendationCalibration.brierLikeScore.toFixed(4)}
              </span>
            </p>
          </div>
        ) : (
          <p className="text-sm text-gray-500">Calibration metrics unavailable.</p>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-900 mb-2">Thesis Memory</h3>
          {thesisMemory ? (
            <div className="space-y-2 text-sm">
              <p className="text-gray-700">
                Status:{" "}
                <span className={`font-semibold uppercase ${thesisMemory.status === "active" ? "text-emerald-700" : "text-red-700"}`}>{thesisMemory.status}</span>
              </p>
              <p className="text-gray-700">{thesisMemory.thesis}</p>
              {thesisMemory.invalidationTriggers.length > 0 && (
                <ul className="list-disc pl-5 text-gray-600">
                  {thesisMemory.invalidationTriggers.map((trigger) => (
                    <li key={trigger}>{trigger}</li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No thesis memory found for this symbol yet.</p>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-900 mb-2">Position Sizing & Rebalance</h3>
          {positionSizing ? (
            <div className="space-y-2 text-sm">
              <p className="text-gray-700">
                Risk budget: <span className="font-semibold">{positionSizing.riskBudgetPct}%</span> | Stop-loss:{" "}
                <span className="font-semibold">{positionSizing.stopLossPct}%</span>
              </p>
              <p className="text-gray-700">
                Suggested rebalance cadence: <span className="font-semibold">30 days</span>
              </p>
              <ul className="list-disc pl-5 text-gray-600">
                {positionSizing.suggestions.slice(0, 3).map((s) => (
                  <li key={s.symbol}>
                    {s.symbol}: {s.targetWeightPct.toFixed(2)}% (max {Math.round(s.maxPositionValue).toLocaleString()})
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-gray-500">Sizing suggestions appear after a report score is available.</p>
          )}
        </div>
      </div>
    </>
  );
}
