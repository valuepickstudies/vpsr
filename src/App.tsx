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
  Radar,
  Activity
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line, LabelList } from 'recharts';
import Markdown from 'react-markdown';
import html2canvas from 'html2canvas';
import { marked } from 'marked';
import { auth, googleProvider, db } from './firebase';
import { signInWithPopup, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot, collection, addDoc, deleteDoc } from 'firebase/firestore';

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
  symbol: string;
};

type PortfolioItem = {
  id: string;
  type: 'SIP' | 'Lumpsum';
  name: string;
  amount: number;
  date: string;
  description?: string;
};

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'all' | 'results' | 'companies' | 'saved' | 'scanners' | 'discover' | 'admin' | 'portfolio'>('discover');
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

  // Snapshot State
  const [snapshotData, setSnapshotData] = useState<{ name: string; snapshot: string } | null>(null);
  const [loadingSnapshot, setLoadingSnapshot] = useState(false);
  const [showSnapshotModal, setShowSnapshotModal] = useState(false);

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
  const [country, setCountry] = useState<'IN' | 'US'>('IN');

  // Feature Flags
  const [visiblePages, setVisiblePages] = useState({
    discover: true,
    all: true,
    companies: true,
    saved: true,
    scanners: true,
    portfolio: false,
  });

  const [portfolioItems, setPortfolioItems] = useState<PortfolioItem[]>([]);
  const [portfolioForm, setPortfolioForm] = useState<Omit<PortfolioItem, 'id'>>({
    type: 'SIP',
    name: '',
    amount: 0,
    date: new Date().toISOString().split('T')[0],
    description: '',
  });
  const [portfolioSearchQuery, setPortfolioSearchQuery] = useState('');
  const [portfolioSearchResults, setPortfolioSearchResults] = useState<any[]>([]);
  const [isSearchingPortfolio, setIsSearchingPortfolio] = useState(false);
  const [showPortfolioResults, setShowPortfolioResults] = useState(false);

  // Auth State
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  useEffect(() => {
    // Listen for feature flags
    const unsubFlags = onSnapshot(collection(db, 'featureFlags'), (snapshot) => {
      const updates: any = {};
      snapshot.forEach((doc) => {
        updates[doc.id] = doc.data().enabled;
      });
      setVisiblePages(prev => ({ ...prev, ...updates }));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'featureFlags');
    });

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        try {
          const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
          setIsAdmin((userDoc.exists() && userDoc.data().role === 'admin') || currentUser.email === 'valuepicks25@gmail.com');
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, `users/${currentUser.uid}`);
        }
      } else {
        setIsAdmin(false);
      }
    });

    // Listen for portfolio items
    const unsubPortfolio = onSnapshot(collection(db, 'portfolio'), (snapshot) => {
      const items: PortfolioItem[] = [];
      snapshot.forEach((doc) => {
        items.push({ id: doc.id, ...doc.data() } as PortfolioItem);
      });
      setPortfolioItems(items);
    }, (error) => {
      // Gracefully handle permission denied if visibility is off
      if (error.code !== 'permission-denied') {
        handleFirestoreError(error, OperationType.LIST, 'portfolio');
      } else {
        setPortfolioItems([]);
      }
    });

    return () => {
      unsubscribe();
      unsubFlags();
      unsubPortfolio();
    };
  }, []);

  const togglePageVisibility = async (page: string, isVisible: boolean) => {
    if (!isAdmin) return;
    try {
      await setDoc(doc(db, 'featureFlags', page), { enabled: !isVisible });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `featureFlags/${page}`);
    }
  };

  const addPortfolioItem = async () => {
    if (!isAdmin) return;
    try {
      await addDoc(collection(db, 'portfolio'), portfolioForm);
      setPortfolioForm({
        type: 'SIP',
        name: '',
        amount: 0,
        date: new Date().toISOString().split('T')[0],
        description: '',
      });
      setPortfolioSearchQuery('');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'portfolio');
    }
  };

  const deletePortfolioItem = async (id: string) => {
    if (!isAdmin) return;
    try {
      await deleteDoc(doc(db, 'portfolio', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `portfolio/${id}`);
    }
  };

  const handleLogin = async () => {
    if (isLoggingIn) return;
    setIsLoggingIn(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      if (err.code === 'auth/popup-blocked') {
        alert("Please enable popups for this site to log in.");
      } else if (err.code === 'auth/cancelled-popup-request') {
        console.log("Popup request cancelled by user or another request.");
      } else {
        console.error("Login failed:", err);
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    window.location.reload();
  };

  useEffect(() => {
    localStorage.setItem('savedCompanies', JSON.stringify(savedCompanies));
  }, [savedCompanies]);

  useEffect(() => {
    const searchPortfolioCompanies = async () => {
      if (portfolioSearchQuery.length >= 3) {
        setIsSearchingPortfolio(true);
        try {
          const json = await fetchJSON(`/api/companies?search=${encodeURIComponent(portfolioSearchQuery)}&country=${country}`);
          if (json.success) {
            setPortfolioSearchResults(json.data);
            setShowPortfolioResults(true);
          }
        } catch (err) {
          console.error("Portfolio search failed", err);
        } finally {
          setIsSearchingPortfolio(false);
        }
      } else {
        setPortfolioSearchResults([]);
        setShowPortfolioResults(false);
      }
    };

    const timer = setTimeout(searchPortfolioCompanies, 300);
    return () => clearTimeout(timer);
  }, [portfolioSearchQuery, country]);

  const fetchJSON = async (url: string, options?: RequestInit, retryCount = 0): Promise<any> => {
    try {
      const res = await fetch(url, options);
      const contentType = res.headers.get("content-type");
      
      if (!res.ok) {
        let errorMessage = `Server error: ${res.status} ${res.statusText}`;
        if (contentType && contentType.includes("application/json")) {
          try {
            const errorJson = await res.json();
            errorMessage = errorJson.error || errorMessage;
          } catch (e) {
            // Fallback to default message
          }
        } else {
          const text = await res.text();
          console.error(`Non-JSON error response from ${url}:`, text.substring(0, 200));
          
          // If we get "Starting Server" HTML, it's a transient state
          if (text.includes("<title>Starting Server...</title>") && retryCount < 1) {
            console.log(`Server still starting, retrying ${url} in 2s...`);
            await new Promise(resolve => setTimeout(resolve, 2000));
            return fetchJSON(url, options, retryCount + 1);
          }
        }
        throw new Error(errorMessage);
      }

      if (!contentType || !contentType.includes("application/json")) {
        const text = await res.text();
        console.error(`Expected JSON but got ${contentType} from ${url}:`, text.substring(0, 200));
        
        // Retry for HTML responses that might be transient
        if (text.includes("<!doctype html>") && retryCount < 1) {
          console.log(`Received HTML instead of JSON, retrying ${url} in 2s...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
          return fetchJSON(url, options, retryCount + 1);
        }
        
        throw new Error("Invalid response format from server. Please try again.");
      }

      return res.json();
    } catch (err: any) {
      if (retryCount < 1 && err.message === "Failed to fetch") {
        // Network errors also worth a single retry
        await new Promise(resolve => setTimeout(resolve, 2000));
        return fetchJSON(url, options, retryCount + 1);
      }
      throw err;
    }
  };

  const runScanner = async (id: string) => {
    setSelectedScanner(id);
    setLoadingScanner(true);
    try {
      const json = await fetchJSON(`/api/scanners/${id}?country=${country}`);
      if (json.success) {
        setScannerResults(json.data);
      } else {
        setScannerResults([]);
      }
    } catch (err: any) {
      console.error("Failed to run scanner", err);
      setError(err.message || "Failed to run scanner");
      setScannerResults([]);
    } finally {
      setLoadingScanner(false);
    }
  };

  const fetchAnnouncements = async (type: 'all' | 'results') => {
    setLoading(true);
    setError(null);
    try {
      const json = await fetchJSON(`/api/announcements?type=${type}&country=${country}`);
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
        const json = await fetchJSON(`/api/companies?search=${encodeURIComponent(searchQuery)}&country=${country}`);
        if (json.success) {
          setCompanies(json.data);
        }
      } catch (err: any) {
        console.error("Failed to search companies", err);
        setError(err.message || "Failed to search companies");
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
    setError(null);
    try {
      const json = await fetchJSON(`/api/company/fundamentals?url=${encodeURIComponent(company.url)}&country=${country}`);
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
    setError(null);
    try {
      const json = await fetchJSON(`/api/company/report?url=${encodeURIComponent(selectedCompany.url)}&country=${country}`);
      if (json.success) {
        setReportData(json.data);
      } else {
        throw new Error(json.error || "Failed to fetch report data from server");
      }
    } catch (err: any) {
      console.error("Failed to generate report:", err);
      setError(err.message || "Failed to generate report");
    } finally {
      setLoadingReport(false);
    }
  };

  const generateSnapshot = async (company: SavedCompany) => {
    setLoadingSnapshot(true);
    setShowSnapshotModal(true);
    setSnapshotData(null);
    try {
      const json = await fetchJSON(`/api/company/snapshot?url=${encodeURIComponent(company.url)}&country=${country}`);
      if (json.success) {
        setSnapshotData(json.data);
      } else {
        throw new Error(json.error || "Failed to generate snapshot");
      }
    } catch (err: any) {
      console.error("Failed to generate snapshot:", err);
      setSnapshotData({ name: company.name, snapshot: `Error: ${err.message}` });
    } finally {
      setLoadingSnapshot(false);
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
    if (activeTab === 'all' || activeTab === 'results' || activeTab === 'discover') {
      fetchAnnouncements(activeTab === 'discover' ? 'results' : activeTab);
      setSelectedCompany(null);
    } else if (activeTab === 'saved') {
      setSelectedCompany(null);
    }
  }, [activeTab, country]);

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
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-6 w-6 text-blue-600" />
                <h1 className="text-xl font-bold tracking-tight text-gray-900">Market Intelligence</h1>
              </div>
              
              <div className="flex items-center bg-gray-100 p-1 rounded-lg">
                <button
                  onClick={() => setCountry('IN')}
                  className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                    country === 'IN' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  🇮🇳 INDIA
                </button>
                <button
                  onClick={() => setCountry('US')}
                  className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                    country === 'US' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  🇺🇸 USA
                </button>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {user ? (
                <button
                  onClick={handleLogout}
                  className="text-sm font-medium text-gray-600 hover:text-gray-900"
                >
                  Logout
                </button>
              ) : (
                <button
                  onClick={handleLogin}
                  disabled={isLoggingIn}
                  className={`text-sm font-medium ${isLoggingIn ? 'text-gray-400 cursor-not-allowed' : 'text-blue-600 hover:text-blue-800'}`}
                >
                  {isLoggingIn ? 'Logging in...' : 'Login'}
                </button>
              )}
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
          {isAdmin && (
            <button
              onClick={() => setActiveTab('admin')}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
                activeTab === 'admin' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200'
              }`}
            >
              <Shield className="h-4 w-4" />
              Admin
            </button>
          )}
          {visiblePages.all && (
            <button
              onClick={() => setActiveTab('all')}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
                activeTab === 'all' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200'
              }`}
            >
              <FileText className="h-4 w-4" />
              All Announcements
            </button>
          )}
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
          {(visiblePages.portfolio || isAdmin) && (
            <button
              onClick={() => setActiveTab('portfolio')}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
                activeTab === 'portfolio' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200'
              }`}
            >
              <BarChart3 className="h-4 w-4" />
              Portfolio
            </button>
          )}
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
          {activeTab === 'admin' && (
            <div className="p-6 bg-white rounded-xl border border-gray-200 shadow-sm">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Admin Dashboard</h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <h3 className="font-semibold text-gray-800">Page Visibility</h3>
                  {Object.entries(visiblePages).map(([page, isVisible]) => (
                    <div key={page} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <span className="capitalize text-gray-700">{page}</span>
                      <button
                        onClick={() => togglePageVisibility(page, isVisible)}
                        className={`px-3 py-1 rounded-md text-sm font-medium ${
                          isVisible ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {isVisible ? 'Visible' : 'Hidden'}
                      </button>
                    </div>
                  ))}
                </div>

                <div className="space-y-4">
                  <h3 className="font-semibold text-gray-800">Add Portfolio Item</h3>
                  <div className="space-y-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Type</label>
                      <select 
                        value={portfolioForm.type}
                        onChange={(e) => setPortfolioForm({...portfolioForm, type: e.target.value as any})}
                        className="w-full text-sm border border-gray-300 rounded-md px-3 py-2"
                      >
                        <option value="SIP">SIP</option>
                        <option value="Lumpsum">One-time Investment</option>
                      </select>
                    </div>
                    <div className="relative">
                      <label className="block text-xs font-medium text-gray-500 mb-1">Name</label>
                      <input 
                        type="text"
                        value={portfolioSearchQuery || portfolioForm.name}
                        onChange={(e) => {
                          setPortfolioSearchQuery(e.target.value);
                          setPortfolioForm({...portfolioForm, name: e.target.value});
                        }}
                        placeholder="Type 3 letters to search stocks..."
                        className="w-full text-sm border border-gray-300 rounded-md px-3 py-2"
                      />
                      {showPortfolioResults && portfolioSearchResults.length > 0 && (
                        <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-y-auto">
                          {portfolioSearchResults.map((company) => (
                            <button
                              key={company.symbol}
                              onClick={() => {
                                setPortfolioForm({
                                  ...portfolioForm,
                                  name: company.companyName
                                });
                                setPortfolioSearchQuery(company.companyName);
                                setShowPortfolioResults(false);
                              }}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors border-b border-gray-50 last:border-0"
                            >
                              <div className="font-medium text-gray-900">{company.companyName}</div>
                              <div className="text-[10px] text-gray-500">{company.symbol} • {company.exchange}</div>
                            </button>
                          ))}
                        </div>
                      )}
                      {isSearchingPortfolio && (
                        <div className="absolute right-3 top-8">
                          <RefreshCw className="h-3 w-3 text-blue-500 animate-spin" />
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Amount (₹)</label>
                      <input 
                        type="number"
                        value={portfolioForm.amount}
                        onChange={(e) => setPortfolioForm({...portfolioForm, amount: Number(e.target.value)})}
                        className="w-full text-sm border border-gray-300 rounded-md px-3 py-2"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Date</label>
                      <input 
                        type="date"
                        value={portfolioForm.date}
                        onChange={(e) => setPortfolioForm({...portfolioForm, date: e.target.value})}
                        className="w-full text-sm border border-gray-300 rounded-md px-3 py-2"
                      />
                    </div>
                    <button 
                      onClick={addPortfolioItem}
                      className="w-full bg-blue-600 text-white text-sm font-medium py-2 rounded-md hover:bg-blue-700 transition-colors"
                    >
                      Add to Portfolio
                    </button>
                  </div>

                  <div className="mt-6">
                    <h4 className="text-sm font-medium text-gray-700 mb-3">Current Portfolio Items</h4>
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {portfolioItems.map(item => (
                        <div key={item.id} className="flex justify-between items-center p-2 bg-white border border-gray-200 rounded text-sm">
                          <div>
                            <p className="font-medium">{item.name}</p>
                            <p className="text-xs text-gray-500">₹{item.amount.toLocaleString()} • {item.type}</p>
                          </div>
                          <button 
                            onClick={() => deletePortfolioItem(item.id)}
                            className="text-red-500 hover:text-red-700 p-1"
                          >
                            Delete
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
          {activeTab === 'portfolio' && (
            <div className="p-6">
              <div className="mb-8">
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Portfolio Showcase</h2>
                <p className="text-gray-600">A curated view of strategic investments and SIPs.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {portfolioItems.map((item) => (
                  <div key={item.id} className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm hover:shadow-md transition-all">
                    <div className="flex justify-between items-start mb-4">
                      <div className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${
                        item.type === 'SIP' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'
                      }`}>
                        {item.type}
                      </div>
                      <div className="text-sm font-bold text-gray-900">
                        ₹{item.amount.toLocaleString()}
                      </div>
                    </div>
                    <h3 className="text-lg font-bold text-gray-900 mb-2">{item.name}</h3>
                    <div className="flex items-center gap-2 text-xs text-gray-500 mb-4">
                      <Calendar className="h-3.5 w-3.5" />
                      Started: {format(new Date(item.date), 'MMM dd, yyyy')}
                    </div>
                    {item.description && (
                      <p className="text-sm text-gray-600 line-clamp-2">{item.description}</p>
                    )}
                  </div>
                ))}
              </div>

              {portfolioItems.length === 0 && (
                <div className="text-center py-20 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
                  <BarChart3 className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900">No portfolio items to show</h3>
                  <p className="text-gray-500">Check back later for investment updates.</p>
                </div>
              )}
            </div>
          )}
          {activeTab === 'discover' && (
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-amber-500" />
                    Discover New Results
                  </h2>
                  <p className="text-sm text-gray-500">Companies that recently announced their financial performance</p>
                </div>
                <button 
                  onClick={() => fetchAnnouncements('results')}
                  className="flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-800"
                >
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>

              {loading && announcements.length === 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {[1, 2, 3, 4, 5, 6].map(i => (
                    <div key={i} className="animate-pulse bg-gray-50 rounded-xl p-6 border border-gray-100 h-48"></div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {announcements.filter(a => a.category === 'Result').slice(0, 12).map((item) => (
                    <div key={item.id} className="group bg-white rounded-xl p-6 border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all">
                      <div className="flex justify-between items-start mb-4">
                        <div className="bg-blue-50 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">
                          {item.exchange}
                        </div>
                        <span className="text-[10px] text-gray-400 font-medium">
                          {item.date ? format(new Date(item.date), 'MMM dd, HH:mm') : 'N/A'}
                        </span>
                      </div>
                      
                      <h3 className="font-bold text-gray-900 mb-1 line-clamp-1 group-hover:text-blue-600 transition-colors">
                        {item.companyName}
                      </h3>
                      <p className="text-xs text-gray-500 mb-4 font-mono">{item.symbol}</p>
                      
                      <div className="text-xs text-gray-600 mb-6 line-clamp-2 h-8 italic">
                        "{item.subject}"
                      </div>
                      
                      <div className="flex items-center gap-2 mt-auto">
                        <button
                          onClick={() => {
                            const companyUrl = country === 'IN' 
                              ? `https://www.screener.in/company/${item.symbol}/`
                              : `https://finance.yahoo.com/quote/${item.symbol}`;
                            
                            const company: SavedCompany = {
                              id: item.symbol,
                              name: item.companyName,
                              url: companyUrl,
                              exchange: item.exchange,
                              symbol: item.symbol
                            };
                            openCompanyDashboard(company);
                          }}
                          className="flex-1 flex items-center justify-center gap-2 py-2 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
                        >
                          <Sparkles className="h-3.5 w-3.5" />
                          AI Analysis
                        </button>
                        <button
                          onClick={() => {
                            const companyUrl = country === 'IN' 
                              ? `https://www.screener.in/company/${item.symbol}/`
                              : `https://finance.yahoo.com/quote/${item.symbol}`;
                            
                            const company: SavedCompany = {
                              id: item.symbol,
                              name: item.companyName,
                              url: companyUrl,
                              exchange: item.exchange,
                              symbol: item.symbol
                            };
                            generateSnapshot(company);
                          }}
                          className="flex-1 flex items-center justify-center gap-2 py-2 bg-indigo-50 text-indigo-700 text-xs font-bold rounded-lg hover:bg-indigo-100 transition-colors border border-indigo-100"
                        >
                          <Activity className="h-3.5 w-3.5" />
                          Snapshot
                        </button>
                        {item.pdfLink && (
                          <a 
                            href={item.pdfLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
                            title="View PDF"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                  {announcements.filter(a => a.category === 'Result').length === 0 && (
                    <div className="col-span-full py-20 text-center text-gray-500 bg-gray-50 rounded-xl border border-dashed border-gray-300">
                      <FileText className="h-10 w-10 mx-auto mb-3 text-gray-300" />
                      <p>No recent results found. Try refreshing or changing country.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

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
                              <div className="flex items-center justify-end gap-3">
                                {item.category === 'Result' && (
                                  <>
                                    <button
                                      onClick={() => {
                                        const companyUrl = country === 'IN' 
                                          ? `https://www.screener.in/company/${item.symbol}/`
                                          : `https://finance.yahoo.com/quote/${item.symbol}`;
                                        
                                        const company: SavedCompany = {
                                          id: item.symbol,
                                          name: item.companyName,
                                          url: companyUrl,
                                          exchange: item.exchange,
                                          symbol: item.symbol
                                        };
                                        openCompanyDashboard(company);
                                      }}
                                      className="inline-flex items-center gap-1 text-amber-600 hover:text-amber-800 font-medium text-xs bg-amber-50 px-2 py-1 rounded border border-amber-100 transition-colors"
                                    >
                                      <Sparkles className="h-3 w-3" />
                                      Analyze
                                    </button>
                                    <button
                                      onClick={() => {
                                        const companyUrl = country === 'IN' 
                                          ? `https://www.screener.in/company/${item.symbol}/`
                                          : `https://finance.yahoo.com/quote/${item.symbol}`;
                                        
                                        const company: SavedCompany = {
                                          id: item.symbol,
                                          name: item.companyName,
                                          url: companyUrl,
                                          exchange: item.exchange,
                                          symbol: item.symbol
                                        };
                                        generateSnapshot(company);
                                      }}
                                      className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-medium text-xs bg-indigo-50 px-2 py-1 rounded border border-indigo-100 transition-colors"
                                    >
                                      <Activity className="h-3.5 w-3.5" />
                                      Snapshot
                                    </button>
                                  </>
                                )}
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
                              </div>
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

                  {/* Recent Filings Section */}
                  {companyData.recentAnnouncements && companyData.recentAnnouncements.length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <FileText className="h-5 w-5 text-blue-500" />
                        Recent Exchange Filings & Documents
                      </h3>
                      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                        <table className="w-full text-left text-sm text-gray-600">
                          <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-200">
                            <tr>
                              <th className="px-6 py-3 font-medium">Date</th>
                              <th className="px-6 py-3 font-medium">Subject</th>
                              <th className="px-6 py-3 font-medium text-right">Document</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200">
                            {companyData.recentAnnouncements.map((item: any) => (
                              <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                                <td className="px-6 py-3 whitespace-nowrap text-gray-500">
                                  {item.date ? format(new Date(item.date), 'MMM dd, yyyy') : 'N/A'}
                                </td>
                                <td className="px-6 py-3">
                                  <div className="font-medium text-gray-900 line-clamp-1" title={item.subject}>
                                    {item.subject}
                                  </div>
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 mt-1 uppercase">
                                    {item.category || 'Filing'}
                                  </span>
                                </td>
                                <td className="px-6 py-3 text-right">
                                  {item.pdfLink ? (
                                    <a 
                                      href={item.pdfLink} 
                                      target="_blank" 
                                      rel="noopener noreferrer"
                                      className="text-blue-600 hover:text-blue-800 font-medium inline-flex items-center gap-1"
                                    >
                                      View <ExternalLink className="h-3 w-3" />
                                    </a>
                                  ) : (
                                    <span className="text-gray-400">N/A</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
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

      {/* Snapshot Modal */}
      <AnimatePresence>
        {showSnapshotModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSnapshotModal(false)}
              className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-200"
            >
              <div className="bg-gradient-to-r from-indigo-600 to-blue-600 px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-2 text-white">
                  <Sparkles className="h-5 w-5" />
                  <h3 className="font-bold">Quick Result Snapshot</h3>
                </div>
                <button 
                  onClick={() => setShowSnapshotModal(false)}
                  className="text-white/80 hover:text-white transition-colors"
                >
                  <RefreshCw className="h-5 w-5 rotate-45" />
                </button>
              </div>
              
              <div className="p-6">
                {loadingSnapshot ? (
                  <div className="py-12 text-center">
                    <RefreshCw className="h-8 w-8 animate-spin mx-auto text-indigo-600 mb-4" />
                    <p className="text-gray-500 font-medium">Analyzing latest results...</p>
                  </div>
                ) : snapshotData ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xl font-bold text-gray-900">{snapshotData.name}</h4>
                      <span className="text-[10px] font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded uppercase">Latest Insight</span>
                    </div>
                    <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed">
                      <Markdown>{snapshotData.snapshot}</Markdown>
                    </div>
                    <div className="pt-4 border-t border-gray-100 flex justify-end">
                      <button 
                        onClick={() => setShowSnapshotModal(false)}
                        className="px-4 py-2 bg-gray-900 text-white text-sm font-bold rounded-lg hover:bg-gray-800 transition-colors"
                      >
                        Got it
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="py-8 text-center text-gray-500">
                    <AlertCircle className="h-8 w-8 mx-auto text-red-400 mb-3" />
                    <p>Failed to generate snapshot. Please try again.</p>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
