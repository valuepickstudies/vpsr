import { normalizeHoldingMetricsData, normalizeStrategyPerformanceData, type HoldingMetricsData, type StrategyPerformanceData } from "../../shared/portfolioContracts";
import { fetchJSON, type ApiResponse } from "./apiClient";

export async function fetchStrategyPerformance(startDate: string, symbols: string): Promise<ApiResponse<StrategyPerformanceData>> {
  const params = new URLSearchParams({ startDate, symbols });
  const result = await fetchJSON<unknown>(`/api/strategy-portfolio/performance?${params.toString()}`);
  if (!result.success) return result as ApiResponse<StrategyPerformanceData>;
  const normalized = normalizeStrategyPerformanceData(result.data);
  if (!normalized) return { success: false, error: "invalid_strategy_performance_contract" };
  return { success: true, data: normalized };
}

export async function fetchHoldingMetrics(symbol: string, purchaseDate: string, quantity: number): Promise<ApiResponse<HoldingMetricsData>> {
  const params = new URLSearchParams({
    symbol,
    purchaseDate,
    quantity: String(quantity),
  });
  const result = await fetchJSON<unknown>(`/api/portfolio/holding-metrics?${params.toString()}`);
  if (!result.success) return result as ApiResponse<HoldingMetricsData>;
  const normalized = normalizeHoldingMetricsData(result.data);
  if (!normalized) return { success: false, error: "invalid_holding_metrics_contract" };
  return { success: true, data: normalized };
}

export type PositionSizingData = {
  capital: number;
  riskBudgetPct: number;
  stopLossPct: number;
  rebalanceCadenceDays: number;
  suggestions: Array<{
    symbol: string;
    score: number;
    targetWeightPct: number;
    maxPositionValue: number;
    riskCapital: number;
  }>;
};

export async function fetchPositionSizing(input: {
  capital: number;
  riskBudgetPct: number;
  stopLossPct: number;
  candidates: Array<{ symbol: string; score: number }>;
}): Promise<ApiResponse<PositionSizingData>> {
  return fetchJSON<PositionSizingData>("/api/portfolio/position-sizing", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}
