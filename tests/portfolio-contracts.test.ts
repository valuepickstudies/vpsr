import test from "node:test";
import assert from "node:assert/strict";
import { normalizeHoldingMetricsData, normalizeStrategyPerformanceData } from "../shared/portfolioContracts";

test("normalizeStrategyPerformanceData validates shape", () => {
  const result = normalizeStrategyPerformanceData({
    startDate: "2025-01-01",
    timezoneNote: "note",
    asOf: "2026-01-01T00:00:00.000Z",
    equalWeightReturnPct: 12.3,
    countOk: 2,
    countTotal: 3,
    symbols: [
      { symbol: "AAPL", entryDate: "2025-01-02", entryPrice: 100, lastDate: "2026-01-01", lastPrice: 120, returnPct: 20 },
      { symbol: "MSFT", returnPct: null },
    ],
  });
  assert.ok(result);
  assert.equal(result?.symbols.length, 2);
});

test("normalizeStrategyPerformanceData rejects invalid input", () => {
  const result = normalizeStrategyPerformanceData({ startDate: "x" });
  assert.equal(result, null);
});

test("normalizeHoldingMetricsData validates shape", () => {
  const result = normalizeHoldingMetricsData({
    symbol: "AAPL",
    purchaseDate: "2025-01-01",
    purchasePrice: 100,
    currentDate: "2026-01-01",
    currentPrice: 130,
    quantity: 10,
    investmentValue: 1000,
    marketValue: 1300,
    dailyPctGain: 0.5,
    totalPctGain: 30,
  });
  assert.ok(result);
  assert.equal(result?.symbol, "AAPL");
});
