import { useState, useEffect, useCallback, useRef } from 'react';
import type { SignalDecision } from '../engine/types';

interface Notification {
  id: string;
  timestamp: number;
  type: 'signal_change' | 'price_alert' | 'trade_executed';
  title: string;
  message: string;
  decision?: SignalDecision;
  read: boolean;
}

interface NotificationSystemProps {
  vm: any;
}

export function useNotifications(vm: any) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const lastDecisionRef = useRef<SignalDecision | null>(null);
  const lastNotifiedTimeRef = useRef<number>(0);

  // Watch for signal decision changes
  useEffect(() => {
    const currentDecision = vm.activeSignal?.decision;
    if (!currentDecision) return;

    // Only notify on meaningful changes (not Wait/No Trade spam)
    const significantDecisions: SignalDecision[] = ['Strong Buy', 'Consider Buy', 'Sell / Exit', 'Consider Sell'];
    const wasSignificant = lastDecisionRef.current && significantDecisions.includes(lastDecisionRef.current);
    const isSignificant = significantDecisions.includes(currentDecision);

    // Notify when decision changes to/from a significant state
    if (lastDecisionRef.current !== null && lastDecisionRef.current !== currentDecision) {
      // Don't spam: only notify if it's a significant change and enough time has passed
      const now = Date.now();
      const minInterval = 30000; // 30 seconds minimum between notifications

      if ((isSignificant || wasSignificant) && now - lastNotifiedTimeRef.current > minInterval) {
        const notification: Notification = {
          id: crypto.randomUUID(),
          timestamp: now,
          type: 'signal_change',
          title: `Signal: ${currentDecision}`,
          message: getDecisionMessage(currentDecision, vm.activeSignal),
          decision: currentDecision,
          read: false,
        };

        setNotifications(prev => [notification, ...prev].slice(0, 50));
        lastNotifiedTimeRef.current = now;

        // Browser notification if permitted
        if (Notification.permission === 'granted') {
          try {
            new Notification('AI Crypto Analyzer', {
              body: `${currentDecision} — BTC/USDT $${vm.activeSignal.price?.toFixed(0)}`,
              icon: '📊',
            });
          } catch {}
        }
      }
    }

    lastDecisionRef.current = currentDecision;
  }, [vm.activeSignal?.decision, vm.activeSignal?.price]);

  const markRead = useCallback((id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;

  return { notifications, markRead, markAllRead, clearAll, unreadCount };
}

function getDecisionMessage(decision: SignalDecision, signal: any): string {
  switch (decision) {
    case 'Strong Buy':
      return `Strong buy signal detected. Bias: ${signal.bias ?? 'N/A'}, Confidence: ${signal.confidence ?? 'N/A'}%, Score: ${signal.buyScore ? 'Pro ' + (signal.buyScore.higherTimeframeBias + signal.buyScore.marketStructure + signal.buyScore.liquidity + signal.buyScore.volatilitySession + signal.buyScore.riskReward + signal.buyScore.indicatorConfirmation) + '/100' : 'N/A'}`;
    case 'Consider Buy':
      return `Buy conditions met. Consider entering with proper risk management.`;
    case 'Sell / Exit':
      return `Sell signal detected. Consider exiting your position.`;
    case 'Consider Sell':
      return `Sell pressure building. Consider taking partial profits.`;
    case 'Hold':
      return `Hold current position. No strong signal to exit.`;
    case 'Wait':
      return `Market conditions unclear. Wait for better setup.`;
    case 'No Trade':
      return `No favorable conditions. Stay out of the market.`;
    default:
      return `Signal updated.`;
  }
}

export default function NotificationPanel({ vm }: NotificationSystemProps) {
  const { notifications, markRead, markAllRead, clearAll, unreadCount } = useNotifications(vm);
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Bell icon in sidebar */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative w-full flex items-center px-4 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:bg-gray-800/50 hover:text-gray-200 transition-colors"
      >
        <span>Alerts</span>
        {unreadCount > 0 && (
          <span className="absolute top-1 right-2 bg-pink-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Notification panel overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setIsOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative w-96 max-h-full bg-gray-900 border-l border-gray-800 overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-gray-900 border-b border-gray-800 px-4 py-3 flex items-center justify-between">
              <h2 className="text-sm font-bold text-white">Notifications</h2>
              <div className="flex items-center gap-2">
                {notifications.length > 0 && (
                  <>
                    <button onClick={markAllRead} className="text-xs text-blue-400 hover:text-blue-300">Mark all read</button>
                    <button onClick={clearAll} className="text-xs text-red-400 hover:text-red-300">Clear all</button>
                  </>
                )}
                <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-white text-lg leading-none">✕</button>
              </div>
            </div>

            {notifications.length === 0 && (
              <div className="p-8 text-center text-gray-600">
                <p className="text-3xl mb-2">🔔</p>
                <p className="text-sm">No notifications yet</p>
                <p className="text-xs text-gray-700 mt-1">You'll be alerted when the signal changes</p>
              </div>
            )}

            <div className="divide-y divide-gray-800">
              {notifications.map(n => (
                <div
                  key={n.id}
                  onClick={() => markRead(n.id)}
                  className={`px-4 py-3 cursor-pointer hover:bg-gray-800/50 transition-colors ${n.read ? 'opacity-60' : ''}`}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-lg mt-0.5">{getDecisionIcon(n.decision)}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white">{n.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.message}</p>
                      <p className="text-xs text-gray-600 mt-1">{new Date(n.timestamp).toLocaleTimeString()}</p>
                    </div>
                    {!n.read && <div className="w-2 h-2 rounded-full bg-blue-500 mt-2 shrink-0" />}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function getDecisionIcon(decision?: SignalDecision): string {
  switch (decision) {
    case 'Strong Buy': return '🟢';
    case 'Consider Buy': return '🟩';
    case 'Sell / Exit': return '🔴';
    case 'Consider Sell': return '🟥';
    case 'Hold': return '🟡';
    case 'Wait': return '🟨';
    case 'No Trade': return '⚪';
    default: return '📊';
  }
}