import type { BookTicker, Candle, MarketMicrostructure, OrderBookSnapshot, TradingSignal } from '../engine/types';

const API_BASE_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:3001';

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`);
  if (!response.ok) {
    throw new Error(`Backend request failed: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

export async function fetchBackendSignal(
  symbol: string,
  options: {
    mode?: 'normal' | 'pro' | string;
    investmentAmount?: number;
    demoBalance?: number;
    riskPercent?: number;
    feeAndSpreadPercent?: number;
  } = {},
): Promise<TradingSignal> {
  const params = new URLSearchParams({
    mode: options.mode ?? 'pro',
  });

  if (options.investmentAmount !== undefined) params.set('investment', String(options.investmentAmount));
  if (options.demoBalance !== undefined) params.set('demoBalance', String(options.demoBalance));
  if (options.riskPercent !== undefined) params.set('riskPercent', String(options.riskPercent));
  if (options.feeAndSpreadPercent !== undefined) params.set('feeAndSpread', String(options.feeAndSpreadPercent));

  return fetchJson<TradingSignal>(`/api/signal/${symbol}?${params.toString()}`);
}

/** Fetch cached signal — no Binance API call, just returns latest calculated signal */
export async function fetchCachedSignal(symbol: string): Promise<TradingSignal> {
  return fetchJson<TradingSignal>(`/api/cached-signal/${symbol}`);
}

export async function fetchCandles(
  symbol: string,
  timeframe: string,
  limit: number = 200,
): Promise<Candle[]> {
  const params = new URLSearchParams({
    interval: timeframe,
    limit: String(limit),
  });
  const url = `/api/candles/${symbol}?${params.toString()}`;
  const startTime = Date.now();
  try {
    const data = await fetchJson<{ candles: Candle[] }>(url);
    const elapsed = Date.now() - startTime;
    console.log(`[fetchCandles] ${symbol} ${timeframe} → ${data.candles.length} candles in ${elapsed}ms`);
    return data.candles;
  } catch (err: any) {
    const elapsed = Date.now() - startTime;
    console.error(`[fetchCandles] ${symbol} ${timeframe} FAILED after ${elapsed}ms: ${err.message}`);
    throw err;
  }
}

export async function fetchBookTicker(symbol: string): Promise<BookTicker | null> {
  const signal = await fetchCachedSignal(symbol);
  return (signal as TradingSignal & { microstructure?: MarketMicrostructure }).microstructure?.bookTicker ?? null;
}

export async function fetchDepth(symbol: string, _limit: number = 10): Promise<OrderBookSnapshot | null> {
  const signal = await fetchCachedSignal(symbol);
  return (signal as TradingSignal & { microstructure?: MarketMicrostructure }).microstructure?.orderBook ?? null;
}

export async function fetchExchangeRates(): Promise<Record<string, number>> {
  try {
    const data = await fetchJson<{ rates: Record<string, number>; timestamp: number }>('/api/exchange-rates');
    return data.rates;
  } catch (err: any) {
    console.warn('[fetchExchangeRates] Failed:', err.message);
    // Return fallback rates
    return {
      USD: 1,
      PHP: 56,
      EUR: 0.92,
      GBP: 0.79,
      JPY: 149.5,
      KRW: 1320,
      INR: 83,
      AUD: 1.53,
      CAD: 1.36,
      SGD: 1.34,
    };
  }
}
