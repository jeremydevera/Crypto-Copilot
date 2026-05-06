// ============================================================
// Binance Market Service — Backend version
// Uses Node.js fetch instead of browser fetch
// ============================================================

import type { Candle, BookTicker, OrderBookSnapshot } from '../engine/types.js';

// Binance Futures REST (works in some geo-blocked regions)
const FUTURES_REST_URLS = [
  'https://fapi.binance.com',
  'https://fapi1.binance.com',
  'https://fapi2.binance.com',
];

// Binance US REST (accessible from most regions including PH)
const US_REST_URLS = [
  'https://api.binance.us',
];

// Binance Spot REST (may be geo-blocked — 418 in PH)
const SPOT_REST_URLS = [
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
  // 1. Try Binance Futures first (works in geo-blocked regions like PH)
  for (const baseURL of FUTURES_REST_URLS) {
    try {
      const url = `${baseURL}/fapi/v1/klines?symbol=${symbol}&interval=${timeframe}&limit=${limit}`;
      const res = await fetch(url);
      if (!res.ok) {
        console.warn(`[Binance Futures] ${res.status} ${res.statusText} for ${symbol} ${timeframe} from ${baseURL}`);
        continue;
      }
      const data = await res.json() as any[][];
      if (Array.isArray(data) && data.length > 0) {
        console.log(`[Binance Futures] Fetched ${data.length} ${timeframe} candles for ${symbol}`);
        return data.map((k: any[]) => {
          const closeTime = Number(k[6]);
          return {
            openTime: Number(k[0]),
            closeTime,
            open: parseFloat(k[1]),
            high: parseFloat(k[2]),
            low: parseFloat(k[3]),
            close: parseFloat(k[4]),
            volume: parseFloat(k[5]),
            isClosed: closeTime <= Date.now(),
          };
        });
      }
    } catch (err: any) {
      console.warn(`[Binance Futures] Error fetching ${symbol} ${timeframe}: ${err.message}`);
      continue;
    }
  }

  // 2. Try Binance US (accessible from most regions)
  for (const baseURL of US_REST_URLS) {
    try {
      const url = `${baseURL}/api/v3/klines?symbol=${symbol}&interval=${timeframe}&limit=${limit}`;
      const res = await fetch(url);
      if (!res.ok) {
        console.warn(`[Binance US] ${res.status} ${res.statusText} for ${symbol} ${timeframe} from ${baseURL}`);
        continue;
      }
      const data = await res.json() as any[][];
      if (Array.isArray(data) && data.length > 0) {
        console.log(`[Binance US] Fetched ${data.length} ${timeframe} candles for ${symbol}`);
        return data.map((k: any[]) => {
          const closeTime = Number(k[6]);
          return {
            openTime: Number(k[0]),
            closeTime,
            open: parseFloat(k[1]),
            high: parseFloat(k[2]),
            low: parseFloat(k[3]),
            close: parseFloat(k[4]),
            volume: parseFloat(k[5]),
            isClosed: closeTime <= Date.now(),
          };
        });
      }
    } catch (err: any) {
      console.warn(`[Binance US] Error fetching ${symbol} ${timeframe}: ${err.message}`);
      continue;
    }
  }

  // 3. Try Binance Spot (may be geo-blocked)
  for (const baseURL of SPOT_REST_URLS) {
    try {
      const url = `${baseURL}/api/v3/klines?symbol=${symbol}&interval=${timeframe}&limit=${limit}`;
      const res = await fetch(url);
      if (!res.ok) {
        console.warn(`[Binance Spot] ${res.status} ${res.statusText} for ${symbol} ${timeframe} from ${baseURL}`);
        continue;
      }
      const data = await res.json() as any[][];
      if (Array.isArray(data) && data.length > 0) {
        console.log(`[Binance Spot] Fetched ${data.length} ${timeframe} candles for ${symbol}`);
        return data.map((k: any[]) => {
          const closeTime = Number(k[6]);
          return {
            openTime: Number(k[0]),
            closeTime,
            open: parseFloat(k[1]),
            high: parseFloat(k[2]),
            low: parseFloat(k[3]),
            close: parseFloat(k[4]),
            volume: parseFloat(k[5]),
            isClosed: closeTime <= Date.now(),
          };
        });
      }
    } catch (err: any) {
      console.warn(`[Binance Spot] Error fetching ${symbol} ${timeframe}: ${err.message}`);
      continue;
    }
  }

  // 3. Fallback to CoinGecko OHLC
  try {
    const cg = COINGECKO_TIMEFRAMES[timeframe];
    const days = cg ? cg.days : '1';
    const coinId = COINGECKO_COIN_IDS[symbol] ?? 'bitcoin';
    const url = `https://api.coingecko.com/api/v3/coins/${coinId}/ohlc?vs_currency=usd&days=${days}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json() as number[][];
      if (Array.isArray(data) && data.length > 0) {
        console.log(`[CoinGecko] Fetched ${data.length} ${timeframe} candles for ${symbol}`);
        return data.map((k: number[]) => ({
          openTime: k[0],
          open: k[1],
          high: k[2],
          low: k[3],
          close: k[4],
          volume: 0,
        }));
      }
    } else {
      console.warn(`[CoinGecko] ${res.status} ${res.statusText} for ${symbol} ${timeframe}`);
    }
  } catch (err: any) {
    console.warn(`[CoinGecko] Error fetching ${symbol} ${timeframe}: ${err.message}`);
  }

  console.warn(`[Candles] All providers failed for ${symbol} ${timeframe}`);
  return [];
}

export async function fetchBookTicker(symbol: string): Promise<BookTicker | null> {
  // 1. Try Binance Futures first
  for (const baseURL of FUTURES_REST_URLS) {
    try {
      const url = `${baseURL}/fapi/v1/ticker/bookTicker?symbol=${symbol}`;
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
  // 2. Try Binance US
  for (const baseURL of US_REST_URLS) {
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
  // 3. Try Binance Spot
  for (const baseURL of SPOT_REST_URLS) {
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
  // 1. Try Binance Futures first
  for (const baseURL of FUTURES_REST_URLS) {
    try {
      const url = `${baseURL}/fapi/v1/depth?symbol=${symbol}&limit=${limit}`;
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
  // 2. Try Binance US
  for (const baseURL of US_REST_URLS) {
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
  // 3. Try Binance Spot
  for (const baseURL of SPOT_REST_URLS) {
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