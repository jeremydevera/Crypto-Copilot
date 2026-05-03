// ============================================================
// Binance Market Service — Backend version
// Uses Node.js fetch instead of browser fetch
// ============================================================

import type { Candle, BookTicker, OrderBookSnapshot } from '../engine/types.js';

const REST_BASE_URLS = [
  'https://api.binance.com',
  'https://api1.binance.com',
  'https://api2.binance.com',
];

// CoinGecko fallback for restricted regions
const COINGECKO_COIN_IDS: Record<string, string> = {
  BTCUSDT: 'bitcoin',
  ETHUSDT: 'ethereum',
  SOLUSDT: 'solana',
  BNBUSDT: 'binancecoin',
  XRPUSDT: 'ripple',
  DOGEUSDT: 'dogecoin',
};

const COINGECKO_TIMEFRAMES: Record<string, { days: number | string; granularity: string }> = {
  '1m': { days: 1, granularity: '' },
  '5m': { days: 1, granularity: '' },
  '15m': { days: 1, granularity: '' },
  '1h': { days: 7, granularity: '' },
  '4h': { days: 30, granularity: '' },
  '1d': { days: 90, granularity: 'daily' },
};

export async function fetchCandles(symbol: string, timeframe: string, limit: number = 300): Promise<Candle[]> {
  // Try Binance first
  for (const baseURL of REST_BASE_URLS) {
    try {
      const url = `${baseURL}/api/v3/klines?symbol=${symbol}&interval=${timeframe}&limit=${limit}`;
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json() as any[][];
      if (Array.isArray(data) && data.length > 0) {
        return data.map((k: any[]) => ({
          openTime: k[0],
          open: parseFloat(k[1]),
          high: parseFloat(k[2]),
          low: parseFloat(k[3]),
          close: parseFloat(k[4]),
          volume: parseFloat(k[5]),
          isClosed: true,
        }));
      }
    } catch { continue; }
  }

  // Fallback to CoinGecko OHLC
  try {
    const cg = COINGECKO_TIMEFRAMES[timeframe];
    const days = cg ? cg.days : '1';
    const coinId = COINGECKO_COIN_IDS[symbol] ?? 'bitcoin';
    const url = `https://api.coingecko.com/api/v3/coins/${coinId}/ohlc?vs_currency=usd&days=${days}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json() as number[][];
      if (Array.isArray(data) && data.length > 0) {
        return data.map((k: number[]) => ({
          openTime: k[0],
          open: k[1],
          high: k[2],
          low: k[3],
          close: k[4],
          volume: 0,
        }));
      }
    }
  } catch {
    // CoinGecko failed too
  }

  return [];
}

export async function fetchBookTicker(symbol: string): Promise<BookTicker | null> {
  for (const baseURL of REST_BASE_URLS) {
    try {
      const url = `${baseURL}/api/v3/ticker/bookTicker?symbol=${symbol}`;
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json() as any;
      return {
        symbol: data.symbol,
        bidPrice: parseFloat(data.bidPrice),
        bidQuantity: parseFloat(data.bidQty),
        askPrice: parseFloat(data.askPrice),
        askQuantity: parseFloat(data.askQty),
      };
    } catch { continue; }
  }
  return null;
}

export async function fetchDepth(symbol: string, limit: number = 10): Promise<OrderBookSnapshot | null> {
  for (const baseURL of REST_BASE_URLS) {
    try {
      const url = `${baseURL}/api/v3/depth?symbol=${symbol}&limit=${limit}`;
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json() as any;
      return {
        lastUpdateId: data.lastUpdateId,
        bids: data.bids.slice(0, limit).map((b: string[]) => ({ price: parseFloat(b[0]), quantity: parseFloat(b[1]) })),
        asks: data.asks.slice(0, limit).map((a: string[]) => ({ price: parseFloat(a[0]), quantity: parseFloat(a[1]) })),
      };
    } catch { continue; }
  }
  return null;
}