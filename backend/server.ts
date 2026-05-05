// ============================================================
// Crypto Copilot Backend — Stage 1 MVP
// Express server with REST + WebSocket endpoints
// ============================================================

import express from 'express';
import cors from 'cors';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import {
  fullRefresh,
  getCachedSignal,
  getCachedCandles,
  getCachedData,
  getCachedSymbols,
  refreshCandlesForInterval,
} from './services/Cache.js';
import { connectSymbol, startAutoConnect, getLivePrice, subscribeKline, subscribePrice } from './services/BinanceWebSocket.js';

const app = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ────────────────────────────────────────────────

app.use(cors());
app.use(express.json());

// ── Health Check ─────────────────────────────────────────────

app.get('/', (_req, res) => {
  res.json({
    status: 'Crypto Copilot backend running',
    version: '1.0.0',
    endpoints: [
      'GET /api/signal/:symbol?mode=normal|pro (full refresh)',
      'GET /api/cached-signal/:symbol (cached, no refresh)',
      'GET /api/candles/:symbol?interval=5m|15m|1h|4h',
      'GET /api/price/:symbol',
      'GET /api/exchange-rates',
      'GET /api/status',
      'WS  /ws — live price + kline stream',
    ],
  });
});

app.get('/api/status', (_req, res) => {
  const symbols = getCachedSymbols();
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    cachedSymbols: symbols,
    cache: symbols.map((symbol) => {
      const data = getCachedData(symbol);
      return {
        symbol,
        candleCounts: Object.fromEntries(
          Object.entries(data.candles).map(([interval, candles]) => [interval, candles.length]),
        ),
        lastUpdated: data.lastUpdated,
      };
    }),
    timestamp: Date.now(),
  });
});

// ── Signal Endpoint ───────────────────────────────────────────

app.get('/api/signal/:symbol', async (req, res) => {
  const symbol = (req.params.symbol || 'BTCUSDT').toUpperCase();
  const mode = (req.query.mode as string) || 'pro';
  const feeAndSpreadPercent = parseFloat(req.query.feeAndSpread as string) || 0.5;
  const investmentAmount = parseFloat(req.query.investment as string) || 100000;
  const demoBalance = parseFloat(req.query.demoBalance as string) || 100000;
  const positionRiskPercent = parseFloat(req.query.riskPercent as string) || 1;

  try {
    // Use cached data if fresh, otherwise full refresh
    const signal = await fullRefresh(symbol, {
      feeAndSpreadPercent,
      investmentAmount,
      demoBalance,
      positionRiskPercent,
    });

    // Include microstructure data in the response
    const cachedData = getCachedData(symbol);
    const response = {
      ...signal,
      microstructure: cachedData.microstructure,
      mode,
      timestamp: Date.now(),
    };

    res.json(response);
  } catch (error: any) {
    console.error(`Error calculating signal for ${symbol}:`, error.message);
    res.status(500).json({
      error: 'Failed to calculate signal',
      details: error.message,
      symbol,
    });
  }
});

// ── Candles Endpoint ─────────────────────────────────────────

