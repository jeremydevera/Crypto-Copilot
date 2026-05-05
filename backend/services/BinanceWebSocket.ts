// ============================================================
// Binance WebSocket Service — Backend
// Shared WebSocket per symbol — streams live price updates
// Also supports kline subscriptions for chart WebSocket proxy
// Updates the cache in real-time so REST endpoints stay fresh
// ============================================================

import WebSocket from 'ws';
import { refreshCandlesForInterval, getCachedData, getOrCreate, getCachedSymbols, calculateSignal } from './Cache.js';
import type { BookTicker, OrderBookSnapshot, MarketMicrostructure, Candle } from '../engine/types.js';
import { emptyMicrostructure } from '../engine/types.js';
import { fetchBookTicker, fetchDepth } from './BinanceService.js';

interface StreamConnection {
  ws: WebSocket;
  symbol: string;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  lastPing: number;
  subscribers: Set<(data: any) => void>;
}

// Active connections — one per symbol (bookTicker + depth + default klines)
const connections = new Map<string, StreamConnection>();

// Kline subscribers: key = "symbol:interval" → set of callback functions
const klineSubscribers = new Map<string, Set<(candle: Candle) => void>>();

// Active kline stream connections: key = "symbol:interval" → StreamConnection
const klineConnections = new Map<string, StreamConnection>();

// Symbols to auto-connect
const AUTO_CONNECT_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];

// ── Connect to Binance combined stream (bookTicker + depth) ──

export function connectSymbol(symbol: string): void {
  if (connections.has(symbol)) return; // already connected

  const stream = new BinanceCombinedStream(symbol);
  connections.set(symbol, stream.connection);
  stream.start();
}

export function disconnectSymbol(symbol: string): void {
  const conn = connections.get(symbol);
  if (!conn) return;
  if (conn.reconnectTimer) clearTimeout(conn.reconnectTimer);
  conn.ws.close();
  connections.delete(symbol);
}

export function isConnected(symbol: string): boolean {
  const conn = connections.get(symbol);
  return conn?.ws.readyState === WebSocket.OPEN;
}

// ── Kline subscription management ────────────────────────────

export function subscribeKline(symbol: string, interval: string, callback: (candle: Candle) => void): () => void {
  const key = `${symbol.toUpperCase()}:${interval}`;
  if (!klineSubscribers.has(key)) {
    klineSubscribers.set(key, new Set());
  }
  klineSubscribers.get(key)!.add(callback);

  // Start kline stream if not already running
  if (!klineConnections.has(key)) {
    startKlineStream(symbol.toUpperCase(), interval);
  }

  // Return unsubscribe function
  return () => {
    const subs = klineSubscribers.get(key);
    if (subs) {
      subs.delete(callback);
      if (subs.size === 0) {
        klineSubscribers.delete(key);
        stopKlineStream(key);
      }
    }
  };
}

function startKlineStream(symbol: string, interval: string): void {
  const key = `${symbol}:${interval}`;
  if (klineConnections.has(key)) return;

  const stream = new BinanceKlineStream(symbol, interval);
  klineConnections.set(key, stream.connection);
  stream.start();
}

function stopKlineStream(key: string): void {
  const conn = klineConnections.get(key);
  if (!conn) return;
  if (conn.reconnectTimer) clearTimeout(conn.reconnectTimer);
  conn.ws.close();
  klineConnections.delete(key);
}

export function getActiveKlineStreams(): string[] {
  return [...klineConnections.keys()];
}

// ── Get live price for a symbol ─────────────────────────────

export function getLivePrice(symbol: string): { price: number; bidPrice: number; askPrice: number } | null {
  const data = getCachedData(symbol);
  const bt = data.microstructure?.bookTicker;
  if (!bt) return null;
  return {
    price: (bt.bidPrice + bt.askPrice) / 2,
    bidPrice: bt.bidPrice,
    askPrice: bt.askPrice,
  };
}

// ── Auto-connect popular symbols ────────────────────────────

export function startAutoConnect(): void {
  for (const symbol of AUTO_CONNECT_SYMBOLS) {
    connectSymbol(symbol);
  }
}

// ── Combined Stream Implementation ─────────────────────────

class BinanceCombinedStream {
  connection: StreamConnection;
  private symbol: string;
  private wsUrl: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;

