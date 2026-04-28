export type AnnouncementData = {
  id: string;
  symbol: string;
  companyName: string;
  subject: string;
  date: string;
  pdfLink: string | null;
  exchange: string;
  category: string;
};

export type CompanySearchData = {
  id: string;
  name: string;
  url: string;
  exchange: string;
  symbol: string;
};

export type CompanyFundamentalsMetric = {
  label: string;
  value: string;
};

export type CompanyFundamentalsData = {
  name: string;
  about?: string;
  fundamentals: CompanyFundamentalsMetric[];
  recentAnnouncements: AnnouncementData[];
};

export type PriceHistoryData = {
  symbol: string;
  candles: Array<{
    date: string;
    ts: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number | null;
  }>;
};

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function normalizeAnnouncements(input: unknown): AnnouncementData[] {
  const rows = Array.isArray(input) ? input : [];
  return rows.map((raw, idx) => {
    const r = raw as Record<string, unknown>;
    return {
      id: asString(r.id, `row_${idx}`),
      symbol: asString(r.symbol, "UNKNOWN"),
      companyName: asString(r.companyName, "Unknown Company"),
      subject: asString(r.subject, ""),
      date: asString(r.date, ""),
      pdfLink: typeof r.pdfLink === "string" ? r.pdfLink : null,
      exchange: asString(r.exchange, "N/A"),
      category: asString(r.category, "General"),
    };
  }).filter((r) => r.subject.length > 0);
}

export function normalizeCompanySearchResults(input: unknown): CompanySearchData[] {
  const rows = Array.isArray(input) ? input : [];
  return rows.map((raw, idx) => {
    const r = raw as Record<string, unknown>;
    const symbol = asString(r.symbol, asString(r.id, `sym_${idx}`)).toUpperCase();
    return {
      id: asString(r.id, symbol || `company_${idx}`),
      name: asString(r.name, "Unknown Company"),
      url: asString(r.url, ""),
      exchange: asString(r.exchange, "N/A"),
      symbol,
    };
  }).filter((r) => r.name.length > 0 && r.url.length > 0);
}

export function normalizeCompanyFundamentals(input: unknown): CompanyFundamentalsData | null {
  const obj = input as Record<string, unknown>;
  const name = asString(obj?.name, "").trim();
  if (!name) return null;
  const fundamentalsRaw = Array.isArray(obj?.fundamentals) ? obj.fundamentals : [];
  const fundamentals = fundamentalsRaw.map((raw) => {
    const r = raw as Record<string, unknown>;
    return {
      label: asString(r.label ?? r.name, "Metric"),
      value: asString(r.value, "N/A"),
    };
  }).filter((m) => m.label.length > 0);
  const recentAnnouncements = normalizeAnnouncements(obj?.recentAnnouncements);
  return {
    name,
    about: asString(obj?.about, "").trim() || undefined,
    fundamentals,
    recentAnnouncements,
  };
}

export function normalizePriceHistoryData(input: unknown): PriceHistoryData | null {
  const obj = input as Record<string, unknown>;
  const symbol = asString(obj?.symbol, "").trim();
  if (!symbol) return null;
  const candlesRaw = Array.isArray(obj?.candles) ? obj.candles : [];
  const candles = candlesRaw.map((raw) => {
    const c = raw as Record<string, unknown>;
    const date = asString(c.date, "");
    const ts = Number(c.ts);
    const open = Number(c.open);
    const high = Number(c.high);
    const low = Number(c.low);
    const close = Number(c.close);
    const volume = c.volume == null ? null : Number(c.volume);
    if (!date || ![ts, open, high, low, close].every(Number.isFinite)) return null;
    return {
      date,
      ts,
      open,
      high,
      low,
      close,
      volume: Number.isFinite(volume as number) ? (volume as number) : null,
    };
  }).filter((c): c is NonNullable<typeof c> => !!c);
  return { symbol, candles };
}
