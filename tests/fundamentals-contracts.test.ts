import test from "node:test";
import assert from "node:assert/strict";
import { normalizeCompanyFundamentals } from "../shared/marketContracts";

test("normalizeCompanyFundamentals supports label and name metrics", () => {
  const normalized = normalizeCompanyFundamentals({
    name: "ABC Ltd",
    about: "About text",
    fundamentals: [
      { label: "P/E", value: "20" },
      { name: "ROE", value: "15%" },
    ],
    recentAnnouncements: [{ subject: "Quarterly result", symbol: "ABC" }],
  });
  assert.ok(normalized);
  assert.equal(normalized?.fundamentals.length, 2);
  assert.equal(normalized?.fundamentals[1].label, "ROE");
});

test("normalizeCompanyFundamentals rejects missing name", () => {
  const normalized = normalizeCompanyFundamentals({
    fundamentals: [{ label: "P/E", value: "20" }],
  });
  assert.equal(normalized, null);
});
