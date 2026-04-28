import type { CompanyReportData, QualityGateResult } from "./shared/reportTypes";

type ScoreBreakdown = {
  quality: number;
  valuation: number;
  momentum: number;
  risk: number;
};

export type ReportScorecard = {
  totalScore: number;
  verdict: "strong" | "watch" | "weak";
  breakdown: ScoreBreakdown;
  generatedAt: string;
};

function clampScore(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v)));
}

export function buildReportScorecard(report: CompanyReportData, qualityGate: QualityGateResult | null): ReportScorecard {
  const annual = Array.isArray(report.chartData) ? report.chartData : [];
  const quarterly = Array.isArray(report.quarterlyData) ? report.quarterlyData : [];

  const recentAnnual = annual.slice(-3);
  const growthSeries = recentAnnual
    .filter((r) => Number.isFinite(Number(r.sales)) && Number(r.sales) > 0)
    .map((r) => Number(r.sales));
  const growth = growthSeries.length >= 2
    ? ((growthSeries[growthSeries.length - 1] / growthSeries[0]) - 1) * 100
    : 0;

  const latestQuarter = quarterly[quarterly.length - 1];
  const prevQuarter = quarterly[quarterly.length - 2];
  const qGrowth = latestQuarter && prevQuarter && Number(prevQuarter.sales) > 0
    ? ((Number(latestQuarter.sales) / Number(prevQuarter.sales)) - 1) * 100
    : 0;

  const latestNetProfit = recentAnnual.length ? Number(recentAnnual[recentAnnual.length - 1].netProfit) : 0;
  const latestSales = recentAnnual.length ? Number(recentAnnual[recentAnnual.length - 1].sales) : 0;
  const netMargin = latestSales > 0 ? (latestNetProfit / latestSales) * 100 : 0;
  const pe = Number(String(report.summary?.pe || "").replace(/[^\d.-]/g, ""));
  const valuation = Number.isFinite(pe)
    ? (pe <= 12 ? 85 : pe <= 18 ? 75 : pe <= 25 ? 62 : pe <= 35 ? 50 : 38)
    : 55;
  const annualMargins = recentAnnual
    .filter((r) => Number(r.sales) > 0)
    .map((r) => (Number(r.netProfit) / Number(r.sales)) * 100);
  const marginSpread = annualMargins.length > 1 ? Math.max(...annualMargins) - Math.min(...annualMargins) : 8;
  const downYears = recentAnnual.filter((r) => Number(r.netProfit) <= 0).length;
  const riskPenalty = downYears * 20 + Math.max(0, marginSpread - 12) * 2;
  const risk = clampScore(82 - riskPenalty);
  const quality = qualityGate?.completenessScore ?? 40;

  const breakdown: ScoreBreakdown = {
    quality: clampScore(quality),
    valuation: clampScore(valuation),
    momentum: clampScore(50 + qGrowth * 2 + growth * 0.4),
    risk: clampScore((risk + clampScore(42 + netMargin * 2)) / 2),
  };
  const totalScore = clampScore(
    breakdown.quality * 0.35
    + breakdown.valuation * 0.2
    + breakdown.momentum * 0.25
    + breakdown.risk * 0.2
  );
  const verdict: ReportScorecard["verdict"] = totalScore >= 70 ? "strong" : totalScore >= 50 ? "watch" : "weak";
  return { totalScore, verdict, breakdown, generatedAt: new Date().toISOString() };
}
