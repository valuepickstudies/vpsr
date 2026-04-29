import axios from "axios";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import * as cheerio from "cheerio";

const require = createRequire(import.meta.url);
const pdfParse: (buffer: Buffer) => Promise<{ text: string }> = require("pdf-parse/lib/pdf-parse.js");

type DbLike = {
  all: (query: string, params?: unknown[]) => Promise<any[]>;
  get: (query: string, params?: unknown[]) => Promise<any>;
  run: (query: string, params?: unknown[]) => Promise<{ changes?: number }>;
};

type AnnouncementRow = {
  id: string;
  symbol: string | null;
  companyName: string | null;
  subject: string | null;
  date: string | null;
  pdfLink: string | null;
  exchange: string | null;
  category: string | null;
};

type SourceCheck = {
  checked: boolean;
  matched: boolean;
  detail: string;
  evidence?: string;
};

const sourceCooldownUntil = new Map<string, number>();

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableError(error: any): boolean {
  const status = Number(error?.response?.status || 0);
  const code = String(error?.code || "");
  return status === 429 || status === 403 || code === "ECONNABORTED" || code === "ETIMEDOUT";
}

async function withRetry<T>(fn: () => Promise<T>, retries: number, baseDelayMs: number): Promise<T> {
  let lastErr: any = null;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      lastErr = error;
      if (!isRetryableError(error) || i >= retries - 1) break;
      const jitter = Math.floor(Math.random() * 250);
      await sleep(baseDelayMs * (i + 1) + jitter);
    }
  }
  throw lastErr;
}

function getSourceCooldownCheck(source: "nse" | "bse" | "screener"): SourceCheck | null {
  const until = Number(sourceCooldownUntil.get(source) || 0);
  const now = Date.now();
  if (until > now) {
    const sec = Math.ceil((until - now) / 1000);
    return { checked: true, matched: false, detail: `${source}_cooldown_active_${sec}s` };
  }
  return null;
}

function registerSourceCooldown(source: "nse" | "bse" | "screener", error: any) {
  if (!isRetryableError(error)) return;
  sourceCooldownUntil.set(source, Date.now() + 30_000);
}

function classifyDocument(subject: string, category: string): string {
  const text = `${subject} ${category}`.toLowerCase();
  if (text.includes("result")) return "result";
  if (text.includes("board")) return "board_meeting";
  if (text.includes("dividend") || text.includes("bonus") || text.includes("split")) return "corporate_action";
  if (text.includes("investor") || text.includes("conference")) return "investor_update";
  return "general";
}

function toYmd(value: string): string {
  const ts = Date.parse(value);
  if (!Number.isFinite(ts)) return "";
  return new Date(ts).toISOString().slice(0, 10);
}

function simplifyText(value: string): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

async function persistDocumentIntelligence(db: DbLike, row: {
  announcementId: string;
  symbol: string | null;
  exchange: string | null;
  pdfUrl: string | null;
  contentSha256: string | null;
  docCategory: string | null;
  textSnippet: string | null;
  status: "ok" | "no_pdf" | "fetch_error" | "parse_error";
  error: string | null;
}) {
  const processedAt = new Date().toISOString();
  await db.run(
    `INSERT INTO document_intelligence
      (announcementId, symbol, exchange, pdfUrl, contentSha256, docCategory, textSnippet, status, error, processedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(announcementId) DO UPDATE SET
       symbol=excluded.symbol,
       exchange=excluded.exchange,
       pdfUrl=excluded.pdfUrl,
       contentSha256=excluded.contentSha256,
       docCategory=excluded.docCategory,
       textSnippet=excluded.textSnippet,
       status=excluded.status,
       error=excluded.error,
       processedAt=excluded.processedAt`,
    [
      row.announcementId,
      row.symbol,
      row.exchange,
      row.pdfUrl,
      row.contentSha256,
      row.docCategory,
      row.textSnippet,
      row.status,
      row.error,
      processedAt,
    ]
  );
}

