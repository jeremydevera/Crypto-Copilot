// ── WebSocket Feed Configurations ─────────────────────────────
// Shared between SocketsTab and ChartTab

export interface SocketFeedConfig {
  id: string;
  provider: string;
  label: string;
  endpoint: string;
  color: string;
  subscribe?: string; // JSON string to send on open
  authMessage?: string; // JSON string to send first for authentication (before subscribe)
  parsePrice: (msg: any) => number | null;
  parseEventTime: (msg: any) => number | null;
}

/** Convert display pair like "BTC/USDT" to Binance symbol "BTCUSDT" */
export function pairToSymbol(pair: string): string {
  return pair.replace('/', '').toUpperCase();
}

/** Convert display pair to lowercase stream name like "btcusdt" */
export function pairToStream(pair: string): string {
  return pair.replace('/', '').toLowerCase();
}

/** Convert display pair to OKX instId like "BTC-USDT" */
export function pairToOkxInstId(pair: string): string {
  return pair.replace('/', '-').toUpperCase();
}

/** Convert display pair to Gate.io format like "BTC_USDT" */
export function pairToGateioSymbol(pair: string): string {
  return pair.replace('/', '_').toUpperCase();
}

/** Convert display pair to Bybit format like "BTCUSDT" */
export function pairToBybitSymbol(pair: string): string {
  return pair.replace('/', '').toUpperCase();
}

/** Convert display pair to TickrData format like "BTC-USDT" */
export function pairToTickrSymbol(pair: string): string {
  return pair.replace('/', '-').toUpperCase();
}

