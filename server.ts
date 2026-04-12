import dotenv from "dotenv";
dotenv.config({ override: true });
import express from "express";
import { createServer as createViteServer } from "vite";
import cors from "cors";
import axios from "axios";
import path from "path";
import { format, subDays } from "date-fns";
import * as cheerio from "cheerio";
import sqlite3 from "sqlite3";
import { open } from "sqlite";

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
      const categoriesToFetch = ["-1", "Result", "Board Meeting"];
      
      for (const cat of categoriesToFetch) {
        for (let page = 1; page <= 3; page++) {
          const bseUrl = `https://api.bseindia.com/BseIndiaAPI/api/AnnGetData/w?pageno=${page}&strCat=${cat}&strPrevDate=${strPrevDate}&strScrip=&strSearch=P&strToDate=${strToDate}&strType=C`;
          
          const response = await axios.get(bseUrl, {
            headers: {
              "User-Agent": "Mozilla/5.0",
              "Accept": "application/json, text/plain, */*",
              "Referer": "https://www.bseindia.com/",
              "Origin": "https://www.bseindia.com"
            }
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

  // Initial sync on startup
  syncAnnouncements();
  // Sync every 5 minutes
  setInterval(syncAnnouncements, 5 * 60 * 1000);

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ 
      status: "ok", 
      hasKey: !!process.env.GEMINI_API_KEY,
      keyLength: process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.length : 0,
      keyStart: process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.substring(0, 4) : null
    });
  });

  // Fetch Announcements from SQLite
  app.get("/api/announcements", async (req, res) => {
    try {
      const { type = "all" } = req.query;
      
      // Trigger a quick sync to ensure fresh data, but don't block for long
      await syncAnnouncements();

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

  // Fetch Companies
  app.get("/api/companies", async (req, res) => {
    try {
      const { search } = req.query;
      if (!search) {
        return res.json({ success: true, data: [] });
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

  // Fetch Scanner Results (Real-time from Screener.in Public Screens)
  app.get("/api/scanners/:id", async (req, res) => {
    try {
      const { id } = req.params;
      
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

  // Fetch Company Fundamentals
  app.get("/api/company/fundamentals", async (req, res) => {
    try {
      const { url } = req.query;
      if (!url || typeof url !== "string") {
        console.error("[Fundamentals] Missing URL parameter");
        return res.status(400).json({ success: false, error: "URL is required" });
      }

      const targetUrl = url.startsWith("http") ? url : `https://www.screener.in${url}`;
      console.log(`[Fundamentals] Fetching: ${targetUrl}`);
      
      const response = await axios.get(targetUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
          "Referer": "https://www.screener.in/"
        },
        timeout: 10000
      });

      if (typeof response.data !== 'string') {
        throw new Error("Invalid response format from Screener.in");
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

      if (!name && fundamentals.length === 0) {
        console.warn(`[Fundamentals] No data found for ${targetUrl}. Possible block or layout change.`);
        throw new Error("Could not parse company data. The page layout might have changed or access is restricted.");
      }

      console.log(`[Fundamentals] Successfully parsed data for: ${name}`);
      res.json({ 
        success: true, 
        data: { 
          name, 
          about, 
          fundamentals 
        } 
      });
    } catch (error: any) {
      console.error("[Fundamentals] Error:", error.message);
      res.status(500).json({ success: false, error: error.message || "Failed to fetch fundamentals" });
    }
  });

  // Fetch Company Report (Detailed P&L + AI Analysis)
  app.get("/api/company/report", async (req, res) => {
    try {
      const { url } = req.query;
      if (!url || typeof url !== "string") {
        return res.status(400).json({ success: false, error: "URL is required" });
      }

      const targetUrl = url.startsWith("http") ? url : `https://www.screener.in${url}`;
      
      const response = await axios.get(targetUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
          "Referer": "https://www.screener.in/"
        }
      });

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

      res.json({ 
        success: true, 
        data: { 
          name,
          chartData,
          quarterlyData,
          recentAnnouncements
        } 
      });
    } catch (error: any) {
      console.error("Error generating report:", error.message);
      res.status(500).json({ success: false, error: "Failed to generate report" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