export async function processAnnouncementDocuments(db: DbLike, options?: { limit?: number; type?: "all" | "results" }) {
  const limit = Math.max(1, Math.min(Number(options?.limit || 25), 200));
  const type = options?.type === "results" ? "results" : "all";
  const rows = await db.all(
    type === "results"
      ? `SELECT id, symbol, companyName, subject, date, pdfLink, exchange, category
         FROM announcements WHERE category = 'Result'
         ORDER BY date DESC LIMIT ?`
      : `SELECT id, symbol, companyName, subject, date, pdfLink, exchange, category
         FROM announcements ORDER BY date DESC LIMIT ?`,
    [limit]
  );

  let processed = 0;
  let ok = 0;
  let failed = 0;
  let skipped = 0;
  for (const row of rows as AnnouncementRow[]) {
    processed += 1;
    const docCategory = classifyDocument(row.subject || "", row.category || "");
    if (!row.pdfLink) {
      await persistDocumentIntelligence(db, {
        announcementId: String(row.id),
        symbol: row.symbol,
        exchange: row.exchange,
        pdfUrl: null,
        contentSha256: null,
        docCategory,
        textSnippet: null,
        status: "no_pdf",
        error: null,
      });
      continue;
    }
    try {
      const response = await withRetry(
        () =>
          axios.get<ArrayBuffer>(row.pdfLink as string, {
            responseType: "arraybuffer",
            timeout: 20000,
            headers: {
              "User-Agent": "Mozilla/5.0",
              Accept: "application/pdf,*/*",
              Referer: row.exchange === "NSE" ? "https://www.nseindia.com/" : "https://www.bseindia.com/",
            },
          }),
        3,
        600
      );
      const buffer = Buffer.from(response.data);
      const hash = crypto.createHash("sha256").update(buffer).digest("hex");
      const existing = await db.get(
        `SELECT contentSha256 FROM document_intelligence WHERE announcementId = ? LIMIT 1`,
        [String(row.id)]
      );
      if (existing?.contentSha256 && existing.contentSha256 === hash) {
        skipped += 1;
        continue;
      }
      let textSnippet: string | null = null;
      try {
        const parsed = await pdfParse(buffer);
        textSnippet = simplifyText(parsed.text || "").slice(0, 800) || null;
      } catch (parseError: any) {
        failed += 1;
        await persistDocumentIntelligence(db, {
          announcementId: String(row.id),
          symbol: row.symbol,
          exchange: row.exchange,
          pdfUrl: row.pdfLink,
          contentSha256: hash,
          docCategory,
          textSnippet: null,
          status: "parse_error",
          error: parseError?.message || "pdf_parse_failed",
        });
        continue;
      }

      ok += 1;
      await persistDocumentIntelligence(db, {
        announcementId: String(row.id),
        symbol: row.symbol,
        exchange: row.exchange,
        pdfUrl: row.pdfLink,
        contentSha256: hash,
        docCategory,
        textSnippet,
        status: "ok",
        error: null,
      });
    } catch (error: any) {
      failed += 1;
      await persistDocumentIntelligence(db, {
        announcementId: String(row.id),
        symbol: row.symbol,
        exchange: row.exchange,
        pdfUrl: row.pdfLink,
        contentSha256: null,
        docCategory,
        textSnippet: null,
        status: "fetch_error",
        error: error?.message || "pdf_fetch_failed",
      });
    }
  }

  return { processed, ok, failed, skipped };
}

async function validateWithNse(announcement: AnnouncementRow): Promise<SourceCheck> {
  const cooldown = getSourceCooldownCheck("nse");
  if (cooldown) return cooldown;
  if (announcement.exchange !== "NSE") {
    return { checked: false, matched: false, detail: "not_applicable_for_exchange" };
  }
  if (!announcement.symbol) {
    return { checked: true, matched: false, detail: "missing_symbol" };
  }
  try {
    const response = await withRetry(
      () =>
        axios.get("https://www.nseindia.com/api/corporate-announcements", {
          params: { symbol: announcement.symbol },
          timeout: 12000,
          headers: { "User-Agent": "Mozilla/5.0", Referer: "https://www.nseindia.com/", Accept: "application/json" },
        }),
      3,
      750
    );
    const rows = Array.isArray(response.data) ? response.data : [];
    const expectedDate = toYmd(announcement.date || "");
    const expectedSubject = simplifyText(announcement.subject || "").toLowerCase();
    const match = rows.find((r: any) => {
      const subject = simplifyText(String(r?.caSubject || r?.subject || "")).toLowerCase();
      const date = toYmd(String(r?.an_dt || r?.date || r?.bcStartDate || ""));
      return subject.includes(expectedSubject.slice(0, 24)) || (expectedDate && date === expectedDate);
    });
    if (!match) return { checked: true, matched: false, detail: "not_found_in_nse_feed" };
    return {
      checked: true,
      matched: true,
      detail: "matched_nse_announcement",
      evidence: String(match?.caSubject || match?.subject || "").slice(0, 180),
    };
  } catch (error: any) {
    registerSourceCooldown("nse", error);
    return { checked: true, matched: false, detail: `nse_validation_failed:${error?.message || "error"}` };
  }
}

