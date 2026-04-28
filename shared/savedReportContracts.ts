import { normalizeCompanyReportData } from "./reportContracts";
import type { CompanyReportData } from "./reportTypes";

export type SavedReportListItem = {
  id: number;
  companyName: string;
  symbol: string | null;
  country: string;
  sourceUrl: string;
  createdAt: string;
};

export type SavedReportDetail = SavedReportListItem & {
  report: CompanyReportData;
};

export function normalizeSavedReportList(input: unknown): SavedReportListItem[] {
  const rows = Array.isArray(input) ? input : [];
  return rows.map((raw) => {
    const r = raw as Record<string, unknown>;
    return {
      id: Number(r.id) || 0,
      companyName: typeof r.companyName === "string" ? r.companyName : "Unknown Company",
      symbol: typeof r.symbol === "string" ? r.symbol : null,
      country: typeof r.country === "string" ? r.country : "N/A",
      sourceUrl: typeof r.sourceUrl === "string" ? r.sourceUrl : "",
      createdAt: typeof r.createdAt === "string" ? r.createdAt : new Date(0).toISOString(),
    };
  }).filter((r) => r.id > 0);
}

export function normalizeSavedReportDetail(input: unknown): SavedReportDetail | null {
  const r = input as Record<string, unknown>;
  const report = normalizeCompanyReportData(r.report);
  if (!report) return null;
  const id = Number(r.id);
  if (!Number.isFinite(id) || id <= 0) return null;
  return {
    id,
    companyName: typeof r.companyName === "string" ? r.companyName : "Unknown Company",
    symbol: typeof r.symbol === "string" ? r.symbol : null,
    country: typeof r.country === "string" ? r.country : "N/A",
    sourceUrl: typeof r.sourceUrl === "string" ? r.sourceUrl : "",
    createdAt: typeof r.createdAt === "string" ? r.createdAt : new Date(0).toISOString(),
    report,
  };
}
