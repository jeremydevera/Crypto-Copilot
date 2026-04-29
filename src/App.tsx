import { useState, useEffect } from 'react';
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
  const [selectedTab, setSelectedTab] = useState(0);
  const vm = useMarketViewModel();

  // Update browser tab title with live price
  useEffect(() => {
    const price = vm.activeSignal?.price;
    if (price && price > 0) {
      document.title = `BTC $${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} - Trading Copilot`;
    } else {
      document.title = 'Trading Copilot';
    }
  }, [vm.activeSignal?.price]);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex">
      {/* Sidebar */}
      <aside className="w-56 bg-gray-900 border-r border-gray-800 flex flex-col shrink-0">
        <div className="p-5 border-b border-gray-800">
          <h1 className="text-base font-bold text-white">Trading Copilot</h1>
          <p className="text-xs text-gray-500 mt-0.5">BTC/USDT Real-time</p>
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
          <NotificationPanel vm={vm} />
        </nav>
        <div className="p-4 border-t border-gray-800">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${vm.dataFreshness.kind === 'live' ? 'bg-green-500' : vm.dataFreshness.kind === 'delayed' ? 'bg-yellow-500' : vm.dataFreshness.kind === 'stale' ? 'bg-orange-500' : 'bg-gray-600'}`} />
            <span className="text-xs text-gray-500">{vm.statusMessage}</span>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        {selectedTab === 0 && <HomeTab vm={vm} />}
        {selectedTab === 1 && <ChartTab vm={vm} />}
        {selectedTab === 2 && <CalculatorTab vm={vm} />}
        {selectedTab === 3 && <HistoryTab vm={vm} />}
        {selectedTab === 4 && <SocketsTab />}
        {selectedTab === 5 && <TutorialTab />}
        {selectedTab === 6 && <SettingsTab vm={vm} />}
        {selectedTab === 7 && <DevTerminalTab vm={vm} />}}
      </main>
    </div>
  );
}
