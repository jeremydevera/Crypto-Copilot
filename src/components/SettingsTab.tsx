import { useEffect, useState } from 'react';
import { getSocketFeeds, type SocketFeedConfig } from '../data/socketFeeds';
import { setFiatCurrency } from '../engine/formatters';
import { BUY_SOUND_OPTIONS, SELL_SOUND_OPTIONS, previewSound, type SoundId } from '../engine/sounds';

interface SettingsTabProps { vm: any; }

export default function SettingsTab({ vm }: SettingsTabProps) {
  const pt = vm.paperTrading;
  const [pendingFeedId, setPendingFeedId] = useState(vm.selectedLiveFeedId ?? 'binance-futures-bookticker');
  const SOCKET_FEEDS = getSocketFeeds(vm.cryptoPair);
  const selectedFeed = SOCKET_FEEDS.find(feed => feed.id === vm.selectedLiveFeedId);
  const pendingFeed = SOCKET_FEEDS.find(feed => feed.id === pendingFeedId);
  const feedGroups = SOCKET_FEEDS.reduce((acc, feed) => {
    if (!acc[feed.provider]) acc[feed.provider] = [];
    acc[feed.provider].push(feed);
    return acc;
  }, {} as Record<string, SocketFeedConfig[]>);

  useEffect(() => {
    setPendingFeedId(vm.selectedLiveFeedId ?? 'binance-futures-bookticker');
  }, [vm.selectedLiveFeedId]);

  return (
    <>
      {/* Sticky Save Bar — must be direct child of scroll container */}
      <div className="sticky top-0 z-10 px-6 py-3 bg-gray-950/95 backdrop-blur-sm border-b border-gray-800 flex items-center justify-between max-w-3xl mx-auto">
        <h1 className="text-xl font-bold">⚙️ Settings</h1>
        <button
          onClick={() => {
            vm.setCryptoPair(vm.cryptoPair);
            vm.setFiatCurrency(vm.fiatCurrency);
            setFiatCurrency(vm.fiatCurrency);
            vm.applyLiveFeed(pendingFeedId);
          }}
          className="bg-green-600 hover:bg-green-500 text-white text-sm font-bold py-2 px-6 rounded-lg transition-colors"
        >
          Save
        </button>
      </div>

      <div className="p-6 space-y-5 max-w-3xl mx-auto">

      {/* Paper Trading */}
      <div className="bg-gray-900 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider">Paper Trading</h2>
          <div>
            <label className="text-sm text-gray-400 block mb-1.5">Demo Balance</label>
            <input
              type="number"
              value={pt.demoBalance}
              onChange={e => { pt.demoBalance = Number(e.target.value); }}
              className="w-full bg-gray-800 rounded-lg px-4 py-2.5 text-sm text-gray-200 border border-gray-700 focus:border-green-500 outline-none transition-colors"
            />
          </div>
          <div>
            <label className="text-sm text-gray-400 block mb-1.5">Investment Amount</label>
            <input
              type="number"
              value={vm.investmentAmount}
              onChange={e => vm.setInvestmentAmount(Number(e.target.value))}
              className="w-full bg-gray-800 rounded-lg px-4 py-2.5 text-sm text-gray-200 border border-gray-700 focus:border-green-500 outline-none transition-colors"
            />
          </div>
          <div>
            <label className="text-sm text-gray-400 block mb-1.5">Crypto Pair</label>
            <select
              value={vm.cryptoPair}
              onChange={e => vm.setCryptoPair(e.target.value)}
              className="w-full bg-gray-800 rounded-lg px-4 py-2.5 text-sm text-gray-200 border border-gray-700 focus:border-green-500 outline-none transition-colors appearance-none bg-[url('data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2012%2012%22%3E%3Cpath%20d%3D%22M2%204l4%204%204-4%22%20fill%3D%22none%22%20stroke%3D%22%239ca3af%22%20stroke-width%3D%221.5%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fsvg%3E')] bg-[length:12px] bg-[position:right_12px_center] bg-no-repeat pr-8"
            >
              <option value="BTC/USDT">BTC/USDT</option>
              <option value="ETH/USDT">ETH/USDT</option>
              <option value="SOL/USDT">SOL/USDT</option>
              <option value="BNB/USDT">BNB/USDT</option>
              <option value="XRP/USDT">XRP/USDT</option>
              <option value="DOGE/USDT">DOGE/USDT</option>
            </select>
          </div>
          <div>
            <label className="text-sm text-gray-400 block mb-1.5">Fiat Currency</label>
            <select
              value={vm.fiatCurrency}
              onChange={e => { vm.setFiatCurrency(e.target.value); setFiatCurrency(e.target.value); }}
              className="w-full bg-gray-800 rounded-lg px-4 py-2.5 text-sm text-gray-200 border border-gray-700 focus:border-green-500 outline-none transition-colors appearance-none bg-[url('data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2012%2012%22%3E%3Cpath%20d%3D%22M2%204l4%204%204-4%22%20fill%3D%22none%22%20stroke%3D%22%239ca3af%22%20stroke-width%3D%221.5%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fsvg%3E')] bg-[length:12px] bg-[position:right_12px_center] bg-no-repeat pr-8"
            >
              <option value="USD">USD ($)</option>
              <option value="PHP">PHP (₱)</option>
              <option value="EUR">EUR (€)</option>
              <option value="GBP">GBP (£)</option>
              <option value="JPY">JPY (¥)</option>
              <option value="KRW">KRW (₩)</option>
              <option value="INR">INR (₹)</option>
              <option value="AUD">AUD (A$)</option>
              <option value="CAD">CAD (C$)</option>
              <option value="SGD">SGD (S$)</option>
            </select>
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-gray-800">
            <div>
              <p className="text-sm text-gray-200 font-medium">Auto-Trade</p>
              <p className="text-xs text-gray-500 mt-0.5">Automatically execute paper trades on signal changes</p>
            </div>
            <button
              onClick={() => vm.setAutoTradeEnabled(!vm.autoTradeEnabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${vm.autoTradeEnabled ? 'bg-green-600' : 'bg-gray-700'}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${vm.autoTradeEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
          {vm.autoTradeEnabled && (
            <div className="bg-yellow-900/30 border border-yellow-700/50 rounded-lg p-3">
              <p className="text-xs text-yellow-400">⚠️ Auto-trade will automatically BUY on Strong Buy / Consider Buy signals and SELL on Sell / Exit / Consider Sell signals. Minimum 1 minute between trades.</p>
            </div>
          )}
      </div>

      {/* Alert Sounds */}
      <div className="bg-gray-900 rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider">Alert Sounds</h2>
        <div>
          <label className="text-sm text-gray-400 block mb-1.5">Buy Sound</label>
          <div className="flex items-center gap-2">
            <select
              value={vm.buySound}
              onChange={e => vm.setBuySound(e.target.value)}
              className="flex-1 bg-gray-800 rounded-lg px-4 py-2.5 text-sm text-gray-200 border border-gray-700 focus:border-green-500 outline-none transition-colors appearance-none bg-[url('data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2012%2012%22%3E%3Cpath%20d%3D%22M2%204l4%204%204-4%22%20fill%3D%22none%22%20stroke%3D%22%239ca3af%22%20stroke-width%3D%221.5%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fsvg%3E')] bg-[length:12px] bg-[position:right_12px_center] bg-no-repeat pr-8"
            >
              {BUY_SOUND_OPTIONS.map(opt => (
                <option key={opt.id} value={opt.id}>{opt.label}</option>
              ))}
            </select>
            <button
              onClick={() => previewSound(vm.buySound as SoundId)}
              className="px-3 py-2.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm text-gray-300 border border-gray-700 transition-colors"
              title="Preview buy sound"
            >
              ▶
            </button>
          </div>
        </div>
        <div>
          <label className="text-sm text-gray-400 block mb-1.5">Sell Sound</label>
          <div className="flex items-center gap-2">
            <select
              value={vm.sellSound}
              onChange={e => vm.setSellSound(e.target.value)}
              className="flex-1 bg-gray-800 rounded-lg px-4 py-2.5 text-sm text-gray-200 border border-gray-700 focus:border-red-500 outline-none transition-colors appearance-none bg-[url('data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2012%2012%22%3E%3Cpath%20d%3D%22M2%204l4%204%204-4%22%20fill%3D%22none%22%20stroke%3D%22%239ca3af%22%20stroke-width%3D%221.5%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fsvg%3E')] bg-[length:12px] bg-[position:right_12px_center] bg-no-repeat pr-8"
            >
              {SELL_SOUND_OPTIONS.map(opt => (
                <option key={opt.id} value={opt.id}>{opt.label}</option>
              ))}
            </select>
            <button
              onClick={() => previewSound(vm.sellSound as SoundId)}
              className="px-3 py-2.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm text-gray-300 border border-gray-700 transition-colors"
              title="Preview sell sound"
            >
              ▶
            </button>
          </div>
        </div>
      </div>

      {/* Connection */}
      <div className="bg-gray-900 rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider">Connection</h2>
        <div>
          <label className="text-sm text-gray-400 block mb-1.5">WebSocket Feed</label>
          <div className="flex items-center gap-2">
            <select
              value={pendingFeedId}
              onChange={e => setPendingFeedId(e.target.value)}
              className="flex-1 bg-gray-800 rounded-lg px-4 py-2.5 text-sm text-gray-200 border border-gray-700 focus:border-green-500 outline-none transition-colors appearance-none bg-[url('data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2012%2012%22%3E%3Cpath%20d%3D%22M2%204l4%204%204-4%22%20fill%3D%22none%22%20stroke%3D%22%239ca3af%22%20stroke-width%3D%221.5%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fsvg%3E')] bg-[length:12px] bg-[position:right_12px_center] bg-no-repeat pr-8"
            >
              {Object.entries(feedGroups).map(([provider, feeds]) => (
                <optgroup key={provider} label={provider}>
                  {feeds.map(feed => (
                    <option key={feed.id} value={feed.id}>{feed.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            <button
              onClick={() => vm.applyLiveFeed(pendingFeedId)}
              disabled={pendingFeedId === vm.selectedLiveFeedId && vm.liveFeedStatus === 'connected'}
              className="bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-bold py-2.5 px-5 rounded-lg transition-colors"
            >
              Apply
            </button>
          </div>
          <p className="text-xs text-gray-600 mt-2">
            Current: <span className="text-gray-400">{selectedFeed?.label ?? pendingFeed?.label ?? 'Unknown'}</span>
            {vm.liveFeedLatency !== null && <span> · {vm.liveFeedLatency}ms</span>}
            {vm.liveFeedMsgCount > 0 && <span> · {vm.liveFeedMsgCount.toLocaleString()} msgs</span>}
          </p>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-400">Status: <span className="text-green-400">{vm.statusMessage}</span></p>
          <button
            onClick={() => vm.start()}
            className="bg-blue-900/50 hover:bg-blue-800/50 text-blue-400 text-sm font-bold py-2 px-5 rounded-lg transition-colors"
          >
            Reconnect All
          </button>
        </div>
      </div>

      {/* About */}
      <div className="bg-gray-900 rounded-xl p-5 space-y-2">
        <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider">About</h2>
        <p className="text-sm text-gray-500">AI Crypto Analyzer Web v1.0</p>
        <p className="text-sm text-gray-500">Real-time BTC/USDT analysis powered by Binance WebSocket</p>
        <p className="text-xs text-gray-600">⚠️ This is for educational purposes only. Not financial advice.</p>
      </div>
    </div>
    </>
  );
}
