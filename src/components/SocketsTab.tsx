import { useState, useRef, useCallback, useEffect } from 'react';
import { SOCKET_FEEDS, getSocketFeeds } from '../data/socketFeeds';

// ── Types ────────────────────────────────────────────────────

interface SocketResult {
  id: string;
  provider: string;
  endpoint: string;
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  lastPrice: number | null;
  latencyMs: number | null;
  avgLatencyMs: number | null;
  minLatencyMs: number | null;
  maxLatencyMs: number | null;
  messageCount: number;
  messagesPerSecond: number;
  lastEventTime: number | null;
  errorMsg: string | null;
}

interface LatencySample {
  latency: number;
  time: number;
}

// ── Component ────────────────────────────────────────────────

export default function SocketsTab() {
  const SOCKET_CONFIGS = getSocketFeeds();
  const [results, setResults] = useState<SocketResult[]>(
    SOCKET_CONFIGS.map(cfg => ({
      id: cfg.id,
      provider: cfg.provider,
      endpoint: cfg.endpoint,
      status: 'disconnected',
      lastPrice: null,
      latencyMs: null,
      avgLatencyMs: null,
      minLatencyMs: null,
      maxLatencyMs: null,
      messageCount: 0,
      messagesPerSecond: 0,
      lastEventTime: null,
      errorMsg: null,
    }))
  );

  const wsRefs = useRef<Map<string, WebSocket>>(new Map());
  const latencySamples = useRef<Map<string, LatencySample[]>>(new Map());
  const msgCountRefs = useRef<Map<string, { count: number; startTime: number }>>(new Map());
  const intervalsRef = useRef<ReturnType<typeof setInterval>[]>([]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      wsRefs.current.forEach(ws => ws.close());
      intervalsRef.current.forEach(id => clearInterval(id));
    };
  }, []);

  const updateResult = useCallback((id: string, patch: Partial<SocketResult>) => {
    setResults(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
  }, []);

  const connectOne = useCallback((index: number) => {
    const cfg = SOCKET_CONFIGS[index];
    const feedId = cfg.id;

    // Close existing
    const existing = wsRefs.current.get(feedId);
    if (existing) existing.close();

    updateResult(feedId, { status: 'connecting', errorMsg: null, messageCount: 0, lastPrice: null, latencyMs: null, avgLatencyMs: null, minLatencyMs: null, maxLatencyMs: null, messagesPerSecond: 0 });

    latencySamples.current.set(feedId, []);
    msgCountRefs.current.set(feedId, { count: 0, startTime: Date.now() });

    try {
      const ws = new WebSocket(cfg.endpoint);
      wsRefs.current.set(feedId, ws);

      ws.onopen = () => {
        updateResult(feedId, { status: 'connected' });
        // Send subscription if needed
        if (cfg.subscribe) {
          ws.send(cfg.subscribe);
        }
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          const price = cfg.parsePrice(msg);
          const eventTime = cfg.parseEventTime(msg);

          if (price !== null && !isNaN(price) && price > 0) {
            const now = Date.now();
            const latency = eventTime ? now - eventTime : null;

            // Update message count
            const counter = msgCountRefs.current.get(feedId);
            if (counter) {
              counter.count++;
              const elapsed = (now - counter.startTime) / 1000;
              const mps = elapsed > 0 ? counter.count / elapsed : 0;
              updateResult(feedId, { messagesPerSecond: Math.round(mps * 10) / 10 });
            }

            // Track latency samples
            if (latency !== null && latency >= 0 && latency < 60000) {
              const samples = latencySamples.current.get(feedId) ?? [];
              samples.push({ latency, time: now });
              // Keep last 100 samples
              if (samples.length > 100) samples.shift();
              latencySamples.current.set(feedId, samples);

              const all = samples.map(s => s.latency);
              const avg = all.reduce((a, b) => a + b, 0) / all.length;
              const min = Math.min(...all);
              const max = Math.max(...all);

              updateResult(feedId, {
                lastPrice: price,
                latencyMs: Math.round(latency),
                avgLatencyMs: Math.round(avg),
                minLatencyMs: Math.round(min),
                maxLatencyMs: Math.round(max),
                messageCount: counter?.count ?? 0,
                lastEventTime: now,
              });
            } else {
              updateResult(feedId, {
                lastPrice: price,
                latencyMs: null,
                messageCount: counter?.count ?? 0,
                lastEventTime: now,
              });
            }
          }
        } catch {}
      };

      ws.onerror = () => {
        updateResult(feedId, { status: 'error', errorMsg: 'Connection error' });
      };

      ws.onclose = (event) => {
        const wasConnected = results.find(r => r.id === feedId)?.status === 'connected';
        if (wasConnected) {
          updateResult(feedId, { status: 'error', errorMsg: `Closed (code ${event.code})` });
        } else {
          updateResult(feedId, { status: 'error', errorMsg: `Failed to connect (code ${event.code})` });
        }
      };
    } catch (e: any) {
      updateResult(feedId, { status: 'error', errorMsg: e.message });
    }
  }, [updateResult, results]);

  const connectAll = useCallback(() => {
    SOCKET_CONFIGS.forEach((_, i) => connectOne(i));
  }, [connectOne]);

  const disconnectAll = useCallback(() => {
    wsRefs.current.forEach((ws, feedId) => {
      ws.close();
      updateResult(feedId, { status: 'disconnected' });
    });
    wsRefs.current.clear();
    intervalsRef.current.forEach(id => clearInterval(id));
    intervalsRef.current = [];
  }, [updateResult]);

  const connectSingle = useCallback((index: number) => {
    connectOne(index);
  }, [connectOne]);

  const disconnectSingle = useCallback((feedId: string) => {
    const ws = wsRefs.current.get(feedId);
    if (ws) {
      ws.close();
      wsRefs.current.delete(feedId);
    }
    updateResult(feedId, { status: 'disconnected' });
  }, [updateResult]);

  // ── Ranking ──

  const ranked = [...results]
    .filter(r => r.status === 'connected' && r.avgLatencyMs !== null)
    .sort((a, b) => (a.avgLatencyMs ?? Infinity) - (b.avgLatencyMs ?? Infinity));

  const bestId = ranked.length > 0 ? ranked[0].id : null;

  // ── Render ──

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">WebSocket Latency Tester</h1>
          <p className="text-sm text-gray-500 mt-1">Connect to multiple exchanges simultaneously and compare real-time latency</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={connectAll}
            className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Connect All
          </button>
          <button
            onClick={disconnectAll}
            className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Disconnect All
          </button>
        </div>
      </div>

      {/* Leaderboard */}
      {ranked.length > 0 && (
        <div className="bg-gray-900 rounded-xl p-5">
          <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">🏆 Latency Leaderboard</h2>
          <div className="flex gap-4 flex-wrap">
            {ranked.map((r, i) => (
              <div key={r.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg ${i === 0 ? 'bg-green-900/30 border border-green-700' : 'bg-gray-800'}`}>
                <span className="text-lg font-bold text-gray-500">#{i + 1}</span>
                <span className="text-sm font-medium text-white">{r.provider}</span>
                <span className={`text-sm font-mono ${i === 0 ? 'text-green-400' : 'text-gray-400'}`}>
                  {r.avgLatencyMs}ms avg
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Socket Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {SOCKET_CONFIGS.map((cfg, i) => {
          const r = results.find(res => res.id === cfg.id)!;
          const isBest = r.id === bestId;
          const statusColor = r.status === 'connected' ? 'bg-green-500' : r.status === 'connecting' ? 'bg-yellow-500 animate-pulse' : r.status === 'error' ? 'bg-red-500' : 'bg-gray-600';
          const statusText = r.status === 'connected' ? 'LIVE' : r.status === 'connecting' ? 'Connecting...' : r.status === 'error' ? 'Error' : 'Offline';

          return (
            <div key={cfg.id} className={`bg-gray-900 rounded-xl p-5 space-y-3 border ${isBest ? 'border-green-700' : 'border-gray-800'}`}>
              {/* Card Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-2.5 h-2.5 rounded-full ${statusColor}`} />
                  <div>
                    <h3 className="text-sm font-bold text-white">{cfg.label}</h3>
                    <p className="text-xs text-gray-600 font-mono truncate max-w-[280px]">{cfg.endpoint}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold ${r.status === 'connected' ? 'text-green-400' : 'text-gray-500'}`}>{statusText}</span>
                  {r.status === 'connected' ? (
                    <button onClick={() => disconnectSingle(r.id)} className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded bg-red-900/20">Stop</button>
                  ) : (
                    <button onClick={() => connectSingle(i)} className="text-xs text-green-400 hover:text-green-300 px-2 py-1 rounded bg-green-900/20">Start</button>
                  )}
                </div>
              </div>

              {/* Price */}
              {r.lastPrice !== null && (
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-white">${r.lastPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  {isBest && <span className="text-xs bg-green-700 text-green-200 px-1.5 py-0.5 rounded font-bold">FASTEST</span>}
                </div>
              )}

              {/* Latency Stats */}
              <div className="grid grid-cols-4 gap-2">
                <div className="bg-gray-800 rounded-lg p-2 text-center">
                  <p className="text-[10px] text-gray-500 uppercase">Last</p>
                  <p className={`text-sm font-mono font-bold ${latencyColor(r.latencyMs)}`}>{r.latencyMs !== null ? `${r.latencyMs}ms` : '--'}</p>
                </div>
                <div className="bg-gray-800 rounded-lg p-2 text-center">
                  <p className="text-[10px] text-gray-500 uppercase">Avg</p>
                  <p className={`text-sm font-mono font-bold ${latencyColor(r.avgLatencyMs)}`}>{r.avgLatencyMs !== null ? `${r.avgLatencyMs}ms` : '--'}</p>
                </div>
                <div className="bg-gray-800 rounded-lg p-2 text-center">
                  <p className="text-[10px] text-gray-500 uppercase">Min</p>
                  <p className="text-sm font-mono font-bold text-green-400">{r.minLatencyMs !== null ? `${r.minLatencyMs}ms` : '--'}</p>
                </div>
                <div className="bg-gray-800 rounded-lg p-2 text-center">
                  <p className="text-[10px] text-gray-500 uppercase">Max</p>
                  <p className="text-sm font-mono font-bold text-red-400">{r.maxLatencyMs !== null ? `${r.maxLatencyMs}ms` : '--'}</p>
                </div>
              </div>

              {/* Message Stats */}
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>Messages: {r.messageCount.toLocaleString()}</span>
                <span>Rate: {r.messagesPerSecond}/s</span>
                {r.lastEventTime && <span>Last: {timeSince(r.lastEventTime)}</span>}
              </div>

              {/* Error */}
              {r.errorMsg && (
                <p className="text-xs text-red-400 bg-red-900/20 rounded px-2 py-1">⚠ {r.errorMsg}</p>
              )}

              {/* Latency Bar */}
              {r.avgLatencyMs !== null && (
                <div className="space-y-1">
                  <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${latencyBarColor(r.avgLatencyMs)}`}
                      style={{ width: `${Math.min(100, (r.avgLatencyMs / 500) * 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Info */}
      <div className="bg-gray-900 rounded-xl p-5 space-y-2">
        <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider">How It Works</h2>
        <ul className="text-xs text-gray-500 space-y-1 list-disc list-inside">
          <li>Each WebSocket connects directly from your browser to the exchange server</li>
          <li><strong>Latency</strong> = your local clock minus the exchange event timestamp (E/T field)</li>
          <li>Latency includes network transit + your clock offset from exchange time</li>
          <li>If latency is high but messages are frequent, the issue is clock drift — not real lag</li>
          <li><strong>Messages/sec</strong> shows how actively the exchange pushes data</li>
          <li>Binance @trade and @bookTicker are the lowest-latency Binance feeds</li>
          <li>Coinbase Direct (wss-direct) requires auth — this uses the public feed</li>
          <li>For true latency comparison, run this tab from a VPS near exchange servers</li>
        </ul>
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────

function latencyColor(ms: number | null): string {
  if (ms === null) return 'text-gray-600';
  if (ms < 50) return 'text-green-400';
  if (ms < 150) return 'text-yellow-400';
  if (ms < 500) return 'text-orange-400';
  return 'text-red-400';
}

function latencyBarColor(ms: number): string {
  if (ms < 50) return 'bg-green-500';
  if (ms < 150) return 'bg-yellow-500';
  if (ms < 500) return 'bg-orange-500';
  return 'bg-red-500';
}

function timeSince(ts: number): string {
  const diff = Math.round((Date.now() - ts) / 1000);
  if (diff < 1) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  return `${Math.floor(diff / 60)}m ago`;
}
