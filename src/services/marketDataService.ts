import { fetchJSON, type ApiResponse } from "./apiClient";
import { normalizeAnnouncements, normalizeCompanyFundamentals, normalizeCompanySearchResults, normalizePriceHistoryData, type CompanyFundamentalsData, type PriceHistoryData } from "../../shared/marketContracts";

export type CountryCode = "IN" | "US";

export type Announcement = {
  id: string;
  symbol: string;
  companyName: string;
  subject: string;
  date: string;
  pdfLink: string | null;
  exchange: string;
  category: string;
};

export type CompanySearchResult = {
  id: string;
  name: string;
  url: string;
  exchange: string;
  symbol: string;
};

export type CompanyFundamentals = CompanyFundamentalsData;

export async function searchCompanies(query: string, country: CountryCode): Promise<ApiResponse<CompanySearchResult[]>> {
  const params = new URLSearchParams({
    search: query,
    country,
  });
  const result = await fetchJSON<unknown[]>(`/api/companies?${params.toString()}`);
  if (!result.success) return result as ApiResponse<CompanySearchResult[]>;
  return { success: true, data: normalizeCompanySearchResults(result.data) };
}

export async function fetchAnnouncementsByType(type: "all" | "results", country: CountryCode): Promise<ApiResponse<Announcement[]>> {
  const params = new URLSearchParams({ type, country });
  const result = await fetchJSON<unknown[]>(`/api/announcements?${params.toString()}`);
  if (!result.success) return result as ApiResponse<Announcement[]>;
  return { success: true, data: normalizeAnnouncements(result.data) };
}

export async function runScannerById(id: string, country: CountryCode): Promise<ApiResponse<CompanySearchResult[]>> {
  const params = new URLSearchParams({ country });
  const result = await fetchJSON<unknown[]>(`/api/scanners/${encodeURIComponent(id)}?${params.toString()}`);
  if (!result.success) return result as ApiResponse<CompanySearchResult[]>;
  return { success: true, data: normalizeCompanySearchResults(result.data) };
}

export async function fetchCompanyFundamentals(url: string, country: CountryCode): Promise<ApiResponse<CompanyFundamentals>> {
  const params = new URLSearchParams({ url, country });
  const result = await fetchJSON<unknown>(`/api/company/fundamentals?${params.toString()}`);
  if (!result.success) return result as ApiResponse<CompanyFundamentals>;
  const normalized = normalizeCompanyFundamentals(result.data);
  if (!normalized) return { success: false, error: "invalid_fundamentals_contract" };
  return { success: true, data: normalized };
}

export async function fetchPriceHistory(url: string, country: CountryCode, symbol?: string): Promise<ApiResponse<PriceHistoryData>> {
  const params = new URLSearchParams({ url, country });
  if (symbol) params.set("symbol", symbol);
  const result = await fetchJSON<unknown>(`/api/company/price-history?${params.toString()}`);
  if (!result.success) return result as ApiResponse<PriceHistoryData>;
  const normalized = normalizePriceHistoryData(result.data);
  if (!normalized) return { success: false, error: "invalid_price_history_contract" };
  return { success: true, data: normalized };
}
