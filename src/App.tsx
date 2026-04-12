import React, { useState, useEffect, useRef } from 'react';
import { 
  FileText, 
  TrendingUp, 
  Building2, 
  Search, 
  ExternalLink, 
  Calendar,
  RefreshCw,
  AlertCircle,
  ArrowLeft,
  BookmarkPlus,
  BookmarkCheck,
  Bookmark,
  BarChart3,
  Sparkles,
  Download,
  Wallet,
  Gem,
  Smile,
  Rocket,
  Zap,
  Anchor,
  Shield,
  Radar
} from 'lucide-react';
import { format } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line, LabelList } from 'recharts';
import Markdown from 'react-markdown';
import html2canvas from 'html2canvas';
import { marked } from 'marked';

const STRATEGIES = [
  { id: 'VALUE_BUYS', label: 'Deep Value', desc: 'Low P/E, Low P/B, Margin of Safety', icon: <Wallet size={20} className="text-emerald-500" />, bgClass: 'bg-emerald-50', textClass: 'text-emerald-600', premium: false },
  { id: 'QGLP_FRAMEWORK', label: 'QGLP Alpha', desc: 'Raamdeo Agrawal Framework: Quality, Growth, Longevity & Price', icon: <Gem size={20} className="text-rose-500" />, bgClass: 'bg-rose-50', textClass: 'text-rose-600', premium: true },
  { id: 'SMILE_FRAMEWORK', label: 'SMILE Alpha', desc: 'Vijay Kedia: Small cap, Medium experience, Large aspiration, Extra-large potential', icon: <Smile size={20} className="text-violet-500" />, bgClass: 'bg-violet-50', textClass: 'text-violet-600', premium: true },
  { id: 'HIGH_ROE_GROWTH', label: 'Wealth Creators', desc: 'High ROE (>20%) & High Sales Growth (>20%)', icon: <Rocket size={20} className="text-orange-500" />, bgClass: 'bg-orange-50', textClass: 'text-orange-600', premium: false },
  { id: 'MULTIBAGGER_SIGNAL', label: 'Multibagger Signal', desc: 'Micro/Small Cap (<₹5000Cr), High Growth, Margin Expansion', icon: <Sparkles size={20} className="text-purple-500" />, bgClass: 'bg-purple-50', textClass: 'text-purple-600', premium: true },
  { id: 'LOW_ROE_HIGH_GROWTH', label: 'Growth Expansion', desc: 'Low ROE (<12%) but High Sales Growth (>25%)', icon: <Zap size={20} className="text-amber-500" />, bgClass: 'bg-amber-50', textClass: 'text-amber-600', premium: false },
  { id: 'STABLE_MED_GROWTH', label: 'Quality Compounders', desc: 'High ROE, Low Debt, Consistent Cash Flow', icon: <Anchor size={20} className="text-indigo-500" />, bgClass: 'bg-indigo-50', textClass: 'text-indigo-600', premium: false },
  { id: 'STABLE_LOW_GROWTH', label: 'Dividend Fortress', desc: 'High Yield, Defensive, Cash Cows', icon: <Shield size={20} className="text-blue-500" />, bgClass: 'bg-blue-50', textClass: 'text-blue-600', premium: false },
  { id: 'GARP', label: 'GARP', desc: 'Growth at Reasonable Price (PEG < 1)', icon: <TrendingUp size={20} className="text-cyan-500" />, bgClass: 'bg-cyan-50', textClass: 'text-cyan-600', premium: true },
];

type Announcement = {
  id: string;
  symbol: string;
  companyName: string;
  subject: string;
  date: string;
  pdfLink: string | null;
  exchange: string;
  category: string;
};

type SavedCompany = {
  id: string;
  name: string;
  url: string;
  exchange: string;
};

