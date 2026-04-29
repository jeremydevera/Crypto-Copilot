import { useEffect, useRef, useState } from 'react';
import { createChart, type IChartApi, type ISeriesApi, ColorType, type CandlestickData, type Time } from 'lightweight-charts';
import type { Timeframe } from '../engine/types';
import { TIMEFRAMES, timeframeTitle } from '../engine/types';

interface ChartTabProps {
  vm: any;
}

export default function ChartTab({ vm }: ChartTabProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const ema9Ref = useRef<ISeriesApi<'Line'> | null>(null);
  const ema21Ref = useRef<ISeriesApi<'Line'> | null>(null);
  const ema50Ref = useRef<ISeriesApi<'Line'> | null>(null);
  const [showEMA9, setShowEMA9] = useState(true);
  const [showEMA21, setShowEMA21] = useState(true);
  const [showEMA50, setShowEMA50] = useState(true);
  const [showVolume, setShowVolume] = useState(true);

  // Create chart on mount
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#030712' },
        textColor: '#9ca3af',
        fontSize: 12,
      },
      grid: {
        vertLines: { color: '#1f2937' },
        horzLines: { color: '#1f2937' },
      },
      crosshair: {
        vertLine: { color: '#4b5563', width: 1, style: 2 },
        horzLine: { color: '#4b5563', width: 1, style: 2 },
      },
      rightPriceScale: {
        borderColor: '#374151',
      },
      timeScale: {
        borderColor: '#374151',
        timeVisible: true,
        secondsVisible: false,
      },
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderUpColor: '#22c55e',
      borderDownColor: '#ef4444',
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    });

    const volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });

    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    const ema9Series = chart.addLineSeries({
      color: '#f59e0b',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    const ema21Series = chart.addLineSeries({
      color: '#3b82f6',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    const ema50Series = chart.addLineSeries({
      color: '#a855f7',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;
    ema9Ref.current = ema9Series;
    ema21Ref.current = ema21Series;
    ema50Ref.current = ema50Series;

    // Resize observer
    const resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        chart.applyOptions({ width, height });
      }
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      ema9Ref.current = null;
      ema21Ref.current = null;
      ema50Ref.current = null;
    };
  }, []);

  // Update data when candles change
  useEffect(() => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current) return;

    const candles = vm.selectedChartCandles;
    if (!candles || candles.length === 0) return;

    const candleData: CandlestickData<Time>[] = candles.map((c: any) => ({
      time: (c.openTime / 1000) as Time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));

    const volumeData = candles.map((c: any) => ({
      time: (c.openTime / 1000) as Time,
      value: c.volume,
      color: c.close >= c.open ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)',
    }));

    candleSeriesRef.current.setData(candleData);
    volumeSeriesRef.current.setData(volumeData);

    // Compute EMAs for overlay
    const closes = candles.map((c: any) => c.close);
    const ema9Values = ema(closes, 9);
    const ema21Values = ema(closes, 21);
    const ema50Values = ema(closes, 50);

    if (ema9Ref.current && showEMA9) {
      ema9Ref.current.setData(
        ema9Values.map((v: number | null, i: number) => ({
          time: (candles[i].openTime / 1000) as Time,
          value: v ?? 0,
        })).filter((d: any) => d.value > 0)
      );
    }
    if (ema21Ref.current && showEMA21) {
      ema21Ref.current.setData(
        ema21Values.map((v: number | null, i: number) => ({
          time: (candles[i].openTime / 1000) as Time,
          value: v ?? 0,
        })).filter((d: any) => d.value > 0)
      );
    }
    if (ema50Ref.current && showEMA50) {
      ema50Ref.current.setData(
        ema50Values.map((v: number | null, i: number) => ({
          time: (candles[i].openTime / 1000) as Time,
          value: v ?? 0,
        })).filter((d: any) => d.value > 0)
      );
    }

    // Auto-fit
    chartRef.current?.timeScale().fitContent();
  }, [vm.selectedChartCandles, showEMA9, showEMA21, showEMA50]);

  // Toggle EMA visibility
  useEffect(() => {
    if (ema9Ref.current) {
      ema9Ref.current.applyOptions({ visible: showEMA9 });
    }
  }, [showEMA9]);

  useEffect(() => {
    if (ema21Ref.current) {
      ema21Ref.current.applyOptions({ visible: showEMA21 });
    }
  }, [showEMA21]);

  useEffect(() => {
    if (ema50Ref.current) {
      ema50Ref.current.applyOptions({ visible: showEMA50 });
    }
  }, [showEMA50]);

  useEffect(() => {
    if (volumeSeriesRef.current) {
      volumeSeriesRef.current.applyOptions({ visible: showVolume });
    }
  }, [showVolume]);

  const sig = vm.activeSignal;

  return (
    <div className="p-6 space-y-4 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">📊 Chart</h1>
        <div className="flex items-center gap-2">
          {TIMEFRAMES.filter(tf => tf !== '1s').map(tf => (
            <button
              key={tf}
              onClick={() => vm.setSelectedChartTimeframe(tf)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                vm.selectedChartTimeframe === tf
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {timeframeTitle(tf)}
            </button>
          ))}
        </div>
      </div>

      {/* Indicator toggles */}
      <div className="flex items-center gap-4 text-sm">
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={showEMA9} onChange={e => setShowEMA9(e.target.checked)} className="accent-amber-500" />
          <span className="text-amber-500 font-medium">EMA 9</span>
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={showEMA21} onChange={e => setShowEMA21(e.target.checked)} className="accent-blue-500" />
          <span className="text-blue-500 font-medium">EMA 21</span>
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={showEMA50} onChange={e => setShowEMA50(e.target.checked)} className="accent-purple-500" />
          <span className="text-purple-500 font-medium">EMA 50</span>
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={showVolume} onChange={e => setShowVolume(e.target.checked)} className="accent-gray-400" />
          <span className="text-gray-400 font-medium">Volume</span>
        </label>
      </div>

      {/* Chart container */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <div ref={containerRef} className="w-full" style={{ height: '500px' }} />
      </div>

      {/* Indicator summary */}
      <div className="grid grid-cols-6 gap-4">
        <IndicatorCard label="RSI 14" value={sig.fiveMinute.rsi14 !== null ? sig.fiveMinute.rsi14.toFixed(1) : '--'} color={sig.fiveMinute.rsi14 !== null && sig.fiveMinute.rsi14 > 70 ? 'text-pink-400' : sig.fiveMinute.rsi14 !== null && sig.fiveMinute.rsi14 < 30 ? 'text-green-400' : 'text-gray-200'} />
        <IndicatorCard label="MACD" value={sig.fiveMinute.macd !== null ? (sig.fiveMinute.macd > (sig.fiveMinute.macdSignal ?? 0) ? 'Bullish' : 'Bearish') : '--'} color={sig.fiveMinute.macd !== null && sig.fiveMinute.macd > (sig.fiveMinute.macdSignal ?? 0) ? 'text-green-400' : 'text-pink-400'} />
        <IndicatorCard label="EMA 9" value={sig.fiveMinute.ema9 !== null ? `$${sig.fiveMinute.ema9.toFixed(0)}` : '--'} color="text-amber-400" />
        <IndicatorCard label="EMA 21" value={sig.fiveMinute.ema21 !== null ? `$${sig.fiveMinute.ema21.toFixed(0)}` : '--'} color="text-blue-400" />
        <IndicatorCard label="EMA 50" value={sig.fiveMinute.ema50 !== null ? `$${sig.fiveMinute.ema50.toFixed(0)}` : '--'} color="text-purple-400" />
        <IndicatorCard label="Volume" value={sig.fiveMinute.currentVolume !== null && sig.fiveMinute.averageVolume20 !== null && sig.fiveMinute.currentVolume > sig.fiveMinute.averageVolume20 ? 'High' : 'Low'} color={sig.fiveMinute.currentVolume !== null && sig.fiveMinute.averageVolume20 !== null && sig.fiveMinute.currentVolume > sig.fiveMinute.averageVolume20 ? 'text-green-400' : 'text-gray-400'} />
      </div>
    </div>
  );
}

function IndicatorCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-gray-900 rounded-xl p-4 text-center">
      <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-sm font-bold ${color}`}>{value}</p>
    </div>
  );
}

// Simple EMA calculation for chart overlay
function ema(values: number[], period: number): (number | null)[] {
  if (period <= 0 || values.length < period) {
    return Array(values.length).fill(null);
  }
  const result: (number | null)[] = Array(values.length).fill(null);
  const multiplier = 2.0 / (period + 1);
  const seed = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result[period - 1] = seed;
  let previousEMA = seed;
  for (let i = period; i < values.length; i++) {
    const currentEMA = (values[i] - previousEMA) * multiplier + previousEMA;
    result[i] = currentEMA;
    previousEMA = currentEMA;
  }
  return result;
}