app.get('/api/candles/:symbol', async (req, res) => {
  const symbol = (req.params.symbol || 'BTCUSDT').toUpperCase();
  const interval = (req.query.interval as string) || '15m';
  const limit = parseInt(req.query.limit as string) || 200;

  // Validate interval
  const validIntervals = ['1m', '5m', '15m', '1h', '4h', '1d'];
  if (!validIntervals.includes(interval)) {
    res.status(400).json({
      error: `Invalid interval: ${interval}. Valid intervals: ${validIntervals.join(', ')}`,
    });
    return;
  }

  try {
    let candles = getCachedCandles(symbol, interval);
    const data = getCachedData(symbol);
    const cacheAge = Date.now() - data.lastUpdated;
    const isCacheFresh = candles.length > 0 && cacheAge < 30_000;

    if (isCacheFresh) {
      // Use cached candles — no Binance API call needed
      console.log(`[Candles] Returning cached ${interval} candles for ${symbol} (age: ${Math.round(cacheAge / 1000)}s)`);
    } else if (candles.length === 0 || cacheAge > 60_000) {
      // No cache or very stale — fetch from Binance
      console.log(`[Candles] Fetching fresh ${interval} candles for ${symbol} (cache: ${candles.length}, age: ${Math.round(cacheAge / 1000)}s)`);
      candles = await refreshCandlesForInterval(symbol, interval, Math.max(limit, 200));
    } else {
      // Cache exists but is moderately stale — use it, refresh in background
      console.log(`[Candles] Using cached ${interval} candles for ${symbol}, refreshing in background`);
      refreshCandlesForInterval(symbol, interval, Math.max(limit, 200)).catch(() => {});
    }
    const limitedCandles = candles.slice(-limit);

    res.json({
      symbol,
      interval,
      count: limitedCandles.length,
      candles: limitedCandles,
      timestamp: Date.now(),
    });
  } catch (error: any) {
    console.error(`Error fetching candles for ${symbol}:`, error.message);
    res.status(500).json({
      error: 'Failed to fetch candles',
      details: error.message,
      symbol,
      interval,
    });
  }
});

// ── Cached Signal (no refresh, just return latest) ───────────

app.get('/api/cached-signal/:symbol', (req, res) => {
  const symbol = (req.params.symbol || 'BTCUSDT').toUpperCase();
  const signal = getCachedSignal(symbol);
  const cachedData = getCachedData(symbol);
  const now = Date.now();
  const ageSeconds = cachedData.lastUpdated > 0 ? Math.round((now - cachedData.lastUpdated) / 1000) : -1;
  res.json({
    ...signal,
    microstructure: cachedData.microstructure,
    cached: true,
    updatedAt: cachedData.lastUpdated,
    ageSeconds,
    timestamp: now,
  });
});

// ── Live Price Endpoint ──────────────────────────────────────

app.get('/api/price/:symbol', (req, res) => {
  const symbol = (req.params.symbol || 'BTCUSDT').toUpperCase();
  const live = getLivePrice(symbol);
  if (!live) {
    res.status(404).json({ error: 'No live price data for symbol', symbol });
    return;
  }
  res.json({ symbol, ...live, timestamp: Date.now() });
});

// ── Exchange Rates Endpoint ──────────────────────────────────

app.get('/api/exchange-rates', async (_req, res) => {
  try {
    const cgRes = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd,php,eur,gbp,jpy,krw,inr,aud,cad,sgd');
    if (!cgRes.ok) {
      res.status(502).json({ error: 'CoinGecko API unavailable', status: cgRes.status });
      return;
    }
    const data = await cgRes.json();
    const btcUsd = data?.bitcoin?.usd;
    if (!btcUsd) {
      res.status(502).json({ error: 'Invalid CoinGecko response' });
      return;
    }
    const rates: Record<string, number> = { USD: 1 };
    for (const [currency, value] of Object.entries(data.bitcoin)) {
      if (currency !== 'usd' && typeof value === 'number') {
        rates[currency.toUpperCase()] = value / btcUsd;
      }
    }
    res.json({ rates, timestamp: Date.now() });
  } catch (error: any) {
    console.error('[ExchangeRates] Error:', error.message);
    res.status(500).json({ error: 'Failed to fetch exchange rates', details: error.message });
  }
});

// ── Start Server (HTTP + WebSocket) ──────────────────────────

const server = http.createServer(app);

