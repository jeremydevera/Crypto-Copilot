import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { useMarketViewModel } from './store/useMarketViewModel';
import HomeTab from './components/HomeTab';
import ChartTab from './components/ChartTab';
import CalculatorTab from './components/CalculatorTab';
import HistoryTab from './components/HistoryTab';
import TutorialTab from './components/TutorialTab';
import SettingsTab from './components/SettingsTab';
import DevTerminalTab from './components/DevTerminalTab';
import SocketsTab from './components/SocketsTab';
import NotificationPanel from './components/NotificationPanel';
import AuthGate from './components/AuthGate';
import PrivacyPolicy from './components/PrivacyPolicy';
import TermsOfUse from './components/TermsOfUse';
import { ToastProvider } from './components/Toast';

const TABS = [
  { id: 0, label: 'Home' },
  { id: 1, label: 'Chart' },
  { id: 2, label: 'Calculator' },
  { id: 3, label: 'History' },
  { id: 4, label: 'Sockets' },
  { id: 5, label: 'Tutorial' },
  { id: 6, label: 'Settings' },
  { id: 7, label: 'Dev' },
];

export default function App() {
  return (
    <AuthProvider>
      <AuthGate>
        <ToastProvider>
          <AppInner />
        </ToastProvider>
      </AuthGate>
    </AuthProvider>
  );
}

function AppInner() {
  const { user, signOut } = useAuth();
  const [selectedTab, setSelectedTab] = useState(0);
  const vm = useMarketViewModel();

  // Update browser tab title with live price
  useEffect(() => {
    const price = vm.activeSignal?.price;
    const pair = vm.cryptoPair ?? 'BTC/USDT';
    if (price && price > 0) {
      document.title = `${pair} $${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} - Trading Copilot`;
    } else {
      document.title = 'Trading Copilot';
    }
  }, [vm.activeSignal?.price, vm.cryptoPair]);

  return (
    <div className="h-screen bg-gray-950 text-gray-100 flex overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 bg-gray-900 border-r border-gray-800 flex flex-col shrink-0">
        <div className="p-5 border-b border-gray-800">
          <h1 className="text-base font-bold text-white">Trading Copilot</h1>
          <p className="text-xs text-gray-500 mt-0.5">Crypto Analyzer</p>
        </div>
        <nav className="flex-1 py-3 space-y-1 px-2">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setSelectedTab(tab.id)}
              className={`w-full flex items-center px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                selectedTab === tab.id
                  ? 'bg-gray-800 text-green-400'
                  : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
          <div className="border-t border-gray-800 my-2" />
        </nav>
        <div className="p-4 border-t border-gray-800">
          {user ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-green-600 flex items-center justify-center text-xs font-bold text-white">
                  {user.email?.[0]?.toUpperCase() ?? '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-300 truncate">{user.email}</p>
                </div>
              </div>
              <button
                onClick={() => signOut()}
                className="w-full text-xs text-gray-500 hover:text-red-400 transition-colors"
              >
                Sign out
              </button>
            </div>
          ) : (
            <p className="text-[10px] text-gray-500 leading-tight">Not signed in</p>
          )}
          <div className="flex gap-2 mt-1">
            <button
              onClick={() => setSelectedTab(8)}
              className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors"
            >
              Privacy
            </button>
            <span className="text-[10px] text-gray-700">·</span>
            <button
              onClick={() => setSelectedTab(9)}
              className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors"
            >
              Terms
            </button>
          </div>
          <p className="text-[10px] text-gray-600 leading-tight mt-1">Developed by<br/>Jeremy De Vera</p>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top Header Bar */}
        <header className="h-12 bg-gray-900 border-b border-gray-800 flex items-center justify-end px-4 shrink-0">
          <NotificationPanel vm={vm} />
        </header>
        <div className="flex-1 overflow-y-auto">
          {selectedTab === 0 && <HomeTab vm={vm} />}
          {selectedTab === 1 && <ChartTab vm={vm} />}
          {selectedTab === 2 && <CalculatorTab vm={vm} />}
          {selectedTab === 3 && <HistoryTab vm={vm} />}
          {selectedTab === 4 && <SocketsTab />}
          {selectedTab === 5 && <TutorialTab />}
          {selectedTab === 6 && <SettingsTab vm={vm} />}
          {selectedTab === 7 && <DevTerminalTab vm={vm} />}
          {selectedTab === 8 && <PrivacyPolicy />}
          {selectedTab === 9 && <TermsOfUse />}
        </div>
      </main>
    </div>
  );
}
