import test from "node:test";
import assert from "node:assert/strict";
import { normalizeAnnouncements, normalizeCompanySearchResults } from "../shared/marketContracts";

test("normalizeAnnouncements coerces and filters rows", () => {
  const data = normalizeAnnouncements([
    { id: 1, symbol: "ABC", companyName: "ABC Ltd", subject: "Result declared", date: "2026-01-01", exchange: "BSE", category: "Result" },
    { id: 2, symbol: "DEF" },
  ]);
  assert.equal(data.length, 1);
  assert.equal(data[0].symbol, "ABC");
});

test("normalizeCompanySearchResults normalizes missing symbol/id", () => {
  const data = normalizeCompanySearchResults([
    { id: "abc", name: "ABC Ltd", url: "https://example.com/abc", exchange: "NSE" },
    { name: "No URL" },
  ]);
  assert.equal(data.length, 1);
  assert.equal(data[0].id, "abc");
  assert.equal(data[0].symbol, "ABC");
});
