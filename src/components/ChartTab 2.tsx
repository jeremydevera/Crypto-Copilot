import { useEffect, useRef, useState, useCallback } from 'react';
import * as am5 from '@amcharts/amcharts5';
import * as am5xy from '@amcharts/amcharts5/xy';
import am5themes_Animated from '@amcharts/amcharts5/themes/Animated';
import type { Timeframe } from '../engine/types';
import { TIMEFRAMES, timeframeTitle } from '../engine/types';
import { SOCKET_FEEDS, type SocketFeedConfig } from '../data/socketFeeds';

interface ChartTabProps {
  vm: any;
}

export default function ChartTab({ vm }: ChartTabProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<am5.Root | null>(null);
  const seriesRef = useRef<am5xy.CandlestickSeries | null>(null);
  const volumeSeriesRef = useRef<am5xy.ColumnSeries | null>(null);
  const ema9Ref = useRef<am5xy.LineSeries | null>(null);
  const ema21Ref = useRef<am5xy.LineSeries | null>(null);
  const ema50Ref = useRef<am5xy.LineSeries | null>(null);
  const liveSeriesRef = useRef<am5xy.LineSeries | null>(null);
  const sbSeriesRef = useRef<am5xy.LineSeries | null>(null);
  const [showEMA9, setShowEMA9] = useState(true);
  const [showEMA21, setShowEMA21] = useState(true);
  const [showEMA50, setShowEMA50] = useState(true);
  const [showVolume, setShowVolume] = useState(true);

  // WebSocket feed state
  const [selectedFeedId, setSelectedFeedId] = useState<string>('binance-trade');
  const [feedStatus, setFeedStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [feedLatency, setFeedLatency] = useState<number | null>(null);
  const [feedMsgCount, setFeedMsgCount] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const feedMsgCountRef = useRef(0);

  // Create chart on mount
  useEffect(() => {
    if (!containerRef.current) return;

    // ── Root ──
    const root = am5.Root.new(containerRef.current);
    rootRef.current = root;

    // Custom theme: hide minor grid in scrollbar
    const myTheme = am5.Theme.new(root);
    myTheme.rule('Grid', ['scrollbar', 'minor']).setAll({ visible: false });

    root.setThemes([
      am5themes_Animated.new(root),
      myTheme,
    ]);

    // ── Chart ──
    const chart = root.container.children.push(
      am5xy.XYChart.new(root, {
        focusable: true,
        panX: true,
        panY: true,
        wheelX: 'panX',
        wheelY: 'zoomX',
        paddingLeft: 0,
      })
    );

    // ── Axes ──
    const xAxis = chart.xAxes.push(
      am5xy.DateAxis.new(root, {
        groupData: true,
        maxDeviation: 0.5,
        baseInterval: { timeUnit: 'minute', count: 5 },
        renderer: am5xy.AxisRendererX.new(root, {
          pan: 'zoom',
          minorGridEnabled: true,
        }),
        tooltip: am5.Tooltip.new(root, {}),
      })
    );

    const yAxis = chart.yAxes.push(
      am5xy.ValueAxis.new(root, {
        maxDeviation: 1,
        renderer: am5xy.AxisRendererY.new(root, {
          pan: 'zoom',
        }),
      })
    );

    // ── Candlestick series (matching amCharts demo) ──
    const color = root.interfaceColors.get('background');

    const candleSeries = chart.series.push(
      am5xy.CandlestickSeries.new(root, {
        turboMode: true,
        fill: color,
        calculateAggregates: true,
        stroke: color,
        name: 'BTC/USDT',
        xAxis,
        yAxis,
        valueYField: 'close',
        openValueYField: 'open',
        lowValueYField: 'low',
        highValueYField: 'high',
        valueXField: 'date',
        lowValueYGrouped: 'low',
        highValueYGrouped: 'high',
        openValueYGrouped: 'open',
        valueYGrouped: 'close',
        legendValueText: 'open: {openValueY}  low: {lowValueY}  high: {highValueY}  close: {valueY}',
        legendRangeValueText: '{valueYClose}',
        tooltip: am5.Tooltip.new(root, {
          pointerOrientation: 'horizontal',
          labelText: 'open: {openValueY}\nlow: {lowValueY}\nhigh: {highValueY}\nclose: {valueY}',
        }),
      })
    );

    // ── Volume series (secondary Y axis) ──
    const volumeAxis = chart.yAxes.push(
      am5xy.ValueAxis.new(root, {
        renderer: am5xy.AxisRendererY.new(root, {
          opposite: true,
          pan: 'zoom',
        }),
        visible: false,
      })
    );

    const volumeSeries = chart.series.push(
      am5xy.ColumnSeries.new(root, {
        name: 'Volume',
        xAxis,
        yAxis: volumeAxis,
        valueYField: 'volume',
        valueXField: 'date',
        fill: am5.color('#4b5563'),
        stroke: am5.color('#4b5563'),
      })
    );

    // ── EMA lines ──
    const ema9Series = chart.series.push(
      am5xy.LineSeries.new(root, {
        name: 'EMA 9',
        xAxis,
        yAxis,
        valueYField: 'ema9',
        valueXField: 'date',
        stroke: am5.color('#f59e0b'),
        fill: am5.color('#f59e0b'),
        strokeWidth: 1,
      })
    );

    const ema21Series = chart.series.push(
      am5xy.LineSeries.new(root, {
        name: 'EMA 21',
        xAxis,
        yAxis,
        valueYField: 'ema21',
        valueXField: 'date',
        stroke: am5.color('#3b82f6'),
        fill: am5.color('#3b82f6'),
        strokeWidth: 1,
      })
    );

    const ema50Series = chart.series.push(
      am5xy.LineSeries.new(root, {
        name: 'EMA 50',
        xAxis,
        yAxis,
        valueYField: 'ema50',
        valueXField: 'date',
        stroke: am5.color('#a855f7'),
        fill: am5.color('#a855f7'),
        strokeWidth: 1,
      })
    );

    // ── Live price line ──
    const liveSeries = chart.series.push(
      am5xy.LineSeries.new(root, {
        name: 'Live Price',
        xAxis,
        yAxis,
        valueYField: 'price',
        valueXField: 'date',
        stroke: am5.color('#22d3ee'),
        strokeWidth: 2,
        strokeDasharray: [4, 4],
      })
    );

    // ── Cursor ──
    const cursor = chart.set(
      'cursor',
      am5xy.XYCursor.new(root, {
        xAxis,
      })
    );
    cursor.lineY.set('visible', false);

    // ── Stack axes vertically (like the demo) ──
    chart.leftAxesContainer.set('layout', root.verticalLayout);

    // ── Scrollbar with its own series (matching the demo) ──
    const scrollbar = am5xy.XYChartScrollbar.new(root, {
      orientation: 'horizontal',
      height: 50,
    });
    chart.set('scrollbarX', scrollbar);

    const sbxAxis = scrollbar.chart.xAxes.push(
      am5xy.DateAxis.new(root, {
        groupData: true,
        groupIntervals: [{ timeUnit: 'week', count: 1 }],
        baseInterval: { timeUnit: 'minute', count: 5 },
        renderer: am5xy.AxisRendererX.new(root, {
          minorGridEnabled: true,
          strokeOpacity: 0,
        }),
      })
    );

    const sbyAxis = scrollbar.chart.yAxes.push(
      am5xy.ValueAxis.new(root, {
        renderer: am5xy.AxisRendererY.new(root, {}),
      })
    );

    const sbseries = scrollbar.chart.series.push(
      am5xy.LineSeries.new(root, {
        xAxis: sbxAxis,
        yAxis: sbyAxis,
        valueYField: 'close',
        valueXField: 'date',
      })
    );
    sbSeriesRef.current = sbseries;

    // ── Legend (matching the demo) ──
    const legend = yAxis.axisHeader.children.push(am5.Legend.new(root, {}));
    legend.data.push(candleSeries);
    legend.markers.template.setAll({ width: 10 });
    legend.markerRectangles.template.setAll({
      cornerRadiusTR: 0,
      cornerRadiusBR: 0,
      cornerRadiusTL: 0,
      cornerRadiusBL: 0,
    });

    // ── Store refs ──
    seriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;
    ema9Ref.current = ema9Series;
    ema21Ref.current = ema21Series;
    ema50Ref.current = ema50Series;
    liveSeriesRef.current = liveSeries;

    // ── Resize observer ──
    const resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          root.resize(width, height);
        }
      }
    });
    resizeObserver.observe(containerRef.current);

    // ── Cleanup ──
    return () => {
      resizeObserver.disconnect();
      root.dispose();
      rootRef.current = null;
      seriesRef.current = null;
      volumeSeriesRef.current = null;
      ema9Ref.current = null;
      ema21Ref.current = null;
      ema50Ref.current = null;
      liveSeriesRef.current = null;
      sbSeriesRef.current = null;
    };
  }, []);

  // ── Update data when candles change ──
  useEffect(() => {
    if (!seriesRef.current || !volumeSeriesRef.current) return;

    const candles = vm.selectedChartCandles;
    if (!candles || candles.length === 0) return;

    const closes = candles.map((c: any) => c.close);
    const ema9Values = ema(closes, 9);
    const ema21Values = ema(closes, 21);
    const ema50Values = ema(closes, 50);

    const chartData = candles.map((c: any, i: number) => ({
      date: c.openTime,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
      ema9: ema9Values[i] ?? undefined,
      ema21: ema21Values[i] ?? undefined,
      ema50: ema50Values[i] ?? undefined,
    }));

    seriesRef.current.data.setAll(chartData);
    volumeSeriesRef.current.data.setAll(chartData);
    if (ema9Ref.current) ema9Ref.current.data.setAll(chartData);
    if (ema21Ref.current) ema21Ref.current.data.setAll(chartData);
    if (ema50Ref.current) ema50Ref.current.data.setAll(chartData);
    if (sbSeriesRef.current) sbSeriesRef.current.data.setAll(chartData);

    // Animate on load (matching the demo)
    seriesRef.current.appear(1000);
  }, [vm.selectedChartCandles]);

  // ── Toggle EMA / Volume visibility ──
  useEffect(() => {
    if (ema9Ref.current) ema9Ref.current.set('visible', showEMA9);
  }, [showEMA9]);

  useEffect(() => {
    if (ema21Ref.current) ema21Ref.current.set('visible', showEMA21);
  }, [showEMA21]);

  useEffect(() => {
    if (ema50Ref.current) ema50Ref.current.set('visible', showEMA50);
  }, [showEMA50]);

  useEffect(() => {
    if (volumeSeriesRef.current) volumeSeriesRef.current.set('visible', showVolume);
  }, [showVolume]);

  // ── WebSocket Feed Connection ──

  const connectFeed = useCallback((feed: SocketFeedConfig) => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setFeedStatus('connecting');
    setFeedMsgCount(0);
    feedMsgCountRef.current = 0;

    try {
      const ws = new WebSocket(feed.endpoint);
      wsRef.current = ws;

      ws.onopen = () => {
        setFeedStatus('connected');
        if (feed.subscribe) {
          ws.send(feed.subscribe);
        }
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          const price = feed.parsePrice(msg);
          if (price !== null && !isNaN(price) && price > 0 && liveSeriesRef.current) {
            const eventTime = feed.parseEventTime(msg);
            const latency = eventTime ? Date.now() - eventTime : null;
            if (latency !== null) setFeedLatency(latency);

            feedMsgCountRef.current++;
            setFeedMsgCount(feedMsgCountRef.current);

            liveSeriesRef.current.data.push({
              date: Date.now(),
              price,
            });
          }
        } catch {}
      };

      ws.onerror = () => {
        setFeedStatus('error');
      };

      ws.onclose = () => {
        if (feedStatus !== 'error') {
          setFeedStatus('disconnected');
        }
      };
    } catch {
      setFeedStatus('error');
    }
  }, [feedStatus]);

  const disconnectFeed = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setFeedStatus('disconnected');
    setFeedLatency(null);
    setFeedMsgCount(0);
    feedMsgCountRef.current = 0;
  }, []);

  useEffect(() => {
    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  const selectedFeed = SOCKET_FEEDS.find(f => f.id === selectedFeedId) ?? SOCKET_FEEDS[0];

  // Group feeds by provider for the dropdown
  const providerGroups = SOCKET_FEEDS.reduce((acc, feed) => {
    if (!acc[feed.provider]) acc[feed.provider] = [];
    acc[feed.provider].push(feed);
    return acc;
  }, {} as Record<string, SocketFeedConfig[]>);

  const sig = vm.activeSignal;
  const hasData = vm.selectedChartCandles && vm.selectedChartCandles.length > 0;

  return (
    <div className="p-6 space-y-4 max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-2">
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

      {/* Live Feed Selector */}
      <div className="bg-gray-900 rounded-xl p-4 flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-[280px]">
          <label className="text-xs text-gray-400 font-medium whitespace-nowrap">Live Feed:</label>
          <select
            value={selectedFeedId}
            onChange={e => setSelectedFeedId(e.target.value)}
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-green-500"
          >
            {Object.entries(providerGroups).map(([provider, feeds]) => (
              <optgroup key={provider} label={provider}>
                {feeds.map(f => (
                  <option key={f.id} value={f.id}>{f.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
          {feedStatus === 'connected' ? (
            <button onClick={disconnectFeed} className="px-3 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-lg transition-colors">
              Disconnect
            </button>
          ) : (
            <button onClick={() => connectFeed(selectedFeed)} className="px-3 py-2 bg-green-600 hover:bg-green-500 text-white text-xs font-bold rounded-lg transition-colors">
              Connect
            </button>
          )}
        </div>
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${feedStatus === 'connected' ? 'bg-green-500' : feedStatus === 'connecting' ? 'bg-yellow-500 animate-pulse' : feedStatus === 'error' ? 'bg-red-500' : 'bg-gray-600'}`} />
            <span className="text-gray-400">{feedStatus === 'connected' ? 'LIVE' : feedStatus === 'connecting' ? 'Connecting...' : feedStatus === 'error' ? 'Error' : 'Offline'}</span>
          </div>
          {feedLatency !== null && (
            <span className={`font-mono ${feedLatency < 50 ? 'text-green-400' : feedLatency < 150 ? 'text-yellow-400' : 'text-red-400'}`}>
              {feedLatency}ms
            </span>
          )}
          {feedMsgCount > 0 && (
            <span className="text-gray-500">{feedMsgCount.toLocaleString()} msgs</span>
          )}
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
        {feedStatus === 'connected' && (
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-cyan-400" style={{ borderTop: '2px dashed #22d3ee' }} />
            <span className="text-cyan-400 font-medium">Live Price</span>
          </span>
        )}
      </div>

      {/* Chart container */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden relative">
        <div ref={containerRef} className="w-full" style={{ height: '500px' }} />
        {!hasData && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/80 z-10">
            <p className="text-gray-400 text-lg font-medium">No candle data available</p>
            <p className="text-gray-600 text-sm mt-2">Binance API may be geo-blocked in your region</p>
            <p className="text-gray-600 text-sm">Try connecting a live WebSocket feed above for real-time price</p>
            <button
              onClick={() => vm.refreshAll()}
              className="mt-4 px-4 py-2 bg-green-600 hover:bg-green-500 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Retry Fetch
            </button>
          </div>
        )}
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