  constructor(symbol: string) {
    this.symbol = symbol;
    const s = symbol.toLowerCase();
    // Combined stream: bookTicker + depth (klines handled by dedicated BinanceKlineStream)
    // Use Futures WebSocket (works in geo-blocked regions like PH)
    this.wsUrl = `wss://fstream.binance.com/stream?streams=${s}@bookTicker/${s}@depth10@100ms`;
    this.connection = {
      ws: null as any,
      symbol,
      reconnectTimer: null,
      lastPing: Date.now(),
      subscribers: new Set(),
    };
  }

  start(): void {
    this.connect();
  }

  private connect(): void {
    try {
      const ws = new WebSocket(this.wsUrl);
      this.connection.ws = ws;

      ws.on('open', () => {
        console.log(`[WS] Connected to Binance combined stream for ${this.symbol}`);
        this.reconnectAttempts = 0;
        this.connection.lastPing = Date.now();

        // Refresh microstructure on connect
        this.refreshMicrostructure();
      });

      ws.on('message', (raw: WebSocket.Data) => {
        try {
          const msg = JSON.parse(raw.toString());
          // Combined stream format: { stream: "btcusdt@bookTicker", data: {...} }
          const stream = msg.stream as string;
          const data = msg.data;

          if (!stream || !data) return;

          this.connection.lastPing = Date.now();

          if (stream.includes('@bookTicker')) {
            this.handleBookTicker(data);
          } else if (stream.includes('@kline')) {
            this.handleKline(data);
          } else if (stream.includes('@depth')) {
            this.handleDepth(data);
          }

          // Notify subscribers
          this.connection.subscribers.forEach(cb => {
            try { cb({ stream, data }); } catch {}
          });
        } catch {}
      });

      ws.on('ping', () => {
        this.connection.lastPing = Date.now();
      });

      ws.on('close', (code) => {
        console.log(`[WS] ${this.symbol} stream closed (code: ${code})`);
        this.scheduleReconnect();
      });

      ws.on('error', (err) => {
        console.error(`[WS] ${this.symbol} stream error:`, (err as Error).message);
        this.scheduleReconnect();
      });
    } catch (err) {
      console.error(`[WS] Failed to connect ${this.symbol}:`, (err as Error).message);
      this.scheduleReconnect();
    }
  }

  private handleBookTicker(data: any): void {
    const cached = getOrCreate(this.symbol);
    const bt: BookTicker = {
      symbol: data.s || this.symbol,
      bidPrice: parseFloat(data.b),
      bidQuantity: parseFloat(data.B),
      askPrice: parseFloat(data.a),
      askQuantity: parseFloat(data.A),
    };

    cached.microstructure = {
      ...cached.microstructure ?? emptyMicrostructure,
      bookTicker: bt,
    };
    cached.lastUpdated = Date.now();
  }

  private handleKline(data: any): void {
    const k = data.k;
    if (!k) return;

    const interval = k.i; // e.g. "5m", "15m", "1h"
    const candle: Candle = {
      openTime: k.t,
      open: parseFloat(k.o),
      high: parseFloat(k.h),
      low: parseFloat(k.l),
      close: parseFloat(k.c),
      volume: parseFloat(k.v),
      isClosed: !!k.x,
    };

    // Update the candle in cache
    const cached = getOrCreate(this.symbol);
    const candles = cached.candles[interval] ?? [];
    const idx = candles.findIndex(c => c.openTime === candle.openTime);
    if (idx >= 0) {
      candles[idx] = candle;
    } else {
      candles.push(candle);
    }
    cached.candles[interval] = candles;
    cached.lastUpdated = Date.now();

    // Notify kline subscribers for this symbol:interval
    const key = `${this.symbol}:${interval}`;
    const subs = klineSubscribers.get(key);
    if (subs) {
      for (const cb of subs) {
        try { cb(candle); } catch {}
      }
    }

    // Recalculate signal on closed candle
    if (candle.isClosed) {
      calculateSignal(this.symbol);
    }
  }

  private handleDepth(data: any): void {
    const cached = getOrCreate(this.symbol);
    const depth: OrderBookSnapshot = {
      lastUpdateId: data.lastUpdateId || 0,
      bids: (data.b || []).slice(0, 10).map((b: string[]) => ({
        price: parseFloat(b[0]),
        quantity: parseFloat(b[1]),
      })),
      asks: (data.a || []).slice(0, 10).map((a: string[]) => ({
        price: parseFloat(a[0]),
        quantity: parseFloat(a[1]),
      })),
    };

    cached.microstructure = {
      ...cached.microstructure ?? emptyMicrostructure,
      orderBook: depth,
    };
  }

