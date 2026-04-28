import assert from "node:assert/strict";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

const BASE_URL = "http://127.0.0.1:3000";
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || "test-admin";

type JsonObject = Record<string, unknown>;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(path: string, init?: RequestInit, timeoutMs = 120000): Promise<JsonObject> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${BASE_URL}${path}`, { ...init, signal: controller.signal });
    const json = (await response.json()) as JsonObject;
    return json;
  } finally {
    clearTimeout(timer);
  }
}

async function isServerReachable(): Promise<boolean> {
  try {
    const json = await fetchJson("/api/announcements?type=results&country=IN", undefined, 1500);
    return json.success === true;
  } catch {
    return false;
  }
}

async function startServerIfNeeded(): Promise<{ proc: ChildProcessWithoutNullStreams | null }> {
  if (await isServerReachable()) {
    console.log("[smoke] Using existing server on :3000");
    return { proc: null };
  }
  console.log("[smoke] Starting local dev server...");
  const proc = spawn("npm", ["run", "dev"], {
    env: { ...process.env, ADMIN_API_KEY },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let started = false;
  let stderr = "";

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Server startup timed out. stderr: ${stderr.slice(-500)}`));
    }, 45000);

    const onData = (chunk: Buffer) => {
      const text = chunk.toString();
      if (text.includes("Server running on http://localhost:3000")) {
        started = true;
        clearTimeout(timeout);
        resolve();
      }
    };
    const onErr = (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
    };
    const onExit = () => {
      if (!started) {
        clearTimeout(timeout);
        reject(new Error(`Server exited before startup. stderr: ${stderr.slice(-500)}`));
      }
    };

    proc.stdout.on("data", onData);
    proc.stderr.on("data", onErr);
    proc.once("exit", onExit);
  });

  await sleep(1200);
  return { proc };
}

async function stopServer(proc: ChildProcessWithoutNullStreams | null) {
  if (!proc) return;
  proc.kill("SIGTERM");
  await sleep(500);
}

async function runSmokeSuite() {
  const { proc } = await startServerIfNeeded();
  try {
    const announcements = await fetchJson("/api/announcements?type=results&country=IN");
    assert.equal(announcements.success, true, "announcements fetch should succeed");

    const companies = await fetchJson("/api/companies?search=tata&country=IN");
    assert.equal(companies.success, true, "company search should succeed");

    const fundamentals = await fetchJson("/api/company/fundamentals?country=IN&url=https%3A%2F%2Fwww.screener.in%2Fcompany%2FTCS%2F");
    assert.equal(fundamentals.success, true, "fundamentals should succeed");

    const priceHistory = await fetchJson("/api/company/price-history?country=IN&url=https%3A%2F%2Fwww.screener.in%2Fcompany%2FTCS%2F&symbol=TCS.NS");
    assert.equal(priceHistory.success, true, "price history should succeed");

    const report = await fetchJson("/api/company/report?country=IN&reportType=quick&url=https%3A%2F%2Fwww.screener.in%2Fcompany%2FTCS%2F");
    assert.equal(report.success, true, "report generation should succeed");
    assert.equal(typeof (report.data as JsonObject)?.name === "string", true, "report data should include company name");

    const snapshot = await fetchJson("/api/company/snapshot?country=IN&url=https%3A%2F%2Fwww.screener.in%2Fcompany%2FTCS%2F");
    assert.equal(snapshot.success, true, "snapshot generation should succeed");

    const outcomesQueue = await fetchJson(
      "/api/reports/outcomes/refresh",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-admin-key": ADMIN_API_KEY,
        },
        body: JSON.stringify({ country: "IN", horizons: [30], limit: 5, async: true }),
      },
      120000
    );
    assert.equal(outcomesQueue.success, true, "outcomes refresh queue should succeed");
    const jobId = String((outcomesQueue.data as JsonObject)?.jobId || "");
    assert.equal(Boolean(jobId), true, "outcomes refresh should return jobId");

    let status = "queued";
    for (let i = 0; i < 15; i++) {
      const job = await fetchJson(`/api/reports/outcomes/jobs/${encodeURIComponent(jobId)}`, {
        headers: { "x-admin-key": ADMIN_API_KEY },
      });
      status = String((job.data as JsonObject)?.status || "");
      if (status === "completed") break;
      if (status === "failed") {
        throw new Error("outcomes queue job failed");
      }
      await sleep(1000);
    }
    assert.equal(status, "completed", "outcomes queue job should complete");

    const thesisSave = await fetchJson(
      "/api/company/thesis",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-admin-key": ADMIN_API_KEY,
        },
        body: JSON.stringify({
          symbol: "SMOKETEST",
          country: "IN",
          thesis: "Smoke test thesis",
          invalidationTriggers: ["trigger_a"],
        }),
      },
      60000
    );
    assert.equal(thesisSave.success, true, "thesis save should succeed");

    const thesisGet = await fetchJson("/api/company/thesis?country=IN&symbol=SMOKETEST");
    assert.equal(thesisGet.success, true, "thesis fetch should succeed");

    const positionSizing = await fetchJson(
      "/api/portfolio/position-sizing",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          capital: 200000,
          riskBudgetPct: 1,
          stopLossPct: 8,
          candidates: [{ symbol: "TCS", score: 75 }],
        }),
      },
      60000
    );
    assert.equal(positionSizing.success, true, "position sizing should succeed");

    const metrics = await fetchJson("/api/metrics", {
      headers: { "x-admin-key": ADMIN_API_KEY },
    });
    assert.equal(metrics.success, true, "metrics endpoint should succeed");

    console.log("[smoke] PASS: fetch, process, generation, and display data workflows validated.");
  } finally {
    await stopServer(proc);
  }
}

runSmokeSuite().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "workflow smoke failed";
  console.error(`[smoke] FAIL: ${message}`);
  process.exit(1);
});
