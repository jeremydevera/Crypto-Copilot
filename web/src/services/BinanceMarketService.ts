// ============================================================
// Binance Market Service — Ported from BinanceMarketService.swift
// ============================================================

import type { Candle, BookTicker, OrderBookSnapshot, TradeTick } from '../engine/types';

const REST_BASE_URLS = [
  'https://api.binance.com',
  'https://api1.binance.com',
  'https://api2.binance.com',
  'https://api.binance.us',
];

const WSS_BASE_URLS = [
  'wss://stream.binance.com:9443',
  'wss://stream1.binance.com:443',
  'wss://stream.binance.us:9443',
];

// ---- REST API ----

// CoinGecko coin ID mapping
const COINGECKO_COIN_IDS: Record<string, string> = {
  BTCUSDT: 'bitcoin',
  ETHUSDT: 'ethereum',
  SOLUSDT: 'solana',
  BNBUSDT: 'binancecoin',
  XRPUSDT: 'ripple',
  DOGEUSDT: 'dogecoin',
};
const COINGECKO_TIMEFRAMES: Record<string, { days: number | string; granularity: string }> = {
  '1m': { days: '0.042', granularity: '' },    // ~1 hour
  '5m': { days: '1', granularity: '' },          // CoinGecko doesn't have 5m, use 1d
  '15m': { days: '1', granularity: '' },
  '1h': { days: '7', granularity: '' },
  '4h': { days: '30', granularity: '' },
  '1d': { days: '90', granularity: 'daily' },
  '1w': { days: '365', granularity: 'weekly' },
  '1M': { days: 'max', granularity: 'monthly' },
};

