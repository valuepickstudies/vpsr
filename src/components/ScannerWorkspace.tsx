import React from "react";
import { AlertCircle, ArrowLeft, BookmarkCheck, BookmarkPlus, RefreshCw, Sparkles } from "lucide-react";
import type { CompanySearchResult } from "../services/marketDataService";

export type ScannerStrategy = {
  id: string;
  label: string;
  desc: string;
  icon: React.ReactNode;
  bgClass: string;
  textClass: string;
  premium: boolean;
};

type ScannerWorkspaceProps = {
  scannerWorkspaceTab: "scanners" | "results" | "reports";
  setScannerWorkspaceTab: (tab: "scanners" | "results" | "reports") => void;
  selectedScanner: string | null;
  setSelectedScanner: (id: string | null) => void;
  loadingScanner: boolean;
  scannerResults: CompanySearchResult[];
  strategies: ScannerStrategy[];
  isPaidCustomer: boolean;
  setIsPaidCustomer: (value: boolean) => void;
  runScanner: (id: string) => void;
  openCompanyDashboard: (company: CompanySearchResult) => void;
  addToCustomPortfolio: (company: CompanySearchResult) => void;
  toggleSaveCompany: (company: CompanySearchResult) => void;
  isCompanySaved: (id: string) => boolean;
  selectedCompanyName?: string;
};

export default function ScannerWorkspace(props: ScannerWorkspaceProps) {
  const {
    scannerWorkspaceTab,
    setScannerWorkspaceTab,
    selectedScanner,
    setSelectedScanner,
    loadingScanner,
    scannerResults,
    strategies,
    isPaidCustomer,
    setIsPaidCustomer,
    runScanner,
    openCompanyDashboard,
    addToCustomPortfolio,
    toggleSaveCompany,
    isCompanySaved,
    selectedCompanyName,
  } = props;

  return (
    <div className="p-6">
      <div className="mb-6 flex flex-wrap gap-2 rounded-lg border border-gray-200 bg-gray-50 p-2">
        <button onClick={() => setScannerWorkspaceTab("scanners")} className={`px-3 py-1.5 rounded-md text-sm ${scannerWorkspaceTab === "scanners" ? "bg-white text-blue-700 shadow-sm" : "text-gray-600"}`}>Scanners</button>
        <button onClick={() => setScannerWorkspaceTab("results")} className={`px-3 py-1.5 rounded-md text-sm ${scannerWorkspaceTab === "results" ? "bg-white text-blue-700 shadow-sm" : "text-gray-600"}`}>Generated Results</button>
        <button onClick={() => setScannerWorkspaceTab("reports")} className={`px-3 py-1.5 rounded-md text-sm ${scannerWorkspaceTab === "reports" ? "bg-white text-blue-700 shadow-sm" : "text-gray-600"}`}>Stock Reports</button>
      </div>

      {(scannerWorkspaceTab === "scanners" && !selectedScanner) ? (
        <>
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Stock Scanners & Strategies</h2>
            <p className="text-gray-600">Discover potential investment opportunities using proven quantitative frameworks and screening criteria.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {strategies.map((strategy) => (
              <div
                key={strategy.id}
                onClick={() => {
                  if (strategy.premium && !isPaidCustomer) {
                    setIsPaidCustomer(false);
                  } else {
                    runScanner(strategy.id);
                  }
                }}
                className={`bg-white rounded-xl border p-6 shadow-sm transition-all cursor-pointer group relative overflow-hidden ${strategy.premium && !isPaidCustomer ? "border-amber-200 bg-amber-50/30" : "border-gray-200 hover:shadow-md"}`}
              >
                {strategy.premium && (
                  <div className="absolute top-0 right-0">
                    <div className={`text-[10px] font-bold px-2 py-1 rounded-bl-lg flex items-center gap-1 ${isPaidCustomer ? "bg-green-100 text-green-700" : "bg-amber-500 text-white"}`}>
                      <Sparkles className="h-2.5 w-2.5" />
                      {isPaidCustomer ? "UNLOCKED" : "PREMIUM"}
                    </div>
                  </div>
                )}
                <div className={`w-12 h-12 rounded-lg ${strategy.bgClass} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                  {strategy.icon}
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">{strategy.label}</h3>
                <p className="text-sm text-gray-600 mb-4 h-10 line-clamp-2">{strategy.desc}</p>

                {strategy.premium && !isPaidCustomer ? (
                  <button
                    onClick={(e) => { e.stopPropagation(); setIsPaidCustomer(true); }}
                    className="w-full py-2 bg-amber-600 text-white rounded-lg font-bold text-xs hover:bg-amber-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Unlock Strategy
                  </button>
                ) : (
                  <button className={`text-sm font-medium ${strategy.textClass} flex items-center gap-1 group-hover:gap-2 transition-all`}>
                    Run Scanner <ArrowLeft className="h-4 w-4 rotate-180" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      ) : scannerWorkspaceTab === "results" ? (
        <div>
          <button
            onClick={() => setSelectedScanner(null)}
            className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 mb-6"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Scanners
          </button>

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              {strategies.find((s) => s.id === selectedScanner)?.label} Results
            </h2>
            <p className="text-gray-600">
              {strategies.find((s) => s.id === selectedScanner)?.desc}
            </p>
          </div>

          {loadingScanner ? (
            <div className="text-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin mx-auto text-blue-500 mb-4" />
              <p className="text-gray-500">Running scanner across all listed companies...</p>
            </div>
          ) : scannerResults.length > 0 ? (
            <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
              {scannerResults.map((company) => (
                <div
                  key={company.id}
                  className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => {
                    openCompanyDashboard(company);
                  }}
                >
                  <div className="flex justify-between items-start mb-3 gap-2">
                    <h4 className="font-bold text-gray-900 text-lg line-clamp-1">{company.name}</h4>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          addToCustomPortfolio(company);
                        }}
                        className="text-xs px-2 py-1 rounded border border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                      >
                        Add to custom
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSaveCompany(company);
                        }}
                        className="text-gray-400 hover:text-blue-600 transition-colors"
                      >
                        {isCompanySaved(company.id) ? (
                          <BookmarkCheck className="h-5 w-5 text-blue-600" />
                        ) : (
                          <BookmarkPlus className="h-5 w-5" />
                        )}
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
                    <span className="px-2 py-1 bg-gray-100 rounded text-xs font-medium">{company.exchange}</span>
                  </div>
                  <div className="flex items-center text-sm font-medium text-blue-600 group-hover:text-blue-800">
                    View Analysis <ArrowLeft className="h-4 w-4 ml-1 rotate-180" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
              <AlertCircle className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900">No companies found</h3>
              <p className="text-gray-500 mt-2">No companies currently match this criteria.</p>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-5 text-sm text-indigo-900">
          {selectedCompanyName
            ? `Viewing report workspace for ${selectedCompanyName}. Scroll below to access the full report section.`
            : "Open a company from Generated Results to load its full report here."}
        </div>
      )}
    </div>
  );
}
