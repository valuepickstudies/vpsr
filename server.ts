import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();
import express from "express";
import { GoogleGenAI } from "@google/genai";
import { createServer as createViteServer } from "vite";
import cors from "cors";
import axios from "axios";
import path from "path";
import { format, subDays } from "date-fns";
import * as cheerio from "cheerio";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { STRATEGY_PORTFOLIOS } from "./strategyPortfolios";
import type { CompanyReportData, ReportAnnouncement, ReportChartRow, ReportQuarterlyRow, ReportType } from "./shared/reportTypes";
import { assessReportQuality, parseScreenerFinancials } from "./reportUtils";
import { buildReportScorecard } from "./reportScoring";
import { isCompanySnapshotData, isQualityGateResult, normalizeCompanyReportData, normalizeJudgeValidationData, normalizeRecencyValidationData } from "./shared/reportContracts";
import { normalizeAnnouncements, normalizeCompanyFundamentals, normalizeCompanySearchResults, normalizePriceHistoryData } from "./shared/marketContracts";
import { normalizeSavedReportDetail, normalizeSavedReportList } from "./shared/savedReportContracts";

const SEC_USER_AGENT = "MarketIntelligenceBot/1.0 (valuepicks25@gmail.com)";
let cikToTicker: Record<string, string> = {};

async function fetchTickerMapping() {
  try {
    console.log("[SEC] Fetching ticker mapping...");
    const res = await axios.get('https://www.sec.gov/files/company_tickers.json', {
      headers: { 'User-Agent': SEC_USER_AGENT }
    });
    const data = res.data;
    Object.values(data).forEach((item: any) => {
      const cikStr = item.cik_str.toString();
      cikToTicker[cikStr] = item.ticker;
      cikToTicker[cikStr.padStart(10, '0')] = item.ticker;
    });
    console.log(`[SEC] Loaded ${Object.keys(cikToTicker).length} ticker mappings.`);
  } catch (e: any) {
    console.error("[SEC] Failed to fetch ticker mapping:", e.message);
  }
}

// Helper for fetching with retries and randomized User-Agents
const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0"
];

async function fetchWithRetry(url: string, options: any = {}, retries = 2) {
  const headers = {
    ...options.headers,
    "User-Agent": USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]
  };
  
  for (let i = 0; i < retries; i++) {
    try {
      return await axios.get(url, { ...options, headers });
    } catch (e: any) {
      const isRateLimit = e.response?.status === 429 || e.response?.status === 403;
      if (isRateLimit && i < retries - 1) {
        const delay = (i + 1) * 2000;
        console.log(`[Retry] Rate limit/Block on ${url}, waiting ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
        headers["User-Agent"] = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
        continue;
      }
      throw e;
    }
  }
}

type DailyPriceCandle = {
  date: string;
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
};

type ApiMetrics = {
  requestsTotal: number;
  errorsTotal: number;
  queueEnqueued: number;
  queueCompleted: number;
  queueFailed: number;
  avgLatencyMs: number;
};

type OutcomeRefreshJob = {
  id: string;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  status: "queued" | "running" | "completed" | "failed";
  input: { country: string; horizons: number[]; limit: number };
  result?: { processedReports: number; refreshedOutcomes: number; horizons: number[] };
  error?: string;
};

type RecommendationDecision = {
  reportId: number | null;
  symbol: string;
  country: "IN" | "US";
  recommendationAction: "buy" | "watch" | "avoid";
  confidencePct: number;
  horizonDays: number;
  riskClass: "low" | "medium" | "high";
  explainability: {
    positive: string[];
    negative: string[];
    caveats: string[];
  };
  scoreSnapshot: {
    totalScore: number;
    verdict: "strong" | "watch" | "weak";
    breakdown: {
      quality: number;
      valuation: number;
      momentum: number;
      risk: number;
    };
  };
  policyVersion: string;
};

function normalizeIndianAnnouncementCategory(input: string): string {
  const v = String(input || "").toLowerCase();
  if (v.includes("result")) return "Result";
  if (v.includes("board")) return "Board meeting";
  if (v.includes("compliance")) return "Compliance";
  if (v.includes("investor")) return "Investor update";
  if (v.includes("action")) return "Corporate action";
  return input || "General";
}

function announcementProcessingFingerprint(input: {
  symbol?: string | null;
  companyName?: string | null;
  subject?: string | null;
  date?: string | null;
  category?: string | null;
}): string {
  const symbol = String(input.symbol || "").trim().toUpperCase();
  const company = String(input.companyName || "").trim().toUpperCase();
  const subject = String(input.subject || "")
    .replace(/\s+/g, " ")
    .replace(/[^\w\s]/g, "")
    .trim()
    .toUpperCase()
    .slice(0, 120);
  const category = String(input.category || "").trim().toUpperCase();
  const day = input.date ? new Date(input.date).toISOString().slice(0, 10) : "";
  return `${symbol}::${company}::${category}::${day}::${subject}`;
}

function toIndianYmd(input: Date): string {
  return format(input, "dd-MM-yyyy");
}

function parseIndianYmd(input: string): string | null {
  const v = String(input || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const m = v.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (!m) return null;
  const dd = m[1].padStart(2, "0");
  const mm = m[2].padStart(2, "0");
  const yyyy = m[3];
  return `${yyyy}-${mm}-${dd}`;
}

function extractCookieHeader(setCookie: string[] | undefined): string {
  if (!Array.isArray(setCookie) || !setCookie.length) return "";
  return setCookie.map((c) => String(c).split(";")[0]).join("; ");
}

async function fetchNseEquityDailyHistory(symbol: string, fromDate: string, toDate: string): Promise<DailyPriceCandle[]> {
  const warmup = await axios.get("https://www.nseindia.com", {
    headers: {
      "User-Agent": USER_AGENTS[0],
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    timeout: 10000,
  });
  const cookie = extractCookieHeader(warmup.headers["set-cookie"]);
  const response = await axios.get("https://www.nseindia.com/api/historical/cm/equity", {
    params: {
      symbol: symbol.toUpperCase(),
      series: '["EQ"]',
      from: toIndianYmd(new Date(`${fromDate}T00:00:00+05:30`)),
      to: toIndianYmd(new Date(`${toDate}T00:00:00+05:30`)),
    },
    headers: {
      "User-Agent": USER_AGENTS[0],
      Accept: "application/json",
      Referer: "https://www.nseindia.com/",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    timeout: 15000,
  });
  const rows = response.data?.data || [];
  const candles: DailyPriceCandle[] = [];
  for (const row of rows) {
    const date = parseIndianYmd(row?.CH_TIMESTAMP || row?.mTIMESTAMP || row?.date);
    const open = Number(row?.CH_OPENING_PRICE ?? row?.open ?? row?.OPEN);
    const high = Number(row?.CH_TRADE_HIGH_PRICE ?? row?.high ?? row?.HIGH);
    const low = Number(row?.CH_TRADE_LOW_PRICE ?? row?.low ?? row?.LOW);
    const close = Number(row?.CH_CLOSING_PRICE ?? row?.close ?? row?.CLOSE);
    if (!date || ![open, high, low, close].every((v) => Number.isFinite(v))) continue;
    const volume = Number(row?.CH_TOT_TRADED_QTY ?? row?.volume ?? row?.TOTTRDQTY);
    candles.push({
      date,
      ts: Date.parse(`${date}T00:00:00Z`),
      open,
      high,
      low,
      close,
      volume: Number.isFinite(volume) ? volume : null,
    });
  }
  candles.sort((a, b) => a.ts - b.ts);
  return candles;
}

async function fetchBseDailySeriesFromScripCode(scripCode: string): Promise<DailyPriceCandle[]> {
  const response = await fetchWithRetry(
    `https://api.bseindia.com/BseIndiaAPI/api/StockReachGraph/w?scripcode=${encodeURIComponent(scripCode)}&flag=0&fromdate=&todate=`,
    {
      headers: {
        Accept: "application/json",
        Referer: `https://www.bseindia.com/stock-share-price/stockreach_graph.aspx?scripcode=${encodeURIComponent(scripCode)}`,
      },
      timeout: 15000,
    }
  );
  const rows = response?.data?.Data || response?.data?.data || [];
  const candles: DailyPriceCandle[] = [];
  for (const row of rows) {
    const rawDate = row?.TDate || row?.date || row?.Date;
    const date = rawDate ? new Date(rawDate).toISOString().slice(0, 10) : null;
    const close = Number(row?.Close ?? row?.close ?? row?.value ?? row?.YValue);
    if (!date || !Number.isFinite(close)) continue;
    const open = Number(row?.Open ?? row?.open);
    const high = Number(row?.High ?? row?.high);
    const low = Number(row?.Low ?? row?.low);
    candles.push({
      date,
      ts: Date.parse(`${date}T00:00:00Z`),
      open: Number.isFinite(open) ? open : close,
      high: Number.isFinite(high) ? high : close,
      low: Number.isFinite(low) ? low : close,
      close,
      volume: null,
    });
  }
  candles.sort((a, b) => a.ts - b.ts);
  return candles;
}

async function fetchYahooDailyHistory(symbol: string, fromDate: string, toDate: string): Promise<DailyPriceCandle[]> {
  const period1 = Math.floor(new Date(`${fromDate}T00:00:00Z`).getTime() / 1000);
  const period2 = Math.floor(new Date(`${toDate}T23:59:59Z`).getTime() / 1000);
  const response = await axios.get(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&period1=${period1}&period2=${period2}`,
    {
      headers: {
        "User-Agent": USER_AGENTS[0],
        Accept: "application/json",
      },
      timeout: 15000,
    }
  );
  const chart = response.data?.chart?.result?.[0];
  const timestamps: number[] = chart?.timestamp || [];
  const quote = chart?.indicators?.quote?.[0] || {};
  const opens: Array<number | null> = quote?.open || [];
  const highs: Array<number | null> = quote?.high || [];
  const lows: Array<number | null> = quote?.low || [];
  const closes: Array<number | null> = quote?.close || [];
  const volumes: Array<number | null> = quote?.volume || [];
  const candles: DailyPriceCandle[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const tsMs = Number(timestamps[i]) * 1000;
    const open = Number(opens[i]);
    const high = Number(highs[i]);
    const low = Number(lows[i]);
    const close = Number(closes[i]);
    if (!Number.isFinite(tsMs) || ![open, high, low, close].every((v) => Number.isFinite(v))) continue;
    const date = new Date(tsMs).toISOString().slice(0, 10);
    const volume = Number(volumes[i]);
    candles.push({
      date,
      ts: tsMs,
      open,
      high,
      low,
      close,
      volume: Number.isFinite(volume) ? volume : null,
    });
  }
  candles.sort((a, b) => a.ts - b.ts);
  return candles;
}

function normalizeIndianTradingSymbol(input: string): string {
  return String(input || "").trim().toUpperCase().replace(/\.NS$|\.BO$/i, "");
}

async function fetchIndianDailySeriesFromExchanges(inputSymbol: string, fromDate: string, toDate = format(new Date(), "yyyy-MM-dd")): Promise<DailyPriceCandle[]> {
  const raw = String(inputSymbol || "").trim().toUpperCase();
  const base = normalizeIndianTradingSymbol(raw);
  const tries: Array<() => Promise<DailyPriceCandle[]>> = [];
  if (/^\d{6}$/.test(base)) {
    tries.push(() => fetchBseDailySeriesFromScripCode(base));
  }
  if (/^[A-Z0-9\-]+$/.test(base)) {
    tries.push(() => fetchNseEquityDailyHistory(base, fromDate, toDate));
    tries.push(() => fetchYahooDailyHistory(`${base}.NS`, fromDate, toDate));
    tries.push(() => fetchYahooDailyHistory(`${base}.BO`, fromDate, toDate));
  }
  if (!tries.length) throw new Error(`Unsupported Indian symbol format: ${inputSymbol}`);

  let lastErr: any = null;
  for (const run of tries) {
    try {
      const candles = await run();
      if (candles.length) return candles.filter((c) => c.date >= fromDate && c.date <= toDate);
    } catch (e: any) {
      lastErr = e;
    }
  }
  throw lastErr || new Error(`No candle data found from NSE/BSE for ${inputSymbol}`);
}

function parseUsSymbol(inputUrl: string, hintedSymbol?: string | null): string | null {
  const hinted = String(hintedSymbol || "").trim().toUpperCase();
  if (hinted) return hinted;
  const fromQuotePath = inputUrl.match(/\/quote\/([^\/\?]+)/i)?.[1];
  if (fromQuotePath) return fromQuotePath.trim().toUpperCase();
  const fromNasdaqPath = inputUrl.match(/\/stocks\/([^\/\?]+)/i)?.[1];
  if (fromNasdaqPath) return fromNasdaqPath.trim().toUpperCase();
  const raw = String(inputUrl || "").trim().toUpperCase();
  if (/^[A-Z.\-]{1,10}$/.test(raw)) return raw;
  return null;
}

function parseNasdaqMoneyToNumber(value: string | null | undefined): number | null {
  const clean = String(value || "")
    .replace(/[$,%]/g, "")
    .replace(/,/g, "")
    .trim();
  const n = Number(clean);
  return Number.isFinite(n) ? n : null;
}

type UsIncomeRow = ReportChartRow;
type UsQuarterRow = ReportQuarterlyRow;
type NasdaqHistoryCacheRow = {
  candles: DailyPriceCandle[];
  fetchedAt: number;
};
const nasdaqDailyHistoryCache = new Map<string, NasdaqHistoryCacheRow>();
const NASDAQ_HISTORY_CACHE_TTL_MS = 20 * 60 * 1000;

function pickLatestSecFact(
  units: Array<any>,
  opts?: { forms?: string[]; fps?: string[] }
): any | null {
  const forms = new Set((opts?.forms || []).map((v) => v.toUpperCase()));
  const fps = new Set((opts?.fps || []).map((v) => v.toUpperCase()));
  const filtered = units.filter((row) => {
    const formOk = forms.size === 0 || forms.has(String(row.form || "").toUpperCase());
    const fpOk = fps.size === 0 || fps.has(String(row.fp || "").toUpperCase());
    return formOk && fpOk && Number.isFinite(Number(row.val));
  });
  if (!filtered.length) return null;
  filtered.sort((a, b) => {
    const bTs = Date.parse(String(b.end || b.filed || "")) || 0;
    const aTs = Date.parse(String(a.end || a.filed || "")) || 0;
    return bTs - aTs;
  });
  return filtered[0];
}

async function fetchNasdaqQuoteInfo(symbol: string): Promise<any | null> {
  try {
    const response = await axios.get(`https://api.nasdaq.com/api/quote/${encodeURIComponent(symbol)}/info?assetclass=stocks`, {
      headers: { "User-Agent": USER_AGENTS[0], Accept: "application/json" },
      timeout: 10000,
    });
    return response.data?.data || null;
  } catch (e: any) {
    console.warn(`[NASDAQ] quote info failed for ${symbol}:`, e.message);
    return null;
  }
}

