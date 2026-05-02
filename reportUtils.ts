import * as cheerio from "cheerio";
import type { CompanyReportData, QualityGateResult, ReportChartRow, ReportQuarterlyRow } from "./shared/reportTypes";

/** Parses calendar year from Screener period labels like "Mar 2026", "2024", "FY2025" (FY has no word boundary before digits). */
export function extractYearFromPeriodLabel(label: string): number {
  const s = String(label || "").trim();
  const fy = s.match(/FY\s*(19\d{2}|20\d{2})/i);
  if (fy) return Number(fy[1]);
  const m = s.match(/\b(19\d{2}|20\d{2})\b/);
  if (m) return Number(m[0]);
  return new Date().getFullYear();
}

/** Wilder's RSI aligned by candle index; null until period bars allow a reading. */
export function computeWildersRSI(closes: number[], period = 14): (number | null)[] {
  const rsi: (number | null)[] = closes.map(() => null);
  if (closes.length < period + 1) return rsi;
  const changes: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    changes.push(closes[i] - closes[i - 1]);
  }
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 0; i < period; i++) {
    const ch = changes[i];
    if (ch >= 0) avgGain += ch;
    else avgLoss -= ch;
  }
  avgGain /= period;
  avgLoss /= period;
  const rs0 = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  rsi[period] = rs0;
  let avgG = avgGain;
  let avgL = avgLoss;
  for (let i = period; i < changes.length; i++) {
    const ch = changes[i];
    const gain = ch > 0 ? ch : 0;
    const loss = ch < 0 ? -ch : 0;
    avgG = (avgG * (period - 1) + gain) / period;
    avgL = (avgL * (period - 1) + loss) / period;
    const idx = i + 1;
    rsi[idx] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
  }
  return rsi;
}