  private async refreshMicrostructure(): Promise<void> {
    try {
      const [bookTicker, depth] = await Promise.all([
        fetchBookTicker(this.symbol),
        fetchDepth(this.symbol, 10),
      ]);
      const cached = getOrCreate(this.symbol);
      cached.microstructure = { bookTicker, orderBook: depth };
    } catch {}
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(`[WS] Max reconnect attempts reached for ${this.symbol}`);
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000); // exponential backoff, max 30s

    console.log(`[WS] Reconnecting ${this.symbol} in ${delay}ms (attempt ${this.reconnectAttempts})`);

    this.connection.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }
}

// ── Kline Stream Implementation ──────────────────────────────
// Dedicated WebSocket per symbol:interval for chart kline data
// Proxies kline updates to frontend clients via backend /ws

class BinanceKlineStream {
  connection: StreamConnection;
  private symbol: string;
  private interval: string;
  private wsUrl: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;

  constructor(symbol: string, interval: string) {
    this.symbol = symbol;
    this.interval = interval;
    const s = symbol.toLowerCase();
    // Use Futures WebSocket (works in geo-blocked regions like PH)
    this.wsUrl = `wss://fstream.binance.com/ws/${s}@kline_${interval}`;
    this.connection = {
      ws: null as any,
      symbol,
      reconnectTimer: null,
      lastPing: Date.now(),
      subscribers: new Set(),
    };
  }

  start(): void {
    this.connect();
  }

  private connect(): void {
    try {
      const ws = new WebSocket(this.wsUrl);
      this.connection.ws = ws;

      ws.on('open', () => {
        console.log(`[WS] Connected to Binance kline stream for ${this.symbol}:${this.interval}`);
        this.reconnectAttempts = 0;
        this.connection.lastPing = Date.now();
      });

      ws.on('message', (raw: WebSocket.Data) => {
        try {
          const msg = JSON.parse(raw.toString());
          // Single stream format: { e: "kline", k: { ... } }
          if (!msg.k) return;

          this.connection.lastPing = Date.now();
          const k = msg.k;
          const candle: Candle = {
            openTime: k.t,
            open: parseFloat(k.o),
            high: parseFloat(k.h),
            low: parseFloat(k.l),
            close: parseFloat(k.c),
            volume: parseFloat(k.v),
            isClosed: !!k.x,
          };

          // Update cache
          const cached = getOrCreate(this.symbol);
          const candles = cached.candles[this.interval] ?? [];
          const idx = candles.findIndex(c => c.openTime === candle.openTime);
          if (idx >= 0) {
            candles[idx] = candle;
          } else {
            candles.push(candle);
          }
          cached.candles[this.interval] = candles;
          cached.lastUpdated = Date.now();

          // Notify kline subscribers
          const key = `${this.symbol}:${this.interval}`;
          const subs = klineSubscribers.get(key);
          if (subs) {
            for (const cb of subs) {
              try { cb(candle); } catch {}
            }
          }

          // Recalculate signal on closed candle
          if (candle.isClosed) {
            calculateSignal(this.symbol);
          }
        } catch {}
      });

      ws.on('ping', () => {
        this.connection.lastPing = Date.now();
      });

      ws.on('close', (code) => {
        console.log(`[WS] ${this.symbol}:${this.interval} kline stream closed (code: ${code})`);
        // Only reconnect if there are still subscribers
        const key = `${this.symbol}:${this.interval}`;
        const subs = klineSubscribers.get(key);
        if (subs && subs.size > 0) {
          this.scheduleReconnect();
        } else {
          klineConnections.delete(key);
        }
      });

      ws.on('error', (err) => {
        console.error(`[WS] ${this.symbol}:${this.interval} kline stream error:`, (err as Error).message);
        this.scheduleReconnect();
      });
    } catch (err) {
      console.error(`[WS] Failed to connect ${this.symbol}:${this.interval}:`, (err as Error).message);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(`[WS] Max reconnect attempts reached for ${this.symbol}:${this.interval}`);
      const key = `${this.symbol}:${this.interval}`;
      klineConnections.delete(key);
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);

    console.log(`[WS] Reconnecting ${this.symbol}:${this.interval} in ${delay}ms (attempt ${this.reconnectAttempts})`);

    this.connection.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }
}