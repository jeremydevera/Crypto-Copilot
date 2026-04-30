import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  createChart,
  type CandlestickData,
  type HistogramData,
  type IChartApi,
  type ISeriesApi,
  type LineData,
  type Time,
} from 'lightweight-charts';
import { TIMEFRAMES, timeframeTitle } from '../engine/types';
import { SOCKET_FEEDS } from '../data/socketFeeds';

interface ChartTabProps {
  vm: any;
}

type ChartCandle = CandlestickData<Time> & {
  volume?: number;
};

const UP_COLOR = '#0ecb81';
const DOWN_COLOR = '#f6465d';
const CHART_BG = '#0f1318';
const GRID_COLOR = '#1f2933';
const TEXT_MUTED = '#848e9c';

export default function ChartTab({ vm }: ChartTabProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const ema9Ref = useRef<ISeriesApi<'Line'> | null>(null);
  const ema21Ref = useRef<ISeriesApi<'Line'> | null>(null);
  const ema50Ref = useRef<ISeriesApi<'Line'> | null>(null);
  const lastFitTimeframeRef = useRef<string | null>(null);

  const [showEMA9, setShowEMA9] = useState(true);
  const [showEMA21, setShowEMA21] = useState(true);
  const [showEMA50, setShowEMA50] = useState(true);
  const [showVolume, setShowVolume] = useState(true);
  const [hoveredCandle, setHoveredCandle] = useState<ChartCandle | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: CHART_BG },
        textColor: TEXT_MUTED,
        fontSize: 12,
      },
      grid: {
        vertLines: { color: GRID_COLOR },
        horzLines: { color: GRID_COLOR },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: '#5f6673',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: '#2b3139',
        },
        horzLine: {
          color: '#5f6673',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: '#2b3139',
        },
      },
      rightPriceScale: {
        borderColor: '#2b3139',
        scaleMargins: { top: 0.08, bottom: 0.26 },
      },
      timeScale: {
        borderColor: '#2b3139',
        rightOffset: 8,
        barSpacing: 9,
        minBarSpacing: 3,
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
      localization: {
        priceFormatter: (price: number) => formatUsd(price),
      },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: UP_COLOR,
      downColor: DOWN_COLOR,
      borderUpColor: UP_COLOR,
      borderDownColor: DOWN_COLOR,
      wickUpColor: UP_COLOR,
      wickDownColor: DOWN_COLOR,
      priceLineColor: '#f0b90b',
      priceLineWidth: 1,
      priceLineStyle: LineStyle.Dotted,
      lastValueVisible: true,
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
      lastValueVisible: false,
      priceLineVisible: false,
    });
    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.78, bottom: 0 },
      borderVisible: false,
    });

    const ema9Series = chart.addSeries(LineSeries, {
      color: '#f0b90b',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    const ema21Series = chart.addSeries(LineSeries, {
      color: '#3b82f6',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    const ema50Series = chart.addSeries(LineSeries, {
      color: '#a855f7',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    const handleCrosshairMove = (param: any) => {
      const item = param.seriesData.get(candleSeries) as ChartCandle | undefined;
      setHoveredCandle(item && typeof item.open === 'number' ? item : null);
    };

    chart.subscribeCrosshairMove(handleCrosshairMove);
    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;
    ema9Ref.current = ema9Series;
    ema21Ref.current = ema21Series;
    ema50Ref.current = ema50Series;

    return () => {
      chart.unsubscribeCrosshairMove(handleCrosshairMove);
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      ema9Ref.current = null;
      ema21Ref.current = null;
      ema50Ref.current = null;
    };
  }, []);

  useEffect(() => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current) return;

    const candles = normalizeChartCandles(vm.selectedChartCandles ?? []);
    if (candles.length === 0) return;

    const candleData: ChartCandle[] = candles.map((c: any) => ({
      time: Math.floor(c.openTime / 1000) as Time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
    }));

    const volumeData: HistogramData<Time>[] = candles.map((c: any) => ({
      time: Math.floor(c.openTime / 1000) as Time,
      value: c.volume,
      color: c.close >= c.open ? 'rgba(14, 203, 129, 0.34)' : 'rgba(246, 70, 93, 0.34)',
    }));

    const closes = candles.map((c: any) => c.close);
    const ema9Values = ema(closes, 9);
    const ema21Values = ema(closes, 21);
    const ema50Values = ema(closes, 50);

    candleSeriesRef.current.setData(candleData);
    volumeSeriesRef.current.setData(volumeData);
    ema9Ref.current?.setData(toLineData(candles, ema9Values));
    ema21Ref.current?.setData(toLineData(candles, ema21Values));
    ema50Ref.current?.setData(toLineData(candles, ema50Values));

    if (lastFitTimeframeRef.current !== vm.selectedChartTimeframe) {
      chartRef.current?.timeScale().fitContent();
      lastFitTimeframeRef.current = vm.selectedChartTimeframe;
    }
  }, [vm.selectedChartCandles, vm.selectedChartTimeframe]);

  useEffect(() => {
    ema9Ref.current?.applyOptions({ visible: showEMA9 });
  }, [showEMA9]);

  useEffect(() => {
    ema21Ref.current?.applyOptions({ visible: showEMA21 });
  }, [showEMA21]);

  useEffect(() => {
    ema50Ref.current?.applyOptions({ visible: showEMA50 });
  }, [showEMA50]);

  useEffect(() => {
    volumeSeriesRef.current?.applyOptions({ visible: showVolume });
  }, [showVolume]);

  useEffect(() => {
    chartRef.current?.applyOptions({
      timeScale: {
        timeVisible: true,
        secondsVisible: vm.selectedChartTimeframe === '1s',
        barSpacing: vm.selectedChartTimeframe === '1s' ? 6 : 9,
      },
    });
  }, [vm.selectedChartTimeframe]);

  const selectedFeed = SOCKET_FEEDS.find(f => f.id === vm.selectedLiveFeedId) ?? SOCKET_FEEDS[0];

  const candles = vm.selectedChartCandles ?? [];
  const latestCandle = candles.length > 0 ? candles[candles.length - 1] : null;
  const displayCandle = hoveredCandle ?? (latestCandle
    ? {
        time: Math.floor(latestCandle.openTime / 1000) as Time,
        open: latestCandle.open,
        high: latestCandle.high,
        low: latestCandle.low,
        close: latestCandle.close,
        volume: latestCandle.volume,
      }
    : null);

  const stats = useMemo(() => {
    if (!displayCandle) return null;
    const previous = candles.length > 1 ? candles[candles.length - 2].close : displayCandle.open;
    const change = displayCandle.close - previous;
    const changePercent = previous > 0 ? change / previous * 100 : 0;
    return {
      change,
      changePercent,
      color: change >= 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]',
    };
  }, [candles, displayCandle]);

  const sig = vm.activeSignal;
  const hasData = candles.length > 0;

  return (
    <div className="min-h-screen bg-[#0b0e11] text-gray-100">
      <div className="mx-auto max-w-5xl p-4 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1f2933] pb-3">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="text-lg font-semibold text-white">{vm.cryptoPair}</h1>
            {displayCandle && (
              <>
                <span className={`font-mono text-2xl font-semibold ${stats?.color ?? 'text-white'}`}>
                  {formatUsd(displayCandle.close)}
                </span>
                <span className={`font-mono text-sm ${stats?.color ?? 'text-gray-400'}`}>
                  {stats ? `${stats.change >= 0 ? '+' : ''}${formatUsd(stats.change)} (${stats.changePercent.toFixed(2)}%)` : ''}
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-1 overflow-x-auto">
            {TIMEFRAMES.map(tf => (
              <button
                key={tf}
                onClick={() => vm.setSelectedChartTimeframe(tf)}
                className={`h-8 min-w-10 px-3 text-xs font-semibold transition-colors ${
                  vm.selectedChartTimeframe === tf
                    ? 'bg-[#2b3139] text-[#f0b90b]'
                    : 'text-[#848e9c] hover:bg-[#1f2933] hover:text-white'
                }`}
              >
                {timeframeTitle(tf)}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
            <Stat label="Open" value={displayCandle ? formatUsd(displayCandle.open) : '--'} />
            <Stat label="High" value={displayCandle ? formatUsd(displayCandle.high) : '--'} />
            <Stat label="Low" value={displayCandle ? formatUsd(displayCandle.low) : '--'} />
            <Stat label="Close" value={displayCandle ? formatUsd(displayCandle.close) : '--'} />
            <Stat label="Volume" value={displayCandle?.volume ? displayCandle.volume.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '--'} />
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs">
            <Toggle checked={showEMA9} onChange={setShowEMA9} label="EMA 9" color="text-[#f0b90b]" />
            <Toggle checked={showEMA21} onChange={setShowEMA21} label="EMA 21" color="text-blue-400" />
            <Toggle checked={showEMA50} onChange={setShowEMA50} label="EMA 50" color="text-purple-400" />
            <Toggle checked={showVolume} onChange={setShowVolume} label="Volume" color="text-gray-300" />
          </div>
        </div>

        <div className="border border-[#1f2933] bg-[#0f1318]">
          <div className="flex flex-wrap items-center gap-3 border-b border-[#1f2933] bg-[#0b0e11] p-3 text-xs">
            <span className="text-[#848e9c]">Live feed from Home</span>
            <span className="font-medium text-gray-200">{selectedFeed?.label ?? 'Unknown feed'}</span>
            <span className="ml-auto flex items-center gap-1.5 text-[#848e9c]">
              <span className={`h-2 w-2 rounded-full ${vm.liveFeedStatus === 'connected' ? 'bg-[#0ecb81]' : vm.liveFeedStatus === 'connecting' ? 'bg-[#f0b90b] animate-pulse' : vm.liveFeedStatus === 'error' ? 'bg-[#f6465d]' : 'bg-[#5f6673]'}`} />
              {vm.liveFeedStatus === 'connected' ? 'Live' : vm.liveFeedStatus === 'connecting' ? 'Connecting' : vm.liveFeedStatus === 'error' ? 'Error' : 'Offline'}
            </span>
          </div>

          <div className="relative">
            <div ref={containerRef} className="h-[560px] w-full" />
            {!hasData && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#0f1318]/90 text-center">
                <p className="text-base font-medium text-gray-300">No candle data available</p>
                <p className="mt-2 text-sm text-[#848e9c]">Binance history may be unavailable from this network.</p>
                <button
                  onClick={() => vm.refreshAll()}
                  className="mt-4 bg-[#f0b90b] px-4 py-2 text-sm font-semibold text-black hover:bg-[#ffd24a]"
                >
                  Retry Fetch
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <IndicatorCard label="RSI 14" value={sig.fiveMinute.rsi14 !== null ? sig.fiveMinute.rsi14.toFixed(1) : '--'} color={sig.fiveMinute.rsi14 !== null && sig.fiveMinute.rsi14 > 70 ? 'text-[#f6465d]' : sig.fiveMinute.rsi14 !== null && sig.fiveMinute.rsi14 < 30 ? 'text-[#0ecb81]' : 'text-gray-200'} />
          <IndicatorCard label="MACD" value={sig.fiveMinute.macd !== null ? (sig.fiveMinute.macd > (sig.fiveMinute.macdSignal ?? 0) ? 'Bullish' : 'Bearish') : '--'} color={sig.fiveMinute.macd !== null && sig.fiveMinute.macd > (sig.fiveMinute.macdSignal ?? 0) ? 'text-[#0ecb81]' : 'text-[#f6465d]'} />
          <IndicatorCard label="EMA 9" value={sig.fiveMinute.ema9 !== null ? formatUsd(sig.fiveMinute.ema9) : '--'} color="text-[#f0b90b]" />
          <IndicatorCard label="EMA 21" value={sig.fiveMinute.ema21 !== null ? formatUsd(sig.fiveMinute.ema21) : '--'} color="text-blue-400" />
          <IndicatorCard label="EMA 50" value={sig.fiveMinute.ema50 !== null ? formatUsd(sig.fiveMinute.ema50) : '--'} color="text-purple-400" />
          <IndicatorCard label="Volume" value={sig.fiveMinute.currentVolume !== null && sig.fiveMinute.averageVolume20 !== null && sig.fiveMinute.currentVolume > sig.fiveMinute.averageVolume20 ? 'High' : 'Low'} color={sig.fiveMinute.currentVolume !== null && sig.fiveMinute.averageVolume20 !== null && sig.fiveMinute.currentVolume > sig.fiveMinute.averageVolume20 ? 'text-[#0ecb81]' : 'text-gray-400'} />
        </div>
      </div>
    </div>
  );
}

function Toggle({ checked, onChange, label, color }: { checked: boolean; onChange: (value: boolean) => void; label: string; color: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-1.5">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="accent-[#f0b90b]" />
      <span className={`font-medium ${color}`}>{label}</span>
    </label>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="text-[#848e9c]">{label}</span>
      <span className="font-mono text-gray-200">{value}</span>
    </span>
  );
}

function IndicatorCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="border border-[#1f2933] bg-[#0f1318] p-4 text-center">
      <p className="mb-1 text-xs uppercase tracking-wider text-[#848e9c]">{label}</p>
      <p className={`text-sm font-bold ${color}`}>{value}</p>
    </div>
  );
}

function toLineData(candles: any[], values: (number | null)[]): LineData<Time>[] {
  return values
    .map((value, i) => value === null ? null : ({
      time: Math.floor(candles[i].openTime / 1000) as Time,
      value,
    }))
    .filter((point): point is LineData<Time> => point !== null);
}

function normalizeChartCandles(candles: any[]): any[] {
  const byTime = new Map<number, any>();
  candles.forEach(candle => {
    if (Number.isFinite(candle.openTime)) {
      byTime.set(candle.openTime, candle);
    }
  });
  return Array.from(byTime.values()).sort((a, b) => a.openTime - b.openTime);
}

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

function formatUsd(value: number): string {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: value >= 100 ? 2 : 6,
  });
}
