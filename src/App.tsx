import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
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
import { format, subDays } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line, LabelList } from 'recharts';
import html2canvas from 'html2canvas';
import { marked } from 'marked';
import { auth, googleProvider, db } from './firebase';
import { signInWithPopup, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot, collection, addDoc, deleteDoc } from 'firebase/firestore';
import { STRATEGY_PORTFOLIOS, type StrategyId } from '../strategyPortfolios';
import type { CompanyReportData, CompanySnapshotData, QualityGateResult, ReportType } from '../shared/reportTypes';
import type { SavedReportListItem } from '../shared/savedReportContracts';
import { fetchJSON } from './services/apiClient';
import { createRecommendation, fetchCompanyReport, fetchCompanySnapshot, fetchLatestRecommendationPolicy, fetchOutcomesSummary, fetchRecommendationById, fetchRecommendationCalibration, fetchReportQuality, fetchReportScoreById, fetchSavedReports, fetchThesisMemory, type OutcomesSummaryData, type RecommendationPolicyData, type ReportScoreData, type ThesisMemoryData } from './services/reportService';
import { fetchHoldingMetrics, fetchPositionSizing, fetchStrategyPerformance, type PositionSizingData } from './services/portfolioService';
import { getErrorMessage } from './utils/errorUtils';
import ScannerWorkspace, { type ScannerStrategy } from './components/ScannerWorkspace';
import ReportWorkspaceHeader from './components/ReportWorkspaceHeader';
import ReportFinancialTables from './components/ReportFinancialTables';
import ReportInsightsPanel from './components/ReportInsightsPanel';
import ReportChartsSection from './components/ReportChartsSection';
import FundamentalsPanel from './components/FundamentalsPanel';
import SnapshotModal from './components/SnapshotModal';
import {
  fetchAnnouncementsByType,
  fetchCompanyFundamentals,
  fetchPriceHistory,
  runScannerById,
  searchCompanies,
  type Announcement as MarketAnnouncement,
  type CompanyFundamentals,
  type CompanySearchResult,
} from './services/marketDataService';

