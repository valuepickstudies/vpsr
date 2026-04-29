import test from "node:test";
import assert from "node:assert/strict";

type OutcomeRow = { confidencePct: number; returnPct: number };

function brierLike(rows: OutcomeRow[]) {
  if (!rows.length) return null;
  return rows.reduce((s, r) => {
    const p = r.confidencePct / 100;
    const y = r.returnPct > 0 ? 1 : 0;
    return s + (p - y) ** 2;
  }, 0) / rows.length;
}

test("brierLike decreases with better calibrated predictions", () => {
  const poorlyCalibrated: OutcomeRow[] = [
    { confidencePct: 90, returnPct: -3 },
    { confidencePct: 85, returnPct: -2 },
    { confidencePct: 20, returnPct: 4 },
    { confidencePct: 15, returnPct: 3 },
  ];
  const betterCalibrated: OutcomeRow[] = [
    { confidencePct: 70, returnPct: 3 },
    { confidencePct: 65, returnPct: 1 },
    { confidencePct: 35, returnPct: -2 },
    { confidencePct: 30, returnPct: -1 },
  ];
  const poor = brierLike(poorlyCalibrated);
  const better = brierLike(betterCalibrated);
  assert.ok(poor != null && better != null);
  assert.equal((better as number) < (poor as number), true);
});