async function validateWithBse(announcement: AnnouncementRow): Promise<SourceCheck> {
  const cooldown = getSourceCooldownCheck("bse");
  if (cooldown) return cooldown;
  if (announcement.exchange !== "BSE") {
    return { checked: false, matched: false, detail: "not_applicable_for_exchange" };
  }
  if (!announcement.symbol) {
    return { checked: true, matched: false, detail: "missing_scrip_code" };
  }
  try {
    const response = await withRetry(
      () =>
        axios.get("https://api.bseindia.com/BseIndiaAPI/api/AnnGetData/w", {
          params: {
            pageno: 1,
            strCat: -1,
            strPrevDate: "20240101",
            strScrip: announcement.symbol,
            strSearch: "P",
            strToDate: new Date().toISOString().slice(0, 10).replace(/-/g, ""),
            strType: "C",
          },
          timeout: 15000,
          headers: {
            "User-Agent": "Mozilla/5.0",
            Accept: "application/json, text/plain, */*",
            Referer: "https://www.bseindia.com/",
            Origin: "https://www.bseindia.com",
          },
        }),
      3,
      900
    );
    const rows = Array.isArray(response.data?.Table) ? response.data.Table : [];
    const expectedDate = toYmd(announcement.date || "");
    const expectedSubject = simplifyText(announcement.subject || "").toLowerCase();
    const match = rows.find((r: any) => {
      const subject = simplifyText(String(r?.NEWSSUB || "")).toLowerCase();
      const date = toYmd(String(r?.DT_TM || ""));
      const idMatched = String(r?.NEWSID || "") === String(announcement.id || "");
      return idMatched || subject.includes(expectedSubject.slice(0, 24)) || (expectedDate && date === expectedDate);
    });
    if (!match) return { checked: true, matched: false, detail: "not_found_in_bse_feed" };
    return {
      checked: true,
      matched: true,
      detail: "matched_bse_announcement",
      evidence: String(match?.NEWSSUB || "").slice(0, 180),
    };
  } catch (error: any) {
    registerSourceCooldown("bse", error);
    return { checked: true, matched: false, detail: `bse_validation_failed:${error?.message || "error"}` };
  }
}

async function validateWithScreener(announcement: AnnouncementRow, screenerUrl?: string): Promise<SourceCheck> {
  const cooldown = getSourceCooldownCheck("screener");
  if (cooldown) return cooldown;
  try {
    const symbol = String(announcement.symbol || "").trim();
    const url = screenerUrl || (symbol ? `https://www.screener.in/company/${encodeURIComponent(symbol)}/` : "");
    if (!url) return { checked: true, matched: false, detail: "missing_screener_url_or_symbol" };
    const response = await withRetry(
      () =>
        axios.get(url, {
          timeout: 12000,
          headers: { "User-Agent": "Mozilla/5.0", Accept: "text/html", Referer: "https://www.screener.in/" },
        }),
      2,
      700
    );
    const $ = cheerio.load(String(response.data || ""));
    const pageText = simplifyText($("body").text());
    if (!pageText) return { checked: true, matched: false, detail: "empty_screener_page" };
    if (announcement.exchange === "BSE" && symbol) {
      const bseMatch = pageText.match(/BSE:\s*(\d{6})/i)?.[1] || "";
      const matched = bseMatch === symbol;
      return {
        checked: true,
        matched,
        detail: matched ? "matched_screener_bse_code" : "screener_bse_code_mismatch",
        evidence: bseMatch || undefined,
      };
    }
    const matched = symbol ? pageText.toUpperCase().includes(symbol.toUpperCase()) : false;
    return {
      checked: true,
      matched,
      detail: matched ? "matched_screener_symbol_text" : "screener_symbol_not_found",
    };
  } catch (error: any) {
    registerSourceCooldown("screener", error);
    return { checked: true, matched: false, detail: `screener_validation_failed:${error?.message || "error"}` };
  }
}

