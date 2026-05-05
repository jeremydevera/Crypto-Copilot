// ============================================================
// Backend WebSocket Service — Frontend
// Connects to backend /ws for live price updates + kline data
// Replaces direct Binance WebSocket connection (no VPN needed)
// ============================================================

import type { Candle } from '../engine/types';

const WS_URL = import.meta.env.VITE_BACKEND_WS_URL ?? 'ws://localhost:3001/ws';

export interface LivePriceUpdate {
  type: 'price';
  symbol: string;
  price: number;
  bidPrice: number;
  askPrice: number;
}

export interface KlineUpdate {
  type: 'kline';
  symbol: string;
  interval: string;
  candle: Candle;
}

type PriceCallback = (update: LivePriceUpdate) => void;

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;
const MAX_RECONNECT = 20;
const subscribers = new Set<PriceCallback>();

// Queue of messages to send once WebSocket is open
const pendingMessages: string[] = [];

function flushPendingMessages(): void {
  if (ws && ws.readyState === WebSocket.OPEN) {
    for (const msg of pendingMessages) {
      try { ws.send(msg); } catch {}
    }
    pendingMessages.length = 0;
    // Re-send active kline subscriptions on reconnect
    for (const sub of activeKlineSubscriptions.values()) {
      try {
        ws.send(JSON.stringify({ type: 'subscribe_kline', symbol: sub.symbol, interval: sub.interval }));
      } catch {}
    }
  }
}

export function connectBackendWebSocket(): void {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

  try {
    ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      console.log('[BackendWS] Connected to', WS_URL);
      reconnectAttempts = 0;
      // Send any queued messages
      flushPendingMessages();
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'price') {
          subscribers.forEach(cb => {
            try { cb(msg as LivePriceUpdate); } catch {}
          });
        }
        // Kline messages are handled by BackendKlineWebSocket instances
        if (msg.type === 'kline') {
          const klineUpdate = msg as KlineUpdate;
          klineSubscribers.forEach(cb => {
            try { cb(klineUpdate); } catch {}
          });
        }
      } catch {}
    };

    ws.onerror = () => {
      console.warn('[BackendWS] Connection error');
    };

    ws.onclose = () => {
      console.log('[BackendWS] Disconnected');
      scheduleReconnect();
    };
  } catch (err) {
    console.error('[BackendWS] Failed to connect:', err);
    scheduleReconnect();
  }
}

export function disconnectBackendWebSocket(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  reconnectAttempts = MAX_RECONNECT; // prevent reconnect
  if (ws) {
    ws.close();
    ws = null;
  }
  subscribers.clear();
  klineSubscribers.clear();
}

export function subscribeToPrices(callback: PriceCallback): () => void {
  subscribers.add(callback);
  return () => subscribers.delete(callback);
}

export function sendSubscribe(symbol: string): void {
  const msg = JSON.stringify({ type: 'subscribe', symbol });
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(msg);
  } else {
    pendingMessages.push(msg);
  }
}

export function isBackendWSConnected(): boolean {
  return ws?.readyState === WebSocket.OPEN;
}

function scheduleReconnect(): void {
  if (reconnectAttempts >= MAX_RECONNECT) return;
  reconnectAttempts++;
  const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
  console.log(`[BackendWS] Reconnecting in ${delay}ms (attempt ${reconnectAttempts})`);
  reconnectTimer = setTimeout(() => {
    connectBackendWebSocket();
  }, delay);
}

// ── Kline subscription via backend WebSocket ──────────────────
// Frontend sends: { type: "subscribe_kline", symbol: "BTCUSDT", interval: "15m" }
// Backend forwards: { type: "kline", symbol: "BTCUSDT", interval: "15m", candle: { ... } }

type KlineCallback = (update: KlineUpdate) => void;
const klineSubscribers = new Set<KlineCallback>();

// Active kline subscriptions to re-send on reconnect
const activeKlineSubscriptions = new Map<string, { symbol: string; interval: string }>();

export function sendSubscribeKline(symbol: string, interval: string): void {
  const msg = JSON.stringify({ type: 'subscribe_kline', symbol, interval });
  // Track for re-subscription on reconnect
  activeKlineSubscriptions.set(`${symbol}:${interval}`, { symbol, interval });
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(msg);
  } else {
    // Queue until WS is open
    pendingMessages.push(msg);
  }
}

export function sendUnsubscribeKline(symbol: string, interval: string): void {
  const key = `${symbol}:${interval}`;
  activeKlineSubscriptions.delete(key);
  // Send unsubscribe for all remaining klines (backend clears all on unsubscribe_kline)
  // We'll re-subscribe remaining ones on next flush
  const msg = JSON.stringify({ type: 'unsubscribe_kline' });
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(msg);
  }
  // Re-subscribe any remaining active kline subscriptions
  for (const sub of activeKlineSubscriptions.values()) {
    sendSubscribeKline(sub.symbol, sub.interval);
  }
}

export function subscribeToKline(callback: KlineCallback): () => void {
  klineSubscribers.add(callback);
  return () => klineSubscribers.delete(callback);
}

// ── BackendKlineWebSocket ─────────────────────────────────────
// Drop-in replacement for BinanceKlineWebSocket
// Routes kline data through the backend WebSocket instead of
// connecting directly to Binance (no VPN needed)

export class BackendKlineWebSocket {
  private callback: ((candle: Candle) => void) | null = null;
  private errorCallback: ((msg: string) => void) | null = null;
  private unsubscribe: (() => void) | null = null;
  private symbol = '';
  private interval = '';
  private isConnected = false;

  connect(symbol: string, interval: string, onCandle: (candle: Candle) => void, onError: (msg: string) => void): void {
    this.disconnect();
    this.symbol = symbol.toUpperCase();
    this.interval = interval;
    this.callback = onCandle;
    this.errorCallback = onError;

    // Ensure the backend WebSocket is connected
    connectBackendWebSocket();

    // Subscribe to kline updates from the backend
    this.unsubscribe = subscribeToKline((update: KlineUpdate) => {
      if (update.symbol === this.symbol && update.interval === this.interval && this.callback) {
        this.callback(update.candle);
      }
    });

    // Send subscribe message to backend
    sendSubscribeKline(this.symbol, this.interval);
    this.isConnected = true;
  }

  disconnect(): void {
    if (this.isConnected && this.symbol && this.interval) {
      sendUnsubscribeKline(this.symbol, this.interval);
    }
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.callback = null;
    this.errorCallback = null;
    this.isConnected = false;
  }
}