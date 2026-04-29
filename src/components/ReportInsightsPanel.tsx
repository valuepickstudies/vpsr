import { format } from "date-fns";
import { Download, Sparkles } from "lucide-react";
import Markdown from "react-markdown";
import type { QualityGateResult } from "../../shared/reportTypes";

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
  outcomesSummary: { horizonDays: number; hitRatePct: number | null; avgReturnPct: number | null; usableRows: number } | null;
  loadingScoreAndOutcomes: boolean;
  degradedSourceWarnings: string[];
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
};

export default function ReportInsightsPanel(props: ReportInsightsPanelProps) {
  const {
    aiReportMarkdown,
    hideCompanyNameInReport,
    reportCompanyNameRevealed,
    selectedCompanyName,
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
    loadingScoreAndOutcomes,
    degradedSourceWarnings,
    thesisMemory,
    positionSizing,
    recommendation,
    recommendationCalibration,
    recommendationPolicyVersion,
  } = props;

  return (
    <>
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

      {degradedSourceWarnings.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-semibold">Data source degraded</p>
          <p className="mt-1">Some upstream sections were partially unavailable. Treat this report as provisional.</p>
          <ul className="list-disc pl-5 mt-1">
            {degradedSourceWarnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-900 mb-3">Decision Engine Recommendation</h3>
          {recommendation ? (
            <div className="space-y-2 text-sm">
              <p className="text-gray-700">Action: <span className="font-semibold uppercase">{recommendation.action}</span></p>
              <p className="text-gray-700">Confidence: <span className="font-semibold">{recommendation.confidencePct}%</span></p>
              <p className="text-gray-700">Horizon/Risk: <span className="font-semibold">{recommendation.horizonDays}d / {recommendation.riskClass.toUpperCase()}</span></p>
              <p className="text-gray-700">Policy version: <span className="font-semibold">{recommendationPolicyVersion || "rules_v1"}</span></p>
              {(recommendation.explainability.positive || []).length > 0 && (
                <ul className="list-disc pl-5 text-emerald-700">
                  {recommendation.explainability.positive.map((p) => <li key={p}>+ {p}</li>)}
                </ul>
              )}
              {(recommendation.explainability.negative || []).length > 0 && (
                <ul className="list-disc pl-5 text-red-700">
                  {recommendation.explainability.negative.map((n) => <li key={n}>- {n}</li>)}
                </ul>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-500">Recommendation will appear after scoring completes.</p>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-900 mb-3">Alpha Scorecard</h3>
          {loadingScoreAndOutcomes ? (
            <p className="text-sm text-gray-500">Computing score and outcomes...</p>
          ) : (
            <div className="space-y-2 text-sm">
              <p className="text-gray-700">Total score: <span className="font-semibold">{reportScore?.totalScore ?? "N/A"}</span></p>
              <p className="text-gray-700">Verdict: <span className="font-semibold uppercase">{reportScore?.verdict ?? "N/A"}</span></p>
              <p className="text-gray-700">Quality/Valuation: <span className="font-semibold">{reportScore ? `${reportScore.breakdown.quality}/${reportScore.breakdown.valuation}` : "N/A"}</span></p>
              <p className="text-gray-700">Momentum/Risk: <span className="font-semibold">{reportScore ? `${reportScore.breakdown.momentum}/${reportScore.breakdown.risk}` : "N/A"}</span></p>
              <p className="text-gray-700">Hit-rate ({outcomesSummary?.horizonDays ?? 90}d): <span className="font-semibold">{outcomesSummary?.hitRatePct == null ? "N/A" : `${outcomesSummary.hitRatePct.toFixed(1)}%`}</span></p>
              <p className="text-gray-700">Avg return ({outcomesSummary?.horizonDays ?? 90}d): <span className="font-semibold">{outcomesSummary?.avgReturnPct == null ? "N/A" : `${outcomesSummary.avgReturnPct.toFixed(2)}%`}</span></p>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-900">Accuracy & Recency Validator</h3>
            <button onClick={onRunJudgeValidation} className="text-xs px-2 py-1 border border-gray-300 rounded">Re-run</button>
          </div>
          {loadingJudge ? (
            <p className="text-sm text-gray-500">Running judge...</p>
          ) : (
            <div className="space-y-2 text-sm">
              <p className="text-gray-700">Completeness score: <span className="font-semibold">{judgeData?.completenessScore ?? "N/A"}</span></p>
              <p className="text-gray-700">Latest announcement: <span className="font-semibold">{recencyValidation?.latestAnnouncementDate ? format(new Date(recencyValidation.latestAnnouncementDate), "MMM dd, yyyy") : "N/A"}</span></p>
              {(judgeData?.missingComponents || []).length > 0 ? (
                <ul className="list-disc pl-5 text-red-600">
                  {(judgeData?.missingComponents || []).map((m) => <li key={m}>{m}</li>)}
                </ul>
              ) : <p className="text-emerald-700">No major missing components detected.</p>}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-900">Saved Reports</h3>
            <button onClick={onRefreshSavedReports} className="text-xs px-2 py-1 border border-gray-300 rounded">Refresh</button>
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
                    <div className="font-medium text-gray-900">#{r.id} {r.companyName}</div>
                    <div className="text-xs text-gray-500">{format(new Date(r.createdAt), "MMM dd, yyyy HH:mm")}</div>
                  </div>
                  <a href={`/api/reports/saved/${r.id}`} target="_blank" rel="noreferrer" className="text-blue-600 text-xs">Open JSON</a>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-900 mb-2">Calibration & Trust</h3>
        {recommendationCalibration ? (
          <div className="space-y-2 text-sm">
            <p className="text-gray-700">Samples: <span className="font-semibold">{recommendationCalibration.sampleCount}</span></p>
            <p className="text-gray-700">Expected precision at this band: <span className="font-semibold">{recommendationCalibration.hitRateAtBand == null ? "N/A" : `${recommendationCalibration.hitRateAtBand.toFixed(1)}%`}</span></p>
            <p className="text-gray-700">Calibration loss (brier-like): <span className="font-semibold">{recommendationCalibration.brierLikeScore == null ? "N/A" : recommendationCalibration.brierLikeScore.toFixed(4)}</span></p>
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
              <p className="text-gray-700">Status: <span className={`font-semibold uppercase ${thesisMemory.status === "active" ? "text-emerald-700" : "text-red-700"}`}>{thesisMemory.status}</span></p>
              <p className="text-gray-700">{thesisMemory.thesis}</p>
              {thesisMemory.invalidationTriggers.length > 0 && (
                <ul className="list-disc pl-5 text-gray-600">
                  {thesisMemory.invalidationTriggers.map((trigger) => <li key={trigger}>{trigger}</li>)}
                </ul>
              )}
            </div>
          ) : <p className="text-sm text-gray-500">No thesis memory found for this symbol yet.</p>}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-900 mb-2">Position Sizing & Rebalance</h3>
          {positionSizing ? (
            <div className="space-y-2 text-sm">
              <p className="text-gray-700">Risk budget: <span className="font-semibold">{positionSizing.riskBudgetPct}%</span> | Stop-loss: <span className="font-semibold">{positionSizing.stopLossPct}%</span></p>
              <p className="text-gray-700">Suggested rebalance cadence: <span className="font-semibold">30 days</span></p>
              <ul className="list-disc pl-5 text-gray-600">
                {positionSizing.suggestions.slice(0, 3).map((s) => (
                  <li key={s.symbol}>
                    {s.symbol}: {s.targetWeightPct.toFixed(2)}% (max {Math.round(s.maxPositionValue).toLocaleString()})
                  </li>
                ))}
              </ul>
            </div>
          ) : <p className="text-sm text-gray-500">Sizing suggestions appear after a report score is available.</p>}
        </div>
      </div>
    </>
  );
}
