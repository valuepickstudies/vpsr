import test from "node:test";
import assert from "node:assert/strict";
import {
  isCompanySnapshotData,
  isQualityGateResult,
  normalizeCompanyReportData,
  normalizeJudgeValidationData,
  normalizeRecencyValidationData,
} from "../shared/reportContracts";

test("normalizeCompanyReportData accepts valid payload", () => {
  const normalized = normalizeCompanyReportData({
    name: "ABC Ltd",
    aiReport: "Long form analysis",
    reportType: "standard",
    chartData: [{ year: "2023", sales: 100, netProfit: 20, eps: 5 }],
    quarterlyData: [{ quarter: "Q1 FY25", sales: 35, netProfit: 8, eps: 2 }],
    recentAnnouncements: [{ subject: "Result update", date: "2026-01-01" }],
  });
  assert.ok(normalized);
  assert.equal(normalized?.name, "ABC Ltd");
  assert.equal(normalized?.chartData.length, 1);
});

test("normalizeCompanyReportData rejects invalid payload", () => {
  const normalized = normalizeCompanyReportData({
    name: "ABC Ltd",
    reportType: "invalid",
  });
  assert.equal(normalized, null);
});

test("quality and snapshot contracts validate expected shapes", () => {
  assert.equal(
    isQualityGateResult({
      passed: true,
      completenessScore: 80,
      missingComponents: [],
      latestAnnouncementDate: null,
      checkedAt: new Date().toISOString(),
    }),
    true
  );
  assert.equal(isCompanySnapshotData({ name: "ABC", snapshot: "Short summary" }), true);
  assert.equal(isCompanySnapshotData({ name: "ABC" }), false);
});

test("judge and recency normalizers validate response contracts", () => {
  const recency = normalizeRecencyValidationData({
    symbol: "AAPL",
    latestAnnouncementDate: null,
    checkedAt: new Date().toISOString(),
  });
  assert.ok(recency);

  const judge = normalizeJudgeValidationData({
    passed: true,
    completenessScore: 80,
    missingComponents: [],
    latestAnnouncementDate: null,
    checkedAt: new Date().toISOString(),
    hasRecentAnnouncements: false,
    reportSource: "saved",
  });
  assert.ok(judge);
});
