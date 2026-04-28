import test from "node:test";
import assert from "node:assert/strict";
import { normalizePriceHistoryData } from "../shared/marketContracts";

test("normalizePriceHistoryData validates candle payload", () => {
  const normalized = normalizePriceHistoryData({
    symbol: "AAPL",
    candles: [
      { date: "2026-01-01", ts: 1767225600000, open: 100, high: 110, low: 95, close: 108, volume: 1000 },
    ],
  });
  assert.ok(normalized);
  assert.equal(normalized?.candles.length, 1);
});

test("normalizePriceHistoryData rejects missing symbol", () => {
  const normalized = normalizePriceHistoryData({
    candles: [],
  });
  assert.equal(normalized, null);
});
