// ============================================================
// Market ViewModel — Ported from MarketViewModel.swift
// Uses React state + refs pattern
// Backend API is primary data source; local calc is fallback
// ============================================================

import { useState, useCallback, useRef, useEffect } from 'react';
import type { Candle, TradingSignal, TradeQuote, TradeTick, MarketMicrostructure, DataFreshness, Timeframe } from '../engine/types';
import { placeholderSignal, connectingFreshness, emptyMicrostructure, timeframeSeconds } from '../engine/types';
import { analyze, calculateTradeQuote, latestSwingLowPublic, nearestSwingHighAbovePricePublic, defaultSlippagePercent } from '../engine/SignalEngine';
import { BackendKlineWebSocket } from '../services/BackendWebSocket';
import { fetchBackendSignal, fetchCachedSignal, fetchCandles, fetchExchangeRates } from '../services/BackendMarketService';
import { connectBackendWebSocket, disconnectBackendWebSocket, subscribeToPrices, sendSubscribe, type LivePriceUpdate } from '../services/BackendWebSocket';
import { PaperTradingStore } from './PaperTradingStore';
import { pairToSymbol } from '../data/socketFeeds';
import type { SoundId } from '../engine/sounds';
import { playSound } from '../engine/sounds';
import { setExchangeRates as setFormattersExchangeRates, getExchangeRate } from '../engine/formatters';
import { loadPaperTradesFromSupabase, loadUserConfigFromSupabase, setAutoTradeEnabled as setAutoTradeEnabledBackend } from '../services/SupabaseSync';
import { supabase } from '../lib/supabase';

const MAX_5M_CANDLES = 300;
const MAX_15M_CANDLES = 200;
const DEFAULT_LIVE_FEED_ID = 'binance-futures-bookticker';