function clampNumber(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

/** 3-year forward projection from recent annual rows; labels use fiscal year parsed from Screener columns. */
export function buildFutureProjectionRows(chartData: ReportChartRow[]): Array<{ year: string; sales: number; netProfit: number }> {
  const rows = (chartData || []).slice(-4).map((r) => ({
    year: String(r.year),
    sales: Number(r.sales) || 0,
    netProfit: Number(r.netProfit) || 0,
  })).filter((r) => Number.isFinite(r.sales) && Number.isFinite(r.netProfit));
  if (rows.length < 2) return [];
  const salesGrowth = rows.slice(1).map((r, i) => (rows[i].sales > 0 ? r.sales / rows[i].sales - 1 : 0));
  const profitGrowth = rows.slice(1).map((r, i) =>
    rows[i].netProfit !== 0 ? r.netProfit / rows[i].netProfit - 1 : 0
  );
  const avgSalesGrowth = salesGrowth.length ? salesGrowth.reduce((a, b) => a + b, 0) / salesGrowth.length : 0;
  const avgProfitGrowth = profitGrowth.length ? profitGrowth.reduce((a, b) => a + b, 0) / profitGrowth.length : 0;
  const last = rows[rows.length - 1];
  const baseYear = extractYearFromPeriodLabel(last.year);
  let s = last.sales;
  let p = last.netProfit;
  const out: Array<{ year: string; sales: number; netProfit: number }> = [];
  for (let i = 1; i <= 3; i++) {
    s = s * (1 + clampNumber(avgSalesGrowth, -0.2, 0.35));
    p = p * (1 + clampNumber(avgProfitGrowth, -0.3, 0.4));
    const sy = Number(s.toFixed(2));
    const py = Number(p.toFixed(2));
    if (!Number.isFinite(sy) || !Number.isFinite(py)) continue;
    out.push({
      year: `Mar ${baseYear + i} (proj)`,
      sales: sy,
      netProfit: py,
    });
  }
  return out;
}

function parseTableSeriesByLabels(
  $: cheerio.CheerioAPI,
  sectionSelector: string,
  labels: { sales: string[]; netProfit: string[]; eps?: string[] }
): { columns: string[]; sales: number[]; netProfit: number[]; eps: number[] } {
  const section = $(sectionSelector).first();
  const table = section.is("table") ? section : section.find("table").first();
  const scope = table.length ? table : section;
  const columns: string[] = [];
  const sales: number[] = [];
  const netProfit: number[] = [];
  const eps: number[] = [];
  scope.find("thead th, tr th").each((i, el) => {
    if (i > 0) columns.push($(el).text().trim());
  });
  scope.find("tbody tr, tr").each((_, tr) => {
    const firstCell = $(tr).find("td, th").first();
    const rowName = firstCell.text().trim().toLowerCase();
    if (!rowName) return;
    const extract = (bucket: number[]) => {
      $(tr).find("td, th").each((i, td) => {
        if (i > 0) bucket.push(parseFloat($(td).text().replace(/,/g, "")) || 0);
      });
    };
    if (labels.sales.some((l) => rowName.includes(l))) extract(sales);
    else if (labels.netProfit.some((l) => rowName.includes(l))) extract(netProfit);
    else if ((labels.eps || []).some((l) => rowName.includes(l))) extract(eps);
  });
  return { columns, sales, netProfit, eps };
}

function resolveScreenerSectionSelector($: cheerio.CheerioAPI, fallbackIdSelector: string, headingHints: string[]): string {
  if ($(fallbackIdSelector).length) return fallbackIdSelector;
  const normalizedHints = headingHints.map((h) => h.toLowerCase());
  const normalizedFallback = fallbackIdSelector.replace("#", "").replace(/[-_]/g, "");
  const idByContains = $(`[id*="${normalizedFallback}"], [data-name*="${normalizedFallback}"]`).first();
  if (idByContains.length) {
    const id = idByContains.attr("id");
    if (id) return `#${id}`;
  }
  const candidates: string[] = [];
  $("section, div.card, div.box, table").each((_, el) => {
    const node = $(el);
    const text = node.text().toLowerCase();
    if (normalizedHints.some((hint) => text.includes(hint))) {
      const attrId = node.attr("id");
      if (attrId) candidates.push(`#${attrId}`);
    }
  });
  return candidates[0] || fallbackIdSelector;
}

export function parseScreenerFinancials(html: string): {
  name: string;
  chartData: ReportChartRow[];
  quarterlyData: ReportQuarterlyRow[];
  parsingWarnings: string[];
} {
  const $ = cheerio.load(html);
  const name = $("h1.show-from-tablet-landscape").text().trim() || $("h1").first().text().trim() || "Unknown Company";
  const annualSelector = resolveScreenerSectionSelector($, "#profit-loss", ["profit & loss", "profit and loss", "sales", "net profit"]);
  const quarterlySelector = resolveScreenerSectionSelector($, "#quarters", ["quarterly results", "quarters", "qtr", "results", "dec ", "mar "]);
  const annual = parseTableSeriesByLabels($, annualSelector, {
    sales: ["sales"],
    netProfit: ["net profit", "profit after tax", "pat"],
    eps: ["eps in rs", "eps"],
  });
  const quarterly = parseTableSeriesByLabels($, quarterlySelector, {
    sales: ["sales"],
    netProfit: ["net profit", "profit after tax", "pat"],
    eps: ["eps in rs", "eps"],
  });

  const chartData: ReportChartRow[] = annual.columns.map((year, i) => ({
    year,
    sales: annual.sales[i] || 0,
    netProfit: annual.netProfit[i] || 0,
    eps: annual.eps[i] || 0,
  }));
  const quarterlyData: ReportQuarterlyRow[] = quarterly.columns.map((quarter, i) => ({
    quarter,
    sales: quarterly.sales[i] || 0,
    netProfit: quarterly.netProfit[i] || 0,
    eps: quarterly.eps[i] || 0,
  }));

  const parsingWarnings: string[] = [];
  if (!chartData.length) parsingWarnings.push("annual_table_missing_or_unreadable");
  if (!quarterlyData.length) parsingWarnings.push("quarterly_table_missing_or_unreadable");
  if (chartData.some((r) => r.sales === 0 || r.netProfit === 0)) parsingWarnings.push("annual_rows_with_zero_values");
  return { name, chartData, quarterlyData, parsingWarnings };
}

export function assessReportQuality(report: CompanyReportData, latestAnnouncementDate: string | null): QualityGateResult {
  const missing: string[] = [];
  if (!Array.isArray(report.chartData) || report.chartData.length === 0) missing.push("annual_chart_data_missing");
  if (!Array.isArray(report.quarterlyData) || report.quarterlyData.length === 0) missing.push("quarterly_data_missing");
  if (!String(report.aiReport || "").trim() || String(report.aiReport || "").trim().length < 120) {
    missing.push("ai_report_missing_or_too_short");
  }
  const zerosInAnnual = (report.chartData || []).filter((r) => Number(r.sales) === 0 || Number(r.netProfit) === 0).length;
  if (zerosInAnnual > 0) missing.push(`annual_rows_with_zero_values:${zerosInAnnual}`);
  if (!latestAnnouncementDate) missing.push("latest_announcement_missing");
  const completenessScore = Math.max(0, 100 - missing.length * 20);
  return {
    passed: completenessScore >= 60,
    completenessScore,
    missingComponents: missing,
    latestAnnouncementDate,
    checkedAt: new Date().toISOString(),
  };
}