export async function validateAnnouncementIntelligence(db: DbLike, announcementId: string, screenerUrl?: string) {
  const announcement = (await db.get(
    `SELECT id, symbol, companyName, subject, date, pdfLink, exchange, category
     FROM announcements WHERE id = ? LIMIT 1`,
    [announcementId]
  )) as AnnouncementRow | undefined;
  if (!announcement) return null;

  const document = await db.get(
    `SELECT announcementId, symbol, exchange, pdfUrl, contentSha256, docCategory, textSnippet, status, error, processedAt
     FROM document_intelligence WHERE announcementId = ? LIMIT 1`,
    [announcementId]
  );

  const [nse, bse, screener] = await Promise.all([
    validateWithNse(announcement),
    validateWithBse(announcement),
    validateWithScreener(announcement, screenerUrl),
  ]);

  const reasons: string[] = [];
  if (nse.checked && !nse.matched) reasons.push(`nse:${nse.detail}`);
  if (bse.checked && !bse.matched) reasons.push(`bse:${bse.detail}`);
  if (screener.checked && !screener.matched) reasons.push(`screener:${screener.detail}`);
  if (!document) reasons.push("document:not_processed");

  const passedCount = [nse, bse, screener].filter((x) => x.checked && x.matched).length;
  const verdict = passedCount >= 2 ? "pass" : passedCount === 1 ? "warn" : "fail";

  return {
    announcementId: String(announcement.id),
    symbol: String(announcement.symbol || ""),
    exchange: String(announcement.exchange || ""),
    verdict,
    nse,
    bse,
    screener,
    reasons,
    checkedAt: new Date().toISOString(),
    document: document || null,
  };
}

function mismatchSeverityFromReasons(reasons: string[]): "low" | "medium" | "high" {
  if (!reasons.length) return "low";
  if (reasons.some((r) => r.includes("document:not_processed"))) return "high";
  if (reasons.some((r) => r.includes("validation_failed"))) return "high";
  return reasons.length >= 2 ? "medium" : "low";
}

export async function runValidationSweep(
  db: DbLike,
  options?: { limit?: number; type?: "all" | "results"; screenerUrl?: string }
) {
  const limit = Math.max(1, Math.min(Number(options?.limit || 20), 300));
  const type = options?.type === "results" ? "results" : "all";
  const rows = await db.all(
    type === "results"
      ? `SELECT id FROM announcements WHERE category='Result' ORDER BY date DESC LIMIT ?`
      : `SELECT id FROM announcements ORDER BY date DESC LIMIT ?`,
    [limit]
  );
  let processed = 0;
  let pass = 0;
  let warn = 0;
  let fail = 0;
  let drifted = 0;
  for (const row of rows) {
    const payload = await validateAnnouncementIntelligence(db, String(row.id), options?.screenerUrl);
    if (!payload) continue;
    processed += 1;
    if (payload.verdict === "pass") pass += 1;
    else if (payload.verdict === "warn") warn += 1;
    else fail += 1;
    const prev = await db.get(
      `SELECT verdict FROM validation_runs WHERE announcementId = ? ORDER BY datetime(createdAt) DESC LIMIT 1`,
      [payload.announcementId]
    );
    const driftedNow = Boolean(prev?.verdict && prev.verdict !== payload.verdict);
    if (driftedNow) drifted += 1;
    const severity = mismatchSeverityFromReasons(payload.reasons);
    const driftScore = driftedNow ? 1 : 0;
    await db.run(
      `INSERT INTO validation_runs
       (announcementId, symbol, exchange, verdict, reasonsJson, nseMatched, bseMatched, screenerMatched, driftScore, mismatchSeverity, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        payload.announcementId,
        payload.symbol,
        payload.exchange,
        payload.verdict,
        JSON.stringify(payload.reasons || []),
        payload.nse.matched ? 1 : 0,
        payload.bse.matched ? 1 : 0,
        payload.screener.matched ? 1 : 0,
        driftScore,
        severity,
        payload.checkedAt,
      ]
    );
  }
  return { processed, pass, warn, fail, drifted };
}
