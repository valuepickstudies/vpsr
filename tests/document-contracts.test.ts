import test from "node:test";
import assert from "node:assert/strict";
import { normalizeIntelligenceValidationResult } from "../shared/documentContracts";

test("normalizeIntelligenceValidationResult accepts valid payload", () => {
  const payload = normalizeIntelligenceValidationResult({
    announcementId: "123",
    symbol: "TCS",
    exchange: "NSE",
    verdict: "pass",
    nse: { checked: true, matched: true, detail: "ok" },
    bse: { checked: false, matched: false, detail: "not_applicable_for_exchange" },
    screener: { checked: true, matched: true, detail: "ok" },
    reasons: [],
    checkedAt: new Date().toISOString(),
    document: {
      announcementId: "123",
      symbol: "TCS",
      exchange: "NSE",
      pdfUrl: "https://example.com/a.pdf",
      contentSha256: "abc",
      docCategory: "result",
      textSnippet: "sample",
      status: "ok",
      error: null,
      processedAt: new Date().toISOString(),
    },
  });
  assert.ok(payload);
  assert.equal(payload?.verdict, "pass");
});

test("normalizeIntelligenceValidationResult rejects malformed payload", () => {
  const payload = normalizeIntelligenceValidationResult({
    announcementId: "123",
    symbol: "TCS",
    exchange: "NSE",
    verdict: "maybe",
  });
  assert.equal(payload, null);
});