export async function fetchCandles(symbol: string, timeframe: string, limit: number = 100): Promise<Candle[]> {
  // Try Binance first
  for (const baseURL of REST_BASE_URLS) {
    try {
      const url = `${baseURL}/api/v3/klines?symbol=${symbol}&interval=${timeframe}&limit=${limit}`;
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        return data.map((k: any[]) => ({
          openTime: k[0],
          open: parseFloat(k[1]),
          high: parseFloat(k[2]),
          low: parseFloat(k[3]),
          close: parseFloat(k[4]),
          volume: parseFloat(k[5]),
          isClosed: true, // REST API candles are always closed
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
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        return data.map((k: number[]) => ({
          openTime: k[0],
          open: k[1],
          high: k[2],
          low: k[3],
          close: k[4],
          volume: 0, // CoinGecko OHLC doesn't include volume
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
      const data = await res.json();
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
      const data = await res.json();
      return {
        lastUpdateId: data.lastUpdateId,
        bids: data.bids.slice(0, limit).map((b: string[]) => ({ price: parseFloat(b[0]), quantity: parseFloat(b[1]) })),
        asks: data.asks.slice(0, limit).map((a: string[]) => ({ price: parseFloat(a[0]), quantity: parseFloat(a[1]) })),
      };
    } catch { continue; }
  }
  return null;
}

// ---- WebSocket Services ----

export class BinanceKlineWebSocket {
  private ws: WebSocket | null = null;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private healthInterval: ReturnType<typeof setInterval> | null = null;
  private lastMessageTime = 0;
  private urlIndex = 0;
  private symbol = '';
  private timeframe = '5m';
  private onCandle: (candle: Candle) => void = () => {};
  private onError: (msg: string) => void = () => {};
  private isDisconnected = false;

  connect(symbol: string, timeframe: string, onCandle: (c: Candle) => void, onError: (msg: string) => void) {
    this.disconnect();
    this.symbol = symbol;
    this.timeframe = timeframe;
    this.onCandle = onCandle;
    this.onError = onError;
    this.urlIndex = 0;
    this.isDisconnected = false;
    this.connectToCurrentURL();
    this.startPing();
  }

  private connectToCurrentURL() {
    const stream = `${this.symbol.toLowerCase()}@kline_${this.timeframe}`;
    const baseURL = WSS_BASE_URLS[this.urlIndex];
    const url = `${baseURL}/ws/${stream}`;

    this.ws = new WebSocket(url);
    this.lastMessageTime = Date.now();

    this.ws.onmessage = (event) => {
      this.lastMessageTime = Date.now();
      try {
        const msg = JSON.parse(event.data);
        if (msg.k) {
          const k = msg.k;
          this.onCandle({
            openTime: k.t,
            open: parseFloat(k.o),
            high: parseFloat(k.h),
            low: parseFloat(k.l),
            close: parseFloat(k.c),
            volume: parseFloat(k.v),
            isClosed: !!k.x, // Binance k.x = true when candle is closed
          });
        }
      } catch {}
    };

    this.ws.onerror = () => {
      this.handleDisconnect('WebSocket error');
    };

    this.ws.onclose = () => {
      if (!this.isDisconnected) {
        this.handleDisconnect('Connection closed');
      }
    };
  }

  disconnect() {
    this.isDisconnected = true;
    if (this.pingInterval) clearInterval(this.pingInterval);
    if (this.healthInterval) clearInterval(this.healthInterval);
    this.pingInterval = null;
    this.healthInterval = null;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private startPing() {
    if (this.pingInterval) clearInterval(this.pingInterval);
    this.pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ method: 'ping' }));
      }
    }, 20000);

    if (this.healthInterval) clearInterval(this.healthInterval);
    this.healthInterval = setInterval(() => {
      const stale = (Date.now() - this.lastMessageTime) / 1000;
      if (stale > 60 && !this.isDisconnected) {
        this.handleDisconnect(`No data for ${Math.floor(stale)}s`);
      }
    }, 10000);
  }

  private handleDisconnect(reason: string) {
    this.onError(`Connection lost: ${reason}. Reconnecting...`);
    this.urlIndex++;
    if (this.urlIndex < WSS_BASE_URLS.length) {
      this.connectToCurrentURL();
    } else {
      this.urlIndex = 0;
      setTimeout(() => this.connectToCurrentURL(), 2000);
    }
  }
}

export class BinanceTradeWebSocket {
  private ws: WebSocket | null = null;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private healthInterval: ReturnType<typeof setInterval> | null = null;
  private lastMessageTime = 0;
  private symbol = '';
  private onTrade: (t: TradeTick) => void = () => {};
  private onError: (msg: string) => void = () => {};
  private isDisconnected = false;

  connect(symbol: string, onTrade: (t: TradeTick) => void, onError: (msg: string) => void) {
    this.disconnect();
    this.symbol = symbol;
    this.onTrade = onTrade;
    this.onError = onError;
    this.isDisconnected = false;
    this.connectToCurrentURL();
    this.startPing();
  }

  private connectToCurrentURL() {
    // Use Binance Futures BookTicker for lower latency
    const stream = `${this.symbol.toLowerCase()}@bookTicker`;
    const url = `wss://fstream.binance.com/ws/${stream}`;

    this.ws = new WebSocket(url);
    this.lastMessageTime = Date.now();

    this.ws.onmessage = (event) => {
      this.lastMessageTime = Date.now();
      try {
        const msg = JSON.parse(event.data);
        // Futures bookTicker: { b: bestBid, B: bestBidQty, a: bestAsk, A: bestAskQty, ... }
        const price = msg.b ? parseFloat(msg.b) : (msg.a ? parseFloat(msg.a) : null);
        if (price) {
          this.onTrade({
            price,
            quantity: msg.B ? parseFloat(msg.B) : 0,
            time: msg.E || msg.T || Date.now(),
          });
        }
      } catch {}
    };

    this.ws.onerror = () => {
      this.handleDisconnect('WebSocket error');
    };

    this.ws.onclose = () => {
      if (!this.isDisconnected) {
        this.handleDisconnect('Connection closed');
      }
    };
  }

  disconnect() {
    this.isDisconnected = true;
    if (this.pingInterval) clearInterval(this.pingInterval);
    if (this.healthInterval) clearInterval(this.healthInterval);
    this.pingInterval = null;
    this.healthInterval = null;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private startPing() {
    if (this.pingInterval) clearInterval(this.pingInterval);
    this.pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ method: 'ping' }));
      }
    }, 20000);

    if (this.healthInterval) clearInterval(this.healthInterval);
    this.healthInterval = setInterval(() => {
      const stale = (Date.now() - this.lastMessageTime) / 1000;
      if (stale > 30 && !this.isDisconnected) {
        this.handleDisconnect(`No trades for ${Math.floor(stale)}s`);
      }
    }, 10000);
  }

  private handleDisconnect(reason: string) {
    this.onError(`Connection lost: ${reason}. Reconnecting...`);
    // Reconnect to the same Futures BookTicker URL after a delay
    setTimeout(() => this.connectToCurrentURL(), 2000);
  }
}