export default function App() {
  const [activeTab, setActiveTab] = useState<'all' | 'results' | 'companies' | 'saved' | 'scanners'>('all');
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [companies, setCompanies] = useState<any[]>([]);
  const [searchingCompanies, setSearchingCompanies] = useState(false);

  // Dashboard State
  const [selectedCompany, setSelectedCompany] = useState<SavedCompany | null>(null);
  const [companyData, setCompanyData] = useState<any>(null);
  const [loadingCompany, setLoadingCompany] = useState(false);

  // Report State
  const [reportData, setReportData] = useState<any>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const chartsRef = useRef<HTMLDivElement>(null);

  // Saved Companies State
  const [savedCompanies, setSavedCompanies] = useState<SavedCompany[]>(() => {
    const saved = localStorage.getItem('savedCompanies');
    return saved ? JSON.parse(saved) : [];
  });

  // Scanner State
  const [selectedScanner, setSelectedScanner] = useState<string | null>(null);
  const [scannerResults, setScannerResults] = useState<any[]>([]);
  const [loadingScanner, setLoadingScanner] = useState(false);
  const [isPaidCustomer, setIsPaidCustomer] = useState(false);

  useEffect(() => {
    localStorage.setItem('savedCompanies', JSON.stringify(savedCompanies));
  }, [savedCompanies]);

  const runScanner = async (id: string) => {
    setSelectedScanner(id);
    setLoadingScanner(true);
    try {
      const res = await fetch(`/api/scanners/${id}`);
      const json = await res.json();
      if (json.success) {
        setScannerResults(json.data);
      } else {
        setScannerResults([]);
      }
    } catch (err) {
      console.error("Failed to run scanner", err);
      setScannerResults([]);
    } finally {
      setLoadingScanner(false);
    }
  };

  const fetchAnnouncements = async (type: 'all' | 'results') => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/announcements?type=${type}`);
      const json = await res.json();
      if (json.success) {
        setAnnouncements(json.data);
      } else {
        setError(json.error || 'Failed to fetch data');
      }
    } catch (err: any) {
      setError(err.message || 'Network error');
    } finally {
      setLoading(false);
    }
  };

  const handleCompanySearch = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && searchQuery.trim()) {
      setSearchingCompanies(true);
      try {
        const res = await fetch(`/api/companies?search=${encodeURIComponent(searchQuery)}`);
        const json = await res.json();
        if (json.success) {
          setCompanies(json.data);
        }
      } catch (err) {
        console.error("Failed to search companies", err);
      } finally {
        setSearchingCompanies(false);
      }
    }
  };

  const openCompanyDashboard = async (company: SavedCompany) => {
    setSelectedCompany(company);
    setLoadingCompany(true);
    setCompanyData(null);
    setShowReport(false);
    setReportData(null);
    try {
      const res = await fetch(`/api/company/fundamentals?url=${encodeURIComponent(company.url)}`);
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await res.text();
        console.error("Non-JSON response received:", text.substring(0, 200));
        throw new Error("Server returned an invalid response. Please try again later.");
      }
      const json = await res.json();
      if (json.success) {
        setCompanyData(json.data);
      } else {
        throw new Error(json.error || "Failed to fetch company data");
      }
    } catch (err: any) {
      console.error("Failed to fetch fundamentals:", err);
      setError(err.message || "Failed to fetch company fundamentals");
    } finally {
      setLoadingCompany(false);
    }
  };

  const generateReport = async () => {
    if (!selectedCompany) return;
    setLoadingReport(true);
    setShowReport(true);
    try {
      const res = await fetch(`/api/company/report?url=${encodeURIComponent(selectedCompany.url)}`);
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await res.text();
        console.error("Non-JSON response received:", text.substring(0, 200));
        throw new Error("Server returned an invalid response. Please try again later.");
      }
      const json = await res.json();
      if (json.success) {
        const data = json.data;
        
        let aiReport = "AI analysis is currently unavailable.";
        try {
          const { GoogleGenAI } = await import("@google/genai");
          const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

          const prompt = `You are an expert financial analyst. Write a comprehensive, world-class equity research report for ${data.name}. 
          
Ensure you analyze the LATEST available data, including recent quarterly results and any recent exchange filings.

Annual Profit & Loss Data:
${JSON.stringify(data.chartData)}

Recent Quarterly Results (Last 4 Quarters):
${JSON.stringify(data.quarterlyData.slice(-4))}

Recent BSE Result Announcements (Latest filings):
${JSON.stringify(data.recentAnnouncements.map((a: any) => ({ date: a.date, subject: a.subject })))}

Structure the report EXACTLY with the following sections, providing detailed, professional insights for each:
1. **Investment Thesis & Summary**: A strong opening paragraph summarizing the core investment case, current performance, and why the stock is interesting right now.
2. **Business Model & Operations**: How the company makes money, its core segments, and operational footprint.
3. **Historical Financial Review**: Deep dive into the provided annual and quarterly data. Highlight revenue growth, margin expansion/contraction, and EPS trends. Use exact numbers.
4. **Growth Drivers & Catalysts**: What will drive future growth? Reference recent announcements, capacity expansions, or new market entries.
5. **Risk Assessment**: Key vulnerabilities (market, regulatory, competition, geopolitical, valuation).
6. **Valuation & Price Target**: Assess the current valuation based on the EPS and growth trends, and provide a hypothetical forward-looking perspective.
7. **Management Quality & Governance**: Assessment of management's capital allocation, promoter holding (if known), and strategic decisions.
8. **Competitive Positioning**: The company's moat, peers, and industry standing.

Use markdown formatting. Make it read like a premium institutional research report. Keep it engaging, analytical, and data-driven.

**Constraints:**
- Originality: No repetition, plagiarism, or recycled content. Verify uniqueness and accuracy to the latest updated information.

**Avoid Pitfalls:**
- Don't use cliché personal experiences or anecdotes and phrases. 
- Steer clear of generic advice (e.g., "always plan for failure"). 
- Don't overwhelm with excessive code or math; prioritize intuition and visuals. 
- Ensure explanations are detailed but not overwhelming.`;

          const aiResponse = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
          });
          
          aiReport = aiResponse.text || aiReport;
        } catch (aiError: any) {
          console.error("Gemini API Error:", aiError);
          aiReport = `**AI Analysis Unavailable**\n\nError: ${aiError.message || "Failed to generate report"}\n\n*If you are seeing an API key error, please open the Settings menu (gear icon) and remove the invalid GEMINI_API_KEY to use the default free key.*`;
        }

        setReportData({ ...data, aiReport });
      }
    } catch (err) {
      console.error("Failed to generate report", err);
    } finally {
      setLoadingReport(false);
    }
  };

  const generateReportContent = async () => {
    let chartsHtml = '';
    let chartsMd = '';

    if (chartsRef.current) {
      try {
        const canvas = await html2canvas(chartsRef.current, { scale: 2 });
        const imgData = canvas.toDataURL('image/png');
        chartsMd = `\n\n## Financial Charts\n\n![Financial Charts](${imgData})\n\n`;
        chartsHtml = `<h2>Financial Charts</h2><img src="${imgData}" alt="Financial Charts" style="max-width:100%;height:auto;border-radius:8px;box-shadow:0 4px 6px -1px rgb(0 0 0 / 0.1);" />`;
      } catch (err) {
        console.error("Failed to capture charts", err);
      }
    }

    let tablesMd = '\n\n## Raw Financial Data\n\n### Historical Results (Annual)\n\n| Year | Sales (Cr) | Net Profit (Cr) | EPS (Rs) |\n|---|---|---|---|\n';
    let tablesHtml = '<h2>Raw Financial Data</h2><h3>Historical Results (Annual)</h3><table border="1" style="border-collapse: collapse; width: 100%; margin-bottom: 20px;"><tr><th>Year</th><th>Sales (Cr)</th><th>Net Profit (Cr)</th><th>EPS (Rs)</th></tr>';

    if (reportData?.chartData) {
      reportData.chartData.forEach((row: any) => {
        tablesMd += `| ${row.year} | ${row.sales} | ${row.netProfit} | ${row.eps} |\n`;
        tablesHtml += `<tr><td>${row.year}</td><td>${row.sales}</td><td>${row.netProfit}</td><td>${row.eps}</td></tr>`;
      });
    }
    tablesHtml += '</table>';

    tablesMd += '\n### Latest Results (Quarterly)\n\n| Quarter | Sales (Cr) | Net Profit (Cr) | EPS (Rs) |\n|---|---|---|---|\n';
    tablesHtml += '<h3>Latest Results (Quarterly)</h3><table border="1" style="border-collapse: collapse; width: 100%;"><tr><th>Quarter</th><th>Sales (Cr)</th><th>Net Profit (Cr)</th><th>EPS (Rs)</th></tr>';

    if (reportData?.quarterlyData) {
      reportData.quarterlyData.slice(-6).forEach((row: any) => {
        tablesMd += `| ${row.quarter} | ${row.sales} | ${row.netProfit} | ${row.eps} |\n`;
        tablesHtml += `<tr><td>${row.quarter}</td><td>${row.sales}</td><td>${row.netProfit}</td><td>${row.eps}</td></tr>`;
      });
    }
    tablesHtml += '</table>';

    return { chartsMd, chartsHtml, tablesMd, tablesHtml };
  };

  const downloadMarkdown = async () => {
    if (!reportData || !selectedCompany) return;
    const { chartsMd, tablesMd } = await generateReportContent();
    const content = `# ${selectedCompany.name} - Financial Report\n\n` + reportData.aiReport + chartsMd + tablesMd;
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedCompany.name.replace(/\s+/g, '_')}_Report.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadHTML = async () => {
    if (!reportData || !selectedCompany) return;
    const { chartsHtml, tablesHtml } = await generateReportContent();
    const mdHtml = await marked.parse(reportData.aiReport);
    const content = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${selectedCompany.name} - Financial Report</title>
        <style>
          body { font-family: system-ui, -apple-system, sans-serif; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 2rem; color: #333; }
          img { max-width: 100%; height: auto; margin-bottom: 2rem; }
          h1, h2, h3 { color: #111; }
          table { text-align: left; }
          th, td { padding: 8px 12px; }
          .report-container { background: #fff; padding: 2rem; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        </style>
      </head>
      <body style="background: #f9fafb;">
        <div class="report-container">
          <h1>${selectedCompany.name} - Financial Report</h1>
          ${mdHtml}
          ${chartsHtml}
          ${tablesHtml}
        </div>
      </body>
      </html>
    `;
    const blob = new Blob([content], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedCompany.name.replace(/\s+/g, '_')}_Report.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleSaveCompany = (company: SavedCompany) => {
    setSavedCompanies(prev => {
      const exists = prev.find(c => c.id === company.id);
      if (exists) {
        return prev.filter(c => c.id !== company.id);
      } else {
        return [...prev, company];
      }
    });
  };

  useEffect(() => {
    if (activeTab === 'all' || activeTab === 'results') {
      fetchAnnouncements(activeTab);
      setSelectedCompany(null);
    } else if (activeTab === 'saved') {
      setSelectedCompany(null);
    }
  }, [activeTab]);

  const filteredAnnouncements = announcements.filter(a => 
    a.companyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    a.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
    a.subject.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const isCompanySaved = (id: string) => savedCompanies.some(c => c.id === id);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-6 w-6 text-blue-600" />
              <h1 className="text-xl font-bold tracking-tight text-gray-900">Market Intelligence</h1>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setIsPaidCustomer(!isPaidCustomer)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                  isPaidCustomer 
                    ? 'bg-amber-100 text-amber-700 border border-amber-200 shadow-sm' 
                    : 'bg-gray-100 text-gray-500 border border-gray-200 hover:bg-gray-200'
                }`}
              >
                <Sparkles className={`h-3.5 w-3.5 ${isPaidCustomer ? 'text-amber-500 fill-amber-500' : 'text-gray-400'}`} />
                {isPaidCustomer ? 'PREMIUM ACCESS' : 'UPGRADE TO PRO'}
              </button>
              <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-green-50 border border-green-200 rounded-full">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
                </span>
                <span className="text-xs font-medium text-green-700">Scraping Agents Active</span>
              </div>
              <span className="text-sm text-gray-500 flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                {format(new Date(), 'MMM dd, yyyy')}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Tabs */}
        <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg w-fit mb-8 overflow-x-auto">
          <button
            onClick={() => setActiveTab('all')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
              activeTab === 'all' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200'
            }`}
          >
            <FileText className="h-4 w-4" />
            All Announcements
          </button>
          <button
            onClick={() => setActiveTab('results')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
              activeTab === 'results' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200'
            }`}
          >
            <TrendingUp className="h-4 w-4" />
            Financial Results
          </button>
          <button
            onClick={() => setActiveTab('companies')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
              activeTab === 'companies' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200'
            }`}
          >
            <Building2 className="h-4 w-4" />
            Companies Directory
          </button>
          <button
            onClick={() => setActiveTab('scanners')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
              activeTab === 'scanners' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200'
            }`}
          >
            <Radar className="h-4 w-4" />
            Stock Scanners
          </button>
          <button
            onClick={() => setActiveTab('saved')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
              activeTab === 'saved' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200'
            }`}
          >
            <Bookmark className="h-4 w-4" />
            Saved ({savedCompanies.length})
          </button>
        </div>

        {/* Content Area */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {(activeTab === 'all' || activeTab === 'results') && (
            <div className="p-6">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <h2 className="text-lg font-semibold text-gray-900">
                  {activeTab === 'all' ? 'Latest Exchange Announcements' : 'Recent Financial Results'}
                </h2>
                
                <div className="flex items-center gap-3 w-full sm:w-auto">
                  <div className="relative flex-1 sm:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search company or subject..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <button 
                    onClick={() => fetchAnnouncements(activeTab)}
                    className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                    title="Refresh"
                  >
                    <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>

              {error ? (
                <div className="p-4 bg-red-50 text-red-700 rounded-md flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-medium">Error loading data</h3>
                    <p className="text-sm mt-1">{error}</p>
                  </div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm text-gray-600">
                    <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-y border-gray-200">
                      <tr>
                        <th className="px-4 py-3 font-medium">Date & Time</th>
                        <th className="px-4 py-3 font-medium">Company</th>
                        <th className="px-4 py-3 font-medium">Subject</th>
                        <th className="px-4 py-3 font-medium text-right">Document</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {loading && announcements.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                            <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-blue-500" />
                            Fetching latest data from exchanges...
                          </td>
                        </tr>
                      ) : filteredAnnouncements.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                            No announcements found matching your criteria.
                          </td>
                        </tr>
                      ) : (
                        filteredAnnouncements.map((item) => (
                          <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3 whitespace-nowrap text-gray-500">
                              {item.date ? format(new Date(item.date), 'MMM dd, HH:mm') : 'N/A'}
                            </td>
                            <td className="px-4 py-3">
                              <div className="font-medium text-gray-900">{item.companyName}</div>
                              <div className="text-xs text-gray-500">{item.symbol} • {item.exchange}</div>
                            </td>
                            <td className="px-4 py-3 max-w-md">
                              <div className="line-clamp-2" title={item.subject}>{item.subject}</div>
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 mt-1">
                                {item.category || 'General'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              {item.pdfLink ? (
                                <a 
                                  href={item.pdfLink} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-medium"
                                >
                                  View PDF
                                  <ExternalLink className="h-4 w-4" />
                                </a>
                              ) : (
                                <span className="text-gray-400">No Document</span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'scanners' && (
            <div className="p-6">
              {!selectedScanner ? (
                <>
                  <div className="mb-8">
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Stock Scanners & Strategies</h2>
                    <p className="text-gray-600">Discover potential investment opportunities using proven quantitative frameworks and screening criteria.</p>
                  </div>
                  
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {STRATEGIES.map((strategy) => (
                          <div 
                            key={strategy.id}
                            onClick={() => {
                              if (strategy.premium && !isPaidCustomer) {
                                // Show premium modal or logic
                                setIsPaidCustomer(false); // Just to trigger visual cue if needed
                              } else {
                                runScanner(strategy.id);
                              }
                            }}
                            className={`bg-white rounded-xl border p-6 shadow-sm transition-all cursor-pointer group relative overflow-hidden ${
                              strategy.premium && !isPaidCustomer ? 'border-amber-200 bg-amber-50/30' : 'border-gray-200 hover:shadow-md'
                            }`}
                          >
                            {strategy.premium && (
                              <div className="absolute top-0 right-0">
                                <div className={`text-[10px] font-bold px-2 py-1 rounded-bl-lg flex items-center gap-1 ${
                                  isPaidCustomer ? 'bg-green-100 text-green-700' : 'bg-amber-500 text-white'
                                }`}>
                                  <Sparkles className="h-2.5 w-2.5" />
                                  {isPaidCustomer ? 'UNLOCKED' : 'PREMIUM'}
                                </div>
                              </div>
                            )}
                            <div className={`w-12 h-12 rounded-lg ${strategy.bgClass} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                              {strategy.icon}
                            </div>
                            <h3 className="text-lg font-bold text-gray-900 mb-2">{strategy.label}</h3>
                            <p className="text-sm text-gray-600 mb-4 h-10 line-clamp-2">{strategy.desc}</p>
                            
                            {strategy.premium && !isPaidCustomer ? (
                              <button 
                                onClick={(e) => { e.stopPropagation(); setIsPaidCustomer(true); }}
                                className="w-full py-2 bg-amber-600 text-white rounded-lg font-bold text-xs hover:bg-amber-700 transition-colors flex items-center justify-center gap-2"
                              >
                                <Sparkles className="h-3.5 w-3.5" />
                                Unlock Strategy
                              </button>
                            ) : (
                              <button className={`text-sm font-medium ${strategy.textClass} flex items-center gap-1 group-hover:gap-2 transition-all`}>
                                Run Scanner <ArrowLeft className="h-4 w-4 rotate-180" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                </>
              ) : (
                <div>
                  <button 
                    onClick={() => setSelectedScanner(null)}
                    className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 mb-6"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back to Scanners
                  </button>
                  
                  <div className="mb-8">
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">
                      {STRATEGIES.find(s => s.id === selectedScanner)?.label} Results
                    </h2>
                    <p className="text-gray-600">
                      {STRATEGIES.find(s => s.id === selectedScanner)?.desc}
                    </p>
                  </div>

                  {loadingScanner ? (
                    <div className="text-center py-12">
                      <RefreshCw className="h-8 w-8 animate-spin mx-auto text-blue-500 mb-4" />
                      <p className="text-gray-500">Running scanner across all listed companies...</p>
                    </div>
                  ) : scannerResults.length > 0 ? (
                    <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                      {scannerResults.map((company) => (
                        <div 
                          key={company.id} 
                          className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                          onClick={() => {
                            openCompanyDashboard(company);
                          }}
                        >
                          <div className="flex justify-between items-start mb-3">
                            <h4 className="font-bold text-gray-900 text-lg line-clamp-1">{company.name}</h4>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleSaveCompany(company);
                              }}
                              className="text-gray-400 hover:text-blue-600 transition-colors"
                            >
                              {isCompanySaved(company.id) ? (
                                <BookmarkCheck className="h-5 w-5 text-blue-600" />
                              ) : (
                                <BookmarkPlus className="h-5 w-5" />
                              )}
                            </button>
                          </div>
                          <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
                            <span className="px-2 py-1 bg-gray-100 rounded text-xs font-medium">{company.exchange}</span>
                          </div>
                          <div className="flex items-center text-sm font-medium text-blue-600 group-hover:text-blue-800">
                            View Analysis <ArrowLeft className="h-4 w-4 ml-1 rotate-180" />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
                      <AlertCircle className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                      <h3 className="text-lg font-medium text-gray-900">No companies found</h3>
                      <p className="text-gray-500 mt-2">No companies currently match this criteria.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === 'companies' && !selectedCompany && (
            <div className="p-6">
              <div className="text-center py-8">
                <Building2 className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900">Companies Directory</h3>
                <p className="text-gray-500 mt-2 max-w-md mx-auto">
                  Search and explore listed companies across BSE.
                </p>
                <div className="mt-6 max-w-md mx-auto relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search for a company (e.g., Reliance) and press Enter..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={handleCompanySearch}
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm"
                  />
                </div>
              </div>
              
              {searchingCompanies ? (
                <div className="text-center py-8">
                  <RefreshCw className="h-8 w-8 animate-spin mx-auto text-blue-500 mb-4" />
                  <p className="text-gray-500">Searching directories...</p>
                </div>
              ) : companies.length > 0 ? (
                <div className="mt-8 grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                  {companies.map((company) => (
                    <button 
                      key={company.id}
                      onClick={() => openCompanyDashboard(company)}
                      className="block p-4 bg-white border border-gray-200 rounded-lg hover:border-blue-500 hover:shadow-md transition-all group text-left w-full"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-medium text-gray-900 group-hover:text-blue-600 transition-colors">{company.name}</h4>
                          <span className="inline-block mt-2 px-2 py-1 bg-gray-100 text-xs text-gray-600 rounded">
                            {company.exchange}
                          </span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="mt-8 text-center text-sm text-gray-500">
                  <p>Type a company name above and press Enter to search the live directory.</p>
                  <p className="mt-2">The agent connects directly to exchange APIs to retrieve real-time listings.</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'saved' && !selectedCompany && (
            <div className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-6">Saved Companies</h2>
              {savedCompanies.length === 0 ? (
                <div className="text-center py-12">
                  <Bookmark className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500">You haven't saved any companies yet.</p>
                  <button 
                    onClick={() => setActiveTab('companies')}
                    className="mt-4 text-blue-600 hover:text-blue-800 font-medium"
                  >
                    Search Directory
                  </button>
                </div>
              ) : (
                <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                  {savedCompanies.map((company) => (
                    <button 
                      key={company.id}
                      onClick={() => openCompanyDashboard(company)}
                      className="block p-4 bg-white border border-gray-200 rounded-lg hover:border-blue-500 hover:shadow-md transition-all group text-left w-full relative"
                    >
                      <div className="flex justify-between items-start pr-8">
                        <div>
                          <h4 className="font-medium text-gray-900 group-hover:text-blue-600 transition-colors">{company.name}</h4>
                          <span className="inline-block mt-2 px-2 py-1 bg-gray-100 text-xs text-gray-600 rounded">
                            {company.exchange}
                          </span>
                        </div>
                      </div>
                      <div 
                        className="absolute top-4 right-4 text-blue-600 hover:text-blue-800 p-1"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSaveCompany(company);
                        }}
                      >
                        <BookmarkCheck className="h-5 w-5" />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Company Dashboard View */}
          {selectedCompany && (
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <button 
                  onClick={() => setSelectedCompany(null)}
                  className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to {activeTab === 'saved' ? 'Saved' : 'Search'}
                </button>
                
                <button
                  onClick={() => toggleSaveCompany(selectedCompany)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-colors ${
                    isCompanySaved(selectedCompany.id) 
                      ? 'bg-blue-50 text-blue-700 hover:bg-blue-100' 
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {isCompanySaved(selectedCompany.id) ? (
                    <>
                      <BookmarkCheck className="h-4 w-4" />
                      Saved
                    </>
                  ) : (
                    <>
                      <BookmarkPlus className="h-4 w-4" />
                      Save Company
                    </>
                  )}
                </button>
              </div>

              <div className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className={`text-2xl font-bold text-gray-900 transition-all ${!isPaidCustomer ? 'blur-md select-none' : ''}`}>
                    {isPaidCustomer ? selectedCompany.name : 'HIDDEN COMPANY NAME'}
                  </h2>
                  {!isPaidCustomer && (
                    <div className="mt-1 flex items-center gap-1.5 text-amber-600 text-xs font-semibold uppercase tracking-wider">
                      <Sparkles className="h-3 w-3" />
                      Unlock with Premium
                    </div>
                  )}
                  <div className="flex items-center gap-3 mt-2">
                    <span className="px-2.5 py-1 bg-gray-100 text-sm text-gray-700 rounded-md font-medium">
                      {selectedCompany.exchange}
                    </span>
                    <a 
                      href={selectedCompany.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
                    >
                      View on Screener <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>
                
                <button
                  onClick={generateReport}
                  disabled={loadingReport}
                  className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-md font-medium hover:from-blue-700 hover:to-indigo-700 transition-all shadow-sm disabled:opacity-70"
                >
                  {loadingReport ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  Generate AI Report
                </button>
              </div>

              {showReport ? (
                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                  {loadingReport ? (
                    <div className="py-20 text-center">
                      <div className="relative w-16 h-16 mx-auto mb-6">
                        <div className="absolute inset-0 border-4 border-blue-100 rounded-full"></div>
                        <div className="absolute inset-0 border-4 border-blue-600 rounded-full border-t-transparent animate-spin"></div>
                        <Sparkles className="absolute inset-0 m-auto h-6 w-6 text-blue-600 animate-pulse" />
                      </div>
                      <h3 className="text-lg font-medium text-gray-900">Analyzing Financial Data...</h3>
                      <p className="text-gray-500 mt-2">Our AI is reading the latest P&L statements and generating insights.</p>
                    </div>
                  ) : reportData ? (
                    <div className="space-y-8">
                      {/* Charts Section */}
                      <div ref={chartsRef} className="grid grid-cols-1 lg:grid-cols-2 gap-6 bg-gray-50 p-4 rounded-xl -mx-4 sm:mx-0">
                        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] relative overflow-hidden">
                          {!isPaidCustomer && (
                            <div className="absolute inset-0 z-10 bg-white/40 backdrop-blur-sm flex items-center justify-center p-6 text-center">
                              <div className="bg-white p-6 rounded-2xl shadow-xl border border-gray-100 max-w-xs">
                                <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                  <Sparkles className="h-6 w-6 text-amber-600" />
                                </div>
                                <h4 className="text-lg font-bold text-gray-900 mb-2">Premium Feature</h4>
                                <p className="text-sm text-gray-600 mb-4">Upgrade to Premium to unlock detailed financial charts and AI-powered insights.</p>
                                <button 
                                  onClick={() => setIsPaidCustomer(true)}
                                  className="w-full py-2 bg-amber-600 text-white rounded-lg font-bold text-sm hover:bg-amber-700 transition-colors"
                                >
                                  Unlock Now
                                </button>
                              </div>
                            </div>
                          )}
                          <h3 className="text-base font-semibold text-gray-800 mb-6 flex items-center gap-2">
                            <BarChart3 className="h-5 w-5 text-blue-400" />
                            Revenue vs Net Profit (Cr)
                          </h3>
                          <div className="h-72">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={reportData.chartData} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                                <XAxis dataKey="year" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9CA3AF' }} />
                                <YAxis axisLine={false} tickLine={false} tickCount={5} tick={{ fontSize: 12, fill: '#9CA3AF' }} />
                                <Tooltip 
                                  cursor={{ fill: '#F9FAFB' }}
                                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                />
                                <Legend wrapperStyle={{ paddingTop: '20px' }} iconType="circle" />
                                <Bar dataKey="sales" name="Sales" fill="#3B82F6" radius={[6, 6, 0, 0]} barSize={28} isAnimationActive={false}>
                                  <LabelList dataKey="sales" position="top" offset={8} style={{ fontSize: '10px', fill: '#94A3B8', fontWeight: 600 }} />
                                </Bar>
                                <Bar dataKey="netProfit" name="Net Profit" fill="#10B981" radius={[6, 6, 0, 0]} barSize={28} isAnimationActive={false}>
                                  <LabelList dataKey="netProfit" position="top" offset={8} style={{ fontSize: '10px', fill: '#94A3B8', fontWeight: 600 }} />
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </div>

                        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] relative overflow-hidden">
                          {!isPaidCustomer && (
                            <div className="absolute inset-0 z-10 bg-white/40 backdrop-blur-sm flex items-center justify-center p-6 text-center">
                              {/* Same overlay as above or simplified */}
                            </div>
                          )}
                          <h3 className="text-base font-semibold text-gray-800 mb-6 flex items-center gap-2">
                            <TrendingUp className="h-5 w-5 text-orange-400" />
                            Earnings Per Share (EPS) Trend
                          </h3>
                          <div className="h-72">
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={reportData.chartData} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                                <XAxis dataKey="year" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9CA3AF' }} />
                                <YAxis axisLine={false} tickLine={false} tickCount={5} tick={{ fontSize: 12, fill: '#9CA3AF' }} />
                                <Tooltip 
                                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                />
                                <Legend wrapperStyle={{ paddingTop: '20px' }} iconType="circle" />
                                <Line type="monotone" dataKey="eps" name="EPS (Rs)" stroke="#F59E0B" strokeWidth={3} dot={{ r: 4, fill: '#F59E0B', strokeWidth: 0 }} activeDot={{ r: 6 }} isAnimationActive={false}>
                                  <LabelList dataKey="eps" position="top" offset={12} style={{ fontSize: '10px', fill: '#94A3B8', fontWeight: 600 }} />
                                </Line>
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      </div>

                      {/* Data Tables Section */}
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                          <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
                            <h3 className="font-semibold text-gray-900">Historical Results (Annual)</h3>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm text-gray-600">
                              <thead className="text-xs text-gray-500 uppercase bg-white border-b border-gray-200">
                                <tr>
                                  <th className="px-6 py-3 font-medium">Year</th>
                                  <th className="px-6 py-3 font-medium text-right">Sales (Cr)</th>
                                  <th className="px-6 py-3 font-medium text-right">Net Profit (Cr)</th>
                                  <th className="px-6 py-3 font-medium text-right">EPS (Rs)</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-200">
                                {reportData.chartData?.map((row: any, idx: number) => (
                                  <tr key={idx} className="hover:bg-gray-50">
                                    <td className="px-6 py-3 font-medium text-gray-900">{row.year}</td>
                                    <td className="px-6 py-3 text-right">{row.sales}</td>
                                    <td className="px-6 py-3 text-right">{row.netProfit}</td>
                                    <td className="px-6 py-3 text-right">{row.eps}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                          <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
                            <h3 className="font-semibold text-gray-900">Latest Results (Quarterly)</h3>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm text-gray-600">
                              <thead className="text-xs text-gray-500 uppercase bg-white border-b border-gray-200">
                                <tr>
                                  <th className="px-6 py-3 font-medium">Quarter</th>
                                  <th className="px-6 py-3 font-medium text-right">Sales (Cr)</th>
                                  <th className="px-6 py-3 font-medium text-right">Net Profit (Cr)</th>
                                  <th className="px-6 py-3 font-medium text-right">EPS (Rs)</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-200">
                                {reportData.quarterlyData?.slice(-6).map((row: any, idx: number) => (
                                  <tr key={idx} className="hover:bg-gray-50">
                                    <td className="px-6 py-3 font-medium text-gray-900">{row.quarter}</td>
                                    <td className="px-6 py-3 text-right">{row.sales}</td>
                                    <td className="px-6 py-3 text-right">{row.netProfit}</td>
                                    <td className="px-6 py-3 text-right">{row.eps}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>

                      {/* AI Report Markdown */}
                      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden relative">
                        {!isPaidCustomer && (
                          <div className="absolute inset-x-0 bottom-0 top-[100px] z-10 bg-gradient-to-t from-white via-white/95 to-transparent flex flex-col items-center justify-center p-12 text-center">
                            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-6">
                              <Sparkles className="h-8 w-8 text-blue-600" />
                            </div>
                            <h3 className="text-2xl font-bold text-gray-900 mb-3">Unlock Full AI Analysis</h3>
                            <p className="text-gray-600 max-w-md mb-8">Get deep institutional-grade research, growth catalysts, and risk assessments for this company.</p>
                            <button 
                              onClick={() => setIsPaidCustomer(true)}
                              className="px-8 py-3 bg-blue-600 text-white rounded-xl font-bold text-lg hover:bg-blue-700 transition-all shadow-lg hover:shadow-blue-200"
                            >
                              Upgrade to Premium
                            </button>
                          </div>
                        )}
                        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Sparkles className="h-5 w-5 text-indigo-600" />
                            <h3 className="font-semibold text-gray-900">AI Research Report</h3>
                          </div>
                          <div className="flex items-center gap-3">
                            <button 
                              onClick={downloadMarkdown}
                              className="flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors bg-white px-3 py-1.5 rounded-md border border-blue-200 shadow-sm hover:shadow"
                            >
                              <Download className="h-4 w-4" />
                              <span className="hidden sm:inline">Markdown</span>
                              <span className="sm:hidden">MD</span>
                            </button>
                            <button 
                              onClick={downloadHTML}
                              className="flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors bg-white px-3 py-1.5 rounded-md border border-blue-200 shadow-sm hover:shadow"
                            >
                              <Download className="h-4 w-4" />
                              <span className="hidden sm:inline">HTML</span>
                              <span className="sm:hidden">HTML</span>
                            </button>
                          </div>
                        </div>
                        <div className="p-8 markdown-body">
                          <Markdown>{reportData.aiReport}</Markdown>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="py-12 text-center text-gray-500">
                      <AlertCircle className="h-8 w-8 mx-auto text-gray-400 mb-4" />
                      <p>Failed to load report data.</p>
                    </div>
                  )}
                </div>
              ) : loadingCompany ? (
                <div className="py-12 text-center">
                  <RefreshCw className="h-8 w-8 animate-spin mx-auto text-blue-500 mb-4" />
                  <p className="text-gray-500">Fetching fundamental data...</p>
                </div>
              ) : companyData ? (
                <div className="space-y-8">
                  {/* Key Metrics Grid */}
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Key Fundamentals</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                      {companyData.fundamentals.map((item: any, idx: number) => (
                        <div key={idx} className="bg-gray-50 p-4 rounded-lg border border-gray-100">
                          <div className="text-sm text-gray-500 mb-1">{item.name}</div>
                          <div className="text-lg font-semibold text-gray-900">{item.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* About Section */}
                  {companyData.about && (
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-3">About Company</h3>
                      <div className="bg-gray-50 p-5 rounded-lg border border-gray-100 text-gray-700 leading-relaxed text-sm">
                        {companyData.about}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-12 text-center text-gray-500">
                  <AlertCircle className="h-8 w-8 mx-auto text-gray-400 mb-4" />
                  <p>Failed to load fundamental data.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