async function fetchNasdaqDailyHistory(symbol: string, fromDate: string): Promise<DailyPriceCandle[]> {
  const cacheKey = `${symbol.toUpperCase()}::${fromDate}`;
  const cached = nasdaqDailyHistoryCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < NASDAQ_HISTORY_CACHE_TTL_MS) {
    return cached.candles;
  }

  let lastErr: any = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await axios.get(`https://api.nasdaq.com/api/quote/${encodeURIComponent(symbol)}/historical?assetclass=stocks&fromdate=${encodeURIComponent(fromDate)}&limit=3650`, {
        headers: {
          "User-Agent": USER_AGENTS[attempt % USER_AGENTS.length],
          Accept: "application/json",
        },
        timeout: 15000,
      });
      const rows = response.data?.data?.tradesTable?.rows || [];
      const candles: DailyPriceCandle[] = [];
      for (const row of rows) {
        const dt = String(row.date || "");
        const [mm, dd, yyyy] = dt.split("/");
        if (!yyyy || !mm || !dd) continue;
        const date = `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
        const open = parseNasdaqMoneyToNumber(row.open);
        const high = parseNasdaqMoneyToNumber(row.high);
        const low = parseNasdaqMoneyToNumber(row.low);
        const close = parseNasdaqMoneyToNumber(row.close);
        if ([open, high, low, close].some((v) => v == null)) continue;
        candles.push({
          date,
          ts: Date.parse(`${date}T00:00:00Z`),
          open: open as number,
          high: high as number,
          low: low as number,
          close: close as number,
          volume: parseNasdaqMoneyToNumber(row.volume),
        });
      }
      candles.sort((a, b) => a.ts - b.ts);
      nasdaqDailyHistoryCache.set(cacheKey, { candles, fetchedAt: Date.now() });
      return candles;
    } catch (e: any) {
      lastErr = e;
      const status = e?.response?.status;
      if (status === 429 || status === 503) {
        const retryAfterSec = Number(e?.response?.headers?.["retry-after"] || 0);
        const waitMs = Number.isFinite(retryAfterSec) && retryAfterSec > 0
          ? retryAfterSec * 1000
          : (attempt + 1) * 1200;
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      break;
    }
  }

  // If provider is rate-limited, prefer stale cached data over hard failure.
  if (cached?.candles?.length) {
    console.warn(`[NASDAQ] Using stale cached history for ${symbol} after upstream error`);
    return cached.candles;
  }

  throw lastErr;
}

async function fetchUsSecProfileAndSeries(symbol: string): Promise<{
  companyName: string;
  cik: string;
  annual: UsIncomeRow[];
  quarterly: UsQuarterRow[];
  latestAnnualRevenue: number | null;
  latestAnnualNetIncome: number | null;
  latestAnnualEps: number | null;
}> {
  const mapResp = await axios.get("https://www.sec.gov/files/company_tickers.json", {
    headers: { "User-Agent": SEC_USER_AGENT, Accept: "application/json" },
    timeout: 12000,
  });
  const entries: any[] = Object.values(mapResp.data || {});
  const hit = entries.find((row) => String(row.ticker || "").toUpperCase() === symbol.toUpperCase());
  if (!hit) throw new Error(`SEC mapping not found for symbol: ${symbol}`);
  const cik = String(hit.cik_str || "").padStart(10, "0");
  const companyName = String(hit.title || symbol);
  const factsResp = await axios.get(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`, {
    headers: { "User-Agent": SEC_USER_AGENT, Accept: "application/json" },
    timeout: 15000,
  });
  const usGaap = factsResp.data?.facts?.["us-gaap"] || {};
  const revenuesRaw = usGaap.Revenues?.units?.USD
    || usGaap.RevenueFromContractWithCustomerExcludingAssessedTax?.units?.USD
    || usGaap.SalesRevenueNet?.units?.USD
    || [];
  const netIncomeRaw = usGaap.NetIncomeLoss?.units?.USD || [];
  const epsRaw = usGaap.EarningsPerShareDiluted?.units?.USD_per_shares
    || usGaap.EarningsPerShareBasic?.units?.USD_per_shares
    || [];

  const annualMap = new Map<string, { sales?: number; netProfit?: number; eps?: number }>();
  const revenueAnnual = revenuesRaw.filter((r: any) => String(r.fp || "").toUpperCase() === "FY" || String(r.form || "").toUpperCase() === "10-K");
  const netAnnual = netIncomeRaw.filter((r: any) => String(r.fp || "").toUpperCase() === "FY" || String(r.form || "").toUpperCase() === "10-K");
  const epsAnnual = epsRaw.filter((r: any) => String(r.fp || "").toUpperCase() === "FY" || String(r.form || "").toUpperCase() === "10-K");

  for (const row of revenueAnnual) {
    const y = String(row.fy || "").trim() || new Date(row.end).getFullYear().toString();
    if (!annualMap.has(y)) annualMap.set(y, {});
    annualMap.get(y)!.sales = Number(row.val);
  }
  for (const row of netAnnual) {
    const y = String(row.fy || "").trim() || new Date(row.end).getFullYear().toString();
    if (!annualMap.has(y)) annualMap.set(y, {});
    annualMap.get(y)!.netProfit = Number(row.val);
  }
  for (const row of epsAnnual) {
    const y = String(row.fy || "").trim() || new Date(row.end).getFullYear().toString();
    if (!annualMap.has(y)) annualMap.set(y, {});
    annualMap.get(y)!.eps = Number(row.val);
  }

  const annual = Array.from(annualMap.entries())
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .slice(-8)
    .map(([year, v]) => ({
      year,
      sales: Number.isFinite(v.sales) ? Number((Number(v.sales) / 1_000_000).toFixed(2)) : 0,
      netProfit: Number.isFinite(v.netProfit) ? Number((Number(v.netProfit) / 1_000_000).toFixed(2)) : 0,
      eps: Number.isFinite(v.eps) ? Number(Number(v.eps).toFixed(2)) : 0,
    }));

  const quarterMap = new Map<string, { sales?: number; netProfit?: number; eps?: number; ts: number }>();
  const qFp = new Set(["Q1", "Q2", "Q3", "Q4"]);
  for (const row of revenuesRaw) {
    const fp = String(row.fp || "").toUpperCase();
    if (!qFp.has(fp)) continue;
    const key = `${row.fy || ""}-${fp}`;
    quarterMap.set(key, { ...(quarterMap.get(key) || { ts: Date.parse(row.end) || 0 }), sales: Number(row.val), ts: Date.parse(row.end) || 0 });
  }
  for (const row of netIncomeRaw) {
    const fp = String(row.fp || "").toUpperCase();
    if (!qFp.has(fp)) continue;
    const key = `${row.fy || ""}-${fp}`;
    quarterMap.set(key, { ...(quarterMap.get(key) || { ts: Date.parse(row.end) || 0 }), netProfit: Number(row.val), ts: Date.parse(row.end) || 0 });
  }
  for (const row of epsRaw) {
    const fp = String(row.fp || "").toUpperCase();
    if (!qFp.has(fp)) continue;
    const key = `${row.fy || ""}-${fp}`;
    quarterMap.set(key, { ...(quarterMap.get(key) || { ts: Date.parse(row.end) || 0 }), eps: Number(row.val), ts: Date.parse(row.end) || 0 });
  }
  const quarterly = Array.from(quarterMap.entries())
    .sort((a, b) => a[1].ts - b[1].ts)
    .slice(-12)
    .map(([k, v]) => ({
      quarter: k,
      sales: Number.isFinite(v.sales) ? Number((Number(v.sales) / 1_000_000).toFixed(2)) : 0,
      netProfit: Number.isFinite(v.netProfit) ? Number((Number(v.netProfit) / 1_000_000).toFixed(2)) : 0,
      eps: Number.isFinite(v.eps) ? Number(Number(v.eps).toFixed(2)) : 0,
    }));

  const latestAnnualRevenue = Number(pickLatestSecFact(revenuesRaw, { forms: ["10-K"], fps: ["FY"] })?.val ?? NaN);
  const latestAnnualNetIncome = Number(pickLatestSecFact(netIncomeRaw, { forms: ["10-K"], fps: ["FY"] })?.val ?? NaN);
  const latestAnnualEps = Number(pickLatestSecFact(epsRaw, { forms: ["10-K"], fps: ["FY"] })?.val ?? NaN);
  return {
    companyName,
    cik,
    annual,
    quarterly,
    latestAnnualRevenue: Number.isFinite(latestAnnualRevenue) ? latestAnnualRevenue : null,
    latestAnnualNetIncome: Number.isFinite(latestAnnualNetIncome) ? latestAnnualNetIncome : null,
    latestAnnualEps: Number.isFinite(latestAnnualEps) ? latestAnnualEps : null,
  };
}

function resolveIndianExchangeSymbol(url: string, hintedSymbol?: string | null): string | null {
  const hinted = String(hintedSymbol || "").trim().toUpperCase();
  if (hinted) {
    if (hinted.endsWith(".NS") || hinted.endsWith(".BO")) return hinted.slice(0, -3);
    return hinted;
  }
  const slug = url.match(/\/company\/([^\/\?]+)/i)?.[1]?.trim().toUpperCase() || "";
  if (slug) {
    return slug;
  }
  return null;
}

