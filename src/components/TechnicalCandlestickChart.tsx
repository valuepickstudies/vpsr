import { useMemo } from "react";

export type TechnicalRange = "3M" | "6M" | "1Y" | "3Y" | "5Y";

export type TechnicalCandle = {
  date: string;
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
};

export type PriceActionMarker = {
  ts: number;
  price: number;
  label: string;
  kind: "breakout" | "breakdown" | "swing-high" | "swing-low";
};

type TechnicalCandlestickChartProps = {
  candles: TechnicalCandle[];
  markers: PriceActionMarker[];
  isLoading: boolean;
  range: TechnicalRange;
  onRangeChange: (next: TechnicalRange) => void;
};

export default function TechnicalCandlestickChart({
  candles,
  markers,
  isLoading,
  range,
  onRangeChange,
}: TechnicalCandlestickChartProps) {
  const width = 1000;
  const height = 320;
  const pad = { top: 14, right: 24, bottom: 30, left: 58 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const minLow = candles.length ? Math.min(...candles.map((c) => c.low)) : 0;
  const maxHigh = candles.length ? Math.max(...candles.map((c) => c.high)) : 1;
  const spread = Math.max(0.0001, maxHigh - minLow);
  const yMin = minLow - spread * 0.03;
  const yMax = maxHigh + spread * 0.03;
  const y = (price: number) => pad.top + ((yMax - price) / (yMax - yMin)) * plotH;
  const x = (idx: number) => (candles.length <= 1 ? pad.left : pad.left + (idx / (candles.length - 1)) * plotW);
  const bodyWidth = Math.min(9, Math.max(1.2, (plotW / Math.max(1, candles.length)) * 0.65));

  const visibleMarkers = useMemo(() => {
    if (!candles.length || !markers.length) return [];
    const minTs = candles[0].ts;
    const maxTs = candles[candles.length - 1].ts;
    return markers.filter((m) => m.ts >= minTs && m.ts <= maxTs);
  }, [candles, markers]);

  return (
    <div>
      <div className="flex items-center justify-between mb-3 gap-3">
        <div className="text-xs text-gray-500">Daily OHLC candlesticks with breakout/swing markers.</div>
        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1">
          {(["3M", "6M", "1Y", "3Y", "5Y"] as TechnicalRange[]).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => onRangeChange(opt)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition ${range === opt ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"}`}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>
      <div className="h-72 rounded-lg border border-gray-100 bg-gradient-to-b from-white to-gray-50">
        {isLoading ? (
          <div className="h-full flex items-center justify-center text-sm text-gray-500">Loading daily candles...</div>
        ) : candles.length === 0 ? (
          <div className="h-full flex items-center justify-center text-sm text-gray-500">Price history unavailable for this symbol.</div>
        ) : (
          <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full">
            {[0, 1, 2, 3, 4].map((tick) => {
              const py = pad.top + (tick / 4) * plotH;
              const pv = (yMax - (tick / 4) * (yMax - yMin)).toFixed(2);
              return (
                <g key={tick}>
                  <line x1={pad.left} y1={py} x2={width - pad.right} y2={py} stroke="#EEF2F7" strokeWidth={1} />
                  <text x={8} y={py + 4} fontSize={10} fill="#9CA3AF">{pv}</text>
                </g>
              );
            })}
            {candles.map((c, idx) => {
              const cx = x(idx);
              const up = c.close >= c.open;
              const color = up ? "#16A34A" : "#DC2626";
              const top = y(Math.max(c.open, c.close));
              const bottom = y(Math.min(c.open, c.close));
              return (
                <g key={c.ts}>
                  <line x1={cx} y1={y(c.high)} x2={cx} y2={y(c.low)} stroke={color} strokeWidth={1} />
                  <rect x={cx - bodyWidth / 2} y={top} width={bodyWidth} height={Math.max(1, bottom - top)} fill={color} fillOpacity={0.9} />
                </g>
              );
            })}
            {visibleMarkers.map((m) => {
              const i = candles.findIndex((c) => c.ts === m.ts);
              if (i < 0) return null;
              const mx = x(i);
              const my = y(m.price);
              const color = m.kind === "breakout" ? "#2563EB" : m.kind === "breakdown" ? "#7C3AED" : m.kind === "swing-high" ? "#F97316" : "#0891B2";
              return <circle key={`${m.kind}-${m.ts}`} cx={mx} cy={my} r={3.2} fill={color} />;
            })}
          </svg>
        )}
      </div>
      <div className="mt-2 text-[11px] text-gray-500">Markers: Breakout (blue), Breakdown (purple), Swing High/Low (orange/cyan)</div>
    </div>
  );
}
