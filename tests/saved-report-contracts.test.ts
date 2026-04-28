import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSavedReportDetail, normalizeSavedReportList } from "../shared/savedReportContracts";

test("normalizeSavedReportList normalizes rows", () => {
  const rows = normalizeSavedReportList([
    { id: 1, companyName: "ABC", symbol: "ABC", country: "IN", sourceUrl: "https://x", createdAt: "2026-01-01T00:00:00.000Z" },
    { id: 0, companyName: "Invalid" },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 1);
});

test("normalizeSavedReportDetail validates report payload", () => {
  const detail = normalizeSavedReportDetail({
    id: 2,
    companyName: "ABC",
    symbol: "ABC",
    country: "IN",
    sourceUrl: "https://x",
    createdAt: "2026-01-01T00:00:00.000Z",
    report: {
      name: "ABC",
      aiReport: "Long text",
      reportType: "standard",
      chartData: [{ year: "2025", sales: 10, netProfit: 2, eps: 1 }],
      quarterlyData: [{ quarter: "Q1", sales: 2, netProfit: 1, eps: 0.5 }],
      recentAnnouncements: [{ subject: "Result" }],
    },
  });
  assert.ok(detail);
  assert.equal(detail?.id, 2);
});
