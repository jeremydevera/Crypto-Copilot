interface DevTerminalTabProps { vm: any; }

export default function DevTerminalTab({ vm }: DevTerminalTabProps) {
  return (
    <div className="p-6 space-y-5 max-w-5xl mx-auto">
      <h1 className="text-xl font-bold">💻 Dev Terminal</h1>

      <div className="grid grid-cols-1 gap-5">
        {/* REST API Logs (includes chart logs) */}
        <div className="bg-gray-900 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider">REST API & Chart Logs</h2>
            <button
              onClick={() => vm.clearRestLogs()}
              className="rounded bg-gray-700 px-2 py-1 text-xs font-medium text-gray-300 hover:bg-gray-600"
            >
              Clear
            </button>
          </div>
          <div className="h-64 overflow-y-auto bg-black rounded-lg p-3 font-mono text-xs text-blue-400">
            {vm.restLogs.length === 0 && <p className="text-gray-600">No REST logs yet</p>}
            {vm.restLogs.slice(0, 500).map((log: string, i: number) => (
              <p key={i} className="whitespace-nowrap">{log}</p>
            ))}
          </div>
        </div>

        {/* Live Socket Logs */}
        <div className="bg-gray-900 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider">Live Socket Logs</h2>
            <button
              onClick={() => vm.clearDevLogs()}
              className="rounded bg-gray-700 px-2 py-1 text-xs font-medium text-gray-300 hover:bg-gray-600"
            >
              Clear
            </button>
          </div>
          <div className="h-64 overflow-y-auto bg-black rounded-lg p-3 font-mono text-xs text-green-400">
            {vm.devLogs.length === 0 && <p className="text-gray-600">Waiting for data...</p>}
            {vm.devLogs.map((log: string, i: number) => (
              <p key={i} className="whitespace-nowrap">{log}</p>
            ))}
          </div>
        </div>
      </div>

      {/* System Info */}
      <div className="bg-gray-900 rounded-xl p-5 space-y-3">
        <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider">System Info</h2>
        <div className="grid grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-xs text-gray-500">5m Candles</p>
            <p className="text-base font-medium text-white">{vm.fiveMinuteCandles.length}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">15m Candles</p>
            <p className="text-base font-medium text-white">{vm.fifteenMinuteCandles.length}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Chart Candles</p>
            <p className="text-base font-medium text-white">{vm.selectedChartCandles.length}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Data Freshness</p>
            <p className="text-base font-medium text-white">{vm.dataFreshness.kind}</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4 text-sm pt-2 border-t border-gray-800">
          <div>
            <p className="text-xs text-gray-500">Signal Decision</p>
            <p className="text-base font-medium text-white">{vm.activeSignal.decision}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Buy Score</p>
            <p className="text-base font-medium text-white">
              {vm.activeSignal.buyScore.higherTimeframeBias + vm.activeSignal.buyScore.marketStructure + vm.activeSignal.buyScore.liquidity + vm.activeSignal.buyScore.volatilitySession + vm.activeSignal.buyScore.riskReward + vm.activeSignal.buyScore.indicatorConfirmation}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Sell Score</p>
            <p className="text-base font-medium text-white">{vm.activeSignal.sellScore}</p>
          </div>
        </div>
      </div>
    </div>
  );
}