async function secEdgarGet(url: string, timeout = 10000): Promise<{ data: string }> {
  let lastErr: any;
  for (let i = 0; i < 3; i++) {
    try {
      const res = await axios.get<string>(url, {
        headers: {
          "User-Agent": SEC_USER_AGENT,
          Accept: "application/atom+xml, application/xml, text/xml, */*",
          "Accept-Encoding": "gzip, deflate",
        },
        timeout,
        responseType: "text",
      });
      return res;
    } catch (e: any) {
      lastErr = e;
      if ((e.response?.status === 429 || e.response?.status === 503) && i < 2) {
        await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

function normalizeSecTicker(symbol: string): string {
  return String(symbol || "").trim().toUpperCase().replace(/-/g, ".");
}

type SecFilingRow = { id: string; date: string; subject: string; pdfLink?: string; category: string };

async function fetchSecFilingsForTicker(symbol: string, count: number, idPrefix: string): Promise<SecFilingRow[]> {
  const sym = normalizeSecTicker(symbol);
  if (!sym) return [];
  const formTypes = ["10-Q", "10-K", "8-K"];
  const perType = Math.min(40, Math.max(8, Math.ceil(count / formTypes.length) + 3));
  const merged: Array<SecFilingRow & { _ts: number }> = [];
  const seenLinks = new Set<string>();

  for (const formType of formTypes) {
    const secSearchUrl = `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&ticker=${encodeURIComponent(sym)}&type=${encodeURIComponent(formType)}&dateb=&owner=include&count=${perType}&output=atom`;
    try {
      const secResponse = await secEdgarGet(secSearchUrl, 8000);
      const $sec = cheerio.load(secResponse.data, { xmlMode: true });
      $sec("entry").each((_, el) => {
        const entry = $sec(el);
        const title = entry.find("title").text().trim();
        if (!title) return;
        if (/^\s*.+\(\s*\d{7,10}\s*\)\s*$/i.test(title)) return;
        const link = entry.find('link[type="text/html"]').attr("href") || entry.find("link").attr("href") || "";
        if (link && seenLinks.has(link)) return;
        if (link) seenLinks.add(link);
        const updated = entry.find("updated").text();
        merged.push({
          id: "",
          date: updated,
          subject: title,
          pdfLink: link || undefined,
          category: title.split(" - ")[0]?.trim() || formType,
          _ts: Date.parse(updated) || 0,
        });
      });
    } catch (e: any) {
      console.warn(`[SEC] ${formType} feed failed for ${sym}:`, e.message);
    }
  }

  merged.sort((a, b) => b._ts - a._ts);
  return merged.slice(0, count).map((row, i) => ({
    id: `${idPrefix}${sym}_${i}`,
    date: row.date,
    subject: row.subject,
    pdfLink: row.pdfLink,
    category: row.category,
  }));
}

function formatAIError(e: any): string {
  const msg = e.message || String(e);
  try {
    const parsed = JSON.parse(msg);
    if (parsed.error && parsed.error.message) {
      return parsed.error.message;
    }
  } catch (_) {
    // Not JSON
  }
  return msg;
}

const GEMINI_MODEL_CACHE_TTL_MS = 30 * 60 * 1000;
let cachedGeminiModels: { models: string[]; fetchedAt: number } | null = null;

function isLikelyRateOrQuotaError(errorMessage: string): boolean {
  const msg = errorMessage.toLowerCase();
  return (
    msg.includes("quota exceeded")
    || msg.includes("rate limit")
    || msg.includes("too many requests")
    || msg.includes("429")
    || msg.includes("resource_exhausted")
  );
}

function modelPriorityScore(modelName: string): number {
  const n = modelName.toLowerCase();
  if (n.includes("gemini-2.0-flash-lite")) return 500;
  if (n.includes("gemini-2.0-flash")) return 450;
  if (n.includes("gemini-1.5-flash")) return 420;
  if (n.includes("gemini-2.5-flash")) return 350;
  if (n.includes("gemini-1.5-pro")) return 240;
  if (n.includes("gemini-2.5-pro")) return 210;
  if (n.includes("gemini")) return 100;
  return 1;
}

async function listAvailableGeminiTextModels(ai: GoogleGenAI): Promise<string[]> {
  const now = Date.now();
  if (cachedGeminiModels && now - cachedGeminiModels.fetchedAt < GEMINI_MODEL_CACHE_TTL_MS) {
    return cachedGeminiModels.models;
  }
  const discovered: string[] = [];
  try {
    const pager: any = await ai.models.list();
    for await (const model of pager) {
      const name = String(model?.name || "").trim();
      const actions: string[] = Array.isArray(model?.supportedActions) ? model.supportedActions : [];
      if (!name) continue;
      if (!actions.includes("generateContent")) continue;
      const lower = name.toLowerCase();
      if (!lower.includes("gemini")) continue;
      if (
        lower.includes("tts")
        || lower.includes("image")
        || lower.includes("embedding")
        || lower.includes("aqa")
        || lower.includes("robotics")
        || lower.includes("computer-use")
      ) continue;
      discovered.push(name);
    }
  } catch (e: any) {
    console.warn("[AI] Model discovery failed; using fallback static list:", e.message);
  }

  const fallback = [
    "models/gemini-2.0-flash-lite",
    "models/gemini-2.0-flash-lite-001",
    "models/gemini-2.0-flash",
    "models/gemini-2.0-flash-001",
    "models/gemini-1.5-flash",
    "models/gemini-1.5-flash-8b",
    "models/gemini-1.5-pro",
    "models/gemini-2.5-flash",
    "models/gemini-2.5-pro",
  ];

  const unique = Array.from(new Set([...discovered, ...fallback]));
  unique.sort((a, b) => modelPriorityScore(b) - modelPriorityScore(a));
  cachedGeminiModels = { models: unique, fetchedAt: now };
  return unique;
}

async function generateWithAnyGeminiModel(
  ai: GoogleGenAI,
  prompt: string,
): Promise<{ text: string; model: string } | { error: string }> {
  const models = await listAvailableGeminiTextModels(ai);
  let lastError = "unknown_error";
  const tried: string[] = [];

  for (const model of models) {
    tried.push(model);
    try {
      const result = await ai.models.generateContent({
        model,
        contents: prompt,
      });
      const text = String(result?.text || "").trim();
      if (text) return { text, model };
      lastError = `${model}: empty_response`;
    } catch (e: any) {
      const friendly = formatAIError(e);
      lastError = `${model}: ${friendly}`;
      if (!isLikelyRateOrQuotaError(friendly)) {
        console.warn(`[AI] Model failed (${model}):`, friendly);
      }
    }
  }
  return { error: `All discovered Gemini models failed. Last error: ${lastError}. Tried: ${tried.join(", ")}` };
}

async function generateAIReport(
  name: string,
  country: string,
  chartData: ReportChartRow[],
  quarterlyData: ReportQuarterlyRow[],
  announcements: ReportAnnouncement[],
  currentPrice?: string | number | null,
  reportType: ReportType = "standard",
) {
  try {
    const apiKey = (process.env.GEMINI_API_KEY || "").trim();
    if (!apiKey) {
      console.error("[AI] GEMINI_API_KEY is missing from environment variables.");
      return "AI analysis is currently unavailable (API Key not configured).";
    }

    const ai = new GoogleGenAI({ apiKey });
    const styleInstruction =
      reportType === "deep"
        ? "Write a deep institutional report (long-form, highly detailed, with explicit assumptions and scenario analysis)."
        : reportType === "quick"
          ? "Write a concise executive report (short, punchy, decision-oriented). Keep it brief."
          : "Write a standard professional equity research report with balanced detail.";

    const sectionInstruction =
      reportType === "quick"
        ? `Structure with the following sections:
1. **Investment Thesis & Summary**
2. **Key Financial Highlights**
3. **Top 3 Catalysts**
4. **Top 3 Risks**
5. **Valuation View**
6. **Actionable Takeaway**`
        : `Structure the report EXACTLY with the following sections, providing detailed, professional insights for each:
1. **Investment Thesis & Summary**
2. **Business Model & Operations**
3. **Historical Financial Review**
4. **Growth Drivers & Catalysts**
5. **Risk Assessment**
6. **Valuation & Price Target**
7. **Management Quality & Governance**
8. **Competitive Positioning**`;

    const prompt = `You are an expert financial analyst. Write a comprehensive, world-class equity research report for ${name} (${country === 'US' ? 'USA' : 'India'}). 
${styleInstruction}
    
Ensure you analyze the LATEST available data, including recent quarterly results and any recent exchange filings.

Annual Profit & Loss Data (${country === 'US' ? 'USD Millions' : 'INR Crores'}):
${JSON.stringify(chartData)}

Recent Quarterly Results (Last 4 Quarters):
${JSON.stringify(quarterlyData.slice(-4))}

Recent Filings (Latest):
${JSON.stringify(announcements.map((a: any) => ({ date: a.date, subject: a.subject })))}

Current Market Price (authoritative):
${currentPrice ?? "N/A"}

${sectionInstruction}

Use markdown formatting. Make it read like a premium institutional research report.`;

    const result = await generateWithAnyGeminiModel(ai, prompt);
    if ("error" in result) {
      return `AI analysis is currently unavailable. Error: ${result.error}`;
    }
    console.log(`[AI] Report generated with model: ${result.model}`);
    return result.text || "AI analysis is currently unavailable.";
  } catch (e: any) {
    const friendlyError = formatAIError(e);
    console.error("[AI] Generation failed:", friendlyError);
    return `AI analysis is currently unavailable. Error: ${friendlyError}`;
  }
}


async function generateQuickSnapshot(name: string, country: string, chartData: any[], quarterlyData: any[], announcements: any[]) {
  try {
    const apiKey = (process.env.GEMINI_API_KEY || "").trim();
    console.log("[AI] Initializing with key length:", apiKey.length);
    if (!apiKey) {
      console.error("[AI] GEMINI_API_KEY is missing from environment variables.");
      return "Snapshot unavailable (API Key not configured).";
    }

    const ai = new GoogleGenAI({ apiKey });
    const prompt = `You are a financial analyst. Provide a 3-sentence "Quick Snapshot" of the latest results for ${name}. 
    Focus on: 
    1. Revenue/Profit growth (YoY or QoQ).
    2. Key margin trends.
    3. One major highlight from recent filings.
    
    Data:
    Annual: ${JSON.stringify(chartData.slice(-2))}
    Quarterly: ${JSON.stringify(quarterlyData.slice(-2))}
    Filings: ${JSON.stringify(announcements.slice(0, 2).map(a => a.subject))}
    
    Keep it extremely concise and professional. Use bullet points.`;

    const result = await generateWithAnyGeminiModel(ai, prompt);
    if ("error" in result) {
      return `Snapshot generation failed: ${result.error}`;
    }
    console.log(`[AI] Snapshot generated with model: ${result.model}`);
    return result.text || "No snapshot available.";
  } catch (e: any) {
    const friendlyError = formatAIError(e);
    console.error("[AI] Snapshot failed:", friendlyError);
    return `Snapshot generation failed: ${friendlyError}`;
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;
  const ADMIN_API_KEY = String(process.env.ADMIN_API_KEY || "").trim();
  const metrics: ApiMetrics = {
    requestsTotal: 0,
    errorsTotal: 0,
    queueEnqueued: 0,
    queueCompleted: 0,
    queueFailed: 0,
    avgLatencyMs: 0,
  };
  const outcomeJobs = new Map<string, OutcomeRefreshJob>();
  const outcomeQueue: string[] = [];
  let outcomeWorkerRunning = false;

  app.use(cors());
  app.use(express.json());
  app.use((req, res, next) => {
    const startedAt = Date.now();
    const reqId = Math.random().toString(36).slice(2, 10);
    res.locals.reqId = reqId;
    res.setHeader("X-Request-Id", reqId);
    res.on("finish", () => {
      const durationMs = Date.now() - startedAt;
      const level = res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";
      metrics.requestsTotal += 1;
      if (res.statusCode >= 500) metrics.errorsTotal += 1;
      metrics.avgLatencyMs = metrics.avgLatencyMs === 0
        ? durationMs
        : Number((metrics.avgLatencyMs * 0.9 + durationMs * 0.1).toFixed(2));
      const payload = {
        event: "http_request",
        reqId,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs,
      };
      if (level === "error") console.error("[HTTP]", JSON.stringify(payload));
      else if (level === "warn") console.warn("[HTTP]", JSON.stringify(payload));
      else console.log("[HTTP]", JSON.stringify(payload));
    });
    next();
  });

  function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
    if (!ADMIN_API_KEY) {
      return res.status(503).json({ success: false, error: "admin_api_key_not_configured" });
    }
    const token = String(req.headers["x-admin-key"] || "");
    if (!token || token !== ADMIN_API_KEY) {
      return res.status(403).json({ success: false, error: "forbidden_admin_only" });
    }
    next();
  }

  // Initialize SQLite Database
  const db = await open({
    filename: './announcements.db',
    driver: sqlite3.Database
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS announcements (
      id TEXT PRIMARY KEY,
      symbol TEXT,
      companyName TEXT,
      subject TEXT,
      date TEXT,
      pdfLink TEXT,
      exchange TEXT,
      category TEXT
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS saved_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      companyName TEXT NOT NULL,
      symbol TEXT,
      country TEXT NOT NULL,
      sourceUrl TEXT NOT NULL,
      reportJson TEXT NOT NULL,
      createdAt TEXT NOT NULL
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS strategy_perf_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      startDate TEXT NOT NULL,
      payloadJson TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      UNIQUE(symbol, startDate)
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS report_outcomes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recommendationId INTEGER,
      reportId INTEGER NOT NULL,
      symbol TEXT NOT NULL,
      country TEXT NOT NULL,
      horizonDays INTEGER NOT NULL,
      reportDate TEXT NOT NULL,
      entryDate TEXT,
      entryPrice REAL,
      targetDate TEXT,
      targetPrice REAL,
      returnPct REAL,
      status TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      UNIQUE(reportId, horizonDays)
    )
  `);

  const reportOutcomeCols: Array<{ name: string }> = await db.all("PRAGMA table_info(report_outcomes)");
  if (!reportOutcomeCols.some((c) => c.name === "recommendationId")) {
    await db.exec("ALTER TABLE report_outcomes ADD COLUMN recommendationId INTEGER");
  }

  await db.exec(`
    CREATE TABLE IF NOT EXISTS company_thesis_memory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      country TEXT NOT NULL,
      thesis TEXT NOT NULL,
      invalidationTriggersJson TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      invalidatedReason TEXT,
      invalidatedAt TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      UNIQUE(symbol, country)
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS recommendations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reportId INTEGER,
      symbol TEXT NOT NULL,
      country TEXT NOT NULL,
      recommendationAction TEXT NOT NULL,
      confidencePct REAL NOT NULL,
      horizonDays INTEGER NOT NULL,
      riskClass TEXT NOT NULL,
      explainabilityJson TEXT NOT NULL,
      scoreSnapshotJson TEXT NOT NULL,
      policyVersion TEXT NOT NULL,
      createdAt TEXT NOT NULL
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS recommendation_actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recommendationId INTEGER NOT NULL,
      actionType TEXT NOT NULL,
      actorType TEXT NOT NULL,
      actorId TEXT,
      executionPrice REAL,
      executionDate TEXT,
      sizeValue REAL,
      notes TEXT,
      createdAt TEXT NOT NULL
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS policy_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      version TEXT UNIQUE NOT NULL,
      weightsJson TEXT NOT NULL,
      metricsJson TEXT,
      notes TEXT,
      createdAt TEXT NOT NULL
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      status TEXT NOT NULL,
      inputJson TEXT NOT NULL,
      resultJson TEXT,
      error TEXT,
      createdAt TEXT NOT NULL,
      startedAt TEXT,
      finishedAt TEXT
    )
  `);

  async function saveGeneratedReport(input: {
    companyName: string;
    symbol?: string | null;
    country: string;
    sourceUrl: string;
    report: CompanyReportData;
  }) {
    await db.run(
      `INSERT INTO saved_reports (companyName, symbol, country, sourceUrl, reportJson, createdAt)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        input.companyName,
        input.symbol || null,
        input.country,
        input.sourceUrl,
        JSON.stringify(input.report),
        new Date().toISOString(),
      ]
    );
  }

  async function ensureInitialPolicyVersion() {
    const existing = await db.get<{ id: number }>("SELECT id FROM policy_versions WHERE version = ?", ["rules_v1"]);
    if (existing) return;
    await db.run(
      `INSERT INTO policy_versions (version, weightsJson, metricsJson, notes, createdAt)
       VALUES (?, ?, ?, ?, ?)`,
      [
        "rules_v1",
        JSON.stringify({ quality: 0.35, valuation: 0.2, momentum: 0.25, risk: 0.2 }),
        JSON.stringify({ seed: true }),
        "Initial deterministic policy weights",
        new Date().toISOString(),
      ]
    );
  }

  await ensureInitialPolicyVersion();

  function buildRecommendationFromScore(input: {
    reportId: number | null;
    symbol: string;
    country: "IN" | "US";
    scorecard: {
      totalScore: number;
      verdict: "strong" | "watch" | "weak";
      breakdown: { quality: number; valuation: number; momentum: number; risk: number };
    };
  }): RecommendationDecision {
    const score = input.scorecard.totalScore;
    const recommendationAction = score >= 72 ? "buy" : score >= 52 ? "watch" : "avoid";
    const riskClass = input.scorecard.breakdown.risk >= 70 ? "low" : input.scorecard.breakdown.risk >= 45 ? "medium" : "high";
    const confidencePct = Math.max(5, Math.min(95, Math.round(score * 0.82 + input.scorecard.breakdown.quality * 0.18)));
    const explainability = {
      positive: [
        `quality:${input.scorecard.breakdown.quality}`,
        `valuation:${input.scorecard.breakdown.valuation}`,
      ],
      negative: [
        `risk:${100 - input.scorecard.breakdown.risk}`,
      ],
      caveats: [
        "outcomes should be interpreted with horizon-specific volatility",
      ],
    };
    return {
      reportId: input.reportId,
      symbol: input.symbol,
      country: input.country,
      recommendationAction,
      confidencePct,
      horizonDays: 90,
      riskClass,
      explainability,
      scoreSnapshot: input.scorecard,
      policyVersion: "rules_v1",
    };
  }

  async function saveRecommendation(rec: RecommendationDecision) {
    const inserted = await db.run(
      `INSERT INTO recommendations
       (reportId, symbol, country, recommendationAction, confidencePct, horizonDays, riskClass, explainabilityJson, scoreSnapshotJson, policyVersion, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        rec.reportId,
        rec.symbol,
        rec.country,
        rec.recommendationAction,
        rec.confidencePct,
        rec.horizonDays,
        rec.riskClass,
        JSON.stringify(rec.explainability),
        JSON.stringify(rec.scoreSnapshot),
        rec.policyVersion,
        new Date().toISOString(),
      ]
    );
    return inserted.lastID;
  }

  async function updateJobRow(job: OutcomeRefreshJob) {
    await db.run(
      `INSERT INTO jobs (id, type, status, inputJson, resultJson, error, createdAt, startedAt, finishedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         status=excluded.status,
         resultJson=excluded.resultJson,
         error=excluded.error,
         startedAt=excluded.startedAt,
         finishedAt=excluded.finishedAt`,
      [
        job.id,
        "outcomes_refresh",
        job.status,
        JSON.stringify(job.input),
        job.result ? JSON.stringify(job.result) : null,
        job.error || null,
        job.createdAt,
        job.startedAt,
        job.finishedAt,
      ]
    );
  }

  async function computeForwardOutcomeForReport(input: {
    reportId: number;
    symbol: string;
    country: "IN" | "US";
    reportDateIso: string;
    horizonDays: number;
  }) {
    const symbol = input.symbol.trim();
    const reportDate = new Date(input.reportDateIso);
    if (!symbol || Number.isNaN(reportDate.getTime())) {
      return { status: "invalid_input" as const };
    }
    const fetchFrom = format(subDays(reportDate, 10), "yyyy-MM-dd");
    const targetDate = format(new Date(reportDate.getTime() + input.horizonDays * 24 * 60 * 60 * 1000), "yyyy-MM-dd");
    const candles = input.country === "US"
      ? await fetchNasdaqDailyHistory(symbol, fetchFrom)
      : await fetchIndianDailySeriesFromExchanges(symbol, fetchFrom);
    if (!candles.length) return { status: "no_price_series" as const };
    const reportYmd = format(reportDate, "yyyy-MM-dd");
    const entry = candles.find((c) => c.date >= reportYmd) || candles[0];
    const target = candles.find((c) => c.date >= targetDate) || candles[candles.length - 1];
    if (!entry || !target || !Number.isFinite(entry.close) || !Number.isFinite(target.close) || entry.close <= 0) {
      return { status: "invalid_price_points" as const };
    }
    const returnPct = ((target.close / entry.close) - 1) * 100;
    return {
      status: "ok" as const,
      entryDate: entry.date,
      entryPrice: entry.close,
      targetDate: target.date,
      targetPrice: target.close,
      returnPct,
    };
  }

  async function refreshOutcomes(input: { country: string; horizons: number[]; limit: number }) {
    const country = String(input.country || "").trim().toUpperCase();
    const horizons = Array.isArray(input.horizons) && input.horizons.length
      ? input.horizons.map((h) => Number(h)).filter((n) => Number.isFinite(n) && n > 0)
      : [30, 90, 180];
    const lim = Math.min(300, Math.max(1, Number(input.limit || 120)));
    const rows: Array<{ id: number; symbol: string | null; country: string; createdAt: string }> = await db.all(
      `SELECT id, symbol, country, createdAt
       FROM saved_reports
       ${country ? "WHERE country = ?" : ""}
       ORDER BY datetime(createdAt) DESC
       LIMIT ${lim}`,
      country ? [country] : []
    );
    let processed = 0;
    let refreshed = 0;
    for (const row of rows) {
      processed += 1;
      if (!row.symbol) continue;
      const normalizedCountry = row.country === "US" ? "US" : "IN";
      for (const horizonDays of horizons) {
        let status = "failed";
        let entryDate: string | null = null;
        let entryPrice: number | null = null;
        let targetDate: string | null = null;
        let targetPrice: number | null = null;
        let returnPct: number | null = null;
        try {
          const out = await computeForwardOutcomeForReport({
            reportId: row.id,
            symbol: row.symbol,
            country: normalizedCountry,
            reportDateIso: row.createdAt,
            horizonDays,
          });
          status = out.status;
          if (out.status === "ok") {
            entryDate = out.entryDate;
            entryPrice = out.entryPrice;
            targetDate = out.targetDate;
            targetPrice = out.targetPrice;
            returnPct = out.returnPct;
          }
        } catch (e: unknown) {
          status = e instanceof Error ? e.message : "refresh_failed";
        }
        const recommendation = await db.get<{ id: number }>(
          `SELECT id FROM recommendations
           WHERE reportId = ?
           ORDER BY datetime(createdAt) DESC
           LIMIT 1`,
          [row.id]
        );
        await db.run(
          `INSERT INTO report_outcomes
           (recommendationId, reportId, symbol, country, horizonDays, reportDate, entryDate, entryPrice, targetDate, targetPrice, returnPct, status, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(reportId, horizonDays) DO UPDATE SET
             recommendationId=excluded.recommendationId,
             symbol=excluded.symbol,
             country=excluded.country,
             reportDate=excluded.reportDate,
             entryDate=excluded.entryDate,
             entryPrice=excluded.entryPrice,
             targetDate=excluded.targetDate,
             targetPrice=excluded.targetPrice,
             returnPct=excluded.returnPct,
             status=excluded.status,
             updatedAt=excluded.updatedAt`,
          [
            recommendation?.id || null,
            row.id,
            row.symbol,
            normalizedCountry,
            horizonDays,
            row.createdAt,
            entryDate,
            entryPrice,
            targetDate,
            targetPrice,
            returnPct,
            status,
            new Date().toISOString(),
            new Date().toISOString(),
          ]
        );
        refreshed += 1;
      }
    }
    return { processedReports: processed, refreshedOutcomes: refreshed, horizons };
  }

  async function computeRecommendationCalibration(windowDays: number) {
    const sinceIso = new Date(Date.now() - Math.max(1, windowDays) * 24 * 60 * 60 * 1000).toISOString();
    const rows: Array<{ confidencePct: number; returnPct: number | null; status: string }> = await db.all(
      `SELECT r.confidencePct as confidencePct, o.returnPct as returnPct, o.status as status
       FROM report_outcomes o
       JOIN recommendations r ON r.id = o.recommendationId
       WHERE datetime(o.updatedAt) >= datetime(?)`,
      [sinceIso]
    );
    const usable = rows.filter((r) => r.status === "ok" && r.returnPct != null && Number.isFinite(Number(r.confidencePct)));
    const bucketDefs = [
      { min: 0, max: 20 },
      { min: 20, max: 40 },
      { min: 40, max: 60 },
      { min: 60, max: 80 },
      { min: 80, max: 101 },
    ];
    const buckets = bucketDefs.map((b) => {
      const hitRows = usable.filter((r) => Number(r.confidencePct) >= b.min && Number(r.confidencePct) < b.max);
      const hitRatePct = hitRows.length ? (hitRows.filter((r) => Number(r.returnPct) > 0).length / hitRows.length) * 100 : null;
      const avgReturnPct = hitRows.length ? hitRows.reduce((s, r) => s + Number(r.returnPct), 0) / hitRows.length : null;
      return {
        minConfidence: b.min,
        maxConfidence: b.max === 101 ? 100 : b.max,
        count: hitRows.length,
        hitRatePct,
        avgReturnPct,
      };
    });
    const brierLikeScore = usable.length
      ? usable.reduce((s, r) => {
          const p = Number(r.confidencePct) / 100;
          const y = Number(r.returnPct) > 0 ? 1 : 0;
          return s + (p - y) ** 2;
        }, 0) / usable.length
      : null;
    return {
      windowDays,
      sampleCount: usable.length,
      brierLikeScore,
      buckets,
      generatedAt: new Date().toISOString(),
    };
  }

  async function runPolicyReweightingJob() {
    const calibration = await computeRecommendationCalibration(180);
    const defaultWeights = { quality: 0.35, valuation: 0.2, momentum: 0.25, risk: 0.2 };
    const hitRate = calibration.sampleCount ? calibration.buckets.reduce((s, b) => s + (b.hitRatePct || 0) * b.count, 0) / calibration.sampleCount : 50;
    const riskBias = hitRate < 45 ? 0.25 : 0.2;
    const momentumBias = hitRate > 55 ? 0.28 : 0.25;
    const qualityBias = 1 - (riskBias + momentumBias + defaultWeights.valuation);
    const weights = {
      quality: Number(qualityBias.toFixed(3)),
      valuation: defaultWeights.valuation,
      momentum: Number(momentumBias.toFixed(3)),
      risk: Number(riskBias.toFixed(3)),
    };
    const version = `rules_v${Date.now()}`;
    await db.run(
      `INSERT INTO policy_versions (version, weightsJson, metricsJson, notes, createdAt)
       VALUES (?, ?, ?, ?, ?)`,
      [
        version,
        JSON.stringify(weights),
        JSON.stringify({ calibration }),
        "Automated rules-first reweighting based on realized outcomes",
        new Date().toISOString(),
      ]
    );
    return { version, weights, calibration };
  }

  async function drainOutcomeQueue() {
    if (outcomeWorkerRunning) return;
    outcomeWorkerRunning = true;
    while (outcomeQueue.length) {
      const jobId = outcomeQueue.shift() as string;
      const job = outcomeJobs.get(jobId);
      if (!job) continue;
      job.status = "running";
      job.startedAt = new Date().toISOString();
      await updateJobRow(job);
      try {
        const result = await refreshOutcomes(job.input);
        job.result = result;
        job.status = "completed";
        job.finishedAt = new Date().toISOString();
        metrics.queueCompleted += 1;
      } catch (e: unknown) {
        job.status = "failed";
        job.error = e instanceof Error ? e.message : "queue_job_failed";
        job.finishedAt = new Date().toISOString();
        metrics.queueFailed += 1;
      }
      outcomeJobs.set(job.id, job);
      await updateJobRow(job);
    }
    outcomeWorkerRunning = false;
  }

  // Background Sync Function
  async function syncAnnouncements(options?: { includeAllListedCorporateAnnouncements?: boolean }) {
    try {
      const lastStored = await db.get<{ maxDate: string | null }>("SELECT MAX(date) as maxDate FROM announcements");
      const lastTs = lastStored?.maxDate ? new Date(lastStored.maxDate).getTime() : null;
      const basePrevDate = lastTs && Number.isFinite(lastTs) ? subDays(new Date(lastTs), 1) : subDays(new Date(), 30);
      const today = new Date();
      const prevDate = basePrevDate;
      const strToDate = format(today, "yyyyMMdd");
      const strPrevDate = format(prevDate, "yyyyMMdd");
      
      let newCount = 0;
      let totalFound = 0;
      let duplicatesSkipped = 0;
      let staleSkipped = 0;
      let resultsProcessed = 0;
      let nonResultProcessed = 0;

      const recentRows = await db.all("SELECT symbol, companyName, subject, date, category FROM announcements ORDER BY date DESC LIMIT 5000");
      const seenFingerprints = new Set<string>(
        recentRows.map((r: any) =>
          announcementProcessingFingerprint({
            symbol: r.symbol,
            companyName: r.companyName,
            subject: r.subject,
            date: r.date,
            category: normalizeIndianAnnouncementCategory(r.category),
          })
        )
      );

      const categoriesToFetch = ["-1", "Result", "Financial Result", "Outcome of Board Meeting"];
      
      for (const cat of categoriesToFetch) {
        for (let page = 1; page <= 5; page++) {
          const bseUrl = `https://api.bseindia.com/BseIndiaAPI/api/AnnGetData/w?pageno=${page}&strCat=${cat}&strPrevDate=${strPrevDate}&strScrip=&strSearch=P&strToDate=${strToDate}&strType=C`;
          
          const response = await axios.get(bseUrl, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              "Accept": "application/json, text/plain, */*",
              "Referer": "https://www.bseindia.com/",
              "Origin": "https://www.bseindia.com"
            },
            timeout: 30000
          });

          const data = response.data?.Table || [];
          if (data.length === 0) break; // No more pages
          
          totalFound += data.length;

          for (const item of data) {
            const pdfLink = item.ATTACHMENTNAME ? `https://www.bseindia.com/xml-data/corpfiling/AttachLive/${item.ATTACHMENTNAME}` : null;
            const normalizedCategory = normalizeIndianAnnouncementCategory(item.CATEGORYNAME);
            const itemDate = item.DT_TM ? new Date(item.DT_TM).getTime() : null;
            if (lastTs && itemDate && itemDate <= lastTs) {
              staleSkipped++;
              continue;
            }
            const fp = announcementProcessingFingerprint({
              symbol: item.SCRIP_CD,
              companyName: item.SLONGNAME,
              subject: item.NEWSSUB,
              date: item.DT_TM,
              category: normalizedCategory,
            });
            if (seenFingerprints.has(fp)) {
              duplicatesSkipped++;
              continue;
            }
            seenFingerprints.add(fp);
            const result = await db.run(`
              INSERT OR IGNORE INTO announcements (id, symbol, companyName, subject, date, pdfLink, exchange, category)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `, [
              item.NEWSID,
              item.SCRIP_CD,
              item.SLONGNAME,
              item.NEWSSUB,
              item.DT_TM,
              pdfLink,
              "BSE",
              normalizedCategory
            ]);

            if (result.changes && result.changes > 0) {
              newCount++;
              if (normalizedCategory === "Result") resultsProcessed++;
              else nonResultProcessed++;
            }
          }
        }
      }

      if (options?.includeAllListedCorporateAnnouncements !== false) {
        try {
          const universe = await fetchWithRetry("https://www.nseindia.com/api/market-data-pre-open?key=ALL", {
            headers: { Accept: "application/json", Referer: "https://www.nseindia.com/" },
            timeout: 15000,
          });
          const symbols = (universe?.data?.data || [])
            .map((r: any) => r?.metadata?.symbol || r?.symbol)
            .filter(Boolean)
            .slice(0, 1200);
          for (const sym of symbols) {
            try {
              const ca = await fetchWithRetry(`https://www.nseindia.com/api/corporate-announcements?symbol=${encodeURIComponent(sym)}`, {
                headers: { Accept: "application/json", Referer: "https://www.nseindia.com/" },
                timeout: 12000,
              });
              const rows = ca?.data || [];
              for (const r of rows.slice(0, 12)) {
                const category = normalizeIndianAnnouncementCategory(r?.caSubject || r?.subject || "General");
                const date = r?.an_dt || r?.bcStartDate || r?.date || "";
                const itemDate = date ? new Date(date).getTime() : null;
                if (lastTs && itemDate && itemDate <= lastTs) {
                  staleSkipped++;
                  continue;
                }
                const fp = announcementProcessingFingerprint({
                  symbol: sym,
                  companyName: r?.sm_name || r?.companyName || sym,
                  subject: r?.caSubject || r?.subject || "",
                  date,
                  category,
                });
                if (seenFingerprints.has(fp)) {
                  duplicatesSkipped++;
                  continue;
                }
                seenFingerprints.add(fp);
                const id = r?.attchmntFile || r?.an_id || `${sym}_${Date.parse(date || String(Date.now()))}_${Math.random().toString(36).slice(2, 7)}`;
                const pdfLink = r?.attchmntFile ? `https://nsearchives.nseindia.com${r.attchmntFile}` : null;
                const insert = await db.run(
                  `INSERT OR IGNORE INTO announcements (id, symbol, companyName, subject, date, pdfLink, exchange, category) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                  [
                    String(id),
                    sym,
                    r?.sm_name || sym,
                    r?.caSubject || r?.subject || "Corporate Announcement",
                    date || new Date().toISOString(),
                    pdfLink,
                    "NSE",
                    category,
                  ]
                );
                if (insert.changes && insert.changes > 0) {
                  newCount++;
                  if (category === "Result") resultsProcessed++;
                  else nonResultProcessed++;
                }
              }
            } catch {
              // best-effort for symbols that fail
            }
          }
        } catch (nseErr: any) {
          console.warn("[Sync] NSE all-listed pass failed:", nseErr.message);
        }
      }
      
      console.log(`[Sync] Found ${totalFound}. Inserted ${newCount}. Duplicates ${duplicatesSkipped}. Stale ${staleSkipped}. Results ${resultsProcessed}, non-results ${nonResultProcessed}.`);
    } catch (error: any) {
      console.error("[Sync] Error syncing announcements:", error.message);
    }
  }

  // Sync every 5 minutes
  setInterval(syncAnnouncements, 5 * 60 * 1000);

  // Recompute rules-first policy weights every day
  setInterval(() => {
    void runPolicyReweightingJob().catch((e) => {
      console.warn("[Policy] Reweighting failed:", e instanceof Error ? e.message : String(e));
    });
  }, 24 * 60 * 60 * 1000);

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ 
      status: "ok", 
      hasKey: !!process.env.GEMINI_API_KEY,
      hasAlpaca: !!process.env.ALPACA_API_KEY,
      alpacaKeyPrefix: process.env.ALPACA_API_KEY ? process.env.ALPACA_API_KEY.substring(0, 5) : null,
      keyLength: process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.length : 0,
      keyStart: process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.substring(0, 4) : null
    });
  });

  app.get("/api/recommendations/policy/latest", async (_req, res) => {
    try {
      const row = await db.get<{ version: string; weightsJson: string; metricsJson: string | null; createdAt: string }>(
        "SELECT version, weightsJson, metricsJson, createdAt FROM policy_versions ORDER BY datetime(createdAt) DESC LIMIT 1"
      );
      if (!row) return res.status(404).json({ success: false, error: "policy_not_found" });
      return res.json({
        success: true,
        data: {
          version: row.version,
          weights: JSON.parse(row.weightsJson || "{}"),
          metrics: row.metricsJson ? JSON.parse(row.metricsJson) : null,
          createdAt: row.createdAt,
        },
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message || "policy_fetch_failed" });
    }
  });

  // Test Alpaca Connectivity
  app.get("/api/test-alpaca", async (req, res) => {
    const symbol = (req.query.symbol as string) || "AAPL";
    if (!process.env.ALPACA_API_KEY || !process.env.ALPACA_SECRET_KEY) {
      return res.status(400).json({ 
        success: false, 
        error: "Alpaca API keys are missing in environment variables." 
      });
    }

    try {
      console.log(`[Test] Testing Alpaca API with symbol: ${symbol}`);
      const response = await axios.get(`https://data.alpaca.markets/v2/stocks/${symbol}/snapshot`, {
        headers: {
          'APCA-API-KEY-ID': process.env.ALPACA_API_KEY,
          'APCA-API-SECRET-KEY': process.env.ALPACA_SECRET_KEY,
        },
        timeout: 5000
      });
      
      res.json({
        success: true,
        message: "Alpaca API is working correctly!",
        data: response.data
      });
    } catch (error: any) {
      console.error("[Test] Alpaca API test failed:", error.response?.status, error.message);
      res.status(error.response?.status || 500).json({
        success: false,
        error: error.message,
        details: error.response?.data || "No additional details"
      });
    }
  });

  // Fetch Announcements from SQLite (Real-time from BSE or SEC)
  app.get("/api/announcements", async (req, res) => {
    try {
      const { type = "all", country } = req.query;
      
      if (country === 'US') {
        // For US, we'll fetch recent SEC filings from their RSS feed
        try {
          const count = type === 'results' ? 100 : 40;
          let secUrl = `https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&CIK=&type=&company=&dateb=&owner=include&start=0&count=${count}&output=atom`;
          
          // If we want results, we can target 8-K (Current Reports/Earnings) specifically to get better data
          if (type === 'results') {
            secUrl = `https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=8-K&count=100&output=atom`;
          }
          
          const response = await fetchWithRetry(secUrl, {
            headers: {
              "User-Agent": "MarketIntelligence (valuepicks25@gmail.com)",
              "Accept-Encoding": "gzip, deflate",
              "Host": "www.sec.gov"
            },
            timeout: 10000
          });
          const $ = cheerio.load(response.data, { xmlMode: true });
          const secAnnouncements: any[] = [];
          
          $('entry').each((i, el) => {
            const entry = $(el);
            const title = entry.find('title').text();
            // Title format: "10-Q - APPLE INC (0000320193) (Filer)"
            const parts = title.split(' - ');
            const category = parts[0] || 'Filing';
            const companyName = parts[1]?.split(' (')[0] || 'Unknown';
            const symbolMatch = title.match(/\(([^)]+)\)/);
            const cik = symbolMatch ? symbolMatch[1] : '';
            
            // Map CIK to Ticker
            const ticker = cikToTicker[cik] || cikToTicker[parseInt(cik).toString()] || cik;
            
            const isResult = category.includes('10-Q') || category.includes('10-K') || category.includes('8-K');
            const itemCategory = isResult ? 'Result' : 'Filing';
            
            // Respect the type filter
            if (type === 'results' && itemCategory !== 'Result') return;

            const rawId = entry.find('id').text();
            
            secAnnouncements.push({
              id: `${rawId}_${i}`,
              symbol: ticker,
              companyName: companyName,
              subject: title,
              date: entry.find('updated').text(),
              pdfLink: entry.find('link').attr('href'),
              exchange: 'SEC',
              category: itemCategory
            });
          });
          return res.json({ success: true, data: normalizeAnnouncements(secAnnouncements) });
        } catch (secError: any) {
          console.error("Error fetching SEC filings:", secError.message);
          return res.status(500).json({ success: false, error: "Failed to fetch SEC filings" });
        }
      }

      // Trigger a sync in the background to ensure fresh data for next time
      syncAnnouncements();

      const rows = await db.all("SELECT * FROM announcements ORDER BY date DESC LIMIT 4000");
      const normalized = rows.map((r: any) => ({
        ...r,
        category: normalizeIndianAnnouncementCategory(r.category),
      }));

      if (type === "results") {
        // Only keep companies whose latest announcement overall is a Result,
        // then return that latest result row.
        const latestOverallByCompany = new Map<string, any>();
        const latestResultByCompany = new Map<string, any>();
        for (const row of normalized) {
          const key = `${row.symbol || ""}::${row.companyName || ""}`;
          if (!latestOverallByCompany.has(key)) latestOverallByCompany.set(key, row);
          if (row.category === "Result" && !latestResultByCompany.has(key)) latestResultByCompany.set(key, row);
        }
        const filtered = Array.from(latestResultByCompany.entries())
          .filter(([key]) => latestOverallByCompany.get(key)?.category === "Result")
          .map(([, row]) => row)
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        return res.json({ success: true, data: normalizeAnnouncements(filtered) });
      }

      const dedup = new Map<string, any>();
      for (const row of normalized) {
        const key = announcementProcessingFingerprint({
          symbol: row.symbol,
          companyName: row.companyName,
          subject: row.subject,
          date: row.date,
          category: row.category,
        });
        if (!dedup.has(key)) dedup.set(key, row);
      }
      const data = Array.from(dedup.values())
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 500);
      res.json({ success: true, data: normalizeAnnouncements(data) });
    } catch (error: any) {
      console.error("Error fetching announcements:", error.message);
      res.status(500).json({ success: false, error: "Failed to fetch announcements" });
    }
  });

  // Fetch Companies (Real-time from Screener.in or Yahoo Finance)
  app.get("/api/companies", async (req, res) => {
    try {
      const { search, country } = req.query;
      if (!search) {
        return res.json({ success: true, data: [] });
      }

      if (country === 'US') {
        const response = await axios.get(`https://api.nasdaq.com/api/autocomplete/slookup/10?search=${encodeURIComponent(String(search))}`, {
          headers: { "User-Agent": USER_AGENTS[0], Accept: "application/json" },
          timeout: 10000,
        });
        const companies = (response.data?.data || [])
          .filter((q: any) => String(q.asset || "").toUpperCase() === "STOCKS")
          .map((q: any) => ({
            id: q.symbol,
            name: q.name || q.symbol,
            url: `https://www.nasdaq.com/market-activity/stocks/${String(q.symbol || "").toLowerCase()}`,
            exchange: q.exchange || "US Exchange",
            symbol: q.symbol,
          }));
        return res.json({ success: true, data: normalizeCompanySearchResults(companies) });
      }

      // Use Screener.in search API for clean company data
      const searchUrl = `https://www.screener.in/api/company/search/?q=${encodeURIComponent(search as string)}&v=3`;
      
      const response = await axios.get(searchUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Accept": "application/json, text/plain, */*",
          "Referer": "https://www.screener.in/"
        }
      });

      // Screener returns an array of objects: { id, name, url }
      const companies = response.data.map((item: any) => ({
        id: item.id,
        name: item.name,
        url: `https://www.screener.in${item.url}`,
        exchange: "BSE/NSE"
      }));

      res.json({ success: true, data: normalizeCompanySearchResults(companies) });
    } catch (error: any) {
      console.error("Error fetching companies:", error.message);
      res.status(500).json({ success: false, error: "Failed to fetch companies" });
    }
  });

  // Fetch Scanner Results (Real-time from Screener.in Public Screens or Mock for US)
  app.get("/api/scanners/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { country } = req.query;
      
      if (country === 'US') {
        const scannerSeeds: Record<string, string[]> = {
          VALUE_BUYS: ["BRK.B", "JNJ", "PG", "PEP", "KO", "PFE", "UNH", "CVX"],
          QGLP_FRAMEWORK: ["AAPL", "MSFT", "GOOGL", "NVDA", "AMZN", "META", "NFLX", "TSM"],
          SMILE_FRAMEWORK: ["PLTR", "SOFI", "RKLB", "IONQ", "ASTS", "RGTI", "HIMS", "DUOL"],
          HIGH_ROE_GROWTH: ["MSFT", "NVDA", "AVGO", "ADBE", "INTU", "COST", "MA", "V"],
          MULTIBAGGER_SIGNAL: ["CRWD", "SNOW", "DDOG", "SHOP", "MELI", "CELH", "ONON", "AXON"],
          LOW_ROE_HIGH_GROWTH: ["UBER", "ABNB", "SQ", "COIN", "AFRM", "DOCU", "PATH", "AI"],
          STABLE_MED_GROWTH: ["MSFT", "AAPL", "GOOGL", "V", "MA", "LLY", "COST", "WM"],
          STABLE_LOW_GROWTH: ["JNJ", "PG", "KO", "PEP", "WMT", "MCD", "HD", "XOM"],
          GARP: ["AAPL", "MSFT", "AMZN", "META", "CRM", "ORCL", "TXN", "AMD"],
        };
        const symbols = scannerSeeds[id] || scannerSeeds.STABLE_MED_GROWTH;
        const rows = await Promise.all(symbols.map(async (symbol) => {
          const info = await fetchNasdaqQuoteInfo(symbol);
          return {
            id: symbol,
            name: info?.companyName || symbol,
            url: `https://www.nasdaq.com/market-activity/stocks/${symbol.toLowerCase()}`,
            exchange: info?.exchange || "US Exchange",
          };
        }));
        return res.json({ success: true, data: normalizeCompanySearchResults(rows) });
      }

      const strategyUrls: Record<string, string> = {
        'VALUE_BUYS': 'https://www.screener.in/screens/184/value-stocks/',
        'QGLP_FRAMEWORK': 'https://www.screener.in/screens/234/bluest-of-the-blue-chips/',
        'SMILE_FRAMEWORK': 'https://www.screener.in/screens/1/the-bull-cartel/',
        'HIGH_ROE_GROWTH': 'https://www.screener.in/screens/178/growth-stocks/',
        'MULTIBAGGER_SIGNAL': 'https://www.screener.in/screens/60880/multibagger-stocks/',
        'LOW_ROE_HIGH_GROWTH': 'https://www.screener.in/screens/49/loss-to-profit-companies/',
        'STABLE_MED_GROWTH': 'https://www.screener.in/screens/57601/coffee-can-portfolio/',
        'STABLE_LOW_GROWTH': 'https://www.screener.in/screens/3/highest-dividend-yield-shares/',
        'GARP': 'https://www.screener.in/screens/178/growth-stocks/'
      };

      const targetUrl = strategyUrls[id];
      if (!targetUrl) {
        return res.status(400).json({ success: false, error: "Invalid scanner ID" });
      }

      console.log(`[Scanner] Fetching public screen for: ${id} from ${targetUrl}`);

      const response = await axios.get(targetUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html",
          "Referer": "https://www.screener.in/"
        }
      });

      const $ = cheerio.load(response.data);
      const results: any[] = [];

      $('table.data-table tbody tr').each((_, el) => {
        const row = $(el);
        const nameLink = row.find('td a').first();
        const name = nameLink.text().trim();
        const url = nameLink.attr('href');
        
        if (name && url) {
          // Extract a unique ID from the URL (e.g., /company/RELIANCE/consolidated/ -> RELIANCE_consolidated)
          const uniqueId = url.split('/').filter(Boolean).filter(p => p !== 'company').join('_');

          results.push({
            id: uniqueId || Math.random().toString(36).substr(2, 9),
            name,
            url,
            exchange: "NSE/BSE"
          });
        }
      });

      if (results.length === 0) {
        console.warn(`[Scanner] No results found for ${id}. HTML might have changed or access restricted.`);
      }

      console.log(`[Scanner] Found ${results.length} companies for ${id}`);
      res.json({ success: true, data: normalizeCompanySearchResults(results.slice(0, 20)) });
    } catch (error: any) {
      console.error("Error fetching scanner results:", error.message);
      res.status(500).json({ success: false, error: "Failed to fetch scanner results" });
    }
  });

  // Fetch Company Fundamentals (Real-time from Screener.in or Yahoo Finance)
  app.get("/api/company/fundamentals", async (req, res) => {
    try {
      const { url, country } = req.query;
      const reportType = (String(req.query.reportType || "standard").toLowerCase() as ReportType);
      const normalizedReportType: ReportType = reportType === "deep" || reportType === "quick" ? reportType : "standard";
      if (!url || typeof url !== "string") {
        console.error("[Fundamentals] Missing URL parameter");
        return res.status(400).json({ success: false, error: "URL is required" });
      }

      if (country === 'US') {
        const symbol = parseUsSymbol(url);
        if (!symbol) throw new Error("Invalid US symbol or URL");
        const sec = await fetchUsSecProfileAndSeries(symbol);
        const quote = await fetchNasdaqQuoteInfo(symbol);
        const marketCap = quote?.keyStats?.marketCap?.value || "N/A";
        const currentPriceNum = parseNasdaqMoneyToNumber(quote?.primaryData?.lastSalePrice || quote?.secondaryData?.lastSalePrice);
        const peRatio = quote?.keyStats?.peRatio?.value || "N/A";
        const fundamentals = [
          { name: "Market Cap", value: marketCap },
          { name: "Current Price", value: currentPriceNum != null ? currentPriceNum.toFixed(2) : "N/A" },
          { name: "Stock P/E", value: peRatio },
          { name: "Book Value", value: "N/A" },
          { name: "Dividend Yield", value: "N/A" },
          { name: "ROCE", value: "N/A" },
          { name: "ROE", value: "N/A" },
          { name: "Face Value", value: "N/A" },
          { name: "Latest Annual Revenue (USD)", value: sec.latestAnnualRevenue != null ? (sec.latestAnnualRevenue / 1_000_000).toFixed(2) + " M" : "N/A" },
          { name: "Latest Annual Net Income (USD)", value: sec.latestAnnualNetIncome != null ? (sec.latestAnnualNetIncome / 1_000_000).toFixed(2) + " M" : "N/A" },
        ];
        const recentAnnouncements = await fetchSecFilingsForTicker(symbol, 10, "sec_fund_");
        const payload = normalizeCompanyFundamentals({
          name: sec.companyName || symbol,
          fundamentals,
          about: `US fundamentals sourced from SEC EDGAR (companyfacts/submissions) and Nasdaq public quote APIs. CIK: ${sec.cik}.`,
          recentAnnouncements,
        });
        if (!payload) {
          return res.status(500).json({ success: false, error: "fundamentals_contract_invalid" });
        }
        return res.json({
          success: true,
          data: payload,
        });
      }


      const targetUrl = url.startsWith("http") ? url : `https://www.screener.in${url}`;
      console.log(`[Fundamentals] Fetching: ${targetUrl}`);
      
      let response;
      try {
        response = await axios.get(targetUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Referer": "https://www.screener.in/",
            "Cache-Control": "no-cache",
            "Pragma": "no-cache"
          },
          timeout: 15000,
          maxRedirects: 5
        });
      } catch (axiosError: any) {
        console.error(`[Fundamentals] Axios error for ${targetUrl}:`, axiosError.message);
        if (axiosError.response?.status === 404) {
          return res.status(404).json({ success: false, error: "Company page not found on Screener.in" });
        }
        if (axiosError.response?.status === 403) {
          return res.status(403).json({ success: false, error: "Access to Screener.in was blocked. Please try again later." });
        }
        throw axiosError; // Re-throw to be caught by the outer catch block
      }

      if (!response.data || typeof response.data !== 'string') {
        throw new Error("Invalid or empty response from Screener.in");
      }

      const $ = cheerio.load(response.data);
      const fundamentals: Array<{ name: string; value: string }> = [];
      
      $('#top-ratios li').each((_, el) => {
        const name = $(el).find('.name').text().trim();
        const value = $(el).find('.value').text().trim().replace(/\s+/g, ' ');
        if (name && value) {
          fundamentals.push({ name, value });
        }
      });

      const about = $('.company-profile .sub').text().trim() || $('.company-profile p').text().trim();
      const name = $('h1.show-from-tablet-landscape').text().trim() || $('h1').first().text().trim();

      // Extract BSE Symbol
      let bseSymbol = null;
      const pageText = response.data;
      const bseMatch = pageText.match(/BSE:\s*(\d{6})/);
      if (bseMatch && bseMatch[1]) {
        bseSymbol = bseMatch[1];
      }

      if (!name && fundamentals.length === 0) {
        console.warn(`[Fundamentals] No data found for ${targetUrl}. Possible block or layout change.`);
        throw new Error("Could not parse company data. The page layout might have changed or access is restricted.");
      }

      let recentAnnouncements: ReportAnnouncement[] = [];
      try {
        if (bseSymbol) {
          recentAnnouncements = await db.all(
            "SELECT * FROM announcements WHERE symbol = ? ORDER BY date DESC LIMIT 10", 
            [bseSymbol]
          );
        } else {
          const shortName = name.split(' ')[0];
          recentAnnouncements = await db.all(
            "SELECT * FROM announcements WHERE companyName LIKE ? ORDER BY date DESC LIMIT 10", 
            [`%${shortName}%`]
          );
        }
      } catch (dbErr) {
        console.error("Error fetching recent announcements for fundamentals:", dbErr);
      }

      console.log(`[Fundamentals] Successfully parsed data for: ${name}`);
      const payload = normalizeCompanyFundamentals({
        name,
        about,
        fundamentals,
        recentAnnouncements,
      });
      if (!payload) {
        return res.status(500).json({ success: false, error: "fundamentals_contract_invalid" });
      }
      res.json({ success: true, data: payload });
    } catch (error: any) {
      console.error("[Fundamentals] Error:", error.response?.status, error.message);
      const status = error.response?.status || 500;
      const message = error.response?.data?.error || error.message || "Failed to fetch fundamentals";
      res.status(status).json({ success: false, error: message });
    }
  });

  // Fetch Company Report (Detailed P&L + AI Analysis)
  app.get("/api/company/report", async (req, res) => {
    try {
      const { url, country } = req.query;
      const reportType = String(req.query.reportType || "standard").toLowerCase();
      const normalizedReportType: ReportType = reportType === "deep" || reportType === "quick" ? reportType : "standard";
      const includeAI = String(req.query.includeAI || "true").toLowerCase() !== "false";
      if (!url || typeof url !== "string") {
        return res.status(400).json({ success: false, error: "URL is required" });
      }

      if (country === 'US') {
        const symbol = parseUsSymbol(url);
        if (!symbol) throw new Error("Invalid US symbol or URL");
        const sec = await fetchUsSecProfileAndSeries(symbol);
        const quote = await fetchNasdaqQuoteInfo(symbol);
        const chartData = sec.annual;
        const quarterlyData = sec.quarterly;
        const recentAnnouncements = await fetchSecFilingsForTicker(symbol, 10, "sec_report_");
        const currentPriceNum = parseNasdaqMoneyToNumber(quote?.primaryData?.lastSalePrice || quote?.secondaryData?.lastSalePrice);
        const aiReport = includeAI
          ? await generateAIReport(
              sec.companyName || symbol,
              'US',
              chartData,
              quarterlyData,
              recentAnnouncements,
              currentPriceNum != null ? currentPriceNum.toFixed(2) : "N/A",
              normalizedReportType,
            )
          : "AI generation skipped for validation request.";
        const payloadRaw: CompanyReportData = {
          name: sec.companyName || symbol,
          chartData,
          quarterlyData,
          recentAnnouncements,
          aiReport,
          reportType: normalizedReportType,
          summary: {
            price: currentPriceNum != null ? currentPriceNum.toFixed(2) : "N/A",
            marketCap: quote?.keyStats?.marketCap?.value || "N/A",
            pe: quote?.keyStats?.peRatio?.value || "N/A",
            source: "SEC EDGAR + Nasdaq public APIs",
          },
        };
        const payload = normalizeCompanyReportData(payloadRaw);
        if (!payload) {
          return res.status(500).json({ success: false, error: "report_contract_invalid" });
        }
        const latestAnnouncementDate = recentAnnouncements[0]?.date ? new Date(recentAnnouncements[0].date).toISOString() : null;
        const qualityGate = assessReportQuality(payload, latestAnnouncementDate);
        if (!isQualityGateResult(qualityGate)) {
          return res.status(500).json({ success: false, error: "quality_gate_contract_invalid" });
        }
        if (qualityGate.passed) {
          await saveGeneratedReport({
            companyName: sec.companyName || symbol,
            symbol,
            country: "US",
            sourceUrl: url,
            report: payload,
          });
        }
        return res.json({ success: true, data: payload, qualityGate });
      }


      const targetUrl = url.startsWith("http") ? url : `https://www.screener.in${url}`;
      
      let response;
      try {
        response = await axios.get(targetUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Referer": "https://www.screener.in/",
            "Cache-Control": "no-cache",
            "Pragma": "no-cache"
          },
          timeout: 15000,
          maxRedirects: 5
        });
      } catch (axiosError: any) {
        console.error(`[Report] Axios error for ${targetUrl}:`, axiosError.message);
        if (axiosError.response?.status === 404) {
          return res.status(404).json({ success: false, error: "Company page not found on Screener.in" });
        }
        if (axiosError.response?.status === 403) {
          return res.status(403).json({ success: false, error: "Access to Screener.in was blocked. Please try again later." });
        }
        throw axiosError;
      }

      if (!response.data || typeof response.data !== 'string') {
        throw new Error("Invalid or empty response from Screener.in");
      }

      const parsed = parseScreenerFinancials(response.data);
      const name = parsed.name;
      const chartData = parsed.chartData;
      const quarterlyData = parsed.quarterlyData;

      // Extract BSE Symbol and fetch recent announcements
      let bseSymbol = null;
      const pageText = response.data;
      const bseMatch = pageText.match(/BSE:\s*(\d{6})/);
      if (bseMatch && bseMatch[1]) {
        bseSymbol = bseMatch[1];
      }

      let recentAnnouncements: ReportAnnouncement[] = [];
      try {
        if (bseSymbol) {
          recentAnnouncements = await db.all(
            "SELECT * FROM announcements WHERE symbol = ? AND category = 'Result' ORDER BY date DESC LIMIT 3", 
            [bseSymbol]
          );
        } else {
          const shortName = name.split(' ')[0];
          recentAnnouncements = await db.all(
            "SELECT * FROM announcements WHERE companyName LIKE ? AND category = 'Result' ORDER BY date DESC LIMIT 3", 
            [`%${shortName}%`]
          );
        }
      } catch (dbErr) {
        console.error("Error fetching recent announcements for report:", dbErr);
      }

      const aiReport = includeAI
        ? await generateAIReport(
            name,
            'IN',
            chartData,
            quarterlyData,
            recentAnnouncements,
            "N/A",
            normalizedReportType,
          )
        : "AI generation skipped for validation request.";

      const payloadRaw: CompanyReportData = {
        name,
        chartData,
        quarterlyData,
        recentAnnouncements,
        aiReport,
        reportType: normalizedReportType,
        parsingWarnings: parsed.parsingWarnings,
      };
      const payload = normalizeCompanyReportData(payloadRaw);
      if (!payload) {
        return res.status(500).json({ success: false, error: "report_contract_invalid" });
      }
      const latestAnnouncementDate = recentAnnouncements[0]?.date || null;
      const qualityGate = assessReportQuality(payload, latestAnnouncementDate);
      if (!isQualityGateResult(qualityGate)) {
        return res.status(500).json({ success: false, error: "quality_gate_contract_invalid" });
      }
      if (parsed.parsingWarnings.length) {
        qualityGate.missingComponents.push(...parsed.parsingWarnings);
      }
      if (qualityGate.passed) {
        await saveGeneratedReport({
          companyName: name,
          symbol: bseSymbol || null,
          country: "IN",
          sourceUrl: targetUrl,
          report: payload,
        });
      }
      res.json({ success: true, data: payload, qualityGate });
    } catch (error: any) {
      console.error("[Report] Error:", error.response?.status, error.message);
      const status = error.response?.status || 500;
      const message = error.response?.data?.error || error.message || "Failed to generate report";
      res.status(status).json({ success: false, error: message });
    }
  });

  app.get("/api/company/price-history", async (req, res) => {
    try {
      const { url, country, symbol } = req.query;
      if (!url || typeof url !== "string") {
        return res.status(400).json({ success: false, error: "URL is required" });
      }

      let resolvedSymbol: string | null = null;
      if (country === "US") {
        const hinted = typeof symbol === "string" ? symbol.trim().toUpperCase() : "";
        if (hinted) resolvedSymbol = hinted;
        else {
          resolvedSymbol = parseUsSymbol(url);
        }
      } else {
        resolvedSymbol = resolveIndianExchangeSymbol(url, typeof symbol === "string" ? symbol : null);
      }

      if (!resolvedSymbol) {
        return res.status(404).json({ success: false, error: "Could not resolve quote symbol for price history" });
      }

      const candles = country === "US"
        ? await fetchNasdaqDailyHistory(resolvedSymbol, format(subDays(new Date(), 365 * 5), "yyyy-MM-dd"))
        : await fetchIndianDailySeriesFromExchanges(resolvedSymbol, format(subDays(new Date(), 365 * 5), "yyyy-MM-dd"));
      const payload = normalizePriceHistoryData({
        symbol: resolvedSymbol,
        candles,
      });
      if (!payload) {
        return res.status(500).json({ success: false, error: "price_history_contract_invalid" });
      }
      return res.json({ success: true, data: payload });
    } catch (error: any) {
      console.error("[PriceHistory] Error:", error.response?.status, error.message);
      const status = error.response?.status || 500;
      const message = error.response?.data?.error || error.message || "Failed to fetch price history";
      return res.status(status).json({ success: false, error: message });
    }
  });

  app.get("/api/company/snapshot", async (req, res) => {
    try {
      const { url, country } = req.query;
      if (!url || typeof url !== "string") {
        return res.status(400).json({ success: false, error: "URL is required" });
      }

      // For snapshot, we'll fetch the data and generate a quick summary
      // We'll reuse the logic from /api/company/report but only return the snapshot
      
      let name = "";
      let chartData: ReportChartRow[] = [];
      let quarterlyData: ReportQuarterlyRow[] = [];
      let recentAnnouncements: ReportAnnouncement[] = [];

      if (country === 'US') {
        const symbol = parseUsSymbol(url);
        if (!symbol) throw new Error("Invalid US symbol or URL");
        const sec = await fetchUsSecProfileAndSeries(symbol);
        name = sec.companyName || symbol;
        chartData = sec.annual;
        quarterlyData = sec.quarterly;
        try {
          recentAnnouncements = await fetchSecFilingsForTicker(symbol, 5, "sec_snap_");
        } catch (e: any) {
          console.warn("[Snapshot] SEC filings:", e.message);
        }


      } else {
        // India logic
        const targetUrl = url.startsWith("http") ? url : `https://www.screener.in${url}`;
        const response = await axios.get(targetUrl, {
          headers: { "User-Agent": USER_AGENTS[0] },
          timeout: 10000
        });
        const parsed = parseScreenerFinancials(response.data);
        name = parsed.name;
        chartData = parsed.chartData;
        quarterlyData = parsed.quarterlyData;

        // BSE Announcements
        const bseMatch = response.data.match(/BSE:\s*(\d{6})/);
        if (bseMatch && bseMatch[1]) {
          recentAnnouncements = await db.all(
            "SELECT subject FROM announcements WHERE symbol = ? AND category = 'Result' ORDER BY date DESC LIMIT 3", 
            [bseMatch[1]]
          );
        }
      }

      const snapshot = await generateQuickSnapshot(name, country as string, chartData, quarterlyData, recentAnnouncements);
      const snapshotPayload = { name, snapshot };
      if (!isCompanySnapshotData(snapshotPayload)) {
        return res.status(500).json({ success: false, error: "snapshot_contract_invalid" });
      }
      res.json({ success: true, data: snapshotPayload });

    } catch (error: any) {
      console.error("[Snapshot] Error:", error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get("/api/strategy-portfolios", (_req, res) => {
    res.json({ success: true, data: STRATEGY_PORTFOLIOS });
  });

  app.get("/api/strategy-portfolio/performance", async (req, res) => {
    try {
      const startDate = req.query.startDate as string | undefined;
      const symbolsParam = req.query.symbols as string | undefined;
      if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
        return res.status(400).json({ success: false, error: "Query startDate=YYYY-MM-DD is required" });
      }
      if (!symbolsParam?.trim()) {
        return res.status(400).json({ success: false, error: "Query symbols is required (comma-separated symbols)" });
      }
      const symbols = symbolsParam.split(",").map((s) => s.trim()).filter(Boolean);
      if (symbols.length > 48) {
        return res.status(400).json({ success: false, error: "Too many symbols (max 48)" });
      }

      const rows: Array<any> = [];
      for (const symbol of symbols) {
        const cached = await db.get("SELECT payloadJson FROM strategy_perf_cache WHERE symbol = ? AND startDate = ?", [symbol, startDate]);
        if (cached?.payloadJson) {
          rows.push(JSON.parse(cached.payloadJson));
          continue;
        }
        try {
          const isIndian = /\.NS$|\.BO$/i.test(symbol);
          const candles = isIndian
            ? await fetchIndianDailySeriesFromExchanges(symbol, format(subDays(new Date(startDate), 14), "yyyy-MM-dd"))
            : await fetchNasdaqDailyHistory(symbol, format(subDays(new Date(startDate), 14), "yyyy-MM-dd"));
          const closes: Array<number | null> = candles.map((c) => c.close);
          let entryIdx = -1;
          for (let i = 0; i < candles.length; i++) {
            const d = candles[i].date;
            const c = closes[i];
            if (c != null && Number.isFinite(c) && d >= startDate) { entryIdx = i; break; }
          }
          let lastIdx = -1;
          for (let i = closes.length - 1; i >= 0; i--) {
            const c = closes[i];
            if (c != null && Number.isFinite(c)) { lastIdx = i; break; }
          }
          if (entryIdx < 0 || lastIdx < 0) {
            const out = { symbol, entryDate: null, entryPrice: null, lastDate: null, lastPrice: null, returnPct: null, error: "no_data" };
            rows.push(out);
            await db.run("INSERT OR REPLACE INTO strategy_perf_cache (symbol, startDate, payloadJson, createdAt) VALUES (?, ?, ?, ?)", [symbol, startDate, JSON.stringify(out), new Date().toISOString()]);
          } else {
            const entryPrice = Number(closes[entryIdx]);
            const lastPrice = Number(closes[lastIdx]);
            const out = {
              symbol,
              entryDate: candles[entryIdx].date,
              entryPrice,
              lastDate: candles[lastIdx].date,
              lastPrice,
              returnPct: entryPrice > 0 ? ((lastPrice / entryPrice) - 1) * 100 : null,
            };
            rows.push(out);
            await db.run("INSERT OR REPLACE INTO strategy_perf_cache (symbol, startDate, payloadJson, createdAt) VALUES (?, ?, ?, ?)", [symbol, startDate, JSON.stringify(out), new Date().toISOString()]);
          }
        } catch (e: any) {
          const out = { symbol, entryDate: null, entryPrice: null, lastDate: null, lastPrice: null, returnPct: null, error: e.message || "fetch_failed" };
          rows.push(out);
          await db.run("INSERT OR REPLACE INTO strategy_perf_cache (symbol, startDate, payloadJson, createdAt) VALUES (?, ?, ?, ?)", [symbol, startDate, JSON.stringify(out), new Date().toISOString()]);
        }
      }
      const ok = rows.filter((r) => r.returnPct != null);
      const equalWeightReturnPct = ok.length ? ok.reduce((sum, r) => sum + r.returnPct, 0) / ok.length : null;
      res.json({
        success: true,
        data: {
          startDate,
          timezoneNote: "Entry price uses first available daily close on/after selected date (IST date input).",
          asOf: new Date().toISOString(),
          equalWeightReturnPct,
          countOk: ok.length,
          countTotal: rows.length,
          symbols: rows,
        },
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message || "performance_failed" });
    }
  });

  app.get("/api/reports/saved", async (req, res) => {
    try {
      const { country, symbol, limit = "50" } = req.query as Record<string, string>;
      const where: string[] = [];
      const params: any[] = [];
      if (country) {
        where.push("country = ?");
        params.push(country);
      }
      if (symbol) {
        where.push("symbol = ?");
        params.push(symbol);
      }
      const lim = Math.min(200, Math.max(1, Number(limit) || 50));
      const query = `
        SELECT id, companyName, symbol, country, sourceUrl, createdAt
        FROM saved_reports
        ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
        ORDER BY datetime(createdAt) DESC
        LIMIT ${lim}
      `;
      const rows = await db.all(query, params);
      res.json({ success: true, data: normalizeSavedReportList(rows) });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message || "failed_to_list_saved_reports" });
    }
  });

  app.get("/api/reports/saved/:id", async (req, res) => {
    try {
      const row = await db.get("SELECT * FROM saved_reports WHERE id = ?", [req.params.id]);
      if (!row) return res.status(404).json({ success: false, error: "report_not_found" });
      const detail = normalizeSavedReportDetail({
        id: row.id,
        companyName: row.companyName,
        symbol: row.symbol,
        country: row.country,
        sourceUrl: row.sourceUrl,
        createdAt: row.createdAt,
        report: JSON.parse(row.reportJson),
      });
      if (!detail) {
        return res.status(500).json({ success: false, error: "saved_report_contract_invalid" });
      }
      res.json({
        success: true,
        data: detail,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message || "failed_to_get_saved_report" });
    }
  });

  app.get("/api/reports/score/:id", async (req, res) => {
    try {
      const row = await db.get<{ reportJson: string; createdAt: string; country: string }>(
        "SELECT reportJson, createdAt, country FROM saved_reports WHERE id = ?",
        [req.params.id]
      );
      if (!row) return res.status(404).json({ success: false, error: "report_not_found" });
      const parsed = normalizeCompanyReportData(JSON.parse(row.reportJson));
      const quality = assessReportQuality(parsed, parsed.recentAnnouncements?.[0]?.date || null);
      const scorecard = buildReportScorecard(parsed, quality);
      const symbolRow = await db.get<{ symbol: string | null }>("SELECT symbol FROM saved_reports WHERE id = ?", [req.params.id]);
      const symbol = String(symbolRow?.symbol || parsed.name).toUpperCase();
      const recommendation = buildRecommendationFromScore({
        reportId: Number(req.params.id),
        symbol,
        country: row.country === "US" ? "US" : "IN",
        scorecard,
      });
      const recommendationId = await saveRecommendation(recommendation);
      return res.json({
        success: true,
        data: {
          reportId: Number(req.params.id),
          country: row.country,
          createdAt: row.createdAt,
          quality,
          scorecard,
          recommendationId,
        },
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message || "score_failed" });
    }
  });

  app.post("/api/recommendations", async (req, res) => {
    try {
      const symbol = String(req.body?.symbol || "").trim().toUpperCase();
      const country = String(req.body?.country || "IN").trim().toUpperCase() === "US" ? "US" : "IN";
      const recommendationAction = String(req.body?.recommendationAction || "watch").toLowerCase();
      const confidencePct = Number(req.body?.confidencePct || 50);
      const horizonDays = Number(req.body?.horizonDays || 90);
      const riskClass = String(req.body?.riskClass || "medium").toLowerCase();
      const explainability = req.body?.explainability || { positive: [], negative: [], caveats: [] };
      const scoreSnapshot = req.body?.scoreSnapshot || { totalScore: 50, verdict: "watch", breakdown: { quality: 50, valuation: 50, momentum: 50, risk: 50 } };
      const policyVersion = String(req.body?.policyVersion || "rules_v1");
      if (!symbol) return res.status(400).json({ success: false, error: "symbol_required" });
      if (!["buy", "watch", "avoid"].includes(recommendationAction)) return res.status(400).json({ success: false, error: "invalid_recommendation_action" });
      if (!["low", "medium", "high"].includes(riskClass)) return res.status(400).json({ success: false, error: "invalid_risk_class" });
      const id = await saveRecommendation({
        reportId: req.body?.reportId != null ? Number(req.body.reportId) : null,
        symbol,
        country,
        recommendationAction: recommendationAction as "buy" | "watch" | "avoid",
        confidencePct: Math.max(0, Math.min(100, confidencePct)),
        horizonDays: Math.max(1, horizonDays),
        riskClass: riskClass as "low" | "medium" | "high",
        explainability,
        scoreSnapshot,
        policyVersion,
      });
      return res.json({ success: true, data: { id } });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message || "recommendation_create_failed" });
    }
  });

  app.get("/api/recommendations/:id(\\d+)", async (req, res) => {
    try {
      const row = await db.get<{
        id: number;
        reportId: number | null;
        symbol: string;
        country: string;
        recommendationAction: string;
        confidencePct: number;
        horizonDays: number;
        riskClass: string;
        explainabilityJson: string;
        scoreSnapshotJson: string;
        policyVersion: string;
        createdAt: string;
      }>("SELECT * FROM recommendations WHERE id = ?", [req.params.id]);
      if (!row) return res.status(404).json({ success: false, error: "recommendation_not_found" });
      return res.json({
        success: true,
        data: {
          id: row.id,
          reportId: row.reportId,
          symbol: row.symbol,
          country: row.country,
          recommendationAction: row.recommendationAction,
          confidencePct: row.confidencePct,
          horizonDays: row.horizonDays,
          riskClass: row.riskClass,
          explainability: JSON.parse(row.explainabilityJson || "{}"),
          scoreSnapshot: JSON.parse(row.scoreSnapshotJson || "{}"),
          policyVersion: row.policyVersion,
          createdAt: row.createdAt,
        },
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message || "recommendation_fetch_failed" });
    }
  });

  app.post("/api/recommendations/:id(\\d+)/actions", async (req, res) => {
    try {
      const recommendationId = Number(req.params.id);
      const actionType = String(req.body?.actionType || "").trim().toLowerCase();
      const actorType = String(req.body?.actorType || "system").trim().toLowerCase();
      if (!Number.isFinite(recommendationId) || recommendationId <= 0) {
        return res.status(400).json({ success: false, error: "invalid_recommendation_id" });
      }
      if (!actionType) return res.status(400).json({ success: false, error: "action_type_required" });
      const row = await db.get<{ id: number }>("SELECT id FROM recommendations WHERE id = ?", [recommendationId]);
      if (!row) return res.status(404).json({ success: false, error: "recommendation_not_found" });
      const inserted = await db.run(
        `INSERT INTO recommendation_actions
         (recommendationId, actionType, actorType, actorId, executionPrice, executionDate, sizeValue, notes, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          recommendationId,
          actionType,
          actorType,
          req.body?.actorId ? String(req.body.actorId) : null,
          req.body?.executionPrice != null ? Number(req.body.executionPrice) : null,
          req.body?.executionDate ? String(req.body.executionDate) : null,
          req.body?.sizeValue != null ? Number(req.body.sizeValue) : null,
          req.body?.notes ? String(req.body.notes) : null,
          new Date().toISOString(),
        ]
      );
      return res.json({ success: true, data: { id: inserted.lastID } });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message || "recommendation_action_failed" });
    }
  });

  app.post("/api/reports/outcomes/refresh", requireAdmin, async (req, res) => {
    try {
      const runAsync = String(req.body?.async || "true") !== "false";
      const payload = {
        country: String(req.body?.country || "").trim().toUpperCase(),
        horizons: Array.isArray(req.body?.horizons) ? req.body.horizons : [30, 90, 180],
        limit: Number(req.body?.limit || 120),
      };
      if (!runAsync) {
        const result = await refreshOutcomes(payload);
        return res.json({ success: true, data: result });
      }
      const jobId = `out_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const job: OutcomeRefreshJob = {
        id: jobId,
        createdAt: new Date().toISOString(),
        startedAt: null,
        finishedAt: null,
        status: "queued",
        input: {
          country: payload.country,
          horizons: payload.horizons.map((h: unknown) => Number(h)).filter((n) => Number.isFinite(n) && n > 0),
          limit: Math.min(300, Math.max(1, Number(payload.limit || 120))),
        },
      };
      outcomeJobs.set(jobId, job);
      outcomeQueue.push(jobId);
      metrics.queueEnqueued += 1;
      await updateJobRow(job);
      void drainOutcomeQueue();
      return res.status(202).json({ success: true, data: { jobId, status: "queued" } });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message || "refresh_outcomes_failed" });
    }
  });

  app.get("/api/reports/outcomes/jobs/:jobId", requireAdmin, (req, res) => {
    const memJob = outcomeJobs.get(String(req.params.jobId || ""));
    if (memJob) return res.json({ success: true, data: memJob });
    db.get(
      "SELECT * FROM jobs WHERE id = ?",
      [String(req.params.jobId || "")]
    ).then((jobRow: any) => {
      if (!jobRow) return res.status(404).json({ success: false, error: "job_not_found" });
      return res.json({
        success: true,
        data: {
          id: jobRow.id,
          status: jobRow.status,
          input: JSON.parse(jobRow.inputJson || "{}"),
          result: jobRow.resultJson ? JSON.parse(jobRow.resultJson) : undefined,
          error: jobRow.error || undefined,
          createdAt: jobRow.createdAt,
          startedAt: jobRow.startedAt,
          finishedAt: jobRow.finishedAt,
        },
      });
    }).catch((e: any) => res.status(500).json({ success: false, error: e.message || "job_fetch_failed" }));
  });

  app.get("/api/reports/outcomes", async (req, res) => {
    try {
      const country = String(req.query.country || "").trim().toUpperCase();
      const horizonDays = Number(req.query.horizonDays || 90);
      if (!Number.isFinite(horizonDays) || horizonDays <= 0) {
        return res.status(400).json({ success: false, error: "horizonDays must be a positive number" });
      }
      const rows: Array<{ returnPct: number | null; status: string; country: string }> = await db.all(
        `SELECT returnPct, status, country
         FROM report_outcomes
         WHERE horizonDays = ?
         ${country ? "AND country = ?" : ""}`,
        country ? [horizonDays, country] : [horizonDays]
      );
      const usable = rows.filter((r) => r.status === "ok" && r.returnPct != null);
      const hitRatePct = usable.length
        ? (usable.filter((r) => Number(r.returnPct) > 0).length / usable.length) * 100
        : null;
      const avgReturnPct = usable.length
        ? usable.reduce((s, r) => s + Number(r.returnPct), 0) / usable.length
        : null;
      return res.json({
        success: true,
        data: {
          horizonDays,
          country: country || "ALL",
          totalRows: rows.length,
          usableRows: usable.length,
          hitRatePct,
          avgReturnPct,
          asOf: new Date().toISOString(),
        },
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message || "outcomes_failed" });
    }
  });

  app.get("/api/recommendations-calibration", async (req, res) => {
    try {
      const windowDays = Number(req.query.windowDays || 180);
      if (!Number.isFinite(windowDays) || windowDays <= 0) {
        return res.status(400).json({ success: false, error: "windowDays must be a positive number" });
      }
      const data = await computeRecommendationCalibration(windowDays);
      return res.json({ success: true, data });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message || "recommendation_calibration_failed" });
    }
  });

  app.get("/api/company/thesis", async (req, res) => {
    try {
      const symbol = String(req.query.symbol || "").trim().toUpperCase();
      const country = String(req.query.country || "IN").trim().toUpperCase() === "US" ? "US" : "IN";
      if (!symbol) return res.status(400).json({ success: false, error: "symbol_required" });
      const row = await db.get<{
        symbol: string;
        country: string;
        thesis: string;
        invalidationTriggersJson: string;
        status: string;
        invalidatedReason: string | null;
        invalidatedAt: string | null;
        updatedAt: string;
      }>(
        `SELECT symbol, country, thesis, invalidationTriggersJson, status, invalidatedReason, invalidatedAt, updatedAt
         FROM company_thesis_memory WHERE symbol = ? AND country = ?`,
        [symbol, country]
      );
      if (!row) return res.status(404).json({ success: false, error: "thesis_not_found" });
      return res.json({
        success: true,
        data: {
          symbol: row.symbol,
          country: row.country,
          thesis: row.thesis,
          invalidationTriggers: JSON.parse(row.invalidationTriggersJson || "[]"),
          status: row.status,
          invalidatedReason: row.invalidatedReason,
          invalidatedAt: row.invalidatedAt,
          updatedAt: row.updatedAt,
        },
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message || "thesis_fetch_failed" });
    }
  });

  app.post("/api/company/thesis", requireAdmin, async (req, res) => {
    try {
      const symbol = String(req.body?.symbol || "").trim().toUpperCase();
      const country = String(req.body?.country || "IN").trim().toUpperCase() === "US" ? "US" : "IN";
      const thesis = String(req.body?.thesis || "").trim();
      const triggers = Array.isArray(req.body?.invalidationTriggers)
        ? req.body.invalidationTriggers.map((t: unknown) => String(t).trim()).filter(Boolean)
        : [];
      if (!symbol || !thesis) return res.status(400).json({ success: false, error: "symbol_and_thesis_required" });
      await db.run(
        `INSERT INTO company_thesis_memory
         (symbol, country, thesis, invalidationTriggersJson, status, invalidatedReason, invalidatedAt, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, 'active', NULL, NULL, ?, ?)
         ON CONFLICT(symbol, country) DO UPDATE SET
           thesis=excluded.thesis,
           invalidationTriggersJson=excluded.invalidationTriggersJson,
           status='active',
           invalidatedReason=NULL,
           invalidatedAt=NULL,
           updatedAt=excluded.updatedAt`,
        [symbol, country, thesis, JSON.stringify(triggers), new Date().toISOString(), new Date().toISOString()]
      );
      return res.json({ success: true, data: { symbol, country, thesis, invalidationTriggers: triggers } });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message || "thesis_save_failed" });
    }
  });

  app.post("/api/company/thesis/invalidate", requireAdmin, async (req, res) => {
    try {
      const symbol = String(req.body?.symbol || "").trim().toUpperCase();
      const country = String(req.body?.country || "IN").trim().toUpperCase() === "US" ? "US" : "IN";
      const reason = String(req.body?.reason || "manual_invalidation").trim();
      if (!symbol) return res.status(400).json({ success: false, error: "symbol_required" });
      const updated = await db.run(
        `UPDATE company_thesis_memory
         SET status = 'invalidated', invalidatedReason = ?, invalidatedAt = ?, updatedAt = ?
         WHERE symbol = ? AND country = ?`,
        [reason, new Date().toISOString(), new Date().toISOString(), symbol, country]
      );
      if (!updated.changes) return res.status(404).json({ success: false, error: "thesis_not_found" });
      return res.json({ success: true, data: { symbol, country, reason } });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message || "thesis_invalidate_failed" });
    }
  });

  app.post("/api/portfolio/position-sizing", async (req, res) => {
    try {
      const capital = Number(req.body?.capital || 0);
      const riskBudgetPct = Number(req.body?.riskBudgetPct || 1);
      const stopLossPct = Number(req.body?.stopLossPct || 8);
      const candidates = Array.isArray(req.body?.candidates)
        ? req.body.candidates.map((c: unknown) => ({
            symbol: String((c as Record<string, unknown>)?.symbol || "").trim().toUpperCase(),
            score: Number((c as Record<string, unknown>)?.score || 50),
          })).filter((c: { symbol: string; score: number }) => c.symbol)
        : [];
      if (!Number.isFinite(capital) || capital <= 0 || !candidates.length) {
        return res.status(400).json({ success: false, error: "invalid_position_sizing_input" });
      }
      const cappedRiskBudgetPct = Math.min(5, Math.max(0.25, riskBudgetPct));
      const cappedStopLossPct = Math.min(25, Math.max(2, stopLossPct));
      const totalRiskCapital = capital * (cappedRiskBudgetPct / 100);
      const scoreSum = candidates.reduce((s: number, c: { score: number }) => s + Math.max(1, c.score), 0);
      const suggestions = candidates.map((c: { symbol: string; score: number }) => {
        const weight = Math.max(1, c.score) / scoreSum;
        const riskForName = totalRiskCapital * weight;
        const maxPositionValue = riskForName / (cappedStopLossPct / 100);
        return {
          symbol: c.symbol,
          score: c.score,
          targetWeightPct: Number((weight * 100).toFixed(2)),
          maxPositionValue: Number(maxPositionValue.toFixed(2)),
          riskCapital: Number(riskForName.toFixed(2)),
        };
      });
      return res.json({
        success: true,
        data: {
          capital,
          riskBudgetPct: cappedRiskBudgetPct,
          stopLossPct: cappedStopLossPct,
          rebalanceCadenceDays: 30,
          suggestions,
        },
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message || "position_sizing_failed" });
    }
  });

  app.get("/api/metrics", requireAdmin, async (_req, res) => {
    const queueDepth = outcomeQueue.length;
    const runningJobs = Array.from(outcomeJobs.values()).filter((j) => j.status === "running").length;
    const queuedJobs = Array.from(outcomeJobs.values()).filter((j) => j.status === "queued").length;
    const persistedJobs = await db.get<{ total: number; queued: number; running: number; failed: number; completed: number }>(
      `SELECT
         COUNT(*) as total,
         SUM(CASE WHEN status='queued' THEN 1 ELSE 0 END) as queued,
         SUM(CASE WHEN status='running' THEN 1 ELSE 0 END) as running,
         SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) as failed,
         SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed
       FROM jobs`
    );
    return res.json({
      success: true,
      data: {
        ...metrics,
        queueDepth,
        runningJobs,
        queuedJobs,
        persistedJobs: persistedJobs || { total: 0, queued: 0, running: 0, failed: 0, completed: 0 },
        asOf: new Date().toISOString(),
      },
    });
  });

  app.get("/api/portfolio/holding-metrics", async (req, res) => {
    try {
      const symbol = String(req.query.symbol || "").trim();
      const purchaseDate = String(req.query.purchaseDate || "").trim();
      const quantity = Number(req.query.quantity || 0);
      if (!symbol || !purchaseDate || !/^\d{4}-\d{2}-\d{2}$/.test(purchaseDate)) {
        return res.status(400).json({ success: false, error: "symbol and purchaseDate(YYYY-MM-DD) are required" });
      }
      const isIndian = /\.NS$|\.BO$/i.test(symbol);
      const series = isIndian
        ? await fetchIndianDailySeriesFromExchanges(
            symbol,
            format(subDays(new Date(purchaseDate), 10), "yyyy-MM-dd")
          )
        : await fetchNasdaqDailyHistory(symbol, format(subDays(new Date(purchaseDate), 10), "yyyy-MM-dd"));
      if (!series.length) return res.status(404).json({ success: false, error: "no_price_series" });
      const entry = series.find((c) => c.date >= purchaseDate) || series[0];
      const current = series[series.length - 1];
      const prev = series.length > 1 ? series[series.length - 2] : current;
      const purchasePrice = entry.close;
      const currentPrice = current.close;
      const investmentValue = quantity > 0 ? quantity * purchasePrice : null;
      const marketValue = quantity > 0 ? quantity * currentPrice : null;
      const dailyPctGain = prev.close > 0 ? ((currentPrice / prev.close) - 1) * 100 : null;
      const totalPctGain = purchasePrice > 0 ? ((currentPrice / purchasePrice) - 1) * 100 : null;
      res.json({
        success: true,
        data: {
          symbol,
          purchaseDate: entry.date,
          purchasePrice,
          currentDate: current.date,
          currentPrice,
          quantity: quantity > 0 ? quantity : null,
          investmentValue,
          marketValue,
          dailyPctGain,
          totalPctGain,
        },
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message || "holding_metrics_failed" });
    }
  });

  app.get("/api/company/validate-recency", async (req, res) => {
    try {
      const { url, country, symbol } = req.query as Record<string, string>;
      if (!url) return res.status(400).json({ success: false, error: "url is required" });
      let resolvedSymbol = symbol;
      if (!resolvedSymbol) {
        if (country === "US") resolvedSymbol = (url.match(/\/quote\/([^\/\?]+)/)?.[1] || "").toUpperCase();
        else resolvedSymbol = resolveIndianExchangeSymbol(url) || "";
      }
      if (!resolvedSymbol) return res.status(404).json({ success: false, error: "symbol_not_resolved" });
      let latestAnnouncementDate: string | null = null;
      if (country === "US") {
        const filings = await fetchSecFilingsForTicker(resolvedSymbol, 5, "sec_val_");
        latestAnnouncementDate = filings[0]?.date ? new Date(filings[0].date).toISOString() : null;
      } else {
        const row = await db.get(
          "SELECT date FROM announcements WHERE symbol = ? ORDER BY datetime(date) DESC LIMIT 1",
          [resolvedSymbol.replace(/\.NS$|\.BO$/i, "")]
        );
        latestAnnouncementDate = row?.date || null;
      }
      const payload = normalizeRecencyValidationData({
        symbol: resolvedSymbol,
        latestAnnouncementDate,
        checkedAt: new Date().toISOString(),
      });
      if (!payload) {
        return res.status(500).json({ success: false, error: "recency_contract_invalid" });
      }
      res.json({ success: true, data: payload });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message || "validate_recency_failed" });
    }
  });

  app.get("/api/company/judge", async (req, res) => {
    try {
      const { url, country, symbol } = req.query as Record<string, string>;
      if (!url) return res.status(400).json({ success: false, error: "url is required" });
      let report: CompanyReportData | null = null;
      let reportSource = "live";
      try {
        const normalizedUrl = url.startsWith("http") ? url : `https://www.screener.in${url}`;
        const cached = await db.get(
          "SELECT reportJson FROM saved_reports WHERE country = ? AND sourceUrl = ? ORDER BY datetime(createdAt) DESC LIMIT 1",
          [country || "IN", normalizedUrl]
        );
        if (cached?.reportJson) {
          report = JSON.parse(cached.reportJson) as CompanyReportData;
          reportSource = "saved";
        } else {
          const reportResp = await axios.get(`http://127.0.0.1:${PORT}/api/company/report`, {
            params: { url, country, includeAI: "false", reportType: "quick" },
            timeout: 25000,
          });
          report = (reportResp.data?.data || null) as CompanyReportData | null;
        }
      } catch (reportErr: any) {
        console.warn("[Judge] Report fetch failed, proceeding with partial validation:", reportErr.message);
      }
      const safeReport: CompanyReportData = report || {
        name: "Unknown",
        chartData: [],
        quarterlyData: [],
        recentAnnouncements: [],
        aiReport: "",
        reportType: "quick",
      };
      const valResp = await axios.get(`http://127.0.0.1:${PORT}/api/company/validate-recency`, {
        params: { url, country, symbol },
        timeout: 12000,
      });
      const latestAnnouncementDate = valResp.data?.data?.latestAnnouncementDate || null;
      const qualityGate = assessReportQuality(safeReport, latestAnnouncementDate);
      const payload = normalizeJudgeValidationData({
        ...qualityGate,
        hasRecentAnnouncements: Array.isArray(safeReport.recentAnnouncements) && safeReport.recentAnnouncements.length > 0,
        reportSource,
      });
      if (!payload) {
        return res.status(500).json({ success: false, error: "judge_contract_invalid" });
      }
      res.json({
        success: true,
        data: payload,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message || "judge_failed" });
    }
  });

  app.get("/api/ai/test-models", async (_req, res) => {
    try {
      const apiKey = (process.env.GEMINI_API_KEY || "").trim();
      if (!apiKey) return res.status(400).json({ success: false, error: "GEMINI_API_KEY is not configured" });
      const ai = new GoogleGenAI({ apiKey });
      const models = await listAvailableGeminiTextModels(ai);
      const probePrompt = "Reply with exactly: OK";
      const rows: Array<{ model: string; ok: boolean; error?: string }> = [];
      for (const model of models) {
        try {
          const result = await ai.models.generateContent({ model, contents: probePrompt });
          const text = String(result?.text || "").trim();
          rows.push({ model, ok: text.length > 0 });
        } catch (e: any) {
          rows.push({ model, ok: false, error: formatAIError(e) });
        }
      }
      return res.json({
        success: true,
        data: {
          testedAt: new Date().toISOString(),
          total: rows.length,
          ok: rows.filter((r) => r.ok).length,
          failed: rows.filter((r) => !r.ok).length,
          models: rows,
        },
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message || "ai_model_test_failed" });
    }
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    // Start initial sync after server is listening
    syncAnnouncements();
    // Fetch SEC ticker mapping
    fetchTickerMapping();
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    console.log("Initializing Vite middleware...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("Vite middleware initialized.");
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Global Error Handler
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    const reqId = (res.locals as any)?.reqId || "unknown";
    console.error("[Global Error Handler]:", JSON.stringify({
      reqId,
      method: req.method,
      path: req.path,
      message: err?.message || String(err),
    }));
    res.status(500).json({ 
      success: false, 
      error: "Internal Server Error",
      reqId,
      message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  });
}

startServer();
