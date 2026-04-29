import test from "node:test";
import assert from "node:assert/strict";
import { normalizeRecommendationData } from "../shared/reportContracts";

test("normalizeRecommendationData accepts valid payload", () => {
  const normalized = normalizeRecommendationData({
    id: 12,
    reportId: 5,
    symbol: "TCS",
    country: "IN",
    recommendationAction: "watch",
    confidencePct: 64,
    horizonDays: 90,
    riskClass: "medium",
    explainability: {
      positive: ["quality:68"],
      negative: ["risk:36"],
      caveats: ["limited sample size"],
    },
    scoreSnapshot: {
      totalScore: 64,
      verdict: "watch",
      breakdown: { quality: 68, valuation: 61, momentum: 62, risk: 59 },
    },
    policyVersion: "rules_v1",
    createdAt: new Date().toISOString(),
  });
  assert.ok(normalized);
  assert.equal(normalized?.symbol, "TCS");
  assert.equal(normalized?.confidencePct, 64);
});

test("normalizeRecommendationData rejects invalid action", () => {
  const normalized = normalizeRecommendationData({
    id: 12,
    reportId: 5,
    symbol: "TCS",
    country: "IN",
    recommendationAction: "enter",
    confidencePct: 64,
    horizonDays: 90,
    riskClass: "medium",
    explainability: { positive: [], negative: [], caveats: [] },
    scoreSnapshot: {
      totalScore: 64,
      verdict: "watch",
      breakdown: { quality: 68, valuation: 61, momentum: 62, risk: 59 },
    },
    policyVersion: "rules_v1",
    createdAt: new Date().toISOString(),
  });
  assert.equal(normalized, null);
});
