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
import { connectSymbol, startAutoConnect, getLivePrice } from './services/BinanceWebSocket.js';

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
      'GET /api/signal/:symbol?mode=normal|pro',
      'GET /api/candles/:symbol?interval=5m|15m|1h|4h',
      'GET /api/price/:symbol',
      'GET /api/status',
      'WS  /ws — live price stream',
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
    // Refresh candles and calculate signal
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
    if (candles.length === 0 || interval === '1m' || interval === '1d') {
      candles = await refreshCandlesForInterval(symbol, interval, Math.max(limit, 200));
    } else {
      await fullRefresh(symbol);
      candles = getCachedCandles(symbol, interval);
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
  res.json({
    ...signal,
    timestamp: Date.now(),
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

// ── Start Server (HTTP + WebSocket) ──────────────────────────

const server = http.createServer(app);

// WebSocket server for frontend clients — streams live price updates
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws: WebSocket) => {
  console.log('[WS] Frontend client connected');

  // Send cached prices immediately on connect
  const symbols = getCachedSymbols();
  for (const symbol of symbols) {
    const live = getLivePrice(symbol);
    if (live) {
      ws.send(JSON.stringify({ type: 'price', symbol, ...live }));
    }
  }

  // Push live price updates every 2 seconds
  const interval = setInterval(() => {
    if (ws.readyState !== WebSocket.OPEN) return;
    for (const symbol of getCachedSymbols()) {
      const live = getLivePrice(symbol);
      if (live) {
        ws.send(JSON.stringify({ type: 'price', symbol, ...live }));
      }
    }
  }, 2000);

  // Handle client requests
  ws.on('message', (raw: WebSocket.Data) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'subscribe' && msg.symbol) {
        connectSymbol(msg.symbol.toUpperCase());
      }
    } catch {}
  });

  ws.on('close', () => {
    console.log('[WS] Frontend client disconnected');
    clearInterval(interval);
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
