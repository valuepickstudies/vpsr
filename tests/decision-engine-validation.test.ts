import { test } from "node:test";
import assert from "node:assert/strict";
import { validateDecisionEngine } from "../decisionEngineValidation";

test("policy weights must sum to ~1", () => {
  const { checks, summary } = validateDecisionEngine({
    symbol: null,
    country: "IN",
    hasSessionReport: false,
    hasSavedReportScore: false,
    reportData: null,
    judgeData: null,
    recencyValidation: null,
    reportScore: null,
    recommendation: null,
    policy: {
      version: "rules_v1",
      weights: { quality: 0.35, valuation: 0.2, momentum: 0.25, risk: 0.2 },
    },
    calibration: { sampleCount: 100, brierLikeScore: 0.2, hitRateAtBand: null },
    positionSizing: null,
    thesis: null,
  });
  assert.equal(summary.fail, 0);
  const w = checks.find((c) => c.id === "policy_weights_sum");
  assert.equal(w?.status, "pass");
});

test("recommendation action vs score mismatch fails", () => {
  const { summary } = validateDecisionEngine({
    symbol: "TEST",
    country: "IN",
    hasSessionReport: true,
    hasSavedReportScore: true,
    reportData: null,
    judgeData: { passed: true, completenessScore: 90, missingComponents: [], latestAnnouncementDate: null, checkedAt: new Date().toISOString() },
    recencyValidation: { symbol: "TEST", latestAnnouncementDate: new Date().toISOString(), checkedAt: new Date().toISOString() },
    reportScore: {
      totalScore: 40,
      verdict: "weak",
      breakdown: { quality: 50, valuation: 50, momentum: 30, risk: 40 },
      generatedAt: new Date().toISOString(),
    },
    recommendation: {
      action: "buy",
      confidencePct: 80,
      horizonDays: 90,
      riskClass: "high",
      scoreSnapshotTotal: 40,
    },
    policy: { version: "v", weights: { quality: 0.25, valuation: 0.25, momentum: 0.25, risk: 0.25 } },
    calibration: { sampleCount: 50, brierLikeScore: null, hitRateAtBand: 55 },
    positionSizing: { capital: 1e5, riskBudgetPct: 1, stopLossPct: 8, suggestions: [{ symbol: "TEST", score: 40, targetWeightPct: 5 }] },
    thesis: { status: "active", hasBody: true },
  });
  assert.ok(summary.fail >= 1);
});