export function getSocketFeeds(pair: string = 'BTC/USDT'): SocketFeedConfig[] {
  const sym = pairToSymbol(pair);
  const stream = pairToStream(pair);
  const okxInstId = pairToOkxInstId(pair);
  const gateioSym = pairToGateioSymbol(pair);
  const bybitSym = pairToBybitSymbol(pair);
  const tickrSym = pairToTickrSymbol(pair);

  return [
  // ── Binance ──
  {
    id: 'binance-trade',
    provider: 'Binance',
    label: 'Binance Trade',
    endpoint: `wss://stream.binance.com:9443/ws/${stream}@trade`,
    color: '#f0b90b',
    parsePrice: (msg: any) => parseFloat(msg.p),
    parseEventTime: (msg: any) => msg.T ?? null,
  },
  {
    id: 'binance-bookticker',
    provider: 'Binance',
    label: 'Binance BookTicker',
    endpoint: `wss://stream.binance.com:9443/ws/${stream}@bookTicker`,
    color: '#f0b90b',
    parsePrice: (msg: any) => parseFloat(msg.b),
    parseEventTime: (msg: any) => msg.E ?? null,
  },
  {
    id: 'binance-aggtrade',
    provider: 'Binance',
    label: 'Binance AggTrade',
    endpoint: `wss://stream.binance.com:9443/ws/${stream}@aggTrade`,
    color: '#f0b90b',
    parsePrice: (msg: any) => parseFloat(msg.p),
    parseEventTime: (msg: any) => msg.E ?? null,
  },
  {
    id: 'binance-depth',
    provider: 'Binance',
    label: 'Binance Depth 100ms',
    endpoint: `wss://stream.binance.com:9443/ws/${stream}@depth@100ms`,
    color: '#f0b90b',
    parsePrice: (msg: any) => msg.b?.[0]?.[0] ? parseFloat(msg.b[0][0]) : null,
    parseEventTime: (msg: any) => msg.E ?? null,
  },
  {
    id: 'binance-futures-trade',
    provider: 'Binance Futures',
    label: 'Binance Futures Trade',
    endpoint: `wss://fstream.binance.com/ws/${stream}@trade`,
    color: '#f0b90b',
    parsePrice: (msg: any) => parseFloat(msg.p),
    parseEventTime: (msg: any) => msg.T ?? null,
  },
  {
    id: 'binance-futures-bookticker',
    provider: 'Binance Futures',
    label: 'Binance Futures BookTicker',
    endpoint: `wss://fstream.binance.com/ws/${stream}@bookTicker`,
    color: '#f0b90b',
    parsePrice: (msg: any) => parseFloat(msg.b),
    parseEventTime: (msg: any) => msg.E ?? null,
  },
  // ── Coinbase ──
  {
    id: 'coinbase-ticker',
    provider: 'Coinbase',
    label: 'Coinbase Ticker',
    endpoint: 'wss://ws-feed.exchange.coinbase.com',
    color: '#0052ff',
    subscribe: JSON.stringify({
      type: 'subscribe',
      product_ids: [`${sym.slice(0, -4)}-USD`],
      channels: ['ticker'],
    }),
    parsePrice: (msg: any) => parseFloat(msg.price),
    parseEventTime: (msg: any) => msg.time ? new Date(msg.time).getTime() : null,
  },
  {
    id: 'coinbase-level2',
    provider: 'Coinbase',
    label: 'Coinbase Level2',
    endpoint: 'wss://ws-feed.exchange.coinbase.com',
    color: '#0052ff',
    subscribe: JSON.stringify({
      type: 'subscribe',
      product_ids: [`${sym.slice(0, -4)}-USD`],
      channels: ['level2_batch'],
    }),
    parsePrice: (msg: any) => msg.changes?.[0]?.[1] ? parseFloat(msg.changes[0][1]) : null,
    parseEventTime: (msg: any) => msg.time ? new Date(msg.time).getTime() : null,
  },
  // ── OKX ──
  {
    id: 'okx-tickers',
    provider: 'OKX',
    label: 'OKX Tickers',
    endpoint: 'wss://ws.okx.com:8443/ws/v5/public',
    color: '#ffffff',
    subscribe: JSON.stringify({
      op: 'subscribe',
      args: [{ channel: 'tickers', instId: okxInstId }],
    }),
    parsePrice: (msg: any) => msg.data?.[0]?.last ? parseFloat(msg.data[0].last) : null,
    parseEventTime: (msg: any) => msg.data?.[0]?.ts ? parseInt(msg.data[0].ts) : null,
  },
  {
    id: 'okx-trades',
    provider: 'OKX',
    label: 'OKX Trades',
    endpoint: 'wss://ws.okx.com:8443/ws/v5/public',
    color: '#ffffff',
    subscribe: JSON.stringify({
      op: 'subscribe',
      args: [{ channel: 'trades', instId: okxInstId }],
    }),
    parsePrice: (msg: any) => msg.data?.[0]?.px ? parseFloat(msg.data[0].px) : null,
    parseEventTime: (msg: any) => msg.data?.[0]?.ts ? parseInt(msg.data[0].ts) : null,
  },
  // ── Bybit ──
  {
    id: 'bybit-spot',
    provider: 'Bybit',
    label: 'Bybit Spot Tickers',
    endpoint: 'wss://stream.bybit.com/v5/public/spot',
    color: '#f7a600',
    subscribe: JSON.stringify({
      op: 'subscribe',
      args: [`tickers.${bybitSym}`],
    }),
    parsePrice: (msg: any) => msg.data?.lastPrice ? parseFloat(msg.data.lastPrice) : null,
    parseEventTime: (msg: any) => msg.data?.ts ? parseInt(msg.data.ts) : null,
  },
  {
    id: 'bybit-linear-tickers',
    provider: 'Bybit',
    label: 'Bybit Linear Tickers',
    endpoint: 'wss://stream.bybit.com/v5/public/linear',
    color: '#f7a600',
    subscribe: JSON.stringify({
      op: 'subscribe',
      args: [`tickers.${bybitSym}`],
    }),
    parsePrice: (msg: any) => msg.data?.lastPrice ? parseFloat(msg.data.lastPrice) : null,
    parseEventTime: (msg: any) => msg.data?.ts ? parseInt(msg.data.ts) : null,
  },
  {
    id: 'bybit-linear-trade',
    provider: 'Bybit',
    label: 'Bybit Linear Trade',
    endpoint: 'wss://stream.bybit.com/v5/public/linear',
    color: '#f7a600',
    subscribe: JSON.stringify({
      op: 'subscribe',
      args: [`publicTrade.${bybitSym}`],
    }),
    parsePrice: (msg: any) => msg.data?.[0]?.price ? parseFloat(msg.data[0].price) : null,
    parseEventTime: (msg: any) => msg.data?.[0]?.ts ? parseInt(msg.data[0].ts) : null,
  },
  // ── Kraken ──
  {
    id: 'kraken-ticker',
    provider: 'Kraken',
    label: 'Kraken Ticker',
    endpoint: 'wss://ws.kraken.com',
    color: '#7b61ff',
    subscribe: JSON.stringify({
      event: 'subscribe',
      pair: [`${sym.slice(0, -4)}/USD`],
      subscription: { name: 'ticker' },
    }),
    parsePrice: (msg: any) => Array.isArray(msg) && msg[1]?.c?.[0] ? parseFloat(msg[1].c[0]) : null,
    parseEventTime: (_msg: any) => null,
  },
  {
    id: 'kraken-trade',
    provider: 'Kraken',
    label: 'Kraken Trade',
    endpoint: 'wss://ws.kraken.com',
    color: '#7b61ff',
    subscribe: JSON.stringify({
      event: 'subscribe',
      pair: [`${sym.slice(0, -4)}/USD`],
      subscription: { name: 'trade' },
    }),
    parsePrice: (msg: any) => Array.isArray(msg) && msg[1]?.[0]?.[0] ? parseFloat(msg[1][0][0]) : null,
    parseEventTime: (msg: any) => Array.isArray(msg) && msg[1]?.[0]?.[2] ? parseFloat(msg[1][0][2]) * 1000 : null,
  },
  // ── Gate.io ──
  {
    id: 'gateio-ticker',
    provider: 'Gate.io',
    label: 'Gate.io Spot Ticker',
    endpoint: 'wss://api.gateio.ws/ws/v4/',
    color: '#2354e6',
    subscribe: JSON.stringify({
      time: Math.floor(Date.now() / 1000),
      channel: 'spot.tickers',
      event: 'subscribe',
      payload: [gateioSym],
    }),
    parsePrice: (msg: any) => msg.result?.last ? parseFloat(msg.result.last) : null,
    parseEventTime: (msg: any) => msg.result?.timestamp ? Math.floor(msg.result.timestamp / 1000) : null,
  },
  // ── Bitget ──
  {
    id: 'bitget-tickers',
    provider: 'Bitget',
    label: 'Bitget Tickers',
    endpoint: 'wss://ws.bitget.com/v2/ws/public',
    color: '#00f0ff',
    subscribe: JSON.stringify({
      op: 'subscribe',
      args: [{ instType: 'SPOT', channel: 'tickers', instId: sym }],
    }),
    parsePrice: (msg: any) => msg.data?.[0]?.lastPr ? parseFloat(msg.data[0].lastPr) : null,
    parseEventTime: (msg: any) => msg.data?.[0]?.ts ? parseInt(msg.data[0].ts) : null,
  },
  // ── TickrData (multi-exchange aggregator — all exchanges in one feed) ──
  {
    id: 'tickrdata-all',
    provider: 'TickrData',
    label: 'TickrData (All Exchanges)',
    endpoint: 'wss://api.tickrdata.com/ws',
    color: '#22c55e',
    authMessage: JSON.stringify({ type: 'auth', key: 'tkr_live_1f7dc672bab05f9e038d0452294ca1d9e8501bc07dcc70066d9fbef8d4eee41d' }),
    subscribe: JSON.stringify({ type: 'subscribe', filters: { symbols: [tickrSym] } }),
    parsePrice: (msg: any) => msg.type === 'tick' && msg.data?.price ? parseFloat(msg.data.price) : null,
    parseEventTime: (msg: any) => msg.data?.published_at_ms ?? null,
  },
  // ── MEXC ──
  {
    id: 'mexc-ticker',
    provider: 'MEXC',
    label: 'MEXC Spot Ticker',
    endpoint: 'wss://wbs.mexc.com/ws',
    color: '#00d4aa',
    subscribe: JSON.stringify({
      method: 'SUBSCRIPTION',
      params: [`spot@public.ticker.v3.api@${sym}`],
    }),
    parsePrice: (msg: any) => msg.d?.c ? parseFloat(msg.d.c) : null,
    parseEventTime: (msg: any) => msg.d?.t ? parseInt(msg.d.t) : null,
  },
  ];
}

/** Default feeds for BTC/USDT (backward compatible) */
export const SOCKET_FEEDS = getSocketFeeds('BTC/USDT');
