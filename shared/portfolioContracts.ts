export type StrategyPerformanceRow = {
  symbol: string;
  entryDate: string | null;
  entryPrice: number | null;
  lastDate: string | null;
  lastPrice: number | null;
  returnPct: number | null;
  error?: string;
};

export type StrategyPerformanceData = {
  startDate: string;
  timezoneNote: string;
  asOf: string;
  equalWeightReturnPct: number | null;
  countOk: number;
  countTotal: number;
  symbols: StrategyPerformanceRow[];
};

export type HoldingMetricsData = {
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

function asNumberOrNull(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function normalizeStrategyPerformanceData(input: unknown): StrategyPerformanceData | null {
  const obj = input as Record<string, unknown>;
  if (typeof obj?.startDate !== "string") return null;
  if (typeof obj?.timezoneNote !== "string") return null;
  if (typeof obj?.asOf !== "string") return null;
  const countOk = Number(obj?.countOk);
  const countTotal = Number(obj?.countTotal);
  if (!Number.isFinite(countOk) || !Number.isFinite(countTotal)) return null;
  const symbolsRaw = Array.isArray(obj?.symbols) ? obj.symbols : [];
  const symbols: StrategyPerformanceRow[] = symbolsRaw.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      symbol: String(r.symbol || ""),
      entryDate: typeof r.entryDate === "string" ? r.entryDate : null,
      entryPrice: asNumberOrNull(r.entryPrice),
      lastDate: typeof r.lastDate === "string" ? r.lastDate : null,
      lastPrice: asNumberOrNull(r.lastPrice),
      returnPct: asNumberOrNull(r.returnPct),
      error: typeof r.error === "string" ? r.error : undefined,
    };
  }).filter((r) => r.symbol.length > 0);
  return {
    startDate: obj.startDate,
    timezoneNote: obj.timezoneNote,
    asOf: obj.asOf,
    equalWeightReturnPct: asNumberOrNull(obj.equalWeightReturnPct),
    countOk,
    countTotal,
    symbols,
  };
}

export function normalizeHoldingMetricsData(input: unknown): HoldingMetricsData | null {
  const obj = input as Record<string, unknown>;
  if (typeof obj?.symbol !== "string") return null;
  if (typeof obj?.purchaseDate !== "string") return null;
  if (typeof obj?.currentDate !== "string") return null;
  const purchasePrice = asNumberOrNull(obj?.purchasePrice);
  const currentPrice = asNumberOrNull(obj?.currentPrice);
  if (purchasePrice == null || currentPrice == null) return null;
  return {
    symbol: obj.symbol,
    purchaseDate: obj.purchaseDate,
    purchasePrice,
    currentDate: obj.currentDate,
    currentPrice,
    quantity: asNumberOrNull(obj.quantity),
    investmentValue: asNumberOrNull(obj.investmentValue),
    marketValue: asNumberOrNull(obj.marketValue),
    dailyPctGain: asNumberOrNull(obj.dailyPctGain),
    totalPctGain: asNumberOrNull(obj.totalPctGain),
  };
}
