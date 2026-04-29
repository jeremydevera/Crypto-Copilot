interface HistoryTabProps { vm: any; }

export default function HistoryTab({ vm }: HistoryTabProps) {
  const pt = vm.paperTrading;

  return (
    <div className="p-6 space-y-5 max-w-5xl mx-auto">
      <h1 className="text-xl font-bold">📋 Paper Trading History</h1>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-gray-900 rounded-xl p-5 text-center">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Balance</p>
          <p className="text-xl font-bold text-green-400">₱{pt.demoBalance.toLocaleString()}</p>
        </div>
        <div className="bg-gray-900 rounded-xl p-5 text-center">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Total P/L</p>
          <p className={`text-xl font-bold ${pt.totalProfit >= 0 ? 'text-green-400' : 'text-pink-400'}`}>
            {pt.totalProfit >= 0 ? '+' : ''}₱{pt.totalProfit.toFixed(2)}
          </p>
        </div>
        <div className="bg-gray-900 rounded-xl p-5 text-center">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Win Rate</p>
          <p className="text-xl font-bold text-gray-200">{pt.winRate.toFixed(1)}%</p>
        </div>
        <div className="bg-gray-900 rounded-xl p-5 text-center">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Total Trades</p>
          <p className="text-xl font-bold text-gray-200">{pt.history.length}</p>
        </div>
      </div>

      {/* Open Position */}
      {pt.openPosition && (
        <div className="bg-gray-900 rounded-xl p-5 space-y-2">
          <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">Open Position</h3>
          <div className="grid grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-xs text-gray-500">Entry Price</p>
              <p className="text-base font-medium text-white">${pt.openPosition.entryPrice.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Invested</p>
              <p className="text-base font-medium text-white">₱{pt.openPosition.investedAmount.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Remaining</p>
              <p className="text-base font-medium text-white">{pt.openPosition.remainingQuantity.toFixed(6)} BTC</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Unrealized P/L</p>
              <p className={`text-base font-bold ${pt.unrealizedProfit(vm.activeSignal.price) >= 0 ? 'text-green-400' : 'text-pink-400'}`}>
                {pt.unrealizedProfit(vm.activeSignal.price) >= 0 ? '+' : ''}₱{pt.unrealizedProfit(vm.activeSignal.price).toFixed(2)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Trade History Table */}
      <div className="bg-gray-900 rounded-xl p-5 space-y-3">
        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">Trade History</h3>
        {pt.history.length === 0 && <p className="text-sm text-gray-600">No trades yet. Use the Home tab to place paper trades.</p>}
        {pt.history.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 uppercase border-b border-gray-800">
                <th className="text-left py-2 px-2">Entry Date</th>
                <th className="text-right py-2 px-2">Entry Price</th>
                <th className="text-right py-2 px-2">Exit Price</th>
                <th className="text-right py-2 px-2">Invested</th>
                <th className="text-right py-2 px-2">P/L</th>
                <th className="text-right py-2 px-2"></th>
              </tr>
            </thead>
            <tbody>
              {pt.history.map((trade: any, i: number) => (
                <tr key={trade.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                  <td className="py-2 px-2 text-gray-400">{new Date(trade.entryDate).toLocaleDateString()}</td>
                  <td className="py-2 px-2 text-right text-gray-300">${trade.entryPrice.toFixed(2)}</td>
                  <td className="py-2 px-2 text-right text-gray-300">${trade.exitPrice.toFixed(2)}</td>
                  <td className="py-2 px-2 text-right text-gray-300">₱{trade.investedAmount.toLocaleString()}</td>
                  <td className={`py-2 px-2 text-right font-bold ${trade.profit >= 0 ? 'text-green-400' : 'text-pink-400'}`}>
                    {trade.profit >= 0 ? '+' : ''}₱{trade.profit.toFixed(2)}
                  </td>
                  <td className="py-2 px-2 text-right">
                    <button
                      onClick={() => pt.deleteTrade(i)}
                      className="text-xs text-red-500 hover:text-red-400 transition-colors"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <button
        onClick={() => { if (confirm('Reset all paper trading data?')) pt.reset(); }}
        className="bg-red-900/50 hover:bg-red-800/50 text-red-400 text-sm font-bold py-2.5 px-6 rounded-lg transition-colors"
      >
        Reset Paper Trading
      </button>
    </div>
  );
}