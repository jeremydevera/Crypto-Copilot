import { useState } from 'react';
import { usd, percent, number } from '../engine/formatters';

interface CalculatorTabProps {
  vm: any;
}

export default function CalculatorTab({ vm }: CalculatorTabProps) {
  const sig = vm.activeSignal;
  const pt = vm.paperTrading;

  const [customEntry, setCustomEntry] = useState(sig.price > 0 ? sig.price.toString() : '');
  const [customInvestment, setCustomInvestment] = useState(vm.investmentAmount.toString());
  const [customFee, setCustomFee] = useState('0.5');
  const [customStopPercent, setCustomStopPercent] = useState('1.5');
  const [customTarget1Percent, setCustomTarget1Percent] = useState('1.5');
  const [customTarget2Percent, setCustomTarget2Percent] = useState('3.0');
  const [useStructureLevels, setUseStructureLevels] = useState(true);

  const entry = parseFloat(customEntry) || 0;
  const investment = parseFloat(customInvestment) || 0;
  const feePct = parseFloat(customFee) || 0.5;
  const stopPct = parseFloat(customStopPercent) || 1.5;
  const t1Pct = parseFloat(customTarget1Percent) || 1.5;
  const t2Pct = parseFloat(customTarget2Percent) || 3.0;

  // Calculate
  const slippagePct = 0.05;
  const adjustedEntry = entry * (1 + slippagePct / 100);
  const breakeven = adjustedEntry * (1 + feePct / 100);

  let stopLoss: number;
  let target1: number;
  let target2: number;

  if (useStructureLevels && sig.price > 0) {
    // Use structure-based levels from the signal
    stopLoss = sig.stopLoss || adjustedEntry * (1 - stopPct / 100);
    target1 = sig.target1 || adjustedEntry * (1 + t1Pct / 100);
    target2 = sig.target2 || adjustedEntry * (1 + t2Pct / 100);
  } else {
    stopLoss = adjustedEntry * (1 - stopPct / 100);
    target1 = adjustedEntry * (1 + t1Pct / 100);
    target2 = adjustedEntry * (1 + t2Pct / 100);
  }

  const risk = adjustedEntry - stopLoss;
  const reward = target2 - adjustedEntry;
  const rewardRisk = risk > 0 ? reward / risk : 0;
  const quantity = investment > 0 && adjustedEntry > 0 ? investment / adjustedEntry : 0;
  const buyFee = investment * (feePct / 100);
  const grossSellValue = quantity * target2;
  const sellFee = grossSellValue * (feePct / 100);
  const netProfit = grossSellValue - sellFee - investment - buyFee;
  const profitPercent = investment > 0 ? (netProfit / investment) * 100 : 0;
  const lossAtStop = investment * (risk / adjustedEntry);
  const lossPercent = adjustedEntry > 0 ? (lossAtStop / investment) * 100 : 0;

  // Position sizing
  const accountRisk = pt.demoBalance * 0.01; // 1% risk
  const suggestedSize = risk > 0 ? accountRisk / risk : 0;
  const suggestedValue = suggestedSize * adjustedEntry;

  const hasPosition = pt.openPosition !== null;
  const unrealizedProfit = hasPosition ? pt.unrealizedProfit(sig.price) : 0;

  return (
    <div className="p-6 space-y-5 max-w-4xl mx-auto">
      <h1 className="text-xl font-bold">🧮 Trade Calculator</h1>

      {/* Input Section */}
      <div className="grid grid-cols-2 gap-5">
        <div className="bg-gray-900 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider">Inputs</h2>

          <div>
            <label className="text-sm text-gray-400 block mb-1.5">Entry Price ($)</label>
            <input
              type="number"
              value={customEntry}
              onChange={e => setCustomEntry(e.target.value)}
              placeholder={sig.price > 0 ? sig.price.toFixed(2) : '0.00'}
              className="w-full bg-gray-800 rounded-lg px-4 py-2.5 text-sm text-gray-200 border border-gray-700 focus:border-green-500 outline-none transition-colors"
            />
            {sig.price > 0 && (
              <button
                onClick={() => setCustomEntry(sig.price.toFixed(2))}
                className="text-xs text-green-400 hover:text-green-300 mt-1"
              >
                Use current price ({usd(sig.price)})
              </button>
            )}
          </div>

          <div>
            <label className="text-sm text-gray-400 block mb-1.5">Investment Amount (₱)</label>
            <input
              type="number"
              value={customInvestment}
              onChange={e => setCustomInvestment(e.target.value)}
              className="w-full bg-gray-800 rounded-lg px-4 py-2.5 text-sm text-gray-200 border border-gray-700 focus:border-green-500 outline-none transition-colors"
            />
          </div>

          <div>
            <label className="text-sm text-gray-400 block mb-1.5">Fees + Spread (%)</label>
            <input
              type="number"
              value={customFee}
              onChange={e => setCustomFee(e.target.value)}
              step="0.1"
              className="w-full bg-gray-800 rounded-lg px-4 py-2.5 text-sm text-gray-200 border border-gray-700 focus:border-green-500 outline-none transition-colors"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={useStructureLevels}
              onChange={e => setUseStructureLevels(e.target.checked)}
              className="accent-green-500"
            />
            <span className="text-sm text-gray-300">Use structure-based levels (swing highs/lows)</span>
          </label>

          {!useStructureLevels && (
            <div className="space-y-3 pt-2 border-t border-gray-800">
              <div>
                <label className="text-sm text-gray-400 block mb-1.5">Stop Loss (%)</label>
                <input
                  type="number"
                  value={customStopPercent}
                  onChange={e => setCustomStopPercent(e.target.value)}
                  step="0.1"
                  className="w-full bg-gray-800 rounded-lg px-4 py-2.5 text-sm text-gray-200 border border-gray-700 focus:border-green-500 outline-none transition-colors"
                />
              </div>
              <div>
                <label className="text-sm text-gray-400 block mb-1.5">Target 1 (%)</label>
                <input
                  type="number"
                  value={customTarget1Percent}
                  onChange={e => setCustomTarget1Percent(e.target.value)}
                  step="0.1"
                  className="w-full bg-gray-800 rounded-lg px-4 py-2.5 text-sm text-gray-200 border border-gray-700 focus:border-green-500 outline-none transition-colors"
                />
              </div>
              <div>
                <label className="text-sm text-gray-400 block mb-1.5">Target 2 (%)</label>
                <input
                  type="number"
                  value={customTarget2Percent}
                  onChange={e => setCustomTarget2Percent(e.target.value)}
                  step="0.1"
                  className="w-full bg-gray-800 rounded-lg px-4 py-2.5 text-sm text-gray-200 border border-gray-700 focus:border-green-500 outline-none transition-colors"
                />
              </div>
            </div>
          )}
        </div>

        {/* Results */}
        <div className="bg-gray-900 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider">Results</h2>

          <div className="space-y-2.5">
            <CalcRow label="Adjusted Entry (with slippage)" value={usd(adjustedEntry)} />
            <CalcRow label="Breakeven Price" value={usd(breakeven)} color="text-yellow-400" />
            <div className="border-t border-gray-800 my-2" />
            <CalcRow label="Stop Loss" value={usd(stopLoss)} color="text-pink-400" />
            <CalcRow label="Target 1" value={usd(target1)} color="text-green-400" />
            <CalcRow label="Target 2" value={usd(target2)} color="text-green-400" />
            <div className="border-t border-gray-800 my-2" />
            <CalcRow label="Reward/Risk" value={`${number(rewardRisk)}:1`} color={rewardRisk >= 2 ? 'text-green-400' : rewardRisk >= 1.5 ? 'text-yellow-400' : 'text-pink-400'} />
            <CalcRow label="Risk per BTC" value={usd(risk)} />
            <div className="border-t border-gray-800 my-2" />
            <CalcRow label="Buy Fee" value={`₱${number(buyFee)}`} color="text-gray-400" />
            <CalcRow label="Sell Fee (at T2)" value={`₱${number(sellFee)}`} color="text-gray-400" />
            <CalcRow label="Net Profit (at T2)" value={`₱${number(netProfit)}`} color={netProfit >= 0 ? 'text-green-400' : 'text-pink-400'} />
            <CalcRow label="Profit %" value={percent(profitPercent)} color={profitPercent >= 0 ? 'text-green-400' : 'text-pink-400'} />
            <CalcRow label="Max Loss (at SL)" value={`₱${number(lossAtStop)}`} color="text-pink-400" />
            <CalcRow label="Max Loss %" value={percent(lossPercent)} color="text-pink-400" />
          </div>
        </div>
      </div>

      {/* Position Sizing */}
      <div className="bg-gray-900 rounded-xl p-5 space-y-3">
        <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider">Position Sizing (1% Risk Rule)</h2>
        <div className="grid grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-gray-500 mb-1">Demo Balance</p>
            <p className="text-base font-medium text-white">₱{pt.demoBalance.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Account Risk (1%)</p>
            <p className="text-base font-medium text-yellow-400">₱{number(accountRisk)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Suggested Position</p>
            <p className="text-base font-medium text-green-400">{number(suggestedSize, 6)} BTC</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Position Value</p>
            <p className="text-base font-medium text-green-400">₱{number(suggestedValue)}</p>
          </div>
        </div>
      </div>

      {/* Current Position */}
      {hasPosition && (
        <div className="bg-gray-900 rounded-xl p-5 space-y-3">
          <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider">Current Position</h2>
          <div className="grid grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-gray-500 mb-1">Entry Price</p>
              <p className="text-base font-medium text-white">{usd(pt.openPosition.entryPrice)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Invested</p>
              <p className="text-base font-medium text-white">₱{pt.openPosition.investedAmount.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Quantity</p>
              <p className="text-base font-medium text-white">{pt.openPosition.remainingQuantity.toFixed(6)} BTC</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Unrealized P/L</p>
              <p className={`text-base font-bold ${unrealizedProfit >= 0 ? 'text-green-400' : 'text-pink-400'}`}>
                {unrealizedProfit >= 0 ? '+' : ''}₱{number(unrealizedProfit)}
              </p>
            </div>
          </div>
        </div>
      )}

      <p className="text-xs text-gray-600 text-center">⚠️ This calculator is for educational purposes only. Not financial advice.</p>
    </div>
  );
}

function CalcRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-sm text-gray-400">{label}</span>
      <span className={`text-sm font-medium ${color ?? 'text-gray-200'}`}>{value}</span>
    </div>
  );
}