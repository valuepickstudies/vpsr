import type { CompanyReportData, CompanySnapshotData, QualityGateResult, ReportType } from "../../shared/reportTypes";
import { isCompanySnapshotData, isQualityGateResult, normalizeCompanyReportData, normalizeJudgeValidationData, normalizeRecencyValidationData, type JudgeValidationData, type RecencyValidationData } from "../../shared/reportContracts";
import { normalizeSavedReportDetail, normalizeSavedReportList, type SavedReportDetail, type SavedReportListItem } from "../../shared/savedReportContracts";
import { fetchJSON, type ApiResponse } from "./apiClient";

type ReportResponse = {
  data: CompanyReportData;
  qualityGate?: QualityGateResult;
};

export type ReportScoreData = {
  reportId: number;
  country: string;
  createdAt: string;
  quality: QualityGateResult;
  scorecard: {
    totalScore: number;
    verdict: "strong" | "watch" | "weak";
    breakdown: {
      quality: number;
      valuation: number;
      momentum: number;
      risk: number;
    };
    generatedAt: string;
  };
};

export type OutcomesSummaryData = {
  horizonDays: number;
  country: string;
  totalRows: number;
  usableRows: number;
  hitRatePct: number | null;
  avgReturnPct: number | null;
  asOf: string;
};

export type ThesisMemoryData = {
  symbol: string;
  country: "IN" | "US";
  thesis: string;
  invalidationTriggers: string[];
  status: "active" | "invalidated";
  invalidatedReason: string | null;
  invalidatedAt: string | null;
  updatedAt: string;
};

export async function fetchCompanyReport(
  url: string,
  country: "IN" | "US",
  reportType: ReportType
): Promise<ApiResponse<ReportResponse>> {
  const params = new URLSearchParams({
    url,
    country,
    reportType,
  });
  const result = await fetchJSON<ReportResponse>(`/api/company/report?${params.toString()}`);
  if (!result.success) return result;
  const rawPayload = (result.data as unknown as { data?: unknown })?.data ?? result.data;
  const normalized = normalizeCompanyReportData(rawPayload);
  if (!normalized) {
    return { success: false, error: "invalid_report_contract" } as ApiResponse<ReportResponse>;
  }
  const qualityGateRaw = (result as unknown as { qualityGate?: unknown }).qualityGate
    ?? (result.data as unknown as { qualityGate?: unknown })?.qualityGate;
  if (qualityGateRaw && !isQualityGateResult(qualityGateRaw)) {
    return { success: false, error: "invalid_quality_gate_contract" } as ApiResponse<ReportResponse>;
  }
  return {
    success: true as const,
    data: {
      data: normalized,
      qualityGate: qualityGateRaw as QualityGateResult | undefined,
    },
  } as ApiResponse<ReportResponse>;
}

export async function fetchCompanySnapshot(url: string, country: "IN" | "US"): Promise<ApiResponse<CompanySnapshotData>> {
  const params = new URLSearchParams({ url, country });
  const result = await fetchJSON<CompanySnapshotData>(`/api/company/snapshot?${params.toString()}`);
  if (!result.success) return result;
  if (!isCompanySnapshotData(result.data)) {
    return { success: false, error: "invalid_snapshot_contract" } as ApiResponse<CompanySnapshotData>;
  }
  return result;
}

export async function fetchReportQuality(url: string, country: "IN" | "US", symbol?: string) {
  const params = new URLSearchParams({ url, country });
  if (symbol) params.set("symbol", symbol);
  const [judge, recency] = await Promise.all([
    fetchJSON<unknown>(`/api/company/judge?${params.toString()}`),
    fetchJSON<unknown>(
      `/api/company/validate-recency?${params.toString()}`
    ),
  ]);
  if (judge.success && !normalizeJudgeValidationData(judge.data)) {
    return {
      judge: { success: false as const, error: "invalid_quality_gate_contract" },
      recency,
    };
  }
  if (recency.success && !normalizeRecencyValidationData(recency.data)) {
    return {
      judge,
      recency: { success: false as const, error: "invalid_recency_contract" },
    };
  }
  return {
    judge: judge.success
      ? ({ success: true, data: normalizeJudgeValidationData(judge.data) as JudgeValidationData })
      : judge,
    recency: recency.success
      ? ({ success: true, data: normalizeRecencyValidationData(recency.data) as RecencyValidationData })
      : recency,
  };
}

export async function fetchSavedReports(country: "IN" | "US", symbol: string): Promise<ApiResponse<SavedReportListItem[]>> {
  const params = new URLSearchParams({ country, symbol });
  const result = await fetchJSON<unknown[]>(`/api/reports/saved?${params.toString()}`);
  if (!result.success) return result as ApiResponse<SavedReportListItem[]>;
  return { success: true, data: normalizeSavedReportList(result.data) };
}

export async function fetchSavedReportById(id: number): Promise<ApiResponse<SavedReportDetail>> {
  const result = await fetchJSON<unknown>(`/api/reports/saved/${id}`);
  if (!result.success) return result as ApiResponse<SavedReportDetail>;
  const normalized = normalizeSavedReportDetail(result.data);
  if (!normalized) return { success: false, error: "invalid_saved_report_contract" };
  return { success: true, data: normalized };
}

export async function fetchReportScoreById(id: number): Promise<ApiResponse<ReportScoreData>> {
  return fetchJSON<ReportScoreData>(`/api/reports/score/${id}`);
}

export async function fetchOutcomesSummary(
  horizonDays: number,
  country: "IN" | "US" | "ALL" = "ALL"
): Promise<ApiResponse<OutcomesSummaryData>> {
  const params = new URLSearchParams({ horizonDays: String(horizonDays) });
  if (country !== "ALL") params.set("country", country);
  return fetchJSON<OutcomesSummaryData>(`/api/reports/outcomes?${params.toString()}`);
}

export async function fetchThesisMemory(symbol: string, country: "IN" | "US"): Promise<ApiResponse<ThesisMemoryData>> {
  const params = new URLSearchParams({ symbol, country });
  return fetchJSON<ThesisMemoryData>(`/api/company/thesis?${params.toString()}`);
}
