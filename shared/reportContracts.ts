import type { CompanyReportData, CompanySnapshotData, QualityGateResult, ReportAnnouncement, ReportChartRow, ReportQuarterlyRow, ReportType } from "./reportTypes";

const REPORT_TYPES: ReportType[] = ["deep", "standard", "quick"];

function asFiniteNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function normalizeChartRow(value: unknown): ReportChartRow | null {
  const row = value as Record<string, unknown>;
  const year = asString(row?.year);
  const sales = asFiniteNumber(row?.sales);
  const netProfit = asFiniteNumber(row?.netProfit);
  const eps = asFiniteNumber(row?.eps);
  if (!year || sales == null || netProfit == null || eps == null) return null;
  return { year, sales, netProfit, eps };
}

function normalizeQuarterlyRow(value: unknown): ReportQuarterlyRow | null {
  const row = value as Record<string, unknown>;
  const quarter = asString(row?.quarter);
  const sales = asFiniteNumber(row?.sales);
  const netProfit = asFiniteNumber(row?.netProfit);
  const eps = asFiniteNumber(row?.eps);
  if (!quarter || sales == null || netProfit == null || eps == null) return null;
  return { quarter, sales, netProfit, eps };
}

function normalizeAnnouncement(value: unknown): ReportAnnouncement | null {
  const a = value as Record<string, unknown>;
  const subject = asString(a?.subject);
  if (!subject) return null;
  return {
    id: (typeof a?.id === "string" || typeof a?.id === "number") ? a.id : undefined,
    symbol: typeof a?.symbol === "string" ? a.symbol : null,
    companyName: typeof a?.companyName === "string" ? a.companyName : undefined,
    subject,
    date: typeof a?.date === "string" ? a.date : undefined,
    pdfLink: typeof a?.pdfLink === "string" ? a.pdfLink : null,
    exchange: typeof a?.exchange === "string" ? a.exchange : undefined,
    category: typeof a?.category === "string" ? a.category : undefined,
  };
}

export function normalizeCompanyReportData(input: unknown): CompanyReportData | null {
  const obj = input as Record<string, unknown>;
  const name = asString(obj?.name);
  const aiReport = asString(obj?.aiReport);
  const reportTypeRaw = asString(obj?.reportType);
  const reportType = REPORT_TYPES.includes(reportTypeRaw as ReportType) ? (reportTypeRaw as ReportType) : null;
  const chartDataRaw = Array.isArray(obj?.chartData) ? obj.chartData : [];
  const quarterlyDataRaw = Array.isArray(obj?.quarterlyData) ? obj.quarterlyData : [];
  const announcementsRaw = Array.isArray(obj?.recentAnnouncements) ? obj.recentAnnouncements : [];
  const chartData = chartDataRaw.map(normalizeChartRow).filter((r): r is ReportChartRow => !!r);
  const quarterlyData = quarterlyDataRaw.map(normalizeQuarterlyRow).filter((r): r is ReportQuarterlyRow => !!r);
  const recentAnnouncements = announcementsRaw.map(normalizeAnnouncement).filter((a): a is ReportAnnouncement => !!a);
  if (!name || !aiReport || !reportType) return null;
  return {
    name,
    aiReport,
    reportType,
    chartData,
    quarterlyData,
    recentAnnouncements,
    summary: (obj?.summary && typeof obj.summary === "object") ? (obj.summary as CompanyReportData["summary"]) : undefined,
    parsingWarnings: Array.isArray(obj?.parsingWarnings)
      ? obj.parsingWarnings.filter((v): v is string => typeof v === "string")
      : undefined,
  };
}

export function isQualityGateResult(input: unknown): input is QualityGateResult {
  const obj = input as Record<string, unknown>;
  return (
    typeof obj?.passed === "boolean" &&
    typeof obj?.completenessScore === "number" &&
    Array.isArray(obj?.missingComponents) &&
    (obj.latestAnnouncementDate === null || typeof obj.latestAnnouncementDate === "string") &&
    typeof obj?.checkedAt === "string"
  );
}

export function isCompanySnapshotData(input: unknown): input is CompanySnapshotData {
  const obj = input as Record<string, unknown>;
  return typeof obj?.name === "string" && typeof obj?.snapshot === "string";
}

export type RecencyValidationData = {
  symbol: string;
  latestAnnouncementDate: string | null;
  checkedAt: string;
};

export type JudgeValidationData = QualityGateResult & {
  hasRecentAnnouncements: boolean;
  reportSource: string;
};

export function normalizeRecencyValidationData(input: unknown): RecencyValidationData | null {
  const obj = input as Record<string, unknown>;
  const symbol = typeof obj?.symbol === "string" ? obj.symbol : "";
  const checkedAt = typeof obj?.checkedAt === "string" ? obj.checkedAt : "";
  const latestAnnouncementDate =
    obj?.latestAnnouncementDate == null ? null :
    (typeof obj.latestAnnouncementDate === "string" ? obj.latestAnnouncementDate : null);
  if (!symbol || !checkedAt) return null;
  return { symbol, latestAnnouncementDate, checkedAt };
}

export function normalizeJudgeValidationData(input: unknown): JudgeValidationData | null {
  if (!isQualityGateResult(input)) return null;
  const obj = input as Record<string, unknown>;
  if (typeof obj?.hasRecentAnnouncements !== "boolean") return null;
  if (typeof obj?.reportSource !== "string") return null;
  return {
    ...input,
    hasRecentAnnouncements: obj.hasRecentAnnouncements,
    reportSource: obj.reportSource,
  };
}