// WebSocket server for frontend clients — streams live price updates + kline data
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws: WebSocket) => {
  console.log('[WS] Frontend client connected');

  // Track kline subscriptions for this client
  const klineUnsubscribers: (() => void)[] = [];
  const priceUnsubscribers: (() => void)[] = [];
  const subscribedPriceSymbols = new Set<string>();

  // Send cached prices immediately on connect
  const symbols = getCachedSymbols();
  for (const symbol of symbols) {
    const live = getLivePrice(symbol);
    if (live) {
      ws.send(JSON.stringify({ type: 'price', symbol, ...live }));
    }
  }

  // Lightweight fallback heartbeat in case a browser misses an event.
  const interval = setInterval(() => {
    if (ws.readyState !== WebSocket.OPEN) return;
    for (const symbol of subscribedPriceSymbols) {
      const live = getLivePrice(symbol);
      if (live) {
        ws.send(JSON.stringify({
          type: 'price',
          symbol,
          ...live,
          eventTime: Date.now(),
          receivedAt: Date.now(),
        }));
      }
    }
  }, 10_000);

  // Handle client requests
  ws.on('message', (raw: WebSocket.Data) => {
    try {
      const msg = JSON.parse(raw.toString());

      if (msg.type === 'subscribe' && msg.symbol) {
        const symbol = msg.symbol.toUpperCase();
        connectSymbol(symbol);
        if (!subscribedPriceSymbols.has(symbol)) {
          subscribedPriceSymbols.add(symbol);
          const unsub = subscribePrice(symbol, (live) => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({
                type: 'price',
                symbol,
                ...live,
              }));
            }
          });
          priceUnsubscribers.push(unsub);
        }
      }

      // Subscribe to kline updates for a specific symbol:interval
      // Frontend sends: { type: "subscribe_kline", symbol: "BTCUSDT", interval: "15m" }
      // Backend forwards: { type: "kline", symbol: "BTCUSDT", interval: "15m", candle: { ... } }
      // Note: 1s is mapped to 1m on the backend (Binance doesn't support 1s klines)
      if (msg.type === 'subscribe_kline' && msg.symbol && msg.interval) {
        const symbol = msg.symbol.toUpperCase();
        const interval = msg.interval;
        console.log(`[WS] Client subscribed to kline ${symbol}:${interval}`);

        const unsub = subscribeKline(symbol, interval, (candle) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: 'kline',
              symbol,
              interval,
              candle,
            }));
          }
        });
        klineUnsubscribers.push(unsub);
      }

      // Unsubscribe from all kline streams (e.g., when switching timeframes)
      if (msg.type === 'unsubscribe_kline') {
        console.log(`[WS] Client unsubscribed from kline streams`);
        for (const unsub of klineUnsubscribers) {
          try { unsub(); } catch {}
        }
        klineUnsubscribers.length = 0;
      }
    } catch {}
  });

  ws.on('close', () => {
    console.log('[WS] Frontend client disconnected');
    clearInterval(interval);
    for (const unsub of priceUnsubscribers) {
      try { unsub(); } catch {}
    }
    // Clean up kline subscriptions
    for (const unsub of klineUnsubscribers) {
      try { unsub(); } catch {}
    }
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Crypto Copilot backend running on port ${PORT}`);
  console.log(`   Signal:  http://localhost:${PORT}/api/signal/BTCUSDT?mode=pro`);
  console.log(`   Candles: http://localhost:${PORT}/api/candles/BTCUSDT?interval=15m`);
  console.log(`   Status:  http://localhost:${PORT}/api/status`);
  console.log(`   WebSocket: ws://localhost:${PORT}/ws`);

  // Start Binance WebSocket connections for popular symbols
  startAutoConnect();
});

// ── Auto-refresh popular symbols every 30 seconds ────────────

const POPULAR_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];

setInterval(async () => {
  for (const symbol of POPULAR_SYMBOLS) {
    try {
      await fullRefresh(symbol);
      console.log(`✓ Refreshed ${symbol} at ${new Date().toISOString()}`);
    } catch (error: any) {
      console.error(`✗ Failed to refresh ${symbol}: ${error.message}`);
    }
  }
}, 30_000);

// Initial refresh on startup
(async () => {
  for (const symbol of POPULAR_SYMBOLS) {
    try {
      await fullRefresh(symbol);
      console.log(`✓ Initial refresh: ${symbol}`);
    } catch (error: any) {
      console.error(`✗ Initial refresh failed for ${symbol}: ${error.message}`);
    }
  }
})();
