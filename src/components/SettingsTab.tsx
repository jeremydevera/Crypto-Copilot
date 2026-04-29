interface SettingsTabProps { vm: any; }

export default function SettingsTab({ vm }: SettingsTabProps) {
  const pt = vm.paperTrading;

  return (
    <div className="p-6 space-y-5 max-w-3xl mx-auto">
      <h1 className="text-xl font-bold">⚙️ Settings</h1>

      <div className="grid grid-cols-2 gap-5">
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
        </div>

        {/* Chart */}
        <div className="bg-gray-900 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider">Chart</h2>
          <div>
            <label className="text-sm text-gray-400 block mb-1.5">Timeframe</label>
            <select
              value={vm.selectedChartTimeframe}
              onChange={e => vm.setSelectedChartTimeframe(e.target.value)}
              className="w-full bg-gray-800 rounded-lg px-4 py-2.5 text-sm text-gray-200 border border-gray-700 focus:border-green-500 outline-none transition-colors"
            >
              {['1s', '1m', '5m', '15m', '1h', '4h', '1d'].map(tf => (
                <option key={tf} value={tf}>{tf}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Connection */}
      <div className="bg-gray-900 rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider">Connection</h2>
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
  );
}