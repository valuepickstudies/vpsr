import { ExternalLink, RefreshCw, Sparkles } from "lucide-react";
import type { ReportType } from "../../shared/reportTypes";

type DataProvenanceStrip = {
  /** ISO timestamp when this report payload was fetched */
  reportGeneratedAt: string | null;
  /** Last daily candle date used for technicals (if loaded) */
  priceAsOf: string | null;
  /** Judge / quality gate run time */
  judgeCheckedAt: string | null;
  /** Units and source hint for fundamentals tables */
  fundamentalsNote: string;
};

type ReportWorkspaceHeaderProps = {
  companyName: string;
  companyExchange: string;
  companyUrl: string;
  isPaidCustomer: boolean;
  reportType: ReportType;
  hideCompanyNameInReport: boolean;
  loadingReport: boolean;
  onReportTypeChange: (value: ReportType) => void;
  onHideCompanyNameChange: (checked: boolean) => void;
  onGenerateReport: () => void;
  /** As-of line for data transparency */
  dataProvenance?: DataProvenanceStrip;
};

export default function ReportWorkspaceHeader({
  companyName,
  companyExchange,
  companyUrl,
  isPaidCustomer,
  reportType,
  hideCompanyNameInReport,
  loadingReport,
  onReportTypeChange,
  onHideCompanyNameChange,
  onGenerateReport,
  dataProvenance,
}: ReportWorkspaceHeaderProps) {
  return (
    <div className="section-shell mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h2 className={`text-2xl font-bold text-gray-900 transition-all ${!isPaidCustomer ? "blur-md select-none" : ""}`}>
          {isPaidCustomer ? companyName : "HIDDEN COMPANY NAME"}
        </h2>
        {!isPaidCustomer && (
          <div className="mt-1 flex items-center gap-1.5 text-amber-600 text-xs font-semibold uppercase tracking-wider">
            <Sparkles className="h-3 w-3" />
            Unlock with Premium
          </div>
        )}
        <div className="flex items-center gap-3 mt-2">
          <span className="px-2.5 py-1 bg-gray-100 text-sm text-gray-700 rounded-md font-medium">
            {companyExchange}
          </span>
          <a
            href={companyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
          >
            View on Screener <ExternalLink className="h-3 w-3" />
          </a>
        </div>
        {dataProvenance && (
          <dl className="mt-3 grid gap-1 text-xs text-gray-600 max-w-xl border-t border-gray-100 pt-3">
            <div className="flex flex-wrap gap-x-4 gap-y-0.5">
              <dt className="font-medium text-gray-500">Report data</dt>
              <dd>{dataProvenance.reportGeneratedAt ? new Date(dataProvenance.reportGeneratedAt).toLocaleString() : "—"}</dd>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-0.5">
              <dt className="font-medium text-gray-500">Price series</dt>
              <dd>{dataProvenance.priceAsOf ? dataProvenance.priceAsOf : "—"}</dd>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-0.5">
              <dt className="font-medium text-gray-500">Quality gate</dt>
              <dd>{dataProvenance.judgeCheckedAt ? new Date(dataProvenance.judgeCheckedAt).toLocaleString() : "—"}</dd>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-0.5">
              <dt className="font-medium text-gray-500">Tables</dt>
              <dd className="text-gray-600">{dataProvenance.fundamentalsNote}</dd>
            </div>
          </dl>
        )}
      </div>

      <div className="flex flex-col items-start sm:items-end gap-2">
        <label className="inline-flex items-center gap-2 text-xs text-gray-600">
          Report type
          <select
            value={reportType}
            onChange={(e) => onReportTypeChange(e.target.value as ReportType)}
            className="h-7 rounded border border-gray-300 bg-white px-2 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="quick">Quick Report</option>
            <option value="standard">Standard Report</option>
            <option value="deep">Deep Research Report</option>
          </select>
        </label>
        <label className="inline-flex items-center gap-2 text-xs text-gray-600">
          <input
            type="checkbox"
            checked={hideCompanyNameInReport}
            onChange={(e) => onHideCompanyNameChange(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
          Hide company name in AI report
        </label>
        <button
          onClick={onGenerateReport}
          disabled={loadingReport}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-md font-medium hover:from-blue-700 hover:to-indigo-700 transition-all shadow-sm disabled:opacity-70"
        >
          {loadingReport ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          Generate {reportType === "deep" ? "Deep Analysis" : reportType === "quick" ? "Quick Analysis" : "Standard Analysis"}
        </button>
      </div>
    </div>
  );
}
