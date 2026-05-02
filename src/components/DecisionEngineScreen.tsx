import {
  ArrowRight,
  BookOpen,
  Brain,
  LineChart,
  Radio,
  Scale,
  Share2,
  Sparkles,
} from "lucide-react";
import DeepAnalysisPanel, { type DeepAnalysisBundle } from "./DeepAnalysisPanel";

export type DecisionNavTab =
  | "discover"
  | "results"
  | "companies"
  | "scanners"
  | "portfolio"
  | "saved";

type DecisionEngineScreenProps = {
  onNavigate: (tab: DecisionNavTab) => void;
  deepAnalysis: DeepAnalysisBundle;
};

const pillars = [
  {
    icon: Brain,
    title: "Proprietary signal score",
    outcome: "One scorecard blending fundamentals, price action, and event recency.",
    evidence: "Alpha scorecard (quality, valuation, momentum, risk) plus quality-gate and recency checks on every report.",
  },
  {
    icon: Scale,
    title: "Portfolio intelligence",
    outcome: "Position sizing and risk-budgeted weights from conviction and drawdown inputs.",
    evidence: "Position-sizing API and custom portfolio workspace tie recommendations to capital and stop rules.",
  },
  {
    icon: LineChart,
    title: "Outcome tracking",
    outcome: "Forward returns vs report timestamps by horizon (e.g. 30 / 90 / 180d).",
    evidence: "Saved reports feed outcome rows; aggregate hit-rate and average return power the dashboard and calibration loop.",
  },
  {
    icon: BookOpen,
    title: "Analyst memory",
    outcome: "Thesis, updates, and explicit invalidation triggers that survive sessions.",
    evidence: "Per-symbol thesis storage with status; invalidation lines surface when the world breaks your story.",
  },
  {
    icon: Share2,
    title: "Distribution flywheel",
    outcome: "Public snapshots and shareable artifacts that feed discovery and watchlists.",
    evidence: "Quick snapshots from results flows; saved companies and discover cards reduce friction to re-run analysis.",
  },
] as const;

export default function DecisionEngineScreen({ onNavigate, deepAnalysis }: DecisionEngineScreenProps) {
  return (
    <div className="p-6 space-y-10">
      <DeepAnalysisPanel data={deepAnalysis} />

      <header className="section-shell border-dashed border-gray-300 bg-gradient-to-br from-amber-50/40 to-white">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-amber-800/90 mb-2">Evidence-backed decision engine</p>
            <h1 className="text-2xl font-bold text-gray-900">
              Score quality, track outcomes, improve from realized performance
            </h1>
            <p className="mt-3 text-sm text-gray-600 max-w-2xl leading-relaxed">
              The system does not stop at a single AI draft. It scores each report, stores recommendations, links them to
              post-hoc price paths, and feeds that signal back into policy and calibration so the next call is sharper than
              the last.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onNavigate("discover")}
              className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-gray-800"
            >
              <Sparkles className="h-4 w-4" />
              Start from Discover
            </button>
            <button
              type="button"
              onClick={() => onNavigate("portfolio")}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"
            >
              Open portfolio
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
        <ol className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm text-gray-700">
          <li className="flex gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-900">1</span>
            <span><span className="font-medium text-gray-900">Ingest &amp; score</span> — parse filings, run gates, build scorecard.</span>
          </li>
          <li className="flex gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-900">2</span>
            <span><span className="font-medium text-gray-900">Decide &amp; size</span> — action, confidence, and risk-budgeted weights.</span>
          </li>
          <li className="flex gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-900">3</span>
            <span><span className="font-medium text-gray-900">Observe</span> — mark horizons and log realized returns.</span>
          </li>
          <li className="flex gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-900">4</span>
            <span><span className="font-medium text-gray-900">Calibrate</span> — update priors; rinse and repeat.</span>
          </li>
        </ol>
      </header>

      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Moat-building pillars</h2>
        <p className="text-sm text-gray-500 mb-6">What ships in-product today and what it is for.</p>
        <div className="grid gap-4 md:grid-cols-2">
          {pillars.map((p) => {
            const Icon = p.icon;
            return (
              <div
                key={p.title}
                className="section-shell text-left border-gray-200 hover:border-amber-200/80 transition-colors"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-800">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="font-semibold text-gray-900">{p.title}</h3>
                </div>
                <p className="text-sm text-gray-700 mb-2">{p.outcome}</p>
                <p className="text-xs text-gray-500 border-t border-gray-100 pt-2">
                  <span className="font-medium text-gray-600">Evidence in app: </span>
                  {p.evidence}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="section-shell flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-gray-900 font-semibold">
            <Radio className="h-4 w-4 text-indigo-600" />
            Where to use it
          </div>
          <p className="text-sm text-gray-500 mt-1">Jump to the parts of the app that implement each layer.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["discover", "Discover"] as const,
              ["results", "Results"] as const,
              ["scanners", "Scanners"] as const,
              ["companies", "Directory"] as const,
              ["portfolio", "Portfolio"] as const,
              ["saved", "Saved"] as const,
            ] as const
          ).map(([tab, label]) => (
            <button
              key={tab}
              type="button"
              onClick={() => onNavigate(tab)}
              className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
