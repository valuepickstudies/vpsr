import * as cheerio from "cheerio";
import type { CompanyReportData, QualityGateResult, ReportChartRow, ReportQuarterlyRow } from "./shared/reportTypes";

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
