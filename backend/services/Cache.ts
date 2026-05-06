// ============================================================
// In-Memory Cache — Stores candles and signals per symbol
// Shared across all users (one WebSocket per symbol)
// ============================================================

import type { Candle, TradingSignal, BookTicker, OrderBookSnapshot, MarketMicrostructure } from '../engine/types.js';
import { placeholderSignal, emptyMicrostructure } from '../engine/types.js';
import { analyze } from '../engine/SignalEngine.js';
import { fetchCandles, fetchBookTicker, fetchDepth } from '../services/BinanceService.js';

interface CachedData {
  candles: Record<string, Candle[]>;
  signal: TradingSignal;
  microstructure: MarketMicrostructure;
  lastUpdated: number;
  isCalculating: boolean;
}

const cache = new Map<string, CachedData>();

export function getOrCreate(symbol: string): CachedData {
  if (!cache.has(symbol)) {
    cache.set(symbol, {
      candles: { '1m': [], '5m': [], '15m': [], '1h': [], '4h': [], '1d': [] },
      signal: { ...placeholderSignal, symbol },
      microstructure: { ...emptyMicrostructure },
      lastUpdated: 0,
      isCalculating: false,
    });
  }
  return cache.get(symbol)!;
}

// ── Fetch all candles for a symbol ──────────────────────────

export async function refreshCandles(symbol: string): Promise<CachedData> {
  const data = getOrCreate(symbol);

  const [candles1m, candles5m, candles15m, candles1h, candles4h, candles1d] = await Promise.all([
    fetchCandles(symbol, '1m', 300),
    fetchCandles(symbol, '5m', 300),
    fetchCandles(symbol, '15m', 200),
    fetchCandles(symbol, '1h', 200),
    fetchCandles(symbol, '4h', 200),
    fetchCandles(symbol, '1d', 200),
  ]);

  data.candles['1m'] = candles1m;
  data.candles['5m'] = candles5m;
  data.candles['15m'] = candles15m;
  data.candles['1h'] = candles1h;
  data.candles['4h'] = candles4h;
  data.candles['1d'] = candles1d;

  return data;
}

export async function refreshCandlesForInterval(
  symbol: string,
  interval: string,
  limit: number = 300,
): Promise<Candle[]> {
  const data = getOrCreate(symbol);
  const candles = await fetchCandles(symbol, interval, limit);
  data.candles[interval] = candles;
  data.lastUpdated = Date.now();
  return candles;
}

// ── Calculate signal from cached candles ─────────────────────

export function calculateSignal(
  symbol: string,
  feeAndSpreadPercent: number = 0.5,
  investmentAmount: number = 100_000,
  demoBalance: number = 100_000,
  activeEntryPrice: number | null = null,
  activeInvestmentAmount: number | null = null,
  positionRiskPercent: number = 1,
): TradingSignal {
  const data = getOrCreate(symbol);

  if (data.candles['5m'].length === 0) {
    return data.signal;
  }

  if (data.isCalculating) {
    return data.signal;
  }

  data.isCalculating = true;
  try {
    // Filter to only confirmed (closed) candles before analysis
    const closed5m = data.candles['5m'].filter(c => c.isClosed !== false);
    const closed15m = data.candles['15m'].filter(c => c.isClosed !== false);
    const closed1h = data.candles['1h'].filter(c => c.isClosed !== false);
    const closed4h = data.candles['4h'].filter(c => c.isClosed !== false);

    data.signal = analyze(
      symbol,
      closed5m,
      closed15m,
      closed1h,
      closed4h,
      feeAndSpreadPercent,
      investmentAmount,
      demoBalance,
      activeEntryPrice,
      activeInvestmentAmount,
      positionRiskPercent,
      data.microstructure,
    );
    data.lastUpdated = Date.now();
  } finally {
    data.isCalculating = false;
  }

  return data.signal;
}

// ── Refresh microstructure (book ticker + depth) ────────────

export async function refreshMicrostructure(symbol: string): Promise<void> {
  const data = getOrCreate(symbol);

  const [bookTicker, depth] = await Promise.all([
    fetchBookTicker(symbol),
    fetchDepth(symbol, 10),
  ]);

  data.microstructure = {
    bookTicker,
    orderBook: depth,
  };
}

// ── Get cached data ──────────────────────────────────────────

export function getCachedSignal(symbol: string): TradingSignal {
  return getOrCreate(symbol).signal;
}

export function getCachedCandles(symbol: string, timeframe: string): Candle[] {
  const data = getOrCreate(symbol);
  return data.candles[timeframe] ?? [];
}

export function getCachedData(symbol: string): CachedData {
  return getOrCreate(symbol);
}

export function getCachedSymbols(): string[] {
  return [...cache.keys()];
}

// ── Full refresh: fetch candles + microstructure + calculate ─

// How long before we consider cached data stale (milliseconds)
const CACHE_TTL = 30_000; // 30 seconds

export async function fullRefresh(
  symbol: string,
  options: {
    feeAndSpreadPercent?: number;
    investmentAmount?: number;
    demoBalance?: number;
    activeEntryPrice?: number | null;
    activeInvestmentAmount?: number | null;
    positionRiskPercent?: number;
  } = {},
): Promise<TradingSignal> {
  const data = getOrCreate(symbol);
  const now = Date.now();
  const isStale = now - data.lastUpdated > CACHE_TTL;

  if (isStale) {
    // Cache is stale — fetch fresh data
    console.log(`[Cache] Refreshing stale data for ${symbol} (age: ${Math.round((now - data.lastUpdated) / 1000)}s)`);
    await refreshCandles(symbol);
    await refreshMicrostructure(symbol);
  }
  // Skip "Using cached data" log — too noisy at 2s intervals

  return calculateSignal(
    symbol,
    options.feeAndSpreadPercent,
    options.investmentAmount,
    options.demoBalance,
    options.activeEntryPrice,
    options.activeInvestmentAmount,
    options.positionRiskPercent,
  );
}
