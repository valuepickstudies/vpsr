import { ExternalLink, RefreshCw, Sparkles } from "lucide-react";
import type { ReportType } from "../../shared/reportTypes";

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
}: ReportWorkspaceHeaderProps) {
  return (
    <div className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
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
          Generate {reportType === "deep" ? "Deep Report" : reportType === "quick" ? "Quick Report" : "AI Report"}
        </button>
      </div>
    </div>
  );
}
