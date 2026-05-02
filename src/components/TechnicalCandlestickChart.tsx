import { useCallback, useEffect, useMemo, useState } from "react";

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

const W = 1000;
const PAD_L = 72;
const PAD_R = 28;
const PAD_T = 14;
const PAD_B = 32;
const PRICE_H = 310;
const HEIGHT = PAD_T + PRICE_H + PAD_B;

export default function TechnicalCandlestickChart({
  candles,
  markers,
  isLoading,
  range,
  onRangeChange,
}: TechnicalCandlestickChartProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  /** Inclusive start index into `candles`; exclusive end index (null = candles.length). */
  const [viewStart, setViewStart] = useState(0);
  const [viewEnd, setViewEnd] = useState<number | null>(null);

  useEffect(() => {
    setViewStart(0);
    setViewEnd(null);
  }, [range]);

  const displayCandles = useMemo(() => {
    const end = viewEnd ?? candles.length;
    return candles.slice(viewStart, Math.min(end, candles.length));
  }, [candles, viewStart, viewEnd]);

  const plotW = W - PAD_L - PAD_R;

  const minLow = displayCandles.length ? Math.min(...displayCandles.map((c) => c.low)) : 0;
  const maxHigh = displayCandles.length ? Math.max(...displayCandles.map((c) => c.high)) : 1;
  const spread = Math.max(0.0001, maxHigh - minLow);
  const yMin = minLow - spread * 0.03;
  const yMax = maxHigh + spread * 0.03;

  const xAt = useCallback(
    (idx: number) =>
      displayCandles.length <= 1 ? PAD_L : PAD_L + (idx / Math.max(1, displayCandles.length - 1)) * plotW,
    [displayCandles.length, plotW],
  );

  const yPrice = useCallback(
    (price: number) => PAD_T + ((yMax - price) / (yMax - yMin)) * PRICE_H,
    [yMax, yMin],
  );

  /** Wider bodies use more of the horizontal slot; capped so neighboring candles still separate when zoomed out. */
  const bodyWidth = Math.min(
    28,
    Math.max(3, (plotW / Math.max(1, displayCandles.length)) * 0.9),
  );

  const visibleMarkers = useMemo(() => {
    if (!displayCandles.length || !markers.length) return [];
    const minTs = displayCandles[0].ts;
    const maxTs = displayCandles[displayCandles.length - 1].ts;
    return markers.filter((m) => m.ts >= minTs && m.ts <= maxTs);
  }, [displayCandles, markers]);

  const zoomIn = useCallback(() => {
    const n = candles.length;
    if (n <= 2) return;
    const start = viewStart;
    const end = viewEnd ?? n;
    const len = end - start;
    if (len <= 2) return;
    const newLen = Math.max(2, Math.floor(len / 2));
    const center = start + len / 2;
    let ns = Math.round(center - newLen / 2);
    ns = Math.max(0, Math.min(ns, n - newLen));
    setViewStart(ns);
    setViewEnd(ns + newLen);
  }, [candles.length, viewEnd, viewStart]);

  const zoomOut = useCallback(() => {
    const n = candles.length;
    const start = viewStart;
    const end = viewEnd ?? n;
    const len = end - start;
    const newLen = Math.min(n, Math.max(len * 2, len + 1));
    const center = start + len / 2;
    let ns = Math.round(center - newLen / 2);
    ns = Math.max(0, Math.min(ns, n - newLen));
    setViewStart(ns);
    setViewEnd(ns + newLen >= n ? null : ns + newLen);
  }, [candles.length, viewEnd, viewStart]);

  const resetZoom = useCallback(() => {
    setViewStart(0);
    setViewEnd(null);
  }, []);

  const pan = useCallback(
    (dir: -1 | 1) => {
      const n = candles.length;
      const start = viewStart;
      const end = viewEnd ?? n;
      const len = end - start;
      const step = Math.max(1, Math.floor(len * 0.15));
      let ns = start + dir * step;
      ns = Math.max(0, Math.min(ns, n - len));
      setViewStart(ns);
      setViewEnd(ns + len >= n ? null : ns + len);
    },
    [candles.length, viewEnd, viewStart],
  );

  const onSvgPointer = useCallback(
    (clientX: number, svgEl: SVGSVGElement) => {
      if (!displayCandles.length) return;
      const rect = svgEl.getBoundingClientRect();
      const scaleX = W / rect.width;
      const vx = (clientX - rect.left) * scaleX;
      const rel = vx - PAD_L;
      const t = plotW <= 0 ? 0 : rel / plotW;
      const idx = displayCandles.length <= 1 ? 0 : Math.round(t * (displayCandles.length - 1));
      setHoverIdx(Math.max(0, Math.min(displayCandles.length - 1, idx)));
    },
    [displayCandles.length, plotW],
  );

  const clearHover = useCallback(() => setHoverIdx(null), []);

  const hover = hoverIdx != null ? displayCandles[hoverIdx] : null;
  const viewLabel =
    candles.length === 0
      ? ""
      : `${viewStart + 1}–${viewEnd ?? candles.length} of ${candles.length} candles`;

  const winEnd = viewEnd ?? candles.length;
  const winLen = Math.max(0, winEnd - viewStart);
  const canZoomIn = candles.length > 2 && winLen > 2;
  const panLeftDisabled = viewStart === 0;
  const panRightDisabled = viewStart + winLen >= candles.length;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between mb-3 gap-3">
        <div className="text-xs text-gray-500">
          Daily OHLC candles — hover for O/H/L/C. Use zoom to magnify a region; pan when zoomed.
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-gray-500 hidden sm:inline">{viewLabel}</span>
          <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 gap-0.5 items-center">
            <button
              type="button"
              title="Zoom in (fewer candles)"
              onClick={() => zoomIn()}
              disabled={!canZoomIn}
              className="px-2 py-1.5 text-xs font-semibold rounded-md text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:pointer-events-none"
            >
              +
            </button>
            <button
              type="button"
              title="Zoom out"
              onClick={() => zoomOut()}
              disabled={viewStart === 0 && viewEnd === null}
              className="px-2 py-1.5 text-xs font-semibold rounded-md text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:pointer-events-none"
            >
              −
            </button>
            <button
              type="button"
              title="Reset zoom"
              onClick={resetZoom}
              disabled={viewStart === 0 && viewEnd === null}
              className="px-2 py-1.5 text-xs font-semibold rounded-md text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:pointer-events-none"
            >
              Reset
            </button>
            <span className="w-px h-4 bg-gray-200 mx-0.5" aria-hidden />
            <button
              type="button"
              title="Pan left"
              onClick={() => pan(-1)}
              disabled={panLeftDisabled}
              className="px-2 py-1.5 text-xs font-semibold rounded-md text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:pointer-events-none"
            >
              ◀
            </button>
            <button
              type="button"
              title="Pan right"
              onClick={() => pan(1)}
              disabled={panRightDisabled}
              className="px-2 py-1.5 text-xs font-semibold rounded-md text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:pointer-events-none"
            >
              ▶
            </button>
          </div>
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
      </div>

      {hover && (
        <div className="mb-3 rounded-xl border-2 border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 shadow-md tabular-nums">
          <div className="mb-2 text-base font-bold text-gray-950 tracking-tight">{hover.date}</div>
          <div className="flex flex-wrap gap-x-5 gap-y-1.5 items-baseline">
            <span>
              <span className="text-gray-500 font-semibold text-xs uppercase tracking-wide">Open</span>{" "}
              <span className="font-bold text-gray-900 text-lg">{hover.open.toFixed(2)}</span>
            </span>
            <span>
              <span className="text-gray-500 font-semibold text-xs uppercase tracking-wide">High</span>{" "}
              <span className="font-bold text-emerald-700 text-lg">{hover.high.toFixed(2)}</span>
            </span>
            <span>
              <span className="text-gray-500 font-semibold text-xs uppercase tracking-wide">Low</span>{" "}
              <span className="font-bold text-red-700 text-lg">{hover.low.toFixed(2)}</span>
            </span>
            <span>
              <span className="text-gray-500 font-semibold text-xs uppercase tracking-wide">Close</span>{" "}
              <span className="font-extrabold text-indigo-900 text-xl">{hover.close.toFixed(2)}</span>
            </span>
          </div>
        </div>
      )}

      <div className="min-h-[300px] h-[420px] max-h-[72vh] rounded-lg border border-gray-100 bg-gradient-to-b from-white to-gray-50">
        {isLoading ? (
          <div className="h-full flex items-center justify-center text-sm text-gray-500">Loading daily candles...</div>
        ) : candles.length === 0 ? (
          <div className="h-full flex items-center justify-center text-sm text-gray-500">Price history unavailable for this symbol.</div>
        ) : displayCandles.length === 0 ? (
          <div className="h-full flex items-center justify-center text-sm text-gray-500">Adjust zoom to show candles.</div>
        ) : (
          <svg
            viewBox={`0 0 ${W} ${HEIGHT}`}
            className="w-full h-full"
            role="img"
            aria-label="Price candlestick chart"
            onMouseMove={(e) => onSvgPointer(e.clientX, e.currentTarget)}
            onMouseLeave={clearHover}
            onTouchMove={(e) => {
              const t = e.touches[0];
              if (t) onSvgPointer(t.clientX, e.currentTarget);
            }}
            onTouchEnd={clearHover}
          >
            {[0, 1, 2, 3, 4].map((tick) => {
              const py = PAD_T + (tick / 4) * PRICE_H;
              const pv = (yMax - (tick / 4) * (yMax - yMin)).toFixed(2);
              return (
                <g key={`pt-${tick}`}>
                  <line x1={PAD_L} y1={py} x2={W - PAD_R} y2={py} stroke="#E5E7EB" strokeWidth={1} />
                  <text x={6} y={py + 5} fontSize={13} fill="#1F2937" fontWeight={700}>
                    {pv}
                  </text>
                </g>
              );
            })}

            <text x={PAD_L} y={PAD_T - 2} fontSize={14} fill="#111827" fontWeight={700}>
              Price
            </text>

            {displayCandles.map((c, idx) => {
              const cx = xAt(idx);
              const up = c.close >= c.open;
              const color = up ? "#16A34A" : "#DC2626";
              const top = yPrice(Math.max(c.open, c.close));
              const bottom = yPrice(Math.min(c.open, c.close));
              return (
                <g key={`${c.ts}-${idx}`}>
                  <line x1={cx} y1={yPrice(c.high)} x2={cx} y2={yPrice(c.low)} stroke={color} strokeWidth={2.25} strokeLinecap="round" />
                  <rect
                    x={cx - bodyWidth / 2}
                    y={top}
                    width={bodyWidth}
                    height={Math.max(2, bottom - top)}
                    fill={color}
                    fillOpacity={hoverIdx === idx ? 1 : 0.92}
                    stroke={color}
                    strokeWidth={hoverIdx === idx ? 1.25 : 0}
                  />
                </g>
              );
            })}

            {visibleMarkers.map((m) => {
              const i = displayCandles.findIndex((c) => c.ts === m.ts);
              if (i < 0) return null;
              const mx = xAt(i);
              const my = yPrice(m.price);
              const color =
                m.kind === "breakout"
                  ? "#2563EB"
                  : m.kind === "breakdown"
                    ? "#7C3AED"
                    : m.kind === "swing-high"
                      ? "#F97316"
                      : "#0891B2";
              return <circle key={`${m.kind}-${m.ts}`} cx={mx} cy={my} r={4.5} stroke="#fff" strokeWidth={1} fill={color} />;
            })}

            {hoverIdx != null && (
              <line
                x1={xAt(hoverIdx)}
                y1={PAD_T}
                x2={xAt(hoverIdx)}
                y2={PAD_T + PRICE_H}
                stroke="#94A3B8"
                strokeWidth={1}
                strokeDasharray="4 3"
                pointerEvents="none"
              />
            )}

            <text x={PAD_L} y={HEIGHT - 8} fontSize={12} fill="#6B7280" fontWeight={600}>
              Move pointer across candles — OHLC values update above.
            </text>
          </svg>
        )}
      </div>
      <div className="mt-2 text-[11px] text-gray-500">
        Markers: Breakout (blue), Breakdown (purple), Swing High/Low (orange/cyan).
      </div>
    </div>
  );
}
