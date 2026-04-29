// ── WebSocket Feed Configurations ─────────────────────────────
// Shared between SocketsTab and ChartTab

export interface SocketFeedConfig {
  id: string;
  provider: string;
  label: string;
  endpoint: string;
  color: string;
  subscribe?: string; // JSON string to send on open
  parsePrice: (msg: any) => number | null;
  parseEventTime: (msg: any) => number | null;
}

export const SOCKET_FEEDS: SocketFeedConfig[] = [
  // ── Binance ──
  {
    id: 'binance-trade',
    provider: 'Binance',
    label: 'Binance Trade',
    endpoint: 'wss://stream.binance.com:9443/ws/btcusdt@trade',
    color: '#f0b90b',
    parsePrice: (msg: any) => parseFloat(msg.p),
    parseEventTime: (msg: any) => msg.T ?? null,
  },
  {
    id: 'binance-bookticker',
    provider: 'Binance',
    label: 'Binance BookTicker',
    endpoint: 'wss://stream.binance.com:9443/ws/btcusdt@bookTicker',
    color: '#f0b90b',
    parsePrice: (msg: any) => parseFloat(msg.b),
    parseEventTime: (msg: any) => msg.E ?? null,
  },
  {
    id: 'binance-aggtrade',
    provider: 'Binance',
    label: 'Binance AggTrade',
    endpoint: 'wss://stream.binance.com:9443/ws/btcusdt@aggTrade',
    color: '#f0b90b',
    parsePrice: (msg: any) => parseFloat(msg.p),
    parseEventTime: (msg: any) => msg.E ?? null,
  },
  {
    id: 'binance-depth',
    provider: 'Binance',
    label: 'Binance Depth 100ms',
    endpoint: 'wss://stream.binance.com:9443/ws/btcusdt@depth@100ms',
    color: '#f0b90b',
    parsePrice: (msg: any) => msg.b?.[0]?.[0] ? parseFloat(msg.b[0][0]) : null,
    parseEventTime: (msg: any) => msg.E ?? null,
  },
  {
    id: 'binance-futures-trade',
    provider: 'Binance Futures',
    label: 'Binance Futures Trade',
    endpoint: 'wss://fstream.binance.com/ws/btcusdt@trade',
    color: '#f0b90b',
    parsePrice: (msg: any) => parseFloat(msg.p),
    parseEventTime: (msg: any) => msg.T ?? null,
  },
  {
    id: 'binance-futures-bookticker',
    provider: 'Binance Futures',
    label: 'Binance Futures BookTicker',
    endpoint: 'wss://fstream.binance.com/ws/btcusdt@bookTicker',
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
      product_ids: ['BTC-USD'],
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
      product_ids: ['BTC-USD'],
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
      args: [{ channel: 'tickers', instId: 'BTC-USDT' }],
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
      args: [{ channel: 'trades', instId: 'BTC-USDT' }],
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
      args: ['tickers.BTCUSDT'],
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
      args: ['tickers.BTCUSDT'],
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
      args: ['publicTrade.BTCUSDT'],
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
      pair: ['XBT/USD'],
      subscription: { name: 'ticker' },
    }),
    parsePrice: (msg: any) => Array.isArray(msg) && msg[1]?.c?.[0] ? parseFloat(msg[1].c[0]) : null,
    parseEventTime: (msg: any) => null,
  },
  {
    id: 'kraken-trade',
    provider: 'Kraken',
    label: 'Kraken Trade',
    endpoint: 'wss://ws.kraken.com',
    color: '#7b61ff',
    subscribe: JSON.stringify({
      event: 'subscribe',
      pair: ['XBT/USD'],
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
      payload: ['BTC_USDT'],
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
      args: [{ instType: 'SPOT', channel: 'tickers', instId: 'BTCUSDT' }],
    }),
    parsePrice: (msg: any) => msg.data?.[0]?.lastPr ? parseFloat(msg.data[0].lastPr) : null,
    parseEventTime: (msg: any) => msg.data?.[0]?.ts ? parseInt(msg.data[0].ts) : null,
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
      params: ['spot@public.ticker.v3.api@BTCUSDT'],
    }),
    parsePrice: (msg: any) => msg.d?.c ? parseFloat(msg.d.c) : null,
    parseEventTime: (msg: any) => msg.d?.t ? parseInt(msg.d.t) : null,
  },
];