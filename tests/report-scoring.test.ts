import test from "node:test";
import assert from "node:assert/strict";
import { buildReportScorecard } from "../reportScoring";
import type { CompanyReportData } from "../shared/reportTypes";

test("buildReportScorecard returns strong score for robust report", () => {
  const report: CompanyReportData = {
    name: "High Quality Ltd",
    chartData: [
      { year: "2022", sales: 1000, netProfit: 120, eps: 10 },
      { year: "2023", sales: 1200, netProfit: 165, eps: 12.5 },
      { year: "2024", sales: 1450, netProfit: 215, eps: 15.2 },
    ],
    quarterlyData: [
      { quarter: "Dec 2025", sales: 350, netProfit: 45, eps: 3.5 },
      { quarter: "Mar 2026", sales: 410, netProfit: 58, eps: 4.2 },
    ],
    recentAnnouncements: [{ subject: "Q4 results", date: "2026-03-31" }],
    aiReport: "X".repeat(220),
    reportType: "standard",
  };
  const out = buildReportScorecard(report, {
    passed: true,
    completenessScore: 90,
    missingComponents: [],
    latestAnnouncementDate: "2026-03-31",
    checkedAt: new Date().toISOString(),
  });
  assert.equal(out.verdict, "strong");
  assert.equal(out.totalScore >= 70, true);
  assert.equal(typeof out.breakdown.valuation, "number");
  assert.equal(typeof out.breakdown.risk, "number");
});

test("buildReportScorecard degrades for weak/partial report", () => {
  const report: CompanyReportData = {
    name: "Weak Co",
    chartData: [{ year: "2024", sales: 100, netProfit: -10, eps: -1 }],
    quarterlyData: [{ quarter: "Mar 2026", sales: 20, netProfit: -4, eps: -0.4 }],
    recentAnnouncements: [],
    aiReport: "short report",
    reportType: "quick",
  };
  const out = buildReportScorecard(report, {
    passed: false,
    completenessScore: 30,
    missingComponents: ["ai_report_missing_or_too_short"],
    latestAnnouncementDate: null,
    checkedAt: new Date().toISOString(),
  });
  assert.equal(out.totalScore < 60, true);
});