export function useMarketViewModel() {
  // Core state
  const [fiveMinuteCandles, setFiveMinuteCandles] = useState<Candle[]>([]);
  const [fifteenMinuteCandles, setFifteenMinuteCandles] = useState<Candle[]>([]);
  const [oneHourCandles, setOneHourCandles] = useState<Candle[]>([]);
  const [fourHourCandles, setFourHourCandles] = useState<Candle[]>([]);
  const [selectedChartCandles, setSelectedChartCandles] = useState<Candle[]>([]);
  const [signal, setSignal] = useState<TradingSignal>(placeholderSignal);
  const [activeSignal, setActiveSignal] = useState<TradingSignal>(placeholderSignal);
  const [tradeQuote, setTradeQuote] = useState<TradeQuote>({
    investmentAmount: 0, entryPrice: 0, feeAndSpreadPercent: 0,
    slippagePercent: 0, breakevenPrice: 0, target1: 0, target2: 0, stopLoss: 0, rewardRisk: 0,
  });
  const [statusMessage, setStatusMessage] = useState('Starting ultra-fast WebSockets...');
  const [isLoading, setIsLoading] = useState(false);
  const [chartLoading, setChartLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [lastSignalUpdateTime, setLastSignalUpdateTime] = useState<number | null>(null);
  const [dataFreshness, setDataFreshness] = useState<DataFreshness>(connectingFreshness);
  const [signalSource, setSignalSource] = useState<'closed-candle' | 'live-preview'>('live-preview');
  const [microstructure, setMicrostructure] = useState<MarketMicrostructure>(emptyMicrostructure);
  const [devLogs, setDevLogs] = useState<string[]>([]);
  const [restLogs, setRestLogs] = useState<string[]>([]);
  const [selectedChartTimeframe, setSelectedChartTimeframe] = useState<Timeframe>('15m');
  const [chartRefreshTrigger, setChartRefreshTrigger] = useState(0);
  const [investmentAmount, setInvestmentAmount] = useState(10000);
  const [feeAndSpreadPercent] = useState(0.5);
  const [autoTradeEnabled, setAutoTradeEnabled] = useState(true);
  const [cryptoPair, setCryptoPair] = useState('BTC/USDT');
  const [fiatCurrency, setFiatCurrency] = useState('USD');
  const [selectedLiveFeedId, setSelectedLiveFeedId] = useState(DEFAULT_LIVE_FEED_ID);
  const [liveFeedStatus, setLiveFeedStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [liveFeedLatency, setLiveFeedLatency] = useState<number | null>(null);
  const [liveFeedMsgCount, setLiveFeedMsgCount] = useState(0);
  const [buySound, setBuySound] = useState<SoundId>('cash');
  const [sellSound, setSellSound] = useState<SoundId>('emergency');
  const buySoundRef = useRef<SoundId>('cash');
  const sellSoundRef = useRef<SoundId>('emergency');
  useEffect(() => { buySoundRef.current = buySound; }, [buySound]);
  useEffect(() => { sellSoundRef.current = sellSound; }, [sellSound]);
  const selectedChartTimeframeRef = useRef<Timeframe>('15m');

  // Derived Binance symbol from cryptoPair
  const symbol = pairToSymbol(cryptoPair);

  // Refs for mutable state in callbacks
  const paperTradingRef = useRef(new PaperTradingStore());
  const paperTrading = paperTradingRef.current;
  const [ptVersion, setPtVersion] = useState(0); // trigger re-renders

  const klineWsRef = useRef(new BackendKlineWebSocket());
  const chartWsRef = useRef(new BackendKlineWebSocket());
  const backendWsConnectedRef = useRef(false);
  const livePriceRef = useRef(0);
  const chartHistoryReadyRef = useRef(false);
  const chartLoadRequestIdRef = useRef(0);
  const currentSymbolRef = useRef(symbol);
  currentSymbolRef.current = symbol;

  const lastSignalCalcTime = useRef(0);
  const lastLogTime = useRef(0);
  const lastMicroRefreshTime = useRef(0);
  const lastAutoTradeTime = useRef<number>(0);
  const lastNotifiedDecision = useRef<string | null>(null);

  useEffect(() => {
    selectedChartTimeframeRef.current = selectedChartTimeframe;
  }, [selectedChartTimeframe]);

  const loadSupabaseState = useCallback(async () => {
    try {
      const data = await loadPaperTradesFromSupabase();
      if (data) {
        paperTrading.demoBalance = data.demoBalance;
        paperTrading.openPosition = data.openPosition;
        paperTrading.history = data.history;
        setPtVersion(v => v + 1);
      }

      const config = await loadUserConfigFromSupabase();
      if (config) {
        setInvestmentAmount(config.accountSize);
      }
    } catch (e) {
      console.warn('[Supabase] Failed to load user data:', e);
    }
  }, [paperTrading]);

  // Supabase sync — load paper trades & config when user signs in
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) loadSupabaseState();
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        loadSupabaseState();
      }
    });
    return () => subscription.unsubscribe();
  }, [loadSupabaseState]);

  // Freshness timer
  useEffect(() => {
    const interval = setInterval(() => {
      if (lastUpdated === null) {
        setDataFreshness({ kind: 'connecting' });
        return;
      }
      const delay = (Date.now() - lastUpdated) / 1000;
      if (delay < 5) setDataFreshness({ kind: 'live', delay });
      else if (delay < 30) setDataFreshness({ kind: 'delayed', delay });
      else if (delay < 120) setDataFreshness({ kind: 'stale', delay });
      else setDataFreshness({ kind: 'offline' });
    }, 1000);
    return () => clearInterval(interval);
  }, [lastUpdated]);

  const addLog = useCallback((msg: string) => {
    const ts = new Date().toLocaleTimeString();
    setDevLogs(prev => [`[${ts}] ${msg}`, ...prev].slice(0, 100));
  }, []);

  const addRestLog = useCallback((msg: string) => {
    const ts = new Date().toLocaleTimeString();
    setRestLogs(prev => [`[${ts}] ${msg}`, ...prev].slice(0, 2000));
  }, []);

  const clearDevLogs = useCallback(() => setDevLogs([]), []);
  const clearRestLogs = useCallback(() => setRestLogs([]), []);

  const recalculateSignal = useCallback((
    fmc: Candle[], fmc15: Candle[], fmc1h: Candle[], fmc4h: Candle[], invAmt: number, feePct: number, pt: PaperTradingStore, ms: MarketMicrostructure
  ) => {
    const newSignal = analyze(
      symbol, fmc, fmc15, fmc1h, fmc4h, feePct, invAmt, pt.demoBalance,
      pt.openPosition?.entryPrice ?? null,
      pt.openPosition?.investedAmount ?? null,
      1, ms
    );
    // Always update live preview signal
    setSignal(newSignal);

    // Only update official active signal when the latest 5m candle is closed
    const latestCandle = fmc[fmc.length - 1];
    const isClosed = latestCandle?.isClosed === true;

    // Track signal source: closed-candle = official, live-preview = forming candle
    if (isClosed) {
      setSignalSource('closed-candle');
    } else {
      setSignalSource('live-preview');
    }

    // Update active signal cache
    let modified = { ...newSignal };
    if (pt.openPosition) {
      if (modified.sellScore >= 80) modified.decision = 'Sell / Exit';
      else if (modified.sellScore >= 65) modified.decision = 'Consider Sell';
      else modified.decision = 'Hold';

      const swingLow = latestSwingLowPublic(fmc);
      const nextRes = nearestSwingHighAbovePricePublic(fmc, pt.openPosition.entryPrice * 1.005);
      const farRes = nearestSwingHighAbovePricePublic(fmc, pt.openPosition.entryPrice * 1.02);
      const quote = calculateTradeQuote(
        pt.openPosition.investedAmount,
        pt.openPosition.entryPrice,
        feePct,
        defaultSlippagePercent,
        swingLow ?? null,
        nextRes ?? null,
        farRes ?? null
      );
      modified.entryPrice = quote.entryPrice;
      modified.breakevenPrice = quote.breakevenPrice;
      modified.stopLoss = quote.stopLoss;
      modified.target1 = quote.target1;
      modified.target2 = quote.target2;
      modified.rewardRisk = quote.rewardRisk;

      if (modified.trailingStop.activeTrailingStop !== null && modified.trailingStop.activeTrailingStop > modified.stopLoss) {
        modified.stopLoss = modified.trailingStop.activeTrailingStop;
      }
    } else {
      const total = modified.buyScore.higherTimeframeBias + modified.buyScore.marketStructure + modified.buyScore.liquidity + modified.buyScore.volatilitySession + modified.buyScore.riskReward + modified.buyScore.indicatorConfirmation;
      if (newSignal.decision === 'No Trade') modified.decision = 'No Trade';
      else if (total >= 85) modified.decision = 'Strong Buy';
      else if (total >= 75) modified.decision = 'Consider Buy';
      else if (total >= 60) modified.decision = 'Wait';
      else modified.decision = 'No Trade';
    }
    // Only update official active signal on closed candles
    if (isClosed) {
      setActiveSignal(modified);
    }

    // Update trade quote cache
    const qSwingLow = latestSwingLowPublic(fmc);
    const qNextRes = nearestSwingHighAbovePricePublic(fmc, newSignal.entryPrice * 1.005);
    const qFarRes = nearestSwingHighAbovePricePublic(fmc, newSignal.entryPrice * 1.02);
    setTradeQuote(calculateTradeQuote(
      invAmt,
      newSignal.entryPrice,
      feePct,
      defaultSlippagePercent,
      qSwingLow ?? null,
      qNextRes ?? null,
      qFarRes ?? null
    ));

    // Auto-trade logic — only on closed candles
    if (autoTradeEnabled && isClosed) {
      const now = Date.now();
      const minInterval = 60000; // 1 minute minimum between auto-trades
      if (now - lastAutoTradeTime.current > minInterval) {
        const decision = modified.decision;
        const hasPosition = pt.openPosition !== null;

        if (!hasPosition && (decision === 'Strong Buy' || decision === 'Consider Buy')) {
          const usdAmount = fiatCurrency === 'USD' ? invAmt : invAmt / getExchangeRate();
          const err = pt.buy(symbol, modified.price, usdAmount);
          if (!err) {
            addLog(`[AUTO-TRADE] BUY executed at $${modified.price.toFixed(2)}`);
            playSound(buySoundRef.current);
            lastAutoTradeTime.current = now;
            setPtVersion(v => v + 1);
          }
        } else if (hasPosition && (decision === 'Sell / Exit' || decision === 'Consider Sell')) {
          const result = pt.sell(modified.price);
          if ('trade' in result) {
            addLog(`[AUTO-TRADE] SELL executed at $${modified.price.toFixed(2)}`);
            playSound(sellSoundRef.current);
            lastAutoTradeTime.current = now;
            setPtVersion(v => v + 1);
          }
        }
      }
    }
  }, [autoTradeEnabled, symbol]);

  const handleLiveTrade = useCallback((trade: TradeTick) => {
    const now = Date.now();

    if (now - lastLogTime.current > 1000) {
      addLog(`Live Trade: $${trade.price} Qty: ${trade.quantity}`);
      lastLogTime.current = now;
    }

    if (now - lastMicroRefreshTime.current > 30000) {
      lastMicroRefreshTime.current = now;
      refreshMicrostructure(false);
    }

    // Update 5m candles from trade
    setFiveMinuteCandles(prev => {
      const updated = [...prev];
      const m5Interval = 300000; // 5 min in ms
      const m5Start = Math.floor(trade.time / m5Interval) * m5Interval;
      const lastIdx = updated.length - 1;
      if (lastIdx >= 0 && updated[lastIdx].openTime === m5Start) {
        const c = updated[lastIdx];
        updated[lastIdx] = { ...c, high: Math.max(c.high, trade.price), low: Math.min(c.low, trade.price), close: trade.price, volume: c.volume + trade.quantity };
      } else {
        const open = lastIdx >= 0 ? updated[lastIdx].close : trade.price;
        updated.push({ openTime: m5Start, open, high: trade.price, low: trade.price, close: trade.price, volume: trade.quantity });
        if (updated.length > MAX_5M_CANDLES) updated.shift();
      }
      return updated;
    });

    // Update 15m candles from trade
    setFifteenMinuteCandles(prev => {
      const updated = [...prev];
      const m15Interval = 900000;
      const m15Start = Math.floor(trade.time / m15Interval) * m15Interval;
      const lastIdx = updated.length - 1;
      if (lastIdx >= 0 && updated[lastIdx].openTime === m15Start) {
        const c = updated[lastIdx];
        updated[lastIdx] = { ...c, high: Math.max(c.high, trade.price), low: Math.min(c.low, trade.price), close: trade.price, volume: c.volume + trade.quantity };
      } else {
        const open = lastIdx >= 0 ? updated[lastIdx].close : trade.price;
        updated.push({ openTime: m15Start, open, high: trade.price, low: trade.price, close: trade.price, volume: trade.quantity });
        if (updated.length > MAX_15M_CANDLES) updated.shift();
      }
      return updated;
    });

    // Throttle signal recalculation to 4x/second
    if (now - lastSignalCalcTime.current > 250) {
      lastSignalCalcTime.current = now;
      // We'll recalculate in the effect below
    }

    setLastUpdated(now);
  }, [addLog]);

  // Recalculate signal locally only as fallback when backend is unavailable
  // Primary signal source is the backend API (refreshBackendSignal runs every 15s)
  useEffect(() => {
    if (fiveMinuteCandles.length === 0 || fifteenMinuteCandles.length === 0) return;
    // Only recalculate locally if backend hasn't updated recently (fallback)
    if (lastUpdated && Date.now() - lastUpdated < 20000) return; // backend is fresh
    const usdInvestment = fiatCurrency === 'USD' ? investmentAmount : investmentAmount / getExchangeRate();
    recalculateSignal(fiveMinuteCandles, fifteenMinuteCandles, oneHourCandles, fourHourCandles, usdInvestment, feeAndSpreadPercent, paperTrading, microstructure);
  }, [fiveMinuteCandles, fifteenMinuteCandles, oneHourCandles, fourHourCandles, investmentAmount, feeAndSpreadPercent, microstructure, recalculateSignal, fiatCurrency, lastUpdated]);

  const refreshMicrostructure = async (_logRaw: boolean = false) => {
    try {
      // Use cached signal which includes microstructure data (no Binance API call)
      const latestSignal = await fetchCachedSignal(symbol);
      if (latestSignal.microstructure) {
        setMicrostructure(latestSignal.microstructure);
      }
    } catch {}
  };

  const refreshBackendSignal = useCallback(async () => {
    try {
      // Use cached signal by default — no Binance API call needed
      // Backend auto-refreshes signals every 30s, so cached data is always fresh
      const response = await fetchCachedSignal(symbol);

      // Check if cached signal is stale (>90s old)
      const ageSeconds = (response as any).ageSeconds ?? -1;
      if (ageSeconds > 90) {
        addRestLog(`⚠️ Cached signal is ${ageSeconds}s old — may be stale`);
        setDataFreshness({ kind: 'delayed', delay: ageSeconds });
      } else if (ageSeconds >= 0) {
        setDataFreshness({ kind: ageSeconds < 5 ? 'live' : 'delayed', delay: ageSeconds });
      }

      // Preserve live price if we already have one (backend signal price can be stale)
      const livePrice = livePriceRef.current > 0 ? livePriceRef.current : response.price;
      const mergedSignal = { ...response, price: livePrice };
      setSignal(mergedSignal);
      setActiveSignal(mergedSignal);
      // Backend signal is always calculated from closed candles
      setSignalSource('closed-candle');
      setLastUpdated(Date.now());
      setLastSignalUpdateTime(Date.now());

      if (response.microstructure) {
        setMicrostructure(response.microstructure);
      }

      const usdInvestment = fiatCurrency === 'USD' ? investmentAmount : investmentAmount / getExchangeRate();
      const qSwingLow = latestSwingLowPublic(fiveMinuteCandles);
      const qNextRes = nearestSwingHighAbovePricePublic(fiveMinuteCandles, response.entryPrice * 1.005);
      const qFarRes = nearestSwingHighAbovePricePublic(fiveMinuteCandles, response.entryPrice * 1.02);
      setTradeQuote(calculateTradeQuote(
        usdInvestment,
        response.entryPrice,
        feeAndSpreadPercent,
        defaultSlippagePercent,
        qSwingLow ?? null,
        qNextRes ?? null,
        qFarRes ?? null
      ));
    } catch (e: any) {
      addRestLog(`Cached signal delayed: ${e.message}`);
      setDataFreshness({ kind: 'offline', delay: 999 });
      // Fallback: recalculate locally if backend is unavailable
      if (fiveMinuteCandles.length > 0 && fifteenMinuteCandles.length > 0) {
        const usdInvestment = fiatCurrency === 'USD' ? investmentAmount : investmentAmount / getExchangeRate();
        recalculateSignal(fiveMinuteCandles, fifteenMinuteCandles, oneHourCandles, fourHourCandles, usdInvestment, feeAndSpreadPercent, paperTrading, microstructure);
        addRestLog('Using local signal calculation (fallback)');
      }
    }
  }, [addRestLog, feeAndSpreadPercent, fiatCurrency, fiveMinuteCandles, investmentAmount, paperTrading.demoBalance, symbol, recalculateSignal, oneHourCandles, fourHourCandles, microstructure]);

  const applyLivePriceToSignals = useCallback((price: number) => {
    if (!Number.isFinite(price) || price <= 0) return;

    setSignal(prev => ({
      ...prev,
      symbol,
      price,
      entryPrice: prev.entryPrice > 0 ? prev.entryPrice : price,
    }));

    setActiveSignal(prev => ({
      ...prev,
      symbol,
      price,
      entryPrice: prev.entryPrice > 0 ? prev.entryPrice : price,
    }));

    // Track live price in ref for refreshAll to use
    livePriceRef.current = price;
  }, [symbol]);

  const updateSelectedChartPrice = useCallback((price: number, quantity: number = 0, time: number = Date.now()) => {
    if (!Number.isFinite(price) || price <= 0) return;
    if (!chartHistoryReadyRef.current) return;

    // Ignore prices that are wildly different from the current chart data
    // (e.g., BTC price coming in after switching to SOL)
    setSelectedChartCandles(prev => {
      if (prev.length > 0) {
        const lastClose = prev[prev.length - 1].close;
        // If the price is more than 10x or less than 0.1x the last close, ignore it
        if (lastClose > 0 && (price > lastClose * 10 || price < lastClose * 0.1)) {
          return prev;
        }
      }

      const intervalMs = timeframeSeconds(selectedChartTimeframeRef.current) * 1000;
      const openTime = Math.floor(time / intervalMs) * intervalMs;

      const updated = [...prev];
      const idx = updated.findIndex(c => c.openTime === openTime);

      if (idx >= 0) {
        const c = updated[idx];
        updated[idx] = {
          ...c,
          high: Math.max(c.high, price),
          low: Math.min(c.low, price),
          close: price,
          volume: c.volume + Math.max(quantity, 0),
        };
      } else {
        const lastIdx = updated.length - 1;
        const open = lastIdx >= 0 ? updated[lastIdx].close : price;
        updated.push({
          openTime,
          open,
          high: Math.max(open, price),
          low: Math.min(open, price),
          close: price,
          volume: Math.max(quantity, 0),
        });
      }

      return normalizeCandles(updated, 500);
    });

    setLastUpdated(Date.now());
  }, []);

  const disconnectLiveFeed = useCallback(() => {
    // Backend WebSocket handles live price — no separate disconnect needed
    setLiveFeedStatus('disconnected');
    setLiveFeedLatency(null);
    setLiveFeedMsgCount(0);
  }, []);

  const connectLiveFeed = useCallback((feedId: string = selectedLiveFeedId) => {
    const nextFeedId = feedId || DEFAULT_LIVE_FEED_ID;
    setSelectedLiveFeedId(nextFeedId);
    setLiveFeedStatus('connecting');
    setStatusMessage('Connecting live feed via backend...');
    connectBackendWebSocket();
    sendSubscribe(symbol);
  }, [selectedLiveFeedId, symbol]);

  const applyLiveFeed = useCallback((feedId: string = selectedLiveFeedId) => {
    connectLiveFeed(feedId);
  }, [connectLiveFeed, selectedLiveFeedId]);

  const refreshAll = async (): Promise<{ success: boolean; message: string }> => {
    setIsLoading(true);
    setStatusMessage(`Syncing ${cryptoPair} history...`);
    addRestLog('Initiating backend API fetch...');

    try {
      addRestLog(`Fetching ${symbol} candles (5m,15m,1h,4h) + cached signal...`);
      const [new5m, new15m, new1h, new4h, signalResponse] = await Promise.all([
        fetchCandles(symbol, '5m', 300),
        fetchCandles(symbol, '15m', 200),
        fetchCandles(symbol, '1h', 200),
        fetchCandles(symbol, '4h', 200),
        fetchCachedSignal(symbol),
      ]);

      addRestLog(`Candles received: 5m=${new5m.length}, 15m=${new15m.length}, 1h=${new1h.length}, 4h=${new4h.length}`);

      // Check if cached signal is stale
      const ageSeconds = (signalResponse as any).ageSeconds ?? -1;
      if (ageSeconds > 90) {
        addRestLog(`⚠️ Cached signal is ${ageSeconds}s old — data may be stale`);
      }

      setFiveMinuteCandles(new5m);
      setFifteenMinuteCandles(new15m);
      setOneHourCandles(new1h);
      setFourHourCandles(new4h);

      // Preserve live price if we already have one (backend signal price can be stale)
      const livePrice = livePriceRef.current > 0 ? livePriceRef.current : signalResponse.price;
      const mergedSignal = { ...signalResponse, price: livePrice };
      setSignal(mergedSignal);
      setActiveSignal(mergedSignal);
      // Backend cached signal is always calculated from closed candles
      setSignalSource('closed-candle');

      // Cached signal includes microstructure
      if (signalResponse.microstructure) {
        setMicrostructure(signalResponse.microstructure);
      }

      const wsStatus = backendWsConnectedRef.current ? 'Live price connected' : 'Live price pending';
      setStatusMessage(backendWsConnectedRef.current ? 'Backend signal + live price connected' : 'Backend signal connected (live price pending)');
      setLastUpdated(Date.now());
      addLog('Backend API Sync Complete');
      setIsLoading(false);
      return { success: true, message: `${cryptoPair} refreshed · ${wsStatus}` };
    } catch (e: any) {
      addRestLog(`ERROR: ${e.message}`);
      setStatusMessage('History delayed. Powered by live stream.');
      setIsLoading(false);
      return { success: false, message: `Refresh failed: ${e.message}` };
    }
  };

  const start = useCallback(() => {
    addLog(`[Start] Initializing ${symbol} — connecting backend WS and fetching data...`);
    // Connect to backend WebSocket for live price updates
    connectBackendWebSocket();
    sendSubscribe(symbol);

    // Subscribe to live price updates from backend (replaces direct exchange WebSocket)
    const unsubscribe = subscribeToPrices((update: LivePriceUpdate) => {
      if (update.symbol !== currentSymbolRef.current) return;
      const price = update.price;
      if (!Number.isFinite(price) || price <= 0) return;

      const tickTime = Date.now();
      if (update.eventTime && Number.isFinite(update.eventTime)) {
        setLiveFeedLatency(Math.max(0, tickTime - update.eventTime));
      }
      const quantity = 0; // backend doesn't stream quantity yet
      applyLivePriceToSignals(price);
      handleLiveTrade({ price, quantity, time: tickTime });
      updateSelectedChartPrice(price, quantity, tickTime);
      setLastUpdated(tickTime);
      backendWsConnectedRef.current = true;
      setLiveFeedStatus('connected');
      setLiveFeedMsgCount(prev => prev + 1);
    });

    // Also connect kline WebSocket for candle updates (supplementary)
    klineWsRef.current.connect(
      symbol,
      '5m',
      (candle) => {
        setLastUpdated(Date.now());
        setFiveMinuteCandles(prev => {
          const idx = prev.findIndex(c => c.openTime === candle.openTime);
          if (idx >= 0) {
            const updated = [...prev];
            updated[idx] = candle;
            return updated;
          }
          const updated = [...prev, candle];
          if (updated.length > MAX_5M_CANDLES) updated.shift();
          return updated;
        });
      },
      (msg) => addLog(`Signal WSS Error: ${msg}`),
    );

    connectLiveFeed(selectedLiveFeedId);

    refreshAll();
    return unsubscribe;
  }, [applyLivePriceToSignals, handleLiveTrade, updateSelectedChartPrice, addLog, symbol, connectLiveFeed, selectedLiveFeedId]);

  // Fetch exchange rates from backend (which calls CoinGecko)
  useEffect(() => {
    const fetchRates = async () => {
      try {
        const rates = await fetchExchangeRates();
        if (rates && Object.keys(rates).length > 0) {
          setFormattersExchangeRates(rates);
        }
      } catch {
        // Fall back to hardcoded rates (already set as defaults)
      }
    };
    fetchRates();
    const interval = setInterval(fetchRates, 300000); // refresh every 5 min
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    refreshBackendSignal();
    const interval = setInterval(refreshBackendSignal, 30_000);
    return () => clearInterval(interval);
  }, [refreshBackendSignal]);

  useEffect(() => {
    const unsubscribe = start();
    return () => {
      disconnectBackendWebSocket();
      klineWsRef.current.disconnect();
      chartWsRef.current.disconnect();
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, []);

  // Reconnect everything when crypto pair changes
  useEffect(() => {
    // Clear all candle data for the new pair
    addLog(`[Pair] Clearing all candle data for ${cryptoPair}`);
    setFiveMinuteCandles([]);
    setFifteenMinuteCandles([]);
    setOneHourCandles([]);
    setFourHourCandles([]);
    setSelectedChartCandles([]);
    setChartLoading(true);
    chartHistoryReadyRef.current = false;
    setSignal(placeholderSignal);
    setActiveSignal(placeholderSignal);
    setSignalSource('live-preview');
    livePriceRef.current = 0;
    backendWsConnectedRef.current = false;
    setLiveFeedMsgCount(0);

    // Subscribe backend WebSocket to new symbol
    sendSubscribe(symbol);

    // Reconnect kline WebSocket for new pair
    klineWsRef.current.disconnect();
    klineWsRef.current.connect(
      symbol,
      '5m',
      (candle) => {
        setLastUpdated(Date.now());
        setFiveMinuteCandles(prev => {
          const idx = prev.findIndex(c => c.openTime === candle.openTime);
          if (idx >= 0) {
            const updated = [...prev];
            updated[idx] = candle;
            return updated;
          }
          const updated = [...prev, candle];
          if (updated.length > MAX_5M_CANDLES) updated.shift();
          return updated;
        });
      },
      (msg) => addLog(`Signal WSS Error: ${msg}`),
    );

    // Reconnect live price feed for new pair (backend WebSocket handles this)
    connectLiveFeed(selectedLiveFeedId);

    // Fetch candles for new pair
    addLog(`[Pair] Switched to ${cryptoPair}, fetching all data...`);
    refreshAll();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cryptoPair]);

  // Reconnect chart WebSocket when timeframe changes
  useEffect(() => {
    addRestLog(`[Chart] Timeframe changed to ${selectedChartTimeframe}, clearing chart and reconnecting...`);
    const chartRequestId = ++chartLoadRequestIdRef.current;
    chartHistoryReadyRef.current = false;
    setSelectedChartCandles([]);
    setChartLoading(true);
    chartWsRef.current.disconnect();
    chartWsRef.current.connect(
      symbol,
      selectedChartTimeframe,
      (candle) => {
        if (!chartHistoryReadyRef.current) return;
        setLastUpdated(Date.now());
        setSelectedChartCandles(prev => {
          const idx = prev.findIndex(c => c.openTime === candle.openTime);
          let updated: Candle[];
          if (idx >= 0) {
            updated = [...prev];
            updated[idx] = candle;
          } else {
            updated = [...prev, candle];
            if (prev.length === 0) {
              addRestLog(`[Chart WS] First ${selectedChartTimeframe} candle received (history may still be loading)`);
            }
          }
          return normalizeCandles(updated, 500);
        });
      },
      (msg) => addRestLog(`[Chart WS] ${msg}`),
    );

    // Also fetch initial chart data for the new timeframe
    addRestLog(`[Chart] Fetching ${selectedChartTimeframe} candles for ${symbol}...`);
    fetchCandles(symbol, selectedChartTimeframe, 500).then(async (newChart) => {
      if (chartRequestId !== chartLoadRequestIdRef.current) return;
      addRestLog(`[Chart] Received ${newChart.length} ${selectedChartTimeframe} candles for ${symbol}`);
      if (newChart.length > 0) {
        chartHistoryReadyRef.current = true;
        setSelectedChartCandles(normalizeCandles(newChart, 500));
        setChartLoading(false);
        addRestLog(`[Chart] ✅ Chart set with ${newChart.length} candles`);
      } else {
        addRestLog(`[Chart] ⚠️ No candles for ${symbol} ${selectedChartTimeframe}, trying 15m fallback`);
        // Fallback to 15m if the selected timeframe has no data
        const fallback = await fetchCandles(symbol, '15m', 500);
        addRestLog(`[Chart] Fallback 15m returned ${fallback.length} candles`);
        if (chartRequestId !== chartLoadRequestIdRef.current) return;
        if (fallback.length > 0) {
          chartHistoryReadyRef.current = true;
          setSelectedChartCandles(normalizeCandles(fallback, 500));
          setChartLoading(false);
          addRestLog(`[Chart] ✅ Chart set with ${fallback.length} fallback candles`);
        } else {
          chartHistoryReadyRef.current = false;
          setChartLoading(false);
          addRestLog(`[Chart] ❌ Both primary and fallback candle fetches returned empty`);
        }
      }
    }).catch(async (err) => {
      console.error('Chart candle fetch failed:', err);
      addRestLog(`[Chart] ❌ Fetch failed: ${err.message}`);
      // Fallback to 15m on error
      try {
        const fallback = await fetchCandles(symbol, '15m', 500);
        if (chartRequestId !== chartLoadRequestIdRef.current) return;
        addRestLog(`[Chart] Error fallback 15m returned ${fallback.length} candles`);
        if (fallback.length > 0) {
          chartHistoryReadyRef.current = true;
          setSelectedChartCandles(normalizeCandles(fallback, 500));
          setChartLoading(false);
          addRestLog(`[Chart] ✅ Chart set with ${fallback.length} fallback candles`);
        } else {
          chartHistoryReadyRef.current = false;
          setChartLoading(false);
        }
      } catch (fallbackErr: any) {
        if (chartRequestId !== chartLoadRequestIdRef.current) return;
        chartHistoryReadyRef.current = false;
        setChartLoading(false);
        addRestLog(`[Chart] ❌ Fallback also failed: ${fallbackErr.message}`);
      }
    });

    return () => {
      chartWsRef.current.disconnect();
    };
  }, [selectedChartTimeframe, symbol, chartRefreshTrigger, addLog]);

  // Paper trading helpers
  const buyPaperTrade = useCallback((): string | null => {
    // Convert investment from fiat to USD for paper trading (prices are in USD)
    const usdAmount = fiatCurrency === 'USD' ? investmentAmount : investmentAmount / getExchangeRate();
    const err = paperTrading.buy(symbol, signal.price, usdAmount);
    if (err) return err;
    lastNotifiedDecision.current = null;
    addLog(`Manual BUY Executed at $${signal.price.toFixed(2)}`);
    playSound(buySound);
    setPtVersion(v => v + 1);
    return null;
  }, [signal.price, investmentAmount, paperTrading, addLog, buySound, symbol, fiatCurrency]);

  const sellPaperTrade = useCallback((): { trade: ClosedPaperTrade } | { error: string } => {
    const result = paperTrading.sell(signal.price);
    if ('error' in result) return result;
    lastNotifiedDecision.current = null;
    addLog(`Manual SELL Executed at $${signal.price.toFixed(2)}`);
    playSound(sellSound);
    setPtVersion(v => v + 1);
    return result;
  }, [signal.price, paperTrading, addLog, sellSound]);

  const sellPartialPaperTrade = useCallback((percent: number) => {
    const result = paperTrading.sellPartial(signal.price, percent);
    if ('error' in result) return result;
    addLog(`Partial SELL ${percent}% Executed at ${signal.price.toFixed(2)} USD`);
    playSound(sellSound);
    setPtVersion(v => v + 1);
    return result;
  }, [signal.price, paperTrading, addLog, sellSound, fiatCurrency]);

  const setDemoBalance = useCallback((balance: number) => {
    paperTrading.setDemoBalance(balance);
    setPtVersion(v => v + 1);
  }, [paperTrading]);

  const refreshChart = useCallback(() => {
    setChartRefreshTrigger(v => v + 1);
  }, []);

  // Force a full refresh from backend (calls /api/signal which triggers Binance data fetch)
  const forceRefresh = useCallback(async (): Promise<{ success: boolean; message: string }> => {
    setIsLoading(true);
    setStatusMessage(`Force refreshing ${cryptoPair}...`);
    addRestLog('Force refresh — calling /api/signal (full Binance fetch)...');

    try {
      const usdInvestment = fiatCurrency === 'USD' ? investmentAmount : investmentAmount / getExchangeRate();
      const [new5m, new15m, new1h, new4h, latestSignal] = await Promise.all([
        fetchCandles(symbol, '5m', 300),
        fetchCandles(symbol, '15m', 200),
        fetchCandles(symbol, '1h', 200),
        fetchCandles(symbol, '4h', 200),
        fetchBackendSignal(symbol, {
          mode: 'pro',
          investmentAmount: usdInvestment,
          demoBalance: paperTrading.demoBalance,
          riskPercent: 1,
          feeAndSpreadPercent,
        }),
      ]);

      setFiveMinuteCandles(new5m);
      setFifteenMinuteCandles(new15m);
      setOneHourCandles(new1h);
      setFourHourCandles(new4h);

      const livePrice = livePriceRef.current > 0 ? livePriceRef.current : latestSignal.price;
      const mergedSignal = { ...latestSignal, price: livePrice };
      setSignal(mergedSignal);
      setActiveSignal(mergedSignal);
      setSignalSource('closed-candle'); // Force refresh always uses closed-candle signal

      if (latestSignal.microstructure) {
        setMicrostructure(latestSignal.microstructure);
      }

      setLastUpdated(Date.now());
      setDataFreshness({ kind: 'live', delay: 0 });
      addRestLog('Force refresh complete');
      setIsLoading(false);
      return { success: true, message: `${cryptoPair} force refreshed` };
    } catch (e: any) {
      addRestLog(`Force refresh failed: ${e.message}`);
      setIsLoading(false);
      return { success: false, message: `Force refresh failed: ${e.message}` };
    }
  }, [addRestLog, feeAndSpreadPercent, fiatCurrency, investmentAmount, paperTrading.demoBalance, symbol, cryptoPair]);

  // ── Auto-Trade Toggle (local + backend) ──────────────────────
  const toggleAutoTrade = useCallback(async (enabled: boolean) => {
    setAutoTradeEnabled(enabled);
    try {
      await setAutoTradeEnabledBackend(enabled, pairToSymbol(cryptoPair), investmentAmount, feeAndSpreadPercent);
    } catch (e: any) {
      addRestLog(`Auto-trade backend sync failed: ${e.message}`);
    }
  }, [cryptoPair, investmentAmount, feeAndSpreadPercent, addRestLog]);

  return {
    // State
    fiveMinuteCandles, fifteenMinuteCandles, selectedChartCandles,
    signal, activeSignal, tradeQuote,
    statusMessage, isLoading, chartLoading, lastUpdated, lastSignalUpdateTime, dataFreshness, signalSource,
    microstructure, devLogs, restLogs, clearDevLogs, clearRestLogs,
    selectedChartTimeframe, investmentAmount, feeAndSpreadPercent,
    autoTradeEnabled, cryptoPair, fiatCurrency,
    buySound, sellSound,
    selectedLiveFeedId, liveFeedStatus, liveFeedLatency, liveFeedMsgCount,
    paperTrading, ptVersion,
    exchangeRate: getExchangeRate(),

    // Actions
    setSelectedChartTimeframe, setInvestmentAmount,
    toggleAutoTrade, setCryptoPair, setFiatCurrency,
    setBuySound, setSellSound,
    updateSelectedChartPrice,
    applyLiveFeed, connectLiveFeed, disconnectLiveFeed,
    setDemoBalance,
    buyPaperTrade, sellPaperTrade, sellPartialPaperTrade,
    start, refreshAll, refreshChart, forceRefresh,
  };
}

import type { ClosedPaperTrade } from '../engine/types';

function normalizeCandles(candles: Candle[], limit: number): Candle[] {
  const byOpenTime = new Map<number, Candle>();
  candles.forEach(candle => {
    if (Number.isFinite(candle.openTime)) {
      byOpenTime.set(candle.openTime, candle);
    }
  });

  const sorted = Array.from(byOpenTime.values()).sort((a, b) => a.openTime - b.openTime);
  return sorted.length > limit ? sorted.slice(sorted.length - limit) : sorted;
}