const STRATEGIES: ScannerStrategy[] = [
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

type Announcement = MarketAnnouncement;

type SavedCompany = {
  id: string;
  name: string;
  url: string;
  exchange: string;
  symbol: string;
};

const SELECTED_COMPANY_STORAGE_KEY = 'selectedCompanyContext';
function loadSelectedCompanyContext(): {
  company: SavedCompany | null;
  country: 'IN' | 'US';
  activeTab: 'all' | 'results' | 'companies' | 'saved' | 'scanners' | 'discover' | 'admin' | 'portfolio';
} {
  try {
    const raw = localStorage.getItem(SELECTED_COMPANY_STORAGE_KEY);
    if (!raw) return { company: null, country: 'IN', activeTab: 'discover' };
    const parsed = JSON.parse(raw);
    const company = parsed?.company;
    const country: 'IN' | 'US' = parsed?.country === 'US' ? 'US' : 'IN';
    if (!company?.url || !company?.id) return { company: null, country, activeTab: 'discover' };
    return { company, country, activeTab: 'discover' };
  } catch {
    return { company: null, country: 'IN', activeTab: 'discover' };
  }
}

function redactCompanyNameFromText(input: string, companyName: string, symbol?: string, replacement = '[Hidden Company]'): string {
  if (!input) return input;
  const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const legalSuffixes = new Set(['ltd', 'limited', 'inc', 'corp', 'corporation', 'co', 'company', 'plc', 'llc', 'pvt', 'private']);
  const words = companyName.trim().match(/[A-Za-z0-9]+/g) || [];
  const coreWords = [...words];
  while (coreWords.length > 0 && legalSuffixes.has(coreWords[coreWords.length - 1].toLowerCase())) {
    coreWords.pop();
  }
  const patterns: RegExp[] = [];
  if (companyName.trim()) patterns.push(new RegExp(escapeRegex(companyName.trim()), 'gi'));
  if (words.length) patterns.push(new RegExp(`\\b${words.map(escapeRegex).join('\\s+')}\\b`, 'gi'));
  if (coreWords.length && coreWords.length !== words.length) patterns.push(new RegExp(`\\b${coreWords.map(escapeRegex).join('\\s+')}\\b`, 'gi'));
  if (coreWords.length >= 2) patterns.push(new RegExp(`\\b${escapeRegex(coreWords[0])}\\s+${escapeRegex(coreWords[1])}\\b`, 'gi'));
  if (symbol && symbol.length >= 2 && symbol.length <= 10) patterns.push(new RegExp(`\\b${escapeRegex(symbol)}\\b`, 'gi'));
  let output = input;
  for (const p of patterns) output = output.replace(p, replacement);
  return output;
}

type PortfolioItem = {
  id: string;
  type: 'SIP' | 'Lumpsum';
  name: string;
  amount: number;
  date: string;
  description?: string;
};

type CustomPortfolioHolding = {
  symbol: string;
  name: string;
  purchaseDate: string;
  amount: number;
  quantity: number;
};

type CustomPortfolio = {
  id: string;
  name: string;
  holdings: CustomPortfolioHolding[];
};

type StrategyPerfRow = {
  symbol: string;
  returnPct: number | null;
};

type StrategyPerformance = {
  equalWeightReturnPct: number | null;
  countOk: number;
  countTotal: number;
  symbols: StrategyPerfRow[];
};

type HoldingMetrics = {
  symbol: string;
  purchaseDate: string;
  purchasePrice: number;
  currentDate: string;
  currentPrice: number;
  quantity: number | null;
  investmentValue: number | null;
  marketValue: number | null;
  dailyPctGain: number | null;
  totalPctGain: number | null;
};

function getApiErrorMessage(response: { success: boolean; error?: string }, fallback: string): string {
  if (!response.success && response.error) return response.error;
  return fallback;
}

type TechnicalRange = '3M' | '6M' | '1Y' | '3Y' | '5Y';
type TechnicalCandle = {
  date: string;
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
};

type PriceActionMarker = {
  ts: number;
  price: number;
  label: string;
  kind: 'breakout' | 'breakdown' | 'swing-high' | 'swing-low';
};

function clampNumber(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

function filterCandlesByRange(candles: TechnicalCandle[], range: TechnicalRange): TechnicalCandle[] {
  if (!candles.length) return [];
  const days =
    range === '3M' ? 90 :
    range === '6M' ? 180 :
    range === '1Y' ? 365 :
    range === '3Y' ? 365 * 3 :
    365 * 5;
  const cutoff = subDays(new Date(candles[candles.length - 1].ts), days).getTime();
  return candles.filter((c) => c.ts >= cutoff);
}

function buildPriceActionMarkers(candles: TechnicalCandle[]): PriceActionMarker[] {
  if (candles.length < 30) return [];
  const out: PriceActionMarker[] = [];
  const breakoutWindow = 20;
  const swingWindow = 3;

  for (let i = breakoutWindow; i < candles.length; i++) {
    const prev = candles.slice(i - breakoutWindow, i);
    const prevHigh = Math.max(...prev.map((c) => c.high));
    const prevLow = Math.min(...prev.map((c) => c.low));
    const c = candles[i];
    if (c.close > prevHigh * 1.01) out.push({ ts: c.ts, price: c.high, label: 'Breakout', kind: 'breakout' });
    else if (c.close < prevLow * 0.99) out.push({ ts: c.ts, price: c.low, label: 'Breakdown', kind: 'breakdown' });
  }

  for (let i = swingWindow; i < candles.length - swingWindow; i++) {
    const c = candles[i];
    const left = candles.slice(i - swingWindow, i);
    const right = candles.slice(i + 1, i + swingWindow + 1);
    if ([...left, ...right].every((p) => c.high >= p.high)) out.push({ ts: c.ts, price: c.high, label: 'Swing High', kind: 'swing-high' });
    if ([...left, ...right].every((p) => c.low <= p.low)) out.push({ ts: c.ts, price: c.low, label: 'Swing Low', kind: 'swing-low' });
  }

  out.sort((a, b) => a.ts - b.ts);
  return out.slice(-20);
}

function buildFutureProjectionRows(chartData: Array<{ year: string; sales: number; netProfit: number }>) {
  const rows = (chartData || []).slice(-4).map((r) => ({
    year: String(r.year),
    sales: Number(r.sales) || 0,
    netProfit: Number(r.netProfit) || 0,
  })).filter((r) => Number.isFinite(r.sales) && Number.isFinite(r.netProfit));
  if (rows.length < 2) return [];
  const salesGrowth = rows.slice(1).map((r, i) => rows[i].sales > 0 ? (r.sales / rows[i].sales - 1) : 0);
  const profitGrowth = rows.slice(1).map((r, i) => rows[i].netProfit > 0 ? (r.netProfit / rows[i].netProfit - 1) : 0);
  const avgSalesGrowth = salesGrowth.length ? salesGrowth.reduce((a, b) => a + b, 0) / salesGrowth.length : 0;
  const avgProfitGrowth = profitGrowth.length ? profitGrowth.reduce((a, b) => a + b, 0) / profitGrowth.length : 0;
  const last = rows[rows.length - 1];
  let s = last.sales;
  let p = last.netProfit;
  const out = [];
  for (let i = 1; i <= 3; i++) {
    s = s * (1 + clampNumber(avgSalesGrowth, -0.2, 0.35));
    p = p * (1 + clampNumber(avgProfitGrowth, -0.3, 0.4));
    out.push({
      year: `${Number(last.year || new Date().getFullYear()) + i}E`,
      sales: Number(s.toFixed(2)),
      netProfit: Number(p.toFixed(2)),
    });
  }
  return out;
}

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
  const [activeTab, setActiveTab] = useState<'all' | 'results' | 'companies' | 'saved' | 'scanners' | 'discover' | 'admin' | 'portfolio'>(() => loadSelectedCompanyContext().activeTab);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [companies, setCompanies] = useState<CompanySearchResult[]>([]);
  const [searchingCompanies, setSearchingCompanies] = useState(false);

  // Dashboard State
  const [selectedCompany, setSelectedCompany] = useState<SavedCompany | null>(() => loadSelectedCompanyContext().company);
  const [companyData, setCompanyData] = useState<CompanyFundamentals | null>(null);
  const [loadingCompany, setLoadingCompany] = useState(false);

  // Report State
  const [reportData, setReportData] = useState<CompanyReportData | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [reportType, setReportType] = useState<ReportType>('standard');
  const [hideCompanyNameInReport, setHideCompanyNameInReport] = useState(false);
  const [reportCompanyNameRevealed, setReportCompanyNameRevealed] = useState(false);
  const [technicalRange, setTechnicalRange] = useState<TechnicalRange>('1Y');
  const [priceCandles, setPriceCandles] = useState<TechnicalCandle[]>([]);
  const [loadingPriceCandles, setLoadingPriceCandles] = useState(false);
  const chartsRef = useRef<HTMLDivElement>(null);

  // Snapshot State
  const [snapshotData, setSnapshotData] = useState<CompanySnapshotData | null>(null);
  const [loadingSnapshot, setLoadingSnapshot] = useState(false);
  const [showSnapshotModal, setShowSnapshotModal] = useState(false);

  // Saved Companies State
  const [savedCompanies, setSavedCompanies] = useState<SavedCompany[]>(() => {
    const saved = localStorage.getItem('savedCompanies');
    return saved ? JSON.parse(saved) : [];
  });

  // Scanner State
  const [selectedScanner, setSelectedScanner] = useState<string | null>(null);
  const [scannerResults, setScannerResults] = useState<CompanySearchResult[]>([]);
  const [loadingScanner, setLoadingScanner] = useState(false);
  const [scannerWorkspaceTab, setScannerWorkspaceTab] = useState<'scanners' | 'results' | 'reports'>('scanners');
  const [isPaidCustomer, setIsPaidCustomer] = useState(false);
  const [country, setCountry] = useState<'IN' | 'US'>(() => loadSelectedCompanyContext().country);

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
  const [portfolioSearchResults, setPortfolioSearchResults] = useState<CompanySearchResult[]>([]);
  const [isSearchingPortfolio, setIsSearchingPortfolio] = useState(false);
  const [showPortfolioResults, setShowPortfolioResults] = useState(false);
  const [portfolioWorkspaceTab, setPortfolioWorkspaceTab] = useState<'strategy' | 'custom'>('strategy');
  const [strategyTab, setStrategyTab] = useState<StrategyId>('medium_risk');
  const [strategyInvestDate, setStrategyInvestDate] = useState(() => format(subDays(new Date(), 365 * 3), 'yyyy-MM-dd'));
  const [strategyPerf, setStrategyPerf] = useState<StrategyPerformance | null>(null);
  const [strategyPerfLoading, setStrategyPerfLoading] = useState(false);
  const [strategyPerfError, setStrategyPerfError] = useState<string | null>(null);
  const [strategyWeightMode, setStrategyWeightMode] = useState<'equal' | 'best'>('equal');
  const [strategyInvestmentAmount, setStrategyInvestmentAmount] = useState(100000);
  const [savedReports, setSavedReports] = useState<SavedReportListItem[]>([]);
  const [loadingSavedReports, setLoadingSavedReports] = useState(false);
  const [judgeData, setJudgeData] = useState<QualityGateResult | null>(null);
  const [loadingJudge, setLoadingJudge] = useState(false);
  const [recencyValidation, setRecencyValidation] = useState<{ latestAnnouncementDate: string | null; checkedAt: string; symbol: string } | null>(null);
  const [reportScore, setReportScore] = useState<ReportScoreData["scorecard"] | null>(null);
  const [outcomesSummary, setOutcomesSummary] = useState<OutcomesSummaryData | null>(null);
  const [loadingScoreAndOutcomes, setLoadingScoreAndOutcomes] = useState(false);
  const [thesisMemory, setThesisMemory] = useState<ThesisMemoryData | null>(null);
  const [positionSizing, setPositionSizing] = useState<PositionSizingData | null>(null);
  const [recommendation, setRecommendation] = useState<{
    action: "buy" | "watch" | "avoid";
    confidencePct: number;
    horizonDays: number;
    riskClass: "low" | "medium" | "high";
    explainability: { positive: string[]; negative: string[]; caveats: string[] };
  } | null>(null);
  const [recommendationCalibration, setRecommendationCalibration] = useState<{
    sampleCount: number;
    brierLikeScore: number | null;
    hitRateAtBand: number | null;
  } | null>(null);
  const [recommendationPolicy, setRecommendationPolicy] = useState<RecommendationPolicyData | null>(null);
  const [customPortfolios, setCustomPortfolios] = useState<CustomPortfolio[]>(() => {
    try {
      const raw = localStorage.getItem('customPortfolios');
      return raw ? JSON.parse(raw) : [{ id: 'default', name: 'My Portfolio', holdings: [] }];
    } catch {
      return [{ id: 'default', name: 'My Portfolio', holdings: [] }];
    }
  });
  const [activeCustomPortfolioId, setActiveCustomPortfolioId] = useState<string>('default');
  const [showPortfolioView, setShowPortfolioView] = useState(false);
  const [holdingMetrics, setHoldingMetrics] = useState<Record<string, HoldingMetrics | null>>({});
  const [chartPaletteByCountry, setChartPaletteByCountry] = useState<Record<'IN' | 'US', 'default' | 'emerald' | 'violet'>>(() => {
    try {
      const raw = localStorage.getItem('chartPaletteByCountry');
      if (!raw) return { IN: 'default', US: 'default' };
      const parsed = JSON.parse(raw);
      return {
        IN: parsed?.IN || 'default',
        US: parsed?.US || 'default',
      };
    } catch {
      return { IN: 'default', US: 'default' };
    }
  });

  // Auth State
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLocalAdminAuthenticated, setIsLocalAdminAuthenticated] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const hasAdminAccess = isAdmin || isLocalAdminAuthenticated;

  useEffect(() => {
    // Listen for feature flags
    const unsubFlags = onSnapshot(collection(db, 'featureFlags'), (snapshot) => {
      const updates: Partial<typeof visiblePages> = {};
      snapshot.forEach((doc) => {
        const key = doc.id as keyof typeof visiblePages;
        updates[key] = Boolean(doc.data().enabled);
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
    if (!hasAdminAccess) return;
    try {
      await setDoc(doc(db, 'featureFlags', page), { enabled: !isVisible });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `featureFlags/${page}`);
    }
  };

  const addPortfolioItem = async () => {
    if (!hasAdminAccess) return;
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
    if (!hasAdminAccess) return;
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
    } catch (err: unknown) {
      const code = typeof err === 'object' && err !== null && 'code' in err ? String((err as { code?: unknown }).code || '') : '';
      if (code === 'auth/popup-blocked') {
        alert("Please enable popups for this site to log in.");
      } else if (code === 'auth/cancelled-popup-request') {
        console.log("Popup request cancelled by user or another request.");
      } else if (code === 'auth/api-key-not-valid.-please-pass-a-valid-api-key.') {
        alert("Firebase API key is invalid. Set VITE_FIREBASE_API_KEY in .env.local and restart the dev server.");
      } else {
        console.error("Login failed:", err);
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    if (isLocalAdminAuthenticated && !user) {
      setIsLocalAdminAuthenticated(false);
      setIsAdmin(false);
      return;
    }
    await signOut(auth);
    setIsLocalAdminAuthenticated(false);
    window.location.reload();
  };

  useEffect(() => {
    localStorage.setItem('savedCompanies', JSON.stringify(savedCompanies));
  }, [savedCompanies]);

  useEffect(() => {
    localStorage.setItem('customPortfolios', JSON.stringify(customPortfolios));
  }, [customPortfolios]);

  useEffect(() => {
    localStorage.setItem('chartPaletteByCountry', JSON.stringify(chartPaletteByCountry));
  }, [chartPaletteByCountry]);

  useEffect(() => {
    if (selectedCompany) {
      localStorage.setItem(SELECTED_COMPANY_STORAGE_KEY, JSON.stringify({ company: selectedCompany, country }));
    } else {
      localStorage.removeItem(SELECTED_COMPANY_STORAGE_KEY);
    }
  }, [selectedCompany, country]);

  useEffect(() => {
    const searchPortfolioCompanies = async () => {
      if (portfolioSearchQuery.length >= 3) {
        setIsSearchingPortfolio(true);
        try {
          const json = await searchCompanies(portfolioSearchQuery, country);
          if (json.success) {
            setPortfolioSearchResults(json.data);
            setShowPortfolioResults(true);
          }
        } catch (err: unknown) {
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

  const loadStrategyPerformance = useCallback(async (overrideDate?: string) => {
    const pf = STRATEGY_PORTFOLIOS.find((p) => p.id === strategyTab);
    if (!pf) return;
    const investDate = overrideDate ?? strategyInvestDate;
    setStrategyPerfLoading(true);
    setStrategyPerfError(null);
    try {
      const symbols = pf.stocks.map((s) => s.symbol).join(',');
      const json = await fetchStrategyPerformance(investDate, symbols);
      if (!json.success) throw new Error(getApiErrorMessage(json, 'Performance request failed'));
      setStrategyPerf(json.data);
    } catch (err: unknown) {
      setStrategyPerf(null);
      setStrategyPerfError(getErrorMessage(err, 'Failed to load performance'));
    } finally {
      setStrategyPerfLoading(false);
    }
  }, [strategyTab, strategyInvestDate]);

  useEffect(() => {
    if (activeTab !== 'portfolio') return;
    void loadStrategyPerformance();
  }, [activeTab, strategyTab, loadStrategyPerformance]);

  const selectedStrategyPf = useMemo(
    () => STRATEGY_PORTFOLIOS.find((p) => p.id === strategyTab),
    [strategyTab]
  );

  const activeCustomPortfolio = useMemo(
    () => customPortfolios.find((p) => p.id === activeCustomPortfolioId) || customPortfolios[0] || { id: 'default', name: 'My Portfolio', holdings: [] },
    [customPortfolios, activeCustomPortfolioId]
  );

  const addToCustomPortfolio = (company: { symbol?: string; id?: string; name: string }) => {
    const symbol = (company.symbol || company.id || '').toUpperCase();
    if (!symbol) return;
    const today = format(new Date(), 'yyyy-MM-dd');
    setCustomPortfolios((prev) => prev.map((p) => {
      if (p.id !== activeCustomPortfolio.id) return p;
      if (p.holdings.some((h) => h.symbol === symbol)) return p;
      return {
        ...p,
        holdings: [
          ...p.holdings,
          { symbol, name: company.name, purchaseDate: today, amount: 10000, quantity: 1 },
        ],
      };
    }));
  };

  const removeHolding = (symbol: string) => {
    setCustomPortfolios((prev) => prev.map((p) => (
      p.id === activeCustomPortfolio.id
        ? { ...p, holdings: p.holdings.filter((h) => h.symbol !== symbol) }
        : p
    )));
  };

  const updateHolding = (symbol: string, patch: Partial<CustomPortfolioHolding>) => {
    setCustomPortfolios((prev) => prev.map((p) => (
      p.id === activeCustomPortfolio.id
        ? {
            ...p,
            holdings: p.holdings.map((h) => h.symbol === symbol ? { ...h, ...patch } : h),
          }
        : p
    )));
  };

  const loadSavedReports = useCallback(async () => {
    if (!selectedCompany) return;
    setLoadingSavedReports(true);
    try {
      const json = await fetchSavedReports(country, selectedCompany.symbol || selectedCompany.id);
      if (json.success) setSavedReports(json.data || []);
    } catch (err: unknown) {
      console.warn('Failed to load saved reports', err);
    } finally {
      setLoadingSavedReports(false);
    }
  }, [country, selectedCompany]);

  const loadScoreAndOutcomes = useCallback(async () => {
    if (!selectedCompany) return;
    setLoadingScoreAndOutcomes(true);
    try {
      let recommendationConfidencePct: number | null = null;
      const saved = await fetchSavedReports(country, selectedCompany.symbol || selectedCompany.id);
      const latestReport = saved.success && saved.data.length > 0 ? saved.data[0] : null;
      if (latestReport) {
        const score = await fetchReportScoreById(Number(latestReport.id));
        if (score.success) {
          setReportScore(score.data.scorecard);
          let recId = score.data.recommendationId;
          if (!recId) {
            const rec = await createRecommendation({
              reportId: Number(latestReport.id),
              symbol: (selectedCompany.symbol || selectedCompany.id).toUpperCase(),
              country,
              recommendationAction: score.data.scorecard.totalScore >= 72 ? "buy" : score.data.scorecard.totalScore >= 52 ? "watch" : "avoid",
              confidencePct: Math.max(5, Math.min(95, Math.round(score.data.scorecard.totalScore * 0.85))),
              horizonDays: 90,
              riskClass: score.data.scorecard.breakdown.risk >= 70 ? "low" : score.data.scorecard.breakdown.risk >= 45 ? "medium" : "high",
              explainability: {
                positive: [`quality:${score.data.scorecard.breakdown.quality}`, `valuation:${score.data.scorecard.breakdown.valuation}`],
                negative: [`risk:${100 - score.data.scorecard.breakdown.risk}`],
                caveats: ["outcomes can vary by market regime"],
              },
              scoreSnapshot: score.data.scorecard,
            });
            recId = rec.success ? rec.data.id : undefined;
          }
          if (recId) {
            const recData = await fetchRecommendationById(recId);
            if (recData.success) {
              recommendationConfidencePct = recData.data.confidencePct;
              setRecommendation({
                action: recData.data.recommendationAction,
                confidencePct: recData.data.confidencePct,
                horizonDays: recData.data.horizonDays,
                riskClass: recData.data.riskClass,
                explainability: recData.data.explainability,
              });
            } else {
              setRecommendation(null);
            }
          } else {
            setRecommendation(null);
          }
          const sizing = await fetchPositionSizing({
            capital: strategyInvestmentAmount || 100000,
            riskBudgetPct: 1,
            stopLossPct: 8,
            candidates: [{ symbol: selectedCompany.symbol || selectedCompany.id, score: score.data.scorecard.totalScore }],
          });
          if (sizing.success) setPositionSizing(sizing.data);
          else setPositionSizing(null);
        }
      } else {
        setReportScore(null);
        setPositionSizing(null);
        setRecommendation(null);
      }
      const outcomes = await fetchOutcomesSummary(90, country);
      if (outcomes.success) setOutcomesSummary(outcomes.data);
      else setOutcomesSummary(null);
      const calibration = await fetchRecommendationCalibration(180);
      if (calibration.success && recommendationConfidencePct != null) {
        const band = calibration.data.buckets.find((b) => recommendationConfidencePct >= b.minConfidence && recommendationConfidencePct <= b.maxConfidence) || null;
        setRecommendationCalibration({
          sampleCount: calibration.data.sampleCount,
          brierLikeScore: calibration.data.brierLikeScore,
          hitRateAtBand: band?.hitRatePct ?? null,
        });
      } else {
        setRecommendationCalibration(calibration.success ? {
          sampleCount: calibration.data.sampleCount,
          brierLikeScore: calibration.data.brierLikeScore,
          hitRateAtBand: null,
        } : null);
      }
      const policy = await fetchLatestRecommendationPolicy();
      if (policy.success) setRecommendationPolicy(policy.data);
      else setRecommendationPolicy(null);
      const thesis = await fetchThesisMemory((selectedCompany.symbol || selectedCompany.id).toUpperCase(), country);
      if (thesis.success) setThesisMemory(thesis.data);
      else setThesisMemory(null);
    } catch (err: unknown) {
      console.warn("Failed to load score/outcomes", err);
      setReportScore(null);
      setOutcomesSummary(null);
      setThesisMemory(null);
      setPositionSizing(null);
      setRecommendation(null);
      setRecommendationCalibration(null);
      setRecommendationPolicy(null);
    } finally {
      setLoadingScoreAndOutcomes(false);
    }
  }, [country, selectedCompany, strategyInvestmentAmount]);

  const runJudgeValidation = useCallback(async () => {
    if (!selectedCompany) return;
    setLoadingJudge(true);
    try {
      const { judge, recency } = await fetchReportQuality(selectedCompany.url, country, selectedCompany.symbol);
      if (judge?.success) setJudgeData(judge.data as QualityGateResult);
      if (recency?.success) setRecencyValidation(recency.data as { latestAnnouncementDate: string | null; checkedAt: string; symbol: string });
    } catch (err: unknown) {
      console.warn('Judge validation failed', err);
      setJudgeData(null);
      setRecencyValidation(null);
    } finally {
      setLoadingJudge(false);
    }
  }, [country, selectedCompany]);

  useEffect(() => {
    if (!selectedCompany || !showReport) {
      setPriceCandles([]);
      setLoadingPriceCandles(false);
      return;
    }
    let cancelled = false;
    setTechnicalRange('1Y');
    setLoadingPriceCandles(true);

    (async () => {
      try {
        const json = await fetchPriceHistory(selectedCompany.url, country, selectedCompany.symbol);
        if (!cancelled && json?.success) {
          setPriceCandles(json.data.candles);
        }
      } catch (err: unknown) {
        console.warn('Failed to load price candles', err);
        if (!cancelled) setPriceCandles([]);
      } finally {
        if (!cancelled) setLoadingPriceCandles(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedCompany?.url, selectedCompany?.symbol, country, showReport]);

  useEffect(() => {
    if (!selectedCompany || !showReport || !reportData) return;
    void loadSavedReports();
    void runJudgeValidation();
    void loadScoreAndOutcomes();
  }, [selectedCompany, showReport, reportData, loadSavedReports, runJudgeValidation, loadScoreAndOutcomes]);

  useEffect(() => {
    if (!showPortfolioView || portfolioWorkspaceTab !== 'custom') return;
    (async () => {
      const next: Record<string, HoldingMetrics | null> = {};
      for (const h of activeCustomPortfolio.holdings) {
        try {
          const json = await fetchHoldingMetrics(h.symbol, h.purchaseDate, h.quantity);
          if (json.success) next[h.symbol] = json.data;
        } catch {
          next[h.symbol] = null;
        }
      }
      setHoldingMetrics(next);
    })();
  }, [showPortfolioView, portfolioWorkspaceTab, activeCustomPortfolio, fetchJSON]);

  const rangedCandles = useMemo(
    () => filterCandlesByRange(priceCandles, technicalRange),
    [priceCandles, technicalRange]
  );
  const priceActionMarkers = useMemo(
    () => buildPriceActionMarkers(rangedCandles),
    [rangedCandles]
  );
  const projectionRows = useMemo(
    () => buildFutureProjectionRows(reportData?.chartData || []),
    [reportData?.chartData]
  );
  const activeChartPalette = useMemo(() => {
    const mode = chartPaletteByCountry[country];
    if (mode === 'emerald') return { sales: '#059669', profit: '#0ea5e9', eps: '#f59e0b', projection: '#10b981', technical: '#2563eb' };
    if (mode === 'violet') return { sales: '#7c3aed', profit: '#ec4899', eps: '#f59e0b', projection: '#8b5cf6', technical: '#0891b2' };
    return { sales: '#3B82F6', profit: '#10B981', eps: '#F59E0B', projection: '#6366F1', technical: '#2563eb' };
  }, [chartPaletteByCountry, country]);

  const runScanner = async (id: string) => {
    setSelectedScanner(id);
    setScannerWorkspaceTab('results');
    setLoadingScanner(true);
    try {
      const json = await runScannerById(id, country);
      if (json.success) {
        setScannerResults(json.data);
      } else {
        setScannerResults([]);
      }
    } catch (err: unknown) {
      console.error("Failed to run scanner", err);
      setError(getErrorMessage(err, "Failed to run scanner"));
      setScannerResults([]);
    } finally {
      setLoadingScanner(false);
    }
  };

  const fetchAnnouncements = async (type: 'all' | 'results') => {
    setLoading(true);
    setError(null);
    try {
      const json = await fetchAnnouncementsByType(type, country);
      if (json.success) {
        setAnnouncements(json.data);
      } else {
        setError(getApiErrorMessage(json, 'Failed to fetch data'));
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Network error'));
    } finally {
      setLoading(false);
    }
  };

  const handleCompanySearch = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && searchQuery.trim()) {
      setSearchingCompanies(true);
      try {
        const json = await searchCompanies(searchQuery, country);
        if (json.success) {
          setCompanies(json.data);
        }
      } catch (err: unknown) {
        console.error("Failed to search companies", err);
        setError(getErrorMessage(err, "Failed to search companies"));
      } finally {
        setSearchingCompanies(false);
      }
    }
  };

  const openCompanyDashboard = async (company: SavedCompany) => {
    if (activeTab === 'scanners') {
      setScannerWorkspaceTab('reports');
    }
    setSelectedCompany(company);
    setLoadingCompany(true);
    setCompanyData(null);
    setShowReport(false);
    setReportData(null);
    setError(null);
    try {
      const json = await fetchCompanyFundamentals(company.url, country);
      if (json.success) {
        setCompanyData(json.data);
      } else {
        throw new Error(getApiErrorMessage(json, "Failed to fetch company data"));
      }
    } catch (err: unknown) {
      console.error("Failed to fetch fundamentals:", err);
      setError(getErrorMessage(err, "Failed to fetch company fundamentals"));
    } finally {
      setLoadingCompany(false);
    }
  };

  const generateReport = async () => {
    if (!selectedCompany) return;
    setLoadingReport(true);
    setShowReport(true);
    setReportCompanyNameRevealed(false);
    setError(null);
    try {
      const json = await fetchCompanyReport(selectedCompany.url, country, reportType);
      if (json.success) {
        setReportData(json.data.data);
        if (json.data.qualityGate) setJudgeData(json.data.qualityGate as QualityGateResult);
      } else {
        throw new Error(getApiErrorMessage(json, "Failed to fetch report data from server"));
      }
    } catch (err: unknown) {
      console.error("Failed to generate report:", err);
      setError(getErrorMessage(err, "Failed to generate report"));
    } finally {
      setLoadingReport(false);
    }
  };

  const generateSnapshot = async (company: SavedCompany) => {
    setLoadingSnapshot(true);
    setShowSnapshotModal(true);
    setSnapshotData(null);
    try {
      const json = await fetchCompanySnapshot(company.url, country);
      if (json.success) {
        setSnapshotData(json.data);
      } else {
        throw new Error(getApiErrorMessage(json, "Failed to generate snapshot"));
      }
    } catch (err: unknown) {
      console.error("Failed to generate snapshot:", err);
      setSnapshotData({ name: company.name, snapshot: `Error: ${getErrorMessage(err, "Failed to generate snapshot")}` });
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
      } catch (err: unknown) {
        console.error("Failed to capture charts", err);
      }
    }

    let tablesMd = '\n\n## Raw Financial Data\n\n### Historical Results (Annual)\n\n| Year | Sales (Cr) | Net Profit (Cr) | EPS (Rs) |\n|---|---|---|---|\n';
    let tablesHtml = '<h2>Raw Financial Data</h2><h3>Historical Results (Annual)</h3><table border="1" style="border-collapse: collapse; width: 100%; margin-bottom: 20px;"><tr><th>Year</th><th>Sales (Cr)</th><th>Net Profit (Cr)</th><th>EPS (Rs)</th></tr>';

    if (reportData?.chartData) {
      reportData.chartData.forEach((row) => {
        tablesMd += `| ${row.year} | ${row.sales} | ${row.netProfit} | ${row.eps} |\n`;
        tablesHtml += `<tr><td>${row.year}</td><td>${row.sales}</td><td>${row.netProfit}</td><td>${row.eps}</td></tr>`;
      });
    }
    tablesHtml += '</table>';

    tablesMd += '\n### Latest Results (Quarterly)\n\n| Quarter | Sales (Cr) | Net Profit (Cr) | EPS (Rs) |\n|---|---|---|---|\n';
    tablesHtml += '<h3>Latest Results (Quarterly)</h3><table border="1" style="border-collapse: collapse; width: 100%;"><tr><th>Quarter</th><th>Sales (Cr)</th><th>Net Profit (Cr)</th><th>EPS (Rs)</th></tr>';

    if (reportData?.quarterlyData) {
      reportData.quarterlyData.slice(-6).forEach((row) => {
        tablesMd += `| ${row.quarter} | ${row.sales} | ${row.netProfit} | ${row.eps} |\n`;
        tablesHtml += `<tr><td>${row.quarter}</td><td>${row.sales}</td><td>${row.netProfit}</td><td>${row.eps}</td></tr>`;
      });
    }
    tablesHtml += '</table>';

    return { chartsMd, chartsHtml, tablesMd, tablesHtml };
  };

  const shouldHideCompanyNameInReport = Boolean(selectedCompany && hideCompanyNameInReport && !reportCompanyNameRevealed);
  const reportCompanyTitle = shouldHideCompanyNameInReport ? 'Hidden Company' : (selectedCompany?.name || 'Company');
  const aiReportMarkdown = useMemo(() => {
    const raw = String(reportData?.aiReport || '');
    if (!raw) return raw;
    if (!shouldHideCompanyNameInReport || !selectedCompany?.name) return raw;
    return redactCompanyNameFromText(raw, selectedCompany.name, selectedCompany.symbol);
  }, [reportData?.aiReport, selectedCompany?.name, selectedCompany?.symbol, shouldHideCompanyNameInReport]);

  const downloadMarkdown = async () => {
    if (!reportData || !selectedCompany) return;
    if (judgeData && !judgeData.passed) {
      alert(`Export blocked: report quality gate failed (${judgeData.completenessScore}%). Missing: ${judgeData.missingComponents.join(', ')}`);
      return;
    }
    const { chartsMd, tablesMd } = await generateReportContent();
    const content = `# ${reportCompanyTitle} - Financial Report\n\n` + aiReportMarkdown + chartsMd + tablesMd;
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${reportCompanyTitle.replace(/\s+/g, '_')}_Report.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadHTML = async () => {
    if (!reportData || !selectedCompany) return;
    if (judgeData && !judgeData.passed) {
      alert(`Export blocked: report quality gate failed (${judgeData.completenessScore}%). Missing: ${judgeData.missingComponents.join(', ')}`);
      return;
    }
    const { chartsHtml, tablesHtml } = await generateReportContent();
    const mdHtml = await marked.parse(aiReportMarkdown);
    const content = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${reportCompanyTitle} - Financial Report</title>
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
          <h1>${reportCompanyTitle} - Financial Report</h1>
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
    a.download = `${reportCompanyTitle.replace(/\s+/g, '_')}_Report.html`;
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

  const didRunInitialTabEffect = useRef(false);
  useEffect(() => {
    if (activeTab === 'all' || activeTab === 'results' || activeTab === 'discover') {
      fetchAnnouncements(activeTab === 'discover' ? 'results' : activeTab);
      if (didRunInitialTabEffect.current) setSelectedCompany(null);
    } else if (activeTab === 'saved') {
      if (didRunInitialTabEffect.current) setSelectedCompany(null);
    }
    didRunInitialTabEffect.current = true;
  }, [activeTab, country]);

  const filteredAnnouncements = announcements.filter(a => 
    a.companyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    a.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
    a.subject.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const isCompanySaved = (id: string) => savedCompanies.some(c => c.id === id);

  return (
    <div className="editorial-app min-h-screen bg-gray-50 text-gray-900 font-sans">
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
              {(user || isLocalAdminAuthenticated) ? (
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
          {hasAdminAccess && (
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
          {(visiblePages.portfolio || hasAdminAccess) && (
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
          {activeTab === 'admin' && hasAdminAccess && (
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
                        onChange={(e) => setPortfolioForm({...portfolioForm, type: e.target.value as PortfolioItem['type']})}
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
                                const displayName = company.name || company.symbol;
                                setPortfolioForm({
                                  ...portfolioForm,
                                  name: displayName
                                });
                                setPortfolioSearchQuery(displayName);
                                setShowPortfolioResults(false);
                              }}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors border-b border-gray-50 last:border-0"
                            >
                              <div className="font-medium text-gray-900">{company.name || company.symbol}</div>
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
                <p className="text-gray-600">Model strategies with historical date-based performance plus curated SIP/lumpsum picks.</p>
              </div>

              <div className="mb-6 flex flex-wrap gap-2 rounded-lg border border-gray-200 bg-gray-50 p-2">
                <button
                  onClick={() => setPortfolioWorkspaceTab('strategy')}
                  className={`px-3 py-1.5 rounded-md text-sm ${portfolioWorkspaceTab === 'strategy' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600'}`}
                >
                  Strategy Model Portfolio
                </button>
                <button
                  onClick={() => setPortfolioWorkspaceTab('custom')}
                  className={`px-3 py-1.5 rounded-md text-sm ${portfolioWorkspaceTab === 'custom' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600'}`}
                >
                  My Portfolio
                </button>
              </div>

              {portfolioWorkspaceTab === 'strategy' && (
              <div className="mb-8 border border-gray-200 rounded-xl p-5 bg-gray-50">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Strategy Model Portfolios</h3>
                <p className="text-sm text-gray-600 mb-4">High Risk, Medium Risk, Low Risk, and Dividend baskets (22 stocks each) with backtest-from-date support.</p>

                <div className="flex flex-wrap gap-2 mb-4">
                  {STRATEGY_PORTFOLIOS.map((pf) => (
                    <button
                      key={pf.id}
                      onClick={() => setStrategyTab(pf.id)}
                      className={`px-3 py-1.5 rounded-md text-sm font-medium ${
                        strategyTab === pf.id ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-700'
                      }`}
                    >
                      {pf.id === 'dividend' ? 'Dividend' : pf.riskLabel}
                    </button>
                  ))}
                </div>

                {selectedStrategyPf && (
                  <>
                    <div className="text-sm text-gray-700 mb-4">
                      <div className="font-semibold text-gray-900">{selectedStrategyPf.title}</div>
                      <div>{selectedStrategyPf.subtitle}</div>
                    </div>
                    <div className="flex flex-wrap items-end gap-3 mb-4">
                      <label className="text-sm">
                        <span className="block text-gray-600 mb-1">Investment date</span>
                        <input
                          type="date"
                          value={strategyInvestDate}
                          max={format(new Date(), 'yyyy-MM-dd')}
                          min="2010-01-01"
                          onChange={(e) => setStrategyInvestDate(e.target.value)}
                          className="border border-gray-300 rounded-md px-2 py-1.5"
                        />
                      </label>
                      <button
                        onClick={() => void loadStrategyPerformance()}
                        disabled={strategyPerfLoading}
                        className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium disabled:opacity-60"
                      >
                        {strategyPerfLoading ? 'Loading...' : 'Update performance'}
                      </button>
                      <select
                        value={strategyWeightMode}
                        onChange={(e) => setStrategyWeightMode(e.target.value as 'equal' | 'best')}
                        className="border border-gray-300 rounded-md px-2 py-2 text-sm"
                      >
                        <option value="equal">Equal weight</option>
                        <option value="best">Best-weight spread</option>
                      </select>
                      <input
                        type="number"
                        value={strategyInvestmentAmount}
                        onChange={(e) => setStrategyInvestmentAmount(Number(e.target.value) || 0)}
                        className="border border-gray-300 rounded-md px-2 py-2 text-sm w-36"
                        placeholder="Investment amount"
                      />
                    </div>
                    {strategyPerfError && <p className="text-sm text-red-600 mb-3">{strategyPerfError}</p>}
                    {strategyPerf && (
                      <div className="mb-4 text-sm text-gray-700">
                        Equal-weight return:{" "}
                        <span className={(strategyPerf.equalWeightReturnPct ?? 0) >= 0 ? 'text-emerald-700 font-semibold' : 'text-red-700 font-semibold'}>
                          {strategyPerf.equalWeightReturnPct == null ? 'N/A' : `${strategyPerf.equalWeightReturnPct >= 0 ? '+' : ''}${strategyPerf.equalWeightReturnPct.toFixed(2)}%`}
                        </span>
                        <span className="text-gray-500"> ({strategyPerf.countOk}/{strategyPerf.countTotal} symbols priced)</span>
                        <div className="mt-2 text-xs text-gray-600">
                          {(() => {
                            const rows = (strategyPerf.symbols || []).filter((r) => r.returnPct != null);
                            if (!rows.length) return 'Projected value: N/A';
                            let weighted = 0;
                            if (strategyWeightMode === 'equal') {
                              weighted = rows.reduce((s, r) => s + Number(r.returnPct), 0) / rows.length;
                            } else {
                              const sorted = [...rows].sort((a, b) => Number(b.returnPct) - Number(a.returnPct));
                              const top = sorted.slice(0, Math.max(1, Math.floor(sorted.length / 3)));
                              const rest = sorted.slice(top.length);
                              const topAvg = top.reduce((s, r) => s + Number(r.returnPct), 0) / top.length;
                              const restAvg = rest.length ? rest.reduce((s, r) => s + Number(r.returnPct), 0) / rest.length : topAvg;
                              weighted = topAvg * 0.55 + restAvg * 0.45;
                            }
                            const value = strategyInvestmentAmount * (1 + weighted / 100);
                            return `Projected value (${strategyWeightMode === 'equal' ? 'equal' : 'best-weight'}): ₹${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
                          })()}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
              )}

              {portfolioWorkspaceTab === 'custom' && (
                <div className="mb-8 border border-gray-200 rounded-xl p-5 bg-gray-50 space-y-4">
                  <div className="flex flex-wrap items-center gap-2 justify-between">
                    <div className="font-semibold text-gray-900">My Portfolio (Custom)</div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          const id = `pf_${Date.now()}`;
                          const name = `Portfolio ${customPortfolios.length + 1}`;
                          setCustomPortfolios((prev) => [...prev, { id, name, holdings: [] }]);
                          setActiveCustomPortfolioId(id);
                        }}
                        className="px-3 py-1.5 text-xs rounded border border-gray-300 bg-white"
                      >
                        Add Portfolio
                      </button>
                      {customPortfolios.length > 1 && (
                        <button
                          onClick={() => {
                            setCustomPortfolios((prev) => prev.filter((p) => p.id !== activeCustomPortfolio.id));
                            setActiveCustomPortfolioId('default');
                          }}
                          className="px-3 py-1.5 text-xs rounded border border-red-300 text-red-700 bg-white"
                        >
                          Delete Portfolio
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {customPortfolios.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => setActiveCustomPortfolioId(p.id)}
                        className={`px-3 py-1.5 rounded-md text-sm ${p.id === activeCustomPortfolio.id ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-700'}`}
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      value={activeCustomPortfolio.name}
                      onChange={(e) => setCustomPortfolios((prev) => prev.map((p) => p.id === activeCustomPortfolio.id ? { ...p, name: e.target.value } : p))}
                      className="border border-gray-300 rounded-md px-2 py-1.5 text-sm"
                    />
                    <button
                      onClick={() => setShowPortfolioView((v) => !v)}
                      className="px-3 py-1.5 rounded-md text-sm bg-gray-900 text-white"
                    >
                      {showPortfolioView ? 'Hide Portfolio View' : 'View Portfolio'}
                    </button>
                  </div>

                  <div className="text-xs text-gray-600">Add stocks from Discover/Announcements/Scanners/Research using <span className="font-semibold">Add to custom</span> buttons.</div>

                  <div className="overflow-x-auto bg-white rounded-lg border border-gray-200">
                    <table className="min-w-full text-sm">
                      <thead className="bg-gray-50 text-xs text-gray-600 uppercase">
                        <tr>
                          <th className="px-3 py-2 text-left">Stock</th>
                          <th className="px-3 py-2 text-left">Purchase Date</th>
                          <th className="px-3 py-2 text-right">Amount</th>
                          <th className="px-3 py-2 text-right">Qty</th>
                          <th className="px-3 py-2 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeCustomPortfolio.holdings.map((h) => (
                          <tr key={h.symbol} className="border-t border-gray-100">
                            <td className="px-3 py-2">{h.name} <span className="text-xs text-gray-500">({h.symbol})</span></td>
                            <td className="px-3 py-2">
                              <input type="date" value={h.purchaseDate} onChange={(e) => updateHolding(h.symbol, { purchaseDate: e.target.value })} className="border border-gray-300 rounded px-1 py-1 text-xs" />
                            </td>
                            <td className="px-3 py-2 text-right">
                              <input type="number" value={h.amount} onChange={(e) => updateHolding(h.symbol, { amount: Number(e.target.value) })} className="border border-gray-300 rounded px-1 py-1 w-24 text-xs text-right" />
                            </td>
                            <td className="px-3 py-2 text-right">
                              <input type="number" value={h.quantity} onChange={(e) => updateHolding(h.symbol, { quantity: Number(e.target.value) })} className="border border-gray-300 rounded px-1 py-1 w-20 text-xs text-right" />
                            </td>
                            <td className="px-3 py-2 text-right">
                              <button onClick={() => removeHolding(h.symbol)} className="text-xs text-red-600">Delete</button>
                            </td>
                          </tr>
                        ))}
                        {activeCustomPortfolio.holdings.length === 0 && (
                          <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-500">No stocks yet.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {showPortfolioView && (
                    <div className="overflow-x-auto bg-white rounded-lg border border-gray-200">
                      <table className="min-w-full text-sm">
                        <thead className="bg-gray-50 text-xs text-gray-600 uppercase">
                          <tr>
                            <th className="px-3 py-2 text-left">Stock</th>
                            <th className="px-3 py-2 text-right">Purchase Price</th>
                            <th className="px-3 py-2 text-right">Current Price</th>
                            <th className="px-3 py-2 text-right">Quantity</th>
                            <th className="px-3 py-2 text-right">Investment Value</th>
                            <th className="px-3 py-2 text-right">Market Value</th>
                            <th className="px-3 py-2 text-right">Daily % Gain</th>
                            <th className="px-3 py-2 text-right">Total % Gain</th>
                          </tr>
                        </thead>
                        <tbody>
                          {activeCustomPortfolio.holdings.map((h) => {
                            const m = holdingMetrics[h.symbol];
                            return (
                              <tr key={`view_${h.symbol}`} className="border-t border-gray-100">
                                <td className="px-3 py-2">{h.name}</td>
                                <td className="px-3 py-2 text-right">{m?.purchasePrice?.toFixed ? m.purchasePrice.toFixed(2) : '-'}</td>
                                <td className="px-3 py-2 text-right">{m?.currentPrice?.toFixed ? m.currentPrice.toFixed(2) : '-'}</td>
                                <td className="px-3 py-2 text-right">{h.quantity}</td>
                                <td className="px-3 py-2 text-right">{m?.investmentValue?.toFixed ? m.investmentValue.toFixed(2) : '-'}</td>
                                <td className="px-3 py-2 text-right">{m?.marketValue?.toFixed ? m.marketValue.toFixed(2) : '-'}</td>
                                <td className={`px-3 py-2 text-right ${m?.dailyPctGain >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{m?.dailyPctGain?.toFixed ? `${m.dailyPctGain.toFixed(2)}%` : '-'}</td>
                                <td className={`px-3 py-2 text-right ${m?.totalPctGain >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{m?.totalPctGain?.toFixed ? `${m.totalPctGain.toFixed(2)}%` : '-'}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {portfolioWorkspaceTab === 'strategy' && (
                <>
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
                </>
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
                          onClick={() => addToCustomPortfolio({ symbol: item.symbol, name: item.companyName })}
                          className="px-2 py-2 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-lg border border-emerald-200"
                        >
                          + Custom
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
                                      onClick={() => addToCustomPortfolio({ symbol: item.symbol, name: item.companyName })}
                                      className="inline-flex items-center gap-1 text-emerald-700 hover:text-emerald-800 font-medium text-xs bg-emerald-50 px-2 py-1 rounded border border-emerald-100 transition-colors"
                                    >
                                      + Custom
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
            <ScannerWorkspace
              scannerWorkspaceTab={scannerWorkspaceTab}
              setScannerWorkspaceTab={setScannerWorkspaceTab}
              selectedScanner={selectedScanner}
              setSelectedScanner={setSelectedScanner}
              loadingScanner={loadingScanner}
              scannerResults={scannerResults}
              strategies={STRATEGIES}
              isPaidCustomer={isPaidCustomer}
              setIsPaidCustomer={setIsPaidCustomer}
              runScanner={runScanner}
              openCompanyDashboard={openCompanyDashboard}
              addToCustomPortfolio={addToCustomPortfolio}
              toggleSaveCompany={toggleSaveCompany}
              isCompanySaved={isCompanySaved}
              selectedCompanyName={selectedCompany?.name}
            />
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
          {selectedCompany && (activeTab !== 'scanners' || scannerWorkspaceTab === 'reports') && (
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <button 
                  onClick={() => setSelectedCompany(null)}
                  className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to {activeTab === 'saved' ? 'Saved' : 'Search'}
                </button>
                
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => addToCustomPortfolio(selectedCompany)}
                    className="flex items-center gap-2 px-4 py-2 rounded-md font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                  >
                    + Add to custom
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
              </div>

              <ReportWorkspaceHeader
                companyName={selectedCompany.name}
                companyExchange={selectedCompany.exchange}
                companyUrl={selectedCompany.url}
                isPaidCustomer={isPaidCustomer}
                reportType={reportType}
                hideCompanyNameInReport={hideCompanyNameInReport}
                loadingReport={loadingReport}
                onReportTypeChange={setReportType}
                onHideCompanyNameChange={(checked) => {
                  setHideCompanyNameInReport(checked);
                  setReportCompanyNameRevealed(false);
                }}
                onGenerateReport={generateReport}
              />

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
                      <ReportChartsSection
                        reportData={reportData}
                        isPaidCustomer={isPaidCustomer}
                        setIsPaidCustomer={setIsPaidCustomer}
                        chartsRef={chartsRef}
                        activeChartPalette={activeChartPalette}
                        country={country}
                        chartPaletteByCountry={chartPaletteByCountry}
                        setChartPaletteByCountry={setChartPaletteByCountry}
                        rangedCandles={rangedCandles}
                        priceActionMarkers={priceActionMarkers}
                        loadingPriceCandles={loadingPriceCandles}
                        technicalRange={technicalRange}
                        setTechnicalRange={setTechnicalRange}
                        projectionRows={projectionRows}
                      />

                      <ReportFinancialTables reportData={reportData} />

                      <ReportInsightsPanel
                        aiReportMarkdown={aiReportMarkdown}
                        hideCompanyNameInReport={hideCompanyNameInReport}
                        reportCompanyNameRevealed={reportCompanyNameRevealed}
                        selectedCompanyName={selectedCompany.name}
                        isPaidCustomer={isPaidCustomer}
                        setIsPaidCustomer={setIsPaidCustomer}
                        setReportCompanyNameRevealed={setReportCompanyNameRevealed}
                        onDownloadMarkdown={downloadMarkdown}
                        onDownloadHTML={downloadHTML}
                        loadingJudge={loadingJudge}
                        judgeData={judgeData}
                        recencyValidation={recencyValidation}
                        onRunJudgeValidation={() => void runJudgeValidation()}
                        loadingSavedReports={loadingSavedReports}
                        savedReports={savedReports}
                        onRefreshSavedReports={() => void loadSavedReports()}
                        reportScore={reportScore}
                        outcomesSummary={outcomesSummary ? {
                          horizonDays: outcomesSummary.horizonDays,
                          hitRatePct: outcomesSummary.hitRatePct,
                          avgReturnPct: outcomesSummary.avgReturnPct,
                          usableRows: outcomesSummary.usableRows,
                        } : null}
                        loadingScoreAndOutcomes={loadingScoreAndOutcomes}
                        degradedSourceWarnings={(reportData.parsingWarnings || []).length
                          ? reportData.parsingWarnings || []
                          : (judgeData?.missingComponents || []).filter((m) => m.includes("unreadable") || m.includes("missing"))}
                        thesisMemory={thesisMemory ? {
                          thesis: thesisMemory.thesis,
                          status: thesisMemory.status,
                          invalidationTriggers: thesisMemory.invalidationTriggers,
                        } : null}
                        positionSizing={positionSizing ? {
                          riskBudgetPct: positionSizing.riskBudgetPct,
                          stopLossPct: positionSizing.stopLossPct,
                          suggestions: positionSizing.suggestions.map((s) => ({
                            symbol: s.symbol,
                            targetWeightPct: s.targetWeightPct,
                            maxPositionValue: s.maxPositionValue,
                          })),
                        } : null}
                        recommendation={recommendation}
                        recommendationCalibration={recommendationCalibration}
                        recommendationPolicyVersion={recommendationPolicy?.version || null}
                      />
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
                <FundamentalsPanel companyData={companyData} />
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

      <SnapshotModal
        open={showSnapshotModal}
        loading={loadingSnapshot}
        snapshotData={snapshotData}
        onClose={() => setShowSnapshotModal(false)}
      />
    </div>
  );
}
