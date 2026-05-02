import { BarChart3, Radar, Sparkles, TrendingUp } from "lucide-react";
import { Bar, BarChart, CartesianGrid, LabelList, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { CompanyReportData } from "../../shared/reportTypes";
import TechnicalCandlestickChart, { type PriceActionMarker, type TechnicalCandle, type TechnicalRange } from "./TechnicalCandlestickChart";

type ChartPalette = {
  sales: string;
  profit: string;
  eps: string;
  projection: string;
  technical: string;
};

type ProjectionRow = {
  year: string;
  sales: number;
  netProfit: number;
};

type ReportChartsSectionProps = {
  reportData: CompanyReportData;
  isPaidCustomer: boolean;
  setIsPaidCustomer: (v: boolean) => void;
  chartsRef: React.RefObject<HTMLDivElement | null>;
  activeChartPalette: ChartPalette;
  country: "IN" | "US";
  chartPaletteByCountry: Record<"IN" | "US", "default" | "emerald" | "violet">;
  setChartPaletteByCountry: React.Dispatch<React.SetStateAction<Record<"IN" | "US", "default" | "emerald" | "violet">>>;
  rangedCandles: TechnicalCandle[];
  priceActionMarkers: PriceActionMarker[];
  loadingPriceCandles: boolean;
  technicalRange: TechnicalRange;
  setTechnicalRange: (value: TechnicalRange) => void;
  projectionRows: ProjectionRow[];
};

export default function ReportChartsSection(props: ReportChartsSectionProps) {
  const {
    reportData,
    isPaidCustomer,
    setIsPaidCustomer,
    chartsRef,
    activeChartPalette,
    country,
    chartPaletteByCountry,
    setChartPaletteByCountry,
    rangedCandles,
    priceActionMarkers,
    loadingPriceCandles,
    technicalRange,
    setTechnicalRange,
    projectionRows,
  } = props;

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-gray-600">Chart palette ({country})</div>
        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1">
          {(["default", "emerald", "violet"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setChartPaletteByCountry((prev) => ({ ...prev, [country]: mode }))}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md ${chartPaletteByCountry[country] === mode ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"}`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      <div ref={chartsRef} className="grid grid-cols-1 lg:grid-cols-2 gap-6 bg-gray-50 p-4 rounded-xl -mx-4 sm:mx-0">
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-[0_8px_30px_rgb(0,0,0,0.04)] relative overflow-hidden">
          {!isPaidCustomer && (
            <div className="absolute inset-0 z-10 bg-white/40 backdrop-blur-sm flex items-center justify-center p-6 text-center">
              <div className="bg-white p-6 rounded-2xl shadow-xl border border-gray-200 max-w-xs">
                <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Sparkles className="h-6 w-6 text-amber-600" />
                </div>
                <h4 className="text-lg font-bold text-gray-900 mb-2">Premium Feature</h4>
                <p className="text-sm text-gray-600 mb-4">Upgrade to Premium to unlock detailed financial charts and AI-powered insights.</p>
                <button onClick={() => setIsPaidCustomer(true)} className="w-full py-2 bg-amber-600 text-white rounded-lg font-bold text-sm hover:bg-amber-700 transition-colors">
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
                <XAxis dataKey="year" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#9CA3AF" }} />
                <YAxis axisLine={false} tickLine={false} tickCount={5} tick={{ fontSize: 12, fill: "#9CA3AF" }} />
                <Tooltip cursor={{ fill: "#F9FAFB" }} contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)" }} />
                <Legend wrapperStyle={{ paddingTop: "20px" }} iconType="circle" />
                <Bar dataKey="sales" name="Sales" fill={activeChartPalette.sales} radius={[6, 6, 0, 0]} barSize={28} isAnimationActive={false}>
                  <LabelList dataKey="sales" position="top" offset={8} style={{ fontSize: "10px", fill: "#94A3B8", fontWeight: 600 }} />
                </Bar>
                <Bar dataKey="netProfit" name="Net Profit" fill={activeChartPalette.profit} radius={[6, 6, 0, 0]} barSize={28} isAnimationActive={false}>
                  <LabelList dataKey="netProfit" position="top" offset={8} style={{ fontSize: "10px", fill: "#94A3B8", fontWeight: 600 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-[0_8px_30px_rgb(0,0,0,0.04)] relative overflow-hidden">
          {!isPaidCustomer && (
            <div className="absolute inset-0 z-10 bg-white/40 backdrop-blur-sm flex items-center justify-center p-6 text-center" />
          )}
          <h3 className="text-base font-semibold text-gray-800 mb-6 flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-orange-400" />
            Earnings Per Share (EPS) Trend
          </h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={reportData.chartData} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                <XAxis dataKey="year" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#9CA3AF" }} />
                <YAxis axisLine={false} tickLine={false} tickCount={5} tick={{ fontSize: 12, fill: "#9CA3AF" }} />
                <Tooltip contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)" }} />
                <Legend wrapperStyle={{ paddingTop: "20px" }} iconType="circle" />
                <Line type="monotone" dataKey="eps" name={country === "US" ? "EPS (USD)" : "EPS (₹)"} stroke={activeChartPalette.eps} strokeWidth={3} dot={{ r: 4, fill: activeChartPalette.eps, strokeWidth: 0 }} activeDot={{ r: 6 }} isAnimationActive={false}>
                  <LabelList dataKey="eps" position="top" offset={12} style={{ fontSize: "10px", fill: "#94A3B8", fontWeight: 600 }} />
                </Line>
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 bg-gray-50 p-4 rounded-xl -mx-4 sm:mx-0">
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-[0_8px_30px_rgb(0,0,0,0.04)] relative overflow-hidden flex flex-col min-h-0">
          {!isPaidCustomer && (
            <div className="absolute inset-0 z-10 bg-white/40 backdrop-blur-sm flex items-center justify-center p-6 text-center">
              <div className="bg-white p-6 rounded-2xl shadow-xl border border-gray-200 max-w-xs">
                <h4 className="text-lg font-bold text-gray-900 mb-2">Premium Feature</h4>
                <p className="text-sm text-gray-600 mb-4">Upgrade to unlock advanced technical movement view.</p>
                <button onClick={() => setIsPaidCustomer(true)} className="w-full py-2 bg-amber-600 text-white rounded-lg font-bold text-sm hover:bg-amber-700 transition-colors">
                  Unlock Now
                </button>
              </div>
            </div>
          )}
          <h3 className="text-base font-semibold text-gray-800 mb-2 flex items-center gap-2 shrink-0">
            <Radar className="h-5 w-5 text-cyan-500" />
            Technical Price Movement
          </h3>
          <p className="text-xs text-gray-500 mb-4 shrink-0">Daily OHLC candles; hover for prices; zoom (+/−) and pan (◀/▶) when magnified; ranges 3M–5Y with price-action dots.</p>
          <div className="flex-1 min-h-0">
            <TechnicalCandlestickChart
              candles={rangedCandles}
              markers={priceActionMarkers}
              isLoading={loadingPriceCandles}
              range={technicalRange}
              onRangeChange={setTechnicalRange}
            />
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-[0_8px_30px_rgb(0,0,0,0.04)] relative overflow-hidden flex flex-col min-h-0">
          <h3 className="text-base font-semibold text-gray-800 mb-1 flex items-center gap-2 shrink-0">
            <TrendingUp className="h-5 w-5 text-indigo-500" />
            Illustrative trend extrapolation (3Y)
          </h3>
          <p className="text-xs text-amber-900/90 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-4 leading-relaxed">
            Not a forecast. Bars extend recent annual sales and profit using capped historical growth from the last few Screener-style annual rows; use for scenario color only, not valuation targets.
          </p>
          <div className="h-72 flex-1 min-h-[18rem]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={projectionRows} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                <XAxis dataKey="year" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#9CA3AF" }} interval={0} angle={-12} textAnchor="end" height={48} />
                <YAxis axisLine={false} tickLine={false} tickCount={5} tick={{ fontSize: 12, fill: "#9CA3AF" }} />
                <Tooltip cursor={{ fill: "#F9FAFB" }} contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)" }} />
                <Legend wrapperStyle={{ paddingTop: "20px" }} iconType="circle" />
                <Bar dataKey="sales" name="Model sales (illustrative)" fill={activeChartPalette.projection} radius={[6, 6, 0, 0]} maxBarSize={36} isAnimationActive={false}>
                  <LabelList dataKey="sales" position="top" offset={6} style={{ fontSize: "10px", fill: "#94A3B8", fontWeight: 600 }} />
                </Bar>
                <Bar dataKey="netProfit" name="Model net profit (illustrative)" fill={activeChartPalette.profit} radius={[6, 6, 0, 0]} maxBarSize={36} isAnimationActive={false}>
                  <LabelList dataKey="netProfit" position="top" offset={6} style={{ fontSize: "10px", fill: "#94A3B8", fontWeight: 600 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </>
  );
}
