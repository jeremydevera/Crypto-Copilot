// ============================================================
// Backend WebSocket Service — Frontend
// Connects to backend /ws for live price updates
// Replaces direct Binance WebSocket connection
// ============================================================

const WS_URL = import.meta.env.VITE_BACKEND_WS_URL ?? 'ws://localhost:3001/ws';

export interface LivePriceUpdate {
  type: 'price';
  symbol: string;
  price: number;
  bidPrice: number;
  askPrice: number;
}

type PriceCallback = (update: LivePriceUpdate) => void;

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;
const MAX_RECONNECT = 20;
const subscribers = new Set<PriceCallback>();

export function connectBackendWebSocket(): void {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

  try {
    ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      console.log('[BackendWS] Connected to', WS_URL);
      reconnectAttempts = 0;
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'price') {
          subscribers.forEach(cb => {
            try { cb(msg as LivePriceUpdate); } catch {}
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
}

export function subscribeToPrices(callback: PriceCallback): () => void {
  subscribers.add(callback);
  return () => subscribers.delete(callback);
}

export function sendSubscribe(symbol: string): void {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'subscribe', symbol }));
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