import { useState } from 'react';
import { useMarketViewModel } from './store/useMarketViewModel';
import HomeTab from './components/HomeTab';
import HistoryTab from './components/HistoryTab';
import TutorialTab from './components/TutorialTab';
import SettingsTab from './components/SettingsTab';
import DevTerminalTab from './components/DevTerminalTab';

const TABS = [
  { id: 0, label: 'Home', icon: '🏠' },
  { id: 1, label: 'History', icon: '📋' },
  { id: 2, label: 'Tutorial', icon: '📖' },
  { id: 3, label: 'Settings', icon: '⚙️' },
  { id: 4, label: 'Dev', icon: '💻' },
];

export default function App() {
  const [selectedTab, setSelectedTab] = useState(0);
  const vm = useMarketViewModel();

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex">
      {/* Sidebar */}
      <aside className="w-56 bg-gray-900 border-r border-gray-800 flex flex-col shrink-0">
        <div className="p-5 border-b border-gray-800">
          <h1 className="text-base font-bold text-white">🤖 AI Crypto Analyzer</h1>
          <p className="text-xs text-gray-500 mt-0.5">BTC/USDT Real-time</p>
        </div>
        <nav className="flex-1 py-3 space-y-1 px-2">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setSelectedTab(tab.id)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                selectedTab === tab.id
                  ? 'bg-gray-800 text-green-400'
                  : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200'
              }`}
            >
              <span className="text-lg">{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
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
        {selectedTab === 1 && <HistoryTab vm={vm} />}
        {selectedTab === 2 && <TutorialTab />}
        {selectedTab === 3 && <SettingsTab vm={vm} />}
        {selectedTab === 4 && <DevTerminalTab vm={vm} />}
      </main>
    </div>
  );
}
