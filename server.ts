import dotenv from "dotenv";
dotenv.config({ override: true });
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

let cikToTicker: Record<string, string> = {};

async function fetchTickerMapping() {
  try {
    console.log("[SEC] Fetching ticker mapping...");
    const res = await axios.get('https://www.sec.gov/files/company_tickers.json', {
      headers: { 'User-Agent': 'MarketIntelligenceBot/1.0 (valuepicks25@gmail.com)' }
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

async function generateAIReport(name: string, country: string, chartData: any[], quarterlyData: any[], announcements: any[]) {
  try {
    const apiKey = (process.env.GEMINI_API_KEY || "").trim();
    if (!apiKey) {
      console.error("[AI] GEMINI_API_KEY is missing from environment variables.");
      return "AI analysis is currently unavailable (API Key not configured).";
    }

    const ai = new GoogleGenAI(apiKey);
    const prompt = `You are an expert financial analyst. Write a comprehensive, world-class equity research report for ${name} (${country === 'US' ? 'USA' : 'India'}). 
    
Ensure you analyze the LATEST available data, including recent quarterly results and any recent exchange filings.

Annual Profit & Loss Data (${country === 'US' ? 'USD Millions' : 'INR Crores'}):
${JSON.stringify(chartData)}

Recent Quarterly Results (Last 4 Quarters):
${JSON.stringify(quarterlyData.slice(-4))}

Recent Filings (Latest):
${JSON.stringify(announcements.map((a: any) => ({ date: a.date, subject: a.subject })))}

Structure the report EXACTLY with the following sections, providing detailed, professional insights for each:
1. **Investment Thesis & Summary**
2. **Business Model & Operations**
3. **Historical Financial Review**
4. **Growth Drivers & Catalysts**
5. **Risk Assessment**
6. **Valuation & Price Target**
7. **Management Quality & Governance**
8. **Competitive Positioning**

Use markdown formatting. Make it read like a premium institutional research report.`;

    const model = ai.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text() || "AI analysis is currently unavailable.";
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

    const ai = new GoogleGenAI(apiKey);
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

    const model = ai.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text() || "No snapshot available.";
  } catch (e: any) {
    const friendlyError = formatAIError(e);
    console.error("[AI] Snapshot failed:", friendlyError);
    return `Snapshot generation failed: ${friendlyError}`;
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

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

  // Background Sync Function
  async function syncAnnouncements() {
    try {
      const today = new Date();
      const prevDate = subDays(today, 7); // Fetch last 7 days to ensure we don't miss anything
      const strToDate = format(today, "yyyyMMdd");
      const strPrevDate = format(prevDate, "yyyyMMdd");
      
      let newCount = 0;
      let totalFound = 0;

      // Fetch multiple categories and pages to ensure we get a good spread of recent data
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
              item.CATEGORYNAME
            ]);

            if (result.changes && result.changes > 0) {
              newCount++;
            }
          }
        }
      }
      
      console.log(`[Sync] Found ${totalFound} announcements. Inserted ${newCount} new records.`);
    } catch (error: any) {
      console.error("[Sync] Error syncing announcements:", error.message);
    }
  }

  // Sync every 5 minutes
  setInterval(syncAnnouncements, 5 * 60 * 1000);

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
          return res.json({ success: true, data: secAnnouncements });
        } catch (secError: any) {
          console.error("Error fetching SEC filings:", secError.message);
          return res.status(500).json({ success: false, error: "Failed to fetch SEC filings" });
        }
      }

      // Trigger a sync in the background to ensure fresh data for next time
      syncAnnouncements();

      let query = "SELECT * FROM announcements ORDER BY date DESC LIMIT 500";
      let params: any[] = [];

      if (type === "results") {
        query = "SELECT * FROM announcements WHERE category = 'Result' ORDER BY date DESC LIMIT 500";
      }

      const announcements = await db.all(query, params);
      res.json({ success: true, data: announcements });
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
        // Try Alpaca for search if keys are available
        if (process.env.ALPACA_API_KEY && process.env.ALPACA_SECRET_KEY) {
          try {
            console.log(`[Search] Fetching US companies from Alpaca for: ${search}`);
            // Alpaca doesn't have a direct "search" endpoint with partial match in the free tier easily,
            // but we can fetch assets and filter. However, for a quick search, Yahoo is still better for partial matches.
            // But let's try to get the exact asset if it's a symbol.
            const alpacaRes = await axios.get(`https://paper-api.alpaca.markets/v2/assets/${(search as string).toUpperCase()}`, {
              headers: {
                'APCA-API-KEY-ID': process.env.ALPACA_API_KEY,
                'APCA-API-SECRET-KEY': process.env.ALPACA_SECRET_KEY,
              },
              timeout: 3000
            });
            if (alpacaRes.data && alpacaRes.data.tradable) {
              return res.json({ success: true, data: [{
                id: alpacaRes.data.symbol,
                name: alpacaRes.data.name,
                url: `https://finance.yahoo.com/quote/${alpacaRes.data.symbol}`,
                exchange: alpacaRes.data.exchange,
                symbol: alpacaRes.data.symbol
              }] });
            }
          } catch (e) {
            // Fallback to Yahoo search if Alpaca exact match fails
          }
        }

        // Use Yahoo Finance search for US companies
        const yahooSearchUrl = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(search as string)}&quotesCount=10&newsCount=0`;
        const response = await fetchWithRetry(yahooSearchUrl, { timeout: 8000 });
        
        const companies = (response.data.quotes || [])
          .filter((q: any) => q.quoteType === 'EQUITY')
          .map((q: any) => ({
            id: q.symbol,
            name: q.longname || q.shortname || q.symbol,
            url: `https://finance.yahoo.com/quote/${q.symbol}`,
            exchange: q.exchange,
            symbol: q.symbol
          }));
          
        return res.json({ success: true, data: companies });
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

      res.json({ success: true, data: companies });
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
        // Real-time US scanner results from Yahoo Finance API
        try {
          const usScreenerMap: Record<string, string> = {
            'VALUE_BUYS': 'undervalued_growth_stocks',
            'QGLP_FRAMEWORK': 'most_watched_tickers',
            'SMILE_FRAMEWORK': 'small_cap_gainers',
            'HIGH_ROE_GROWTH': 'growth_technology_stocks',
            'MULTIBAGGER_SIGNAL': 'aggressive_small_caps',
            'LOW_ROE_HIGH_GROWTH': 'day_gainers',
            'STABLE_MED_GROWTH': 'most_actives',
            'STABLE_LOW_GROWTH': 'day_gainers',
            'GARP': 'undervalued_growth_stocks'
          };
          
          const screenerId = usScreenerMap[id] || 'most_actives';
          const apiUrl = `https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?scrIds=${screenerId}&count=25`;
          
          console.log(`[Scanner] Fetching US scanner: ${screenerId} from ${apiUrl}`);
          
          const response = await fetchWithRetry(apiUrl, {
            headers: {
              "Accept": "application/json"
            },
            timeout: 10000
          });
          
          const results: any[] = [];
          const quotes = response.data?.finance?.result?.[0]?.quotes || [];
          
          quotes.forEach((quote: any) => {
            if (quote.symbol) {
              results.push({
                id: quote.symbol,
                name: quote.longName || quote.shortName || quote.symbol,
                url: `https://finance.yahoo.com/quote/${quote.symbol}`,
                exchange: quote.fullExchangeName || "US Exchange"
              });
            }
          });
          
          if (results.length === 0) {
            // Fallback to most active if specific screener failed or returned empty
            return res.json({ success: true, data: [
              { id: 'AAPL', name: 'Apple Inc.', url: 'https://finance.yahoo.com/quote/AAPL', exchange: 'NASDAQ' },
              { id: 'MSFT', name: 'Microsoft Corp.', url: 'https://finance.yahoo.com/quote/MSFT', exchange: 'NASDAQ' },
              { id: 'TSLA', name: 'Tesla, Inc.', url: 'https://finance.yahoo.com/quote/TSLA', exchange: 'NASDAQ' },
              { id: 'NVDA', name: 'NVIDIA Corporation', url: 'https://finance.yahoo.com/quote/NVDA', exchange: 'NASDAQ' },
              { id: 'AMZN', name: 'Amazon.com, Inc.', url: 'https://finance.yahoo.com/quote/AMZN', exchange: 'NASDAQ' }
            ] });
          }

          return res.json({ success: true, data: results });
        } catch (usScannerError: any) {
          console.error("Error fetching US scanner results:", usScannerError.message);
          return res.status(500).json({ success: false, error: "Failed to fetch US scanner results" });
        }
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
      res.json({ success: true, data: results.slice(0, 20) });
    } catch (error: any) {
      console.error("Error fetching scanner results:", error.message);
      res.status(500).json({ success: false, error: "Failed to fetch scanner results" });
    }
  });

  // Fetch Company Fundamentals (Real-time from Screener.in or Yahoo Finance)
  app.get("/api/company/fundamentals", async (req, res) => {
    try {
      const { url, country } = req.query;
      if (!url || typeof url !== "string") {
        console.error("[Fundamentals] Missing URL parameter");
        return res.status(400).json({ success: false, error: "URL is required" });
      }

      if (country === 'US') {
        // Extract symbol from Yahoo Finance URL using regex
        const symbolMatch = url.match(/\/quote\/([^\/\?]+)/);
        const symbol = symbolMatch ? symbolMatch[1].toUpperCase() : null;
        
        if (!symbol) {
          console.error("[Fundamentals] Could not extract symbol from URL:", url);
          throw new Error("Invalid Yahoo Finance URL");
        }

        console.log(`[Fundamentals] Fetching US data for: ${symbol}`);
        
        let result;
        let quoteData;
        let alpacaData: any = null;

        // Try Alpaca for real-time price and asset info if keys are available
        if (process.env.ALPACA_API_KEY && process.env.ALPACA_SECRET_KEY) {
          try {
            console.log(`[Fundamentals] Fetching Alpaca data for: ${symbol} using key ${process.env.ALPACA_API_KEY.substring(0, 5)}...`);
            const alpacaRes = await axios.get(`https://data.alpaca.markets/v2/stocks/${symbol}/snapshot`, {
              headers: {
                'APCA-API-KEY-ID': process.env.ALPACA_API_KEY,
                'APCA-API-SECRET-KEY': process.env.ALPACA_SECRET_KEY,
              },
              timeout: 5000
            });
            alpacaData = alpacaRes.data;
            console.log(`[Fundamentals] Successfully fetched Alpaca snapshot for ${symbol}`);
          } catch (e: any) {
            console.warn(`[Fundamentals] Alpaca API failed for ${symbol}:`, e.message);
          }
        }
        
        // Try multiple Yahoo Finance API endpoints
        const yahooEndpoints = [
          `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=defaultKeyStatistics,financialData,summaryDetail`,
          `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=defaultKeyStatistics,financialData,summaryDetail`,
          `https://query2.finance.yahoo.com/v7/finance/quoteSummary/${symbol}?modules=defaultKeyStatistics,financialData,summaryDetail`,
          `https://query1.finance.yahoo.com/v7/finance/quoteSummary/${symbol}?modules=defaultKeyStatistics,financialData,summaryDetail`
        ];

        for (const endpoint of yahooEndpoints) {
          try {
            const response = await fetchWithRetry(endpoint, {
              headers: { 
                "Accept": "application/json",
                "Referer": "https://finance.yahoo.com/"
              },
              timeout: 8000
            });
            result = response?.data?.quoteSummary?.result?.[0];
            if (result) {
              console.log(`[Fundamentals] Successfully fetched from ${endpoint}`);
              break;
            }
          } catch (e: any) {
            console.warn(`[Fundamentals] Failed to fetch from ${endpoint}:`, e.message);
          }
        }

        // Try v6 quote API as fallback for basic stats
        if (!result) {
          try {
            const quoteUrl = `https://query2.finance.yahoo.com/v6/finance/quote?symbols=${symbol}`;
            const qResponse = await fetchWithRetry(quoteUrl, { timeout: 5000 });
            quoteData = qResponse.data?.quoteResponse?.result?.[0];
            if (quoteData) console.log(`[Fundamentals] Successfully fetched from quote API`);
          } catch (e: any) {
            console.warn(`[Fundamentals] Failed to fetch from quote API:`, e.message);
          }
        }

        if (!result && !quoteData) {
          console.log(`[Fundamentals] API failed for ${symbol}, attempting scraping fallback...`);
          try {
            // Try the main quote page first as it's more likely to be cached/available
            const scrapeUrl = `https://finance.yahoo.com/quote/${symbol}`;
            const scrapeResponse = await axios.get(scrapeUrl, {
              headers: {
                "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.5",
                "Upgrade-Insecure-Requests": "1",
                "Sec-Fetch-Dest": "document",
                "Sec-Fetch-Mode": "navigate",
                "Sec-Fetch-Site": "none",
                "Sec-Fetch-User": "?1",
                "Cache-Control": "max-age=0"
              },
              timeout: 12000
            });
            const $ = cheerio.load(scrapeResponse.data);
            
            // Yahoo Finance often uses data-field attributes for real-time updates
            const getVal = (field: string) => $(`fin-streamer[data-field="${field}"]`).first().text().trim();
            const getTdVal = (label: string) => $(`td:contains("${label}")`).next().text().trim();

            const marketCap = getTdVal("Market Cap") || getVal("marketCap") || "N/A";
            const currentPrice = getVal("regularMarketPrice") || $('fin-streamer[data-test="qsp-price"]').text().trim() || "N/A";
            const peRatio = getTdVal("PE Ratio (TTM)") || getVal("trailingPE") || "N/A";
            const divYield = getTdVal("Forward Dividend & Yield") || getVal("dividendYield") || "N/A";

            if (currentPrice === "N/A" && marketCap === "N/A") {
              throw new Error("Scraped page returned no data");
            }

            const fundamentals = [
              { name: "Market Cap", value: marketCap },
              { name: "Current Price", value: currentPrice },
              { name: "Stock P/E", value: peRatio },
              { name: "Book Value", value: getTdVal("Book Value Per Share") || "N/A" },
              { name: "Dividend Yield", value: divYield },
              { name: "ROCE", value: "N/A" },
              { name: "ROE", value: getTdVal("Return on Equity") || "N/A" },
              { name: "Face Value", value: "N/A" }
            ];

            return res.json({
              success: true,
              data: {
                name: symbol,
                fundamentals,
                about: `Financial summary for ${symbol} (Scraped from Yahoo Finance).`,
                recentAnnouncements: []
              }
            });
          } catch (scrapeError: any) {
            console.error(`[Fundamentals] Yahoo scraping fallback failed for ${symbol}:`, scrapeError.message);
            
            // Finviz Fallback
            try {
              console.log(`[Fundamentals] Attempting Finviz fallback for ${symbol}...`);
              const finvizUrl = `https://finviz.com/quote.ashx?t=${symbol}`;
              const fvResponse = await axios.get(finvizUrl, {
                headers: {
                  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
                  "Accept": "text/html"
                },
                timeout: 8000
              });
              const $fv = cheerio.load(fvResponse.data);
              
              const getFvVal = (label: string) => $fv(`td:contains("${label}")`).next().text().trim();
              
              const currentPrice = $fv('.quote-price').first().text().trim() || $fv('span[id^="quote-last"]').text().trim();
              const marketCap = getFvVal("Market Cap");
              const peRatio = getFvVal("P/E");
              const divYield = getFvVal("Dividend %");

              if (currentPrice && currentPrice !== "") {
                const fundamentals = [
                  { name: "Market Cap", value: marketCap || "N/A" },
                  { name: "Current Price", value: currentPrice },
                  { name: "Stock P/E", value: peRatio || "N/A" },
                  { name: "Book Value", value: getFvVal("Price/Book") || "N/A" },
                  { name: "Dividend Yield", value: divYield || "N/A" },
                  { name: "ROCE", value: "N/A" },
                  { name: "ROE", value: getFvVal("ROE") || "N/A" },
                  { name: "Face Value", value: "N/A" }
                ];

                return res.json({
                  success: true,
                  data: {
                    name: symbol,
                    fundamentals,
                    about: `Financial summary for ${symbol} (Scraped from Finviz).`,
                    recentAnnouncements: []
                  }
                });
              }
            } catch (fvError: any) {
              console.error(`[Fundamentals] Finviz fallback failed for ${symbol}:`, fvError.message);
            }

            // MarketWatch Fallback
            try {
              console.log(`[Fundamentals] Attempting MarketWatch fallback for ${symbol}...`);
              const mwUrl = `https://www.marketwatch.com/investing/stock/${symbol}`;
              const mwResponse = await axios.get(mwUrl, {
                headers: {
                  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
                  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
                  "Referer": "https://www.google.com/"
                },
                timeout: 10000
              });
              const $mw = cheerio.load(mwResponse.data);
              
              const currentPrice = $mw('.intraday__price .value').first().text().trim() || $mw('bg-quote[field="last"]').first().text().trim();
              const marketCap = $mw('li.kv__item:contains("Market Cap")').find('.kv__value').text().trim();
              const peRatio = $mw('li.kv__item:contains("P/E Ratio")').find('.kv__value').text().trim();
              const divYield = $mw('li.kv__item:contains("Yield")').find('.kv__value').text().trim();

              if (currentPrice) {
                const fundamentals = [
                  { name: "Market Cap", value: marketCap || "N/A" },
                  { name: "Current Price", value: currentPrice },
                  { name: "Stock P/E", value: peRatio || "N/A" },
                  { name: "Book Value", value: "N/A" },
                  { name: "Dividend Yield", value: divYield || "N/A" },
                  { name: "ROCE", value: "N/A" },
                  { name: "ROE", value: "N/A" },
                  { name: "Face Value", value: "N/A" }
                ];

                return res.json({
                  success: true,
                  data: {
                    name: symbol,
                    fundamentals,
                    about: `Financial summary for ${symbol} (Scraped from MarketWatch).`,
                    recentAnnouncements: []
                  }
                });
              }
            } catch (mwError: any) {
              console.error(`[Fundamentals] MarketWatch fallback failed for ${symbol}:`, mwError.message);
            }

            // Google Finance Fallback
            try {
              console.log(`[Fundamentals] Attempting Google Finance fallback for ${symbol}...`);
              // Try NYSE then NASDAQ
              const exchanges = ['NYSE', 'NASDAQ'];
              for (const exch of exchanges) {
                try {
                  const gfUrl = `https://www.google.com/finance/quote/${symbol}:${exch}`;
                  const gfResponse = await axios.get(gfUrl, {
                    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36" },
                    timeout: 5000
                  });
                  const $gf = cheerio.load(gfResponse.data);
                  const currentPrice = $gf('.YMlKec.fxKbKc').first().text().trim();
                  if (currentPrice && currentPrice.includes('$')) {
                    const getGfVal = (label: string) => $gf(`div:contains("${label}")`).next().text().trim();
                    const fundamentals = [
                      { name: "Market Cap", value: getGfVal("Market cap") || "N/A" },
                      { name: "Current Price", value: currentPrice },
                      { name: "Stock P/E", value: getGfVal("P/E ratio") || "N/A" },
                      { name: "Dividend Yield", value: getGfVal("Dividend yield") || "N/A" },
                      { name: "ROE", value: "N/A" },
                      { name: "ROCE", value: "N/A" },
                      { name: "Book Value", value: "N/A" },
                      { name: "Face Value", value: "N/A" }
                    ];
                    return res.json({
                      success: true,
                      data: {
                        name: symbol,
                        fundamentals,
                        about: `Financial summary for ${symbol} (Scraped from Google Finance).`,
                        recentAnnouncements: []
                      }
                    });
                  }
                } catch (e) {}
              }
            } catch (gfError: any) {
              console.error(`[Fundamentals] Google Finance fallback failed for ${symbol}:`, gfError.message);
            }

            // Seeking Alpha Fallback
            try {
              console.log(`[Fundamentals] Attempting Seeking Alpha fallback for ${symbol}...`);
              const saUrl = `https://seekingalpha.com/symbol/${symbol}`;
              const saResponse = await axios.get(saUrl, {
                headers: {
                  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
                  "Accept": "text/html"
                },
                timeout: 8000
              });
              const $sa = cheerio.load(saResponse.data);
              
              const currentPrice = $sa('[data-test-id="symbol-last-price"]').first().text().trim();
              const marketCap = $sa('div:contains("Market Cap")').next().text().trim();
              
              if (currentPrice) {
                const fundamentals = [
                  { name: "Market Cap", value: marketCap || "N/A" },
                  { name: "Current Price", value: currentPrice },
                  { name: "Stock P/E", value: "N/A" },
                  { name: "Book Value", value: "N/A" },
                  { name: "Dividend Yield", value: "N/A" },
                  { name: "ROCE", value: "N/A" },
                  { name: "ROE", value: "N/A" },
                  { name: "Face Value", value: "N/A" }
                ];

                return res.json({
                  success: true,
                  data: {
                    name: symbol,
                    fundamentals,
                    about: `Financial summary for ${symbol} (Scraped from Seeking Alpha).`,
                    recentAnnouncements: []
                  }
                });
              }
            } catch (saError: any) {
              console.error(`[Fundamentals] Seeking Alpha fallback failed for ${symbol}:`, saError.message);
            }

            // CNBC Fallback
            try {
              console.log(`[Fundamentals] Attempting CNBC fallback for ${symbol}...`);
              const cnbcUrl = `https://www.cnbc.com/quotes/${symbol}`;
              const cnbcRes = await fetchWithRetry(cnbcUrl, { timeout: 8000 });
              const $cnbc = cheerio.load(cnbcRes?.data);
              
              const currentPrice = $cnbc('.QuoteStrip-lastPrice').first().text().trim();
              if (currentPrice) {
                const getCnbcVal = (label: string) => $cnbc(`li:contains("${label}")`).find('.Summary-value').text().trim();
                const fundamentals = [
                  { name: "Market Cap", value: getCnbcVal("Market Cap") || "N/A" },
                  { name: "Current Price", value: currentPrice },
                  { name: "Stock P/E", value: getCnbcVal("P/E Ratio") || "N/A" },
                  { name: "Dividend Yield", value: getCnbcVal("Yield") || "N/A" },
                  { name: "ROE", value: "N/A" },
                  { name: "ROCE", value: "N/A" },
                  { name: "Book Value", value: "N/A" },
                  { name: "Face Value", value: "N/A" }
                ];
                return res.json({
                  success: true,
                  data: {
                    name: symbol,
                    fundamentals,
                    about: `Financial summary for ${symbol} (Scraped from CNBC).`,
                    recentAnnouncements: []
                  }
                });
              }
            } catch (e: any) {
              console.error(`[Fundamentals] CNBC fallback failed for ${symbol}:`, e.message);
            }

            // Barchart Fallback
            try {
              console.log(`[Fundamentals] Attempting Barchart fallback for ${symbol}...`);
              const barchartUrl = `https://www.barchart.com/stocks/quotes/${symbol}/overview`;
              const bcRes = await fetchWithRetry(barchartUrl, { timeout: 8000 });
              const $bc = cheerio.load(bcRes?.data);
              const currentPrice = $bc('.last-change').first().text().split(' ')[0].trim();
              if (currentPrice && currentPrice !== "") {
                return res.json({
                  success: true,
                  data: {
                    name: symbol,
                    fundamentals: [
                      { name: "Current Price", value: currentPrice },
                      { name: "Market Cap", value: "N/A" },
                      { name: "Stock P/E", value: "N/A" },
                      { name: "Book Value", value: "N/A" },
                      { name: "Dividend Yield", value: "N/A" },
                      { name: "ROCE", value: "N/A" },
                      { name: "ROE", value: "N/A" },
                      { name: "Face Value", value: "N/A" }
                    ],
                    about: `Basic data for ${symbol} (Scraped from Barchart).`,
                    recentAnnouncements: []
                  }
                });
              }
            } catch (e: any) {}

            // Final Chart API fallback
            try {
              console.log(`[Fundamentals] Attempting Final Chart API fallback for ${symbol}...`);
              const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`;
              const chartRes = await fetchWithRetry(chartUrl, { timeout: 5000 });
              const meta = chartRes?.data?.chart?.result?.[0]?.meta;
              if (meta) {
                return res.json({
                  success: true,
                  data: {
                    name: symbol,
                    fundamentals: [
                      { name: "Current Price", value: meta.regularMarketPrice?.toString() || "N/A" },
                      { name: "Market Cap", value: "N/A" },
                      { name: "Stock P/E", value: "N/A" },
                      { name: "Book Value", value: "N/A" },
                      { name: "Dividend Yield", value: "N/A" },
                      { name: "ROCE", value: "N/A" },
                      { name: "ROE", value: "N/A" },
                      { name: "Face Value", value: "N/A" }
                    ],
                    about: `Basic data for ${symbol} (Chart API fallback).`,
                    recentAnnouncements: []
                  }
                });
              }
            } catch (e) {}
            
            // If everything failed, return a 200 with "Data Unavailable" instead of 404
            // This prevents the UI from showing a hard error
            return res.json({
              success: true,
              data: {
                name: symbol,
                fundamentals: [
                  { name: "Current Price", value: "Data Unavailable" },
                  { name: "Market Cap", value: "Data Unavailable" },
                  { name: "Stock P/E", value: "Data Unavailable" },
                  { name: "Book Value", value: "Data Unavailable" },
                  { name: "Dividend Yield", value: "Data Unavailable" },
                  { name: "ROCE", value: "Data Unavailable" },
                  { name: "ROE", value: "Data Unavailable" },
                  { name: "Face Value", value: "Data Unavailable" }
                ],
                about: `We are currently experiencing high traffic from our data providers for ${symbol}. Please try again in a few minutes.`,
                recentAnnouncements: []
              }
            });
          }
        }
        
        const stats = result?.defaultKeyStatistics || {};
        const financial = result?.financialData || {};
        const detail = result?.summaryDetail || {};

        const currentPrice = alpacaData?.latestTrade?.p?.toString() || 
                           detail.regularMarketPrice?.fmt || 
                           quoteData?.regularMarketPrice?.toString() || 
                           "N/A";

        const fundamentals = [
          { name: "Market Cap", value: detail.marketCap?.fmt || detail.marketCap?.longFmt || quoteData?.marketCap ? (quoteData.marketCap > 1e12 ? (quoteData.marketCap/1e12).toFixed(2) + 'T' : (quoteData.marketCap/1e9).toFixed(2) + 'B') : "N/A" },
          { name: "Current Price", value: currentPrice },
          { name: "Stock P/E", value: detail.trailingPE?.fmt || quoteData?.trailingPE?.toFixed(2) || "N/A" },
          { name: "Book Value", value: stats.bookValue?.fmt || quoteData?.bookValue?.toFixed(2) || "N/A" },
          { name: "Dividend Yield", value: detail.dividendYield?.fmt || (quoteData?.trailingAnnualDividendYield ? (quoteData.trailingAnnualDividendYield * 100).toFixed(2) + '%' : "N/A") },
          { name: "ROCE", value: "N/A" },
          { name: "ROE", value: financial.returnOnEquity?.fmt || "N/A" },
          { name: "Face Value", value: "N/A" }
        ];

        // Fetch recent filings for the specific symbol from SEC
        let recentAnnouncements: any[] = [];
        try {
          const secSearchUrl = `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${symbol}&type=&dateb=&owner=include&count=10&output=atom`;
          const secResponse = await fetchWithRetry(secSearchUrl, {
            headers: {
              "User-Agent": "MarketIntelligence (valuepicks25@gmail.com)",
              "Accept-Encoding": "gzip, deflate",
              "Host": "www.sec.gov"
            },
            timeout: 8000
          });
          const $sec = cheerio.load(secResponse.data, { xmlMode: true });
          $sec('entry').each((i, el) => {
            const entry = $sec(el);
            const title = entry.find('title').text();
            recentAnnouncements.push({
              id: `sec_${symbol}_${i}`,
              date: entry.find('updated').text(),
              subject: title,
              pdfLink: entry.find('link').attr('href'),
              category: title.split(' - ')[0] || 'Filing'
            });
          });
        } catch (secReportError) {
          console.error("Error fetching SEC filings for report:", secReportError);
        }

        return res.json({ 
          success: true, 
          data: { 
            name: symbol,
            fundamentals,
            about: `Financial summary for ${symbol} listed on ${detail.exchangeName || 'US Exchange'}.`,
            recentAnnouncements
          } 
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
      const pageText = $('body').text();
      const bseMatch = pageText.match(/BSE:\s*(\d{6})/);
      if (bseMatch && bseMatch[1]) {
        bseSymbol = bseMatch[1];
      }

      if (!name && fundamentals.length === 0) {
        console.warn(`[Fundamentals] No data found for ${targetUrl}. Possible block or layout change.`);
        throw new Error("Could not parse company data. The page layout might have changed or access is restricted.");
      }

      let recentAnnouncements: any[] = [];
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
      res.json({ 
        success: true, 
        data: { 
          name, 
          about, 
          fundamentals,
          recentAnnouncements
        } 
      });
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
      if (!url || typeof url !== "string") {
        return res.status(400).json({ success: false, error: "URL is required" });
      }

      if (country === 'US') {
        const symbolMatch = url.match(/\/quote\/([^\/\?]+)/);
        const symbol = symbolMatch ? symbolMatch[1].toUpperCase() : null;
        if (!symbol) throw new Error("Invalid Yahoo Finance URL");

        console.log(`[Report] Fetching US data for: ${symbol}`);

        // Fetch income statement for charts
        let result;
        const yahooEndpoints = [
          `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=incomeStatementHistory,incomeStatementHistoryQuarterly,summaryDetail`,
          `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=incomeStatementHistory,incomeStatementHistoryQuarterly,summaryDetail`,
          `https://query2.finance.yahoo.com/v7/finance/quoteSummary/${symbol}?modules=incomeStatementHistory,incomeStatementHistoryQuarterly,summaryDetail`,
          `https://query1.finance.yahoo.com/v7/finance/quoteSummary/${symbol}?modules=incomeStatementHistory,incomeStatementHistoryQuarterly,summaryDetail`
        ];

        for (const endpoint of yahooEndpoints) {
          try {
            const response = await fetchWithRetry(endpoint, {
              headers: { 
                "Accept": "application/json",
                "Referer": "https://finance.yahoo.com/"
              },
              timeout: 12000
            });
            result = response.data?.quoteSummary?.result?.[0];
            if (result) {
              console.log(`[Report] Successfully fetched from ${endpoint}`);
              break;
            }
          } catch (e: any) {
            console.warn(`[Report] Failed to fetch from ${endpoint}:`, e.message);
          }
        }
        
        if (!result) {
          console.log(`[Report] API failed for ${symbol}, attempting Summary fallback...`);
          try {
            // Try to get at least summary data if financials fail
            const summaryUrl = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=summaryDetail,defaultKeyStatistics,financialData`;
            const summaryRes = await fetchWithRetry(summaryUrl, { timeout: 8000 });
            const summaryResult = summaryRes?.data?.quoteSummary?.result?.[0];
            
            if (summaryResult) {
              const detail = summaryResult.summaryDetail || {};
              const stats = summaryResult.defaultKeyStatistics || {};
              const financial = summaryResult.financialData || {};
              
              const chartData = [{
                year: new Date().getFullYear().toString(),
                sales: detail.totalRevenue?.fmt || financial.totalRevenue?.fmt || "N/A",
                netProfit: financial.netIncome?.fmt || "N/A",
                eps: stats.trailingEps?.fmt || "N/A"
              }];

              return res.json({
                success: true,
                data: {
                  name: symbol,
                  chartData,
                  quarterlyData: [],
                  recentAnnouncements: [],
                  summary: {
                    price: financial.currentPrice?.fmt || "N/A",
                    marketCap: detail.marketCap?.fmt || "N/A",
                    pe: detail.trailingPE?.fmt || "N/A"
                  }
                }
              });
            }
          } catch (e: any) {
            console.error(`[Report] Summary fallback failed for ${symbol}:`, e.message);
          }

          console.log(`[Report] API failed for ${symbol}, attempting Chart API fallback...`);
          try {
            const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=3mo&range=5y`;
            const chartRes = await fetchWithRetry(chartUrl, { timeout: 8000 });
            const chartResult = chartRes?.data?.chart?.result?.[0];
            if (chartResult && chartResult.indicators?.quote?.[0]) {
              const timestamps = chartResult.timestamp || [];
              const sales = chartResult.indicators.quote[0].close || []; 
              
              const chartData = timestamps.slice(-5).map((ts: number, i: number) => ({
                year: new Date(ts * 1000).getFullYear().toString(),
                sales: (sales[timestamps.length - 5 + i] || 0).toFixed(2),
                netProfit: "0.00",
                eps: "N/A"
              }));

              return res.json({
                success: true,
                data: {
                  name: symbol,
                  chartData,
                  quarterlyData: [],
                  recentAnnouncements: []
                }
              });
            }
          } catch (e: any) {
            console.error(`[Report] Chart API fallback failed for ${symbol}:`, e.message);
          }

          console.log(`[Report] API failed for ${symbol}, attempting scraping fallback...`);
          try {
            const scrapeUrl = `https://finance.yahoo.com/quote/${symbol}/financials`;
            const scrapeResponse = await fetchWithRetry(scrapeUrl, { timeout: 15000 });
            const $ = cheerio.load(scrapeResponse.data);
            
            // Try to find the financial data in the script tag (Yahoo stores it in a large JSON object)
            const scriptContent = $('script:contains("root.App.main")').text();
            if (scriptContent) {
              const jsonMatch = scriptContent.match(/root\.App\.main\s*=\s*({.*?});/);
              if (jsonMatch && jsonMatch[1]) {
                const fullData = JSON.parse(jsonMatch[1]);
                const financials = fullData.context?.dispatcher?.stores?.QuoteSummaryStore?.incomeStatementHistory?.incomeStatementHistory || [];
                const qFinancials = fullData.context?.dispatcher?.stores?.QuoteSummaryStore?.incomeStatementHistoryQuarterly?.incomeStatementHistory || [];
                
                if (financials.length > 0) {
                  const chartData = financials.map((item: any) => ({
                    year: item.endDate?.fmt?.split('-')[0] || "N/A",
                    sales: item.totalRevenue?.raw ? (item.totalRevenue.raw / 1000000).toFixed(2) : "0.00",
                    netProfit: item.netIncome?.raw ? (item.netIncome.raw / 1000000).toFixed(2) : "0.00",
                    eps: "N/A"
                  })).reverse();

                  const quarterlyData = qFinancials.map((item: any) => ({
                    quarter: item.endDate?.fmt || "N/A",
                    sales: item.totalRevenue?.raw ? (item.totalRevenue.raw / 1000000).toFixed(2) : "0.00",
                    netProfit: item.netIncome?.raw ? (item.netIncome.raw / 1000000).toFixed(2) : "0.00",
                    eps: "N/A"
                  })).reverse();

                  return res.json({
                    success: true,
                    data: {
                      name: symbol,
                      chartData,
                      quarterlyData,
                      recentAnnouncements: []
                    }
                  });
                }
              }
            }
            throw new Error("Could not extract financial data from scraped page");
          } catch (scrapeError: any) {
            console.error(`[Report] Scraping fallback failed for ${symbol}:`, scrapeError.message);
            return res.status(404).json({ success: false, error: `No data found for symbol: ${symbol}. Yahoo Finance API might be temporarily restricted.` });
          }
        }
        
        const annual = result.incomeStatementHistory?.incomeStatementHistory || [];
        const quarterly = result.incomeStatementHistoryQuarterly?.incomeStatementHistory || [];
        const stats = result.defaultKeyStatistics || {};
        const name = symbol;

        const chartData = annual.map((item: any) => ({
          year: item.endDate?.raw ? new Date(item.endDate.raw * 1000).getFullYear().toString() : "N/A",
          sales: item.totalRevenue?.raw ? (item.totalRevenue.raw / 1000000).toFixed(2) : "0.00", // In Millions
          netProfit: item.netIncome?.raw ? (item.netIncome.raw / 1000000).toFixed(2) : "0.00",
          eps: item.trailingEps?.fmt || stats.trailingEps?.fmt || "N/A"
        })).reverse();

        const quarterlyData = quarterly.map((item: any) => ({
          quarter: item.endDate?.raw ? new Date(item.endDate.raw * 1000).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }) : "N/A",
          sales: item.totalRevenue?.raw ? (item.totalRevenue.raw / 1000000).toFixed(2) : "0.00",
          netProfit: item.netIncome?.raw ? (item.netIncome.raw / 1000000).toFixed(2) : "0.00",
          eps: item.trailingEps?.fmt || "N/A"
        })).reverse();

        // Fetch recent filings for the specific symbol from SEC
        let recentAnnouncements: any[] = [];
        try {
          const secSearchUrl = `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${symbol}&type=&dateb=&owner=include&count=10&output=atom`;
          const secResponse = await fetchWithRetry(secSearchUrl, {
            headers: {
              "User-Agent": "MarketIntelligence (valuepicks25@gmail.com)",
              "Accept-Encoding": "gzip, deflate",
              "Host": "www.sec.gov"
            },
            timeout: 8000
          });
          const $sec = cheerio.load(secResponse.data, { xmlMode: true });
          $sec('entry').each((i, el) => {
            const entry = $sec(el);
            recentAnnouncements.push({
              id: `sec_report_${symbol}_${i}`,
              date: entry.find('updated').text(),
              subject: entry.find('title').text(),
              pdfLink: entry.find('link').attr('href')
            });
          });
        } catch (secReportError) {
          console.error("Error fetching SEC filings for report:", secReportError);
        }

        const aiReport = await generateAIReport(name, 'US', chartData, quarterlyData, recentAnnouncements);

        return res.json({ 
          success: true, 
          data: { 
            name,
            chartData,
            quarterlyData,
            recentAnnouncements,
            aiReport
          } 
        });
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

      const $ = cheerio.load(response.data);
      const name = $('h1.show-from-tablet-landscape').text().trim() || $('h1').first().text().trim();
      
      // Parse Profit & Loss Table
      const plSection = $('#profit-loss');
      const years: string[] = [];
      const sales: number[] = [];
      const netProfit: number[] = [];
      const eps: number[] = [];

      plSection.find('thead th').each((i, el) => {
        if (i > 0) years.push($(el).text().trim());
      });

      plSection.find('tbody tr').each((_, tr) => {
        const rowName = $(tr).find('td').first().text().trim();
        if (rowName.includes('Sales')) {
          $(tr).find('td').each((i, td) => {
            if (i > 0) sales.push(parseFloat($(td).text().replace(/,/g, '')) || 0);
          });
        } else if (rowName.includes('Net Profit')) {
          $(tr).find('td').each((i, td) => {
            if (i > 0) netProfit.push(parseFloat($(td).text().replace(/,/g, '')) || 0);
          });
        } else if (rowName.includes('EPS in Rs')) {
          $(tr).find('td').each((i, td) => {
            if (i > 0) eps.push(parseFloat($(td).text().replace(/,/g, '')) || 0);
          });
        }
      });

      // Format data for charts
      const chartData = years.map((year, i) => ({
        year,
        sales: sales[i] || 0,
        netProfit: netProfit[i] || 0,
        eps: eps[i] || 0
      }));

      // Parse Quarterly Results
      const quartersSection = $('#quarters');
      const quarterNames: string[] = [];
      const qSales: number[] = [];
      const qNetProfit: number[] = [];
      const qEps: number[] = [];

      quartersSection.find('thead th').each((i, el) => {
        if (i > 0) quarterNames.push($(el).text().trim());
      });

      quartersSection.find('tbody tr').each((_, tr) => {
        const rowName = $(tr).find('td').first().text().trim();
        if (rowName.includes('Sales')) {
          $(tr).find('td').each((i, td) => {
            if (i > 0) qSales.push(parseFloat($(td).text().replace(/,/g, '')) || 0);
          });
        } else if (rowName.includes('Net Profit')) {
          $(tr).find('td').each((i, td) => {
            if (i > 0) qNetProfit.push(parseFloat($(td).text().replace(/,/g, '')) || 0);
          });
        } else if (rowName.includes('EPS in Rs')) {
          $(tr).find('td').each((i, td) => {
            if (i > 0) qEps.push(parseFloat($(td).text().replace(/,/g, '')) || 0);
          });
        }
      });

      const quarterlyData = quarterNames.map((quarter, i) => ({
        quarter,
        sales: qSales[i] || 0,
        netProfit: qNetProfit[i] || 0,
        eps: qEps[i] || 0
      }));

      // Extract BSE Symbol and fetch recent announcements
      let bseSymbol = null;
      const pageText = $('body').text();
      const bseMatch = pageText.match(/BSE:\s*(\d{6})/);
      if (bseMatch && bseMatch[1]) {
        bseSymbol = bseMatch[1];
      }

      let recentAnnouncements: any[] = [];
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

      const aiReport = await generateAIReport(name, 'IN', chartData, quarterlyData, recentAnnouncements);

      res.json({ 
        success: true, 
        data: { 
          name,
          chartData,
          quarterlyData,
          recentAnnouncements,
          aiReport
        } 
      });
    } catch (error: any) {
      console.error("[Report] Error:", error.response?.status, error.message);
      const status = error.response?.status || 500;
      const message = error.response?.data?.error || error.message || "Failed to generate report";
      res.status(status).json({ success: false, error: message });
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
      let chartData: any[] = [];
      let quarterlyData: any[] = [];
      let recentAnnouncements: any[] = [];

      if (country === 'US') {
        const symbolMatch = url.match(/\/quote\/([^\/\?]+)/);
        const symbol = symbolMatch ? symbolMatch[1].toUpperCase() : null;
        if (!symbol) throw new Error("Invalid Yahoo Finance URL");

        name = symbol;

        // Try to fetch from Yahoo API
        let result;
        const yahooEndpoints = [
          `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=incomeStatementHistory,incomeStatementHistoryQuarterly,summaryDetail`,
          `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=incomeStatementHistory,incomeStatementHistoryQuarterly,summaryDetail`
        ];

        for (const endpoint of yahooEndpoints) {
          try {
            const response = await fetchWithRetry(endpoint, { timeout: 8000 });
            result = response.data?.quoteSummary?.result?.[0];
            if (result) break;
          } catch (e) {}
        }

        if (result) {
          const annual = result.incomeStatementHistory?.incomeStatementHistory || [];
          const quarterly = result.incomeStatementHistoryQuarterly?.incomeStatementHistory || [];
          
          chartData = annual.map((item: any) => ({
            year: item.endDate?.raw ? new Date(item.endDate.raw * 1000).getFullYear().toString() : "N/A",
            sales: item.totalRevenue?.raw ? (item.totalRevenue.raw / 1000000).toFixed(2) : "0.00",
            netProfit: item.netIncome?.raw ? (item.netIncome.raw / 1000000).toFixed(2) : "0.00"
          })).reverse();

          quarterlyData = quarterly.map((item: any) => ({
            quarter: item.endDate?.raw ? new Date(item.endDate.raw * 1000).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }) : "N/A",
            sales: item.totalRevenue?.raw ? (item.totalRevenue.raw / 1000000).toFixed(2) : "0.00",
            netProfit: item.netIncome?.raw ? (item.netIncome.raw / 1000000).toFixed(2) : "0.00"
          })).reverse();
        }

        // Fetch SEC filings
        try {
          const secSearchUrl = `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${symbol}&type=&dateb=&owner=include&count=5&output=atom`;
          const secResponse = await fetchWithRetry(secSearchUrl, {
            headers: { "User-Agent": "MarketIntelligence (valuepicks25@gmail.com)" },
            timeout: 5000
          });
          const $sec = cheerio.load(secResponse.data, { xmlMode: true });
          $sec('entry').each((i, el) => {
            recentAnnouncements.push({ subject: $sec(el).find('title').text() });
          });
        } catch (e) {}

      } else {
        // India logic
        const targetUrl = url.startsWith("http") ? url : `https://www.screener.in${url}`;
        const response = await axios.get(targetUrl, {
          headers: { "User-Agent": USER_AGENTS[0] },
          timeout: 10000
        });
        const $ = cheerio.load(response.data);
        name = $('h1').first().text().trim();

        const plSection = $('#profit-loss');
        const years: string[] = [];
        const sales: number[] = [];
        const netProfit: number[] = [];

        plSection.find('thead th').each((i, el) => { if (i > 0) years.push($(el).text().trim()); });
        plSection.find('tbody tr').each((_, tr) => {
          const rowName = $(tr).find('td').first().text().trim();
          if (rowName.includes('Sales')) {
            $(tr).find('td').each((i, td) => { if (i > 0) sales.push(parseFloat($(td).text().replace(/,/g, '')) || 0); });
          } else if (rowName.includes('Net Profit')) {
            $(tr).find('td').each((i, td) => { if (i > 0) netProfit.push(parseFloat($(td).text().replace(/,/g, '')) || 0); });
          }
        });

        chartData = years.map((year, i) => ({ year, sales: sales[i] || 0, netProfit: netProfit[i] || 0 }));

        const quartersSection = $('#quarters');
        const quarterNames: string[] = [];
        const qSales: number[] = [];
        const qNetProfit: number[] = [];

        quartersSection.find('thead th').each((i, el) => { if (i > 0) quarterNames.push($(el).text().trim()); });
        quartersSection.find('tbody tr').each((_, tr) => {
          const rowName = $(tr).find('td').first().text().trim();
          if (rowName.includes('Sales')) {
            $(tr).find('td').each((i, td) => { if (i > 0) qSales.push(parseFloat($(td).text().replace(/,/g, '')) || 0); });
          } else if (rowName.includes('Net Profit')) {
            $(tr).find('td').each((i, td) => { if (i > 0) qNetProfit.push(parseFloat($(td).text().replace(/,/g, '')) || 0); });
          }
        });

        quarterlyData = quarterNames.map((quarter, i) => ({ quarter, sales: qSales[i] || 0, netProfit: qNetProfit[i] || 0 }));

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
      res.json({ success: true, data: { name, snapshot } });

    } catch (error: any) {
      console.error("[Snapshot] Error:", error.message);
      res.status(500).json({ success: false, error: error.message });
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
    console.error("[Global Error Handler]:", err);
    res.status(500).json({ 
      success: false, 
      error: "Internal Server Error",
      message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  });
}

startServer();
