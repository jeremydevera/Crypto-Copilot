// ============================================================
// Market ViewModel — Ported from MarketViewModel.swift
// Uses React state + refs pattern
// ============================================================

import { useState, useCallback, useRef, useEffect } from 'react';
import type { Candle, TradingSignal, TradeQuote, TradeTick, MarketMicrostructure, DataFreshness, Timeframe } from '../engine/types';
import { placeholderSignal, connectingFreshness, emptyMicrostructure } from '../engine/types';
import { analyze, calculateTradeQuote, latestSwingLowPublic, nearestSwingHighAbovePricePublic, defaultSlippagePercent } from '../engine/SignalEngine';
import { BinanceKlineWebSocket, BinanceTradeWebSocket, fetchCandles, fetchBookTicker, fetchDepth } from '../services/BinanceMarketService';
import { PaperTradingStore } from './PaperTradingStore';

const SYMBOL = 'BTCUSDT';
const MAX_5M_CANDLES = 300;
const MAX_15M_CANDLES = 200;
const MAX_1H_CANDLES = 200;
const MAX_4H_CANDLES = 200;

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
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [dataFreshness, setDataFreshness] = useState<DataFreshness>(connectingFreshness);
  const [microstructure, setMicrostructure] = useState<MarketMicrostructure>(emptyMicrostructure);
  const [devLogs, setDevLogs] = useState<string[]>([]);
  const [restLogs, setRestLogs] = useState<string[]>([]);
  const [selectedChartTimeframe, setSelectedChartTimeframe] = useState<Timeframe>('1d');
  const [investmentAmount, setInvestmentAmount] = useState(10000);
  const [feeAndSpreadPercent] = useState(0.5);
  const [autoTradeEnabled, setAutoTradeEnabled] = useState(false);

  // Refs for mutable state in callbacks
  const paperTradingRef = useRef(new PaperTradingStore());
  const paperTrading = paperTradingRef.current;
  const [ptVersion, setPtVersion] = useState(0); // trigger re-renders

  const klineWsRef = useRef(new BinanceKlineWebSocket());
  const chartWsRef = useRef(new BinanceKlineWebSocket());
  const tradeWsRef = useRef(new BinanceTradeWebSocket());

  const lastSignalCalcTime = useRef(0);
  const lastLogTime = useRef(0);
  const lastMicroRefreshTime = useRef(0);
  const lastAutoTradeTime = useRef<number>(0);
  const lastNotifiedDecision = useRef<string | null>(null);

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

  const recalculateSignal = useCallback((
    fmc: Candle[], fmc15: Candle[], fmc1h: Candle[], fmc4h: Candle[], invAmt: number, feePct: number, pt: PaperTradingStore, ms: MarketMicrostructure
  ) => {
    const newSignal = analyze(
      SYMBOL, fmc, fmc15, fmc1h, fmc4h, feePct, invAmt, pt.demoBalance,
      pt.openPosition?.entryPrice ?? null,
      pt.openPosition?.investedAmount ?? null,
      1, ms
    );
    setSignal(newSignal);

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
    setActiveSignal(modified);

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

    // Auto-trade logic
    if (autoTradeEnabled) {
      const now = Date.now();
      const minInterval = 60000; // 1 minute minimum between auto-trades
      if (now - lastAutoTradeTime.current > minInterval) {
        const decision = modified.decision;
        const hasPosition = pt.openPosition !== null;

        if (!hasPosition && (decision === 'Strong Buy' || decision === 'Consider Buy')) {
          const err = pt.buy(SYMBOL, modified.price, invAmt);
          if (!err) {
            addLog(`[AUTO-TRADE] BUY executed at $${modified.price.toFixed(2)}`);
            lastAutoTradeTime.current = now;
            setPtVersion(v => v + 1);
          }
        } else if (hasPosition && (decision === 'Sell / Exit' || decision === 'Consider Sell')) {
          const result = pt.sell(modified.price);
          if ('trade' in result) {
            addLog(`[AUTO-TRADE] SELL executed at $${modified.price.toFixed(2)}`);
            lastAutoTradeTime.current = now;
            setPtVersion(v => v + 1);
          }
        }
      }
    }
  }, [autoTradeEnabled]);

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

  // Recalculate signal when candles change
  useEffect(() => {
    if (fiveMinuteCandles.length === 0 || fifteenMinuteCandles.length === 0) return;
    recalculateSignal(fiveMinuteCandles, fifteenMinuteCandles, oneHourCandles, fourHourCandles, investmentAmount, feeAndSpreadPercent, paperTrading, microstructure);
  }, [fiveMinuteCandles, fifteenMinuteCandles, oneHourCandles, fourHourCandles, investmentAmount, feeAndSpreadPercent, microstructure, recalculateSignal]);

  const refreshMicrostructure = async (_logRaw: boolean = false) => {
    try {
      const [ticker, depth] = await Promise.all([
        fetchBookTicker(SYMBOL),
        fetchDepth(SYMBOL, 10),
      ]);
      setMicrostructure({ bookTicker: ticker, orderBook: depth });
    } catch {}
  };

  const refreshAll = async () => {
    setIsLoading(true);
    setStatusMessage('Syncing BTC/USDT history...');
    addRestLog('Initiating REST API fetch...');

    try {
      const [new5m, new15m, new1h, new4h, newChart] = await Promise.all([
        fetchCandles(SYMBOL, '5m', 300),
        fetchCandles(SYMBOL, '15m', 200),
        fetchCandles(SYMBOL, '1h', 200),
        fetchCandles(SYMBOL, '4h', 200),
        fetchCandles(SYMBOL, selectedChartTimeframe, 500),
      ]);

      setFiveMinuteCandles(new5m);
      setFifteenMinuteCandles(new15m);
      setOneHourCandles(new1h);
      setFourHourCandles(new4h);
      if (newChart.length > 0) setSelectedChartCandles(newChart);

      await refreshMicrostructure(true);
      setStatusMessage('Live Real-Time Data Connected');
      setLastUpdated(Date.now());
      addLog('REST API Sync Complete');
    } catch (e: any) {
      addRestLog(`ERROR: ${e.message}`);
      setStatusMessage('History delayed. Powered by live stream.');
    }
    setIsLoading(false);
  };

  const start = useCallback(() => {
    // Connect trade WebSocket
    tradeWsRef.current.connect(
      SYMBOL,
      (trade) => handleLiveTrade(trade),
      (msg) => addLog(`Trade WSS Error: ${msg}`),
    );

    // Connect kline WebSocket
    klineWsRef.current.connect(
      SYMBOL,
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

    // Connect chart WebSocket
    if (selectedChartTimeframe !== '1s') {
      chartWsRef.current.connect(
        SYMBOL,
        selectedChartTimeframe,
        (candle) => {
          setLastUpdated(Date.now());
          setSelectedChartCandles(prev => {
            const idx = prev.findIndex(c => c.openTime === candle.openTime);
            if (idx >= 0) {
              const updated = [...prev];
              updated[idx] = candle;
              return updated;
            }
            const updated = [...prev, candle];
            if (updated.length > 500) updated.shift();
            return updated;
          });
        },
        (msg) => addLog(`Chart WSS Error: ${msg}`),
      );
    }

    refreshAll();
  }, [selectedChartTimeframe, handleLiveTrade, addLog]);

  // Auto-start
  useEffect(() => {
    start();
    return () => {
      klineWsRef.current.disconnect();
      chartWsRef.current.disconnect();
      tradeWsRef.current.disconnect();
    };
  }, []);

  // Paper trading helpers
  const buyPaperTrade = useCallback((): string | null => {
    const err = paperTrading.buy(SYMBOL, signal.price, investmentAmount);
    if (err) return err;
    lastNotifiedDecision.current = null;
    addLog(`Manual BUY Executed at $${signal.price}`);
    setPtVersion(v => v + 1);
    return null;
  }, [signal.price, investmentAmount, paperTrading, addLog]);

  const sellPaperTrade = useCallback((): { trade: ClosedPaperTrade } | { error: string } => {
    const result = paperTrading.sell(signal.price);
    if ('error' in result) return result;
    lastNotifiedDecision.current = null;
    addLog(`Manual SELL Executed at $${signal.price}`);
    setPtVersion(v => v + 1);
    return result;
  }, [signal.price, paperTrading, addLog]);

  const sellPartialPaperTrade = useCallback((percent: number) => {
    const result = paperTrading.sellPartial(signal.price, percent);
    if ('error' in result) return result;
    addLog(`Partial SELL ${percent}% Executed at $${signal.price}`);
    setPtVersion(v => v + 1);
    return result;
  }, [signal.price, paperTrading, addLog]);

  return {
    // State
    fiveMinuteCandles, fifteenMinuteCandles, selectedChartCandles,
    signal, activeSignal, tradeQuote,
    statusMessage, isLoading, lastUpdated, dataFreshness,
    microstructure, devLogs, restLogs,
    selectedChartTimeframe, investmentAmount, feeAndSpreadPercent,
    autoTradeEnabled,
    paperTrading, ptVersion,

    // Actions
    setSelectedChartTimeframe, setInvestmentAmount,
    setAutoTradeEnabled,
    buyPaperTrade, sellPaperTrade, sellPartialPaperTrade,
    start, refreshAll,
  };
}

import type { ClosedPaperTrade } from '../engine/types';