import { useState } from 'react';
import type { TradingSignal, DataFreshness, SignalDecision, RiskLevel, MarketRegime } from '../engine/types';
import { totalScore, normalTotal, freshnessLabel, freshnessDotColor } from '../engine/types';
import { usd, fiat, percent, number, toFiat, getExchangeRate } from '../engine/formatters';
import HelpModal from './HelpModal';
import GaugeChart from './GaugeChart';
import { useToast } from './Toast';


interface HomeTabProps {
  vm: any;
}

function decisionColor(d: SignalDecision): string {
  switch (d) {
    case 'Strong Buy': case 'Consider Buy': return 'text-green-400';
    case 'Wait': case 'Hold': return 'text-yellow-400';
    case 'No Trade': return 'text-gray-500';
    case 'Consider Sell': case 'Sell / Exit': return 'text-pink-400';
  }
}

function riskColor(r: RiskLevel): string {
  switch (r) {
    case 'Low': return 'text-green-400';
    case 'Medium': return 'text-orange-400';
    case 'High': return 'text-pink-400';
  }
}

function regimeColor(r: MarketRegime): string {
  switch (r) {
    case 'Trending': return 'text-green-400';
    case 'Ranging': return 'text-yellow-400';
    case 'Volatile / Choppy': return 'text-pink-400';
    case 'Quiet / Low Activity': return 'text-gray-500';
  }
}

function freshnessDot(f: DataFreshness): string {
  return freshnessDotColor(f);
}

export default function HomeTab({ vm }: HomeTabProps) {
  const sig: TradingSignal = vm.activeSignal;
  const pt = vm.paperTrading;
  const profit = pt.openPosition ? toFiat(pt.unrealizedProfit(sig.price)) : 0;
  const hasPosition = pt.openPosition !== null;
  const [activeHelpTopic, setActiveHelpTopic] = useState<string | null>(null);
  const { showToast } = useToast();

  const handleRefresh = async () => {
    const result = await vm.refreshAll();
    if (result?.success) {
      showToast(result.message, 'success');
    } else {
      showToast(result?.message ?? 'Refresh failed', 'error');
    }
  };


  return (
    <div className="p-6 space-y-3 max-w-6xl mx-auto">
      <HelpModal topicId={activeHelpTopic} onClose={() => setActiveHelpTopic(null)} />
      {/* Single Grid — All Content */}
      <div className="grid grid-cols-3 gap-3 items-start">
        {/* Left Column — Price + Risk + Indicators */}
        <div className="space-y-3">
          {/* Price Tile */}
          <div className="bg-gray-900 rounded-xl p-6 flex flex-col relative h-[160px]">
            <button
              onClick={handleRefresh}
              className="absolute top-3 right-3 group text-gray-500 hover:text-white transition-colors"
              title="Reconnect All"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
            <div className="flex-1 flex flex-col justify-center mt-2 pl-1">
              <div className="flex items-center gap-2 mb-1">
                <CryptoLogo pair={vm.cryptoPair} />
                <select
                  value={vm.cryptoPair}
                  onChange={e => vm.setCryptoPair(e.target.value)}
                  className="bg-transparent text-base font-semibold text-white outline-none appearance-none cursor-pointer pr-4 bg-[url('data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%228%22%20height%3D%225%22%20viewBox%3D%220%200%208%205%22%3E%3Cpath%20d%3D%22M1%201l3%203%203-3%22%20stroke%3D%22%239ca3af%22%20stroke-width%3D%221.5%22%20fill%3D%22none%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[right_center]"
                >
                <option value="BTC/USDT">BTC/USDT</option>
                <option value="ETH/USDT">ETH/USDT</option>
                <option value="SOL/USDT">SOL/USDT</option>
                <option value="BNB/USDT">BNB/USDT</option>
                <option value="XRP/USDT">XRP/USDT</option>
                <option value="DOGE/USDT">DOGE/USDT</option>
              </select>
              </div>
              <p className={`font-mono text-3xl font-semibold ${sig.price >= sig.entryPrice ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>{usd(sig.price)}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <div className={`w-2 h-2 rounded-full ${freshnessDot(vm.dataFreshness)}`} />
                <span className="text-xs text-gray-500">{freshnessLabel(vm.dataFreshness)}</span>
              </div>
            </div>
          </div>

          {/* Risk Analysis */}
          <div className="bg-gray-900 rounded-xl p-5 space-y-3">
            <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider">Risk Analysis</h2>
            {sig.backtest.probability !== null && (
              <MetricRow label="Backtest Win Rate" value={percent(sig.backtest.probability)} infoAction={() => setActiveHelpTopic('backtest')} />
            )}
            {sig.backtest.expectedValueR !== null && (
              <MetricRow label="Expected Value" value={number(sig.backtest.expectedValueR) + 'R'} infoAction={() => setActiveHelpTopic('expectedValue')} />
            )}
            {sig.reasons.length > 0 && (
              <div className="space-y-1">
                {sig.reasons.map((r, i) => (
                  <p key={i} className="text-sm text-gray-400">• {r}</p>
                ))}
              </div>
            )}
            {sig.warnings.length > 0 && (
              <div className="space-y-1">
                {sig.warnings.map((w, i) => (
                  <p key={i} className="text-sm text-orange-400">⚠ {w}</p>
                ))}
              </div>
            )}
            <p className="text-xs text-gray-600">Backtest results are estimates, not guarantees.</p>
          </div>

          {/* Indicators */}
          <div className="bg-gray-900 rounded-xl p-5 space-y-3">
            <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider">5m Indicators</h2>
            <div className="space-y-2">
              <MetricRow label="EMA 9" value={usd(sig.fiveMinute.ema9 ?? 0)} infoAction={() => setActiveHelpTopic('ema9')} />
              <MetricRow label="EMA 21" value={usd(sig.fiveMinute.ema21 ?? 0)} infoAction={() => setActiveHelpTopic('ema21')} />
              <MetricRow label="EMA 50" value={usd(sig.fiveMinute.ema50 ?? 0)} infoAction={() => setActiveHelpTopic('ema50')} />
              <MetricRow label="RSI 14" value={sig.fiveMinute.rsi14 !== null ? number(sig.fiveMinute.rsi14) : '--'} infoAction={() => setActiveHelpTopic('rsi')} />
              <MetricRow label="MACD" value={sig.fiveMinute.macd !== null ? (sig.fiveMinute.macd > sig.fiveMinute.macdSignal! ? 'Bullish' : 'Bearish') : '--'} infoAction={() => setActiveHelpTopic('macd')} />
              <MetricRow label="Volume" value={sig.fiveMinute.currentVolume !== null && sig.fiveMinute.averageVolume20 !== null && sig.fiveMinute.currentVolume > sig.fiveMinute.averageVolume20 ? 'High' : 'Low'} infoAction={() => setActiveHelpTopic('volume')} />
            </div>
          </div>
        </div>

        {/* Middle Column — Gauge + Scores */}
        <div className="space-y-3">
          {/* Gauge + Decision Tile */}
          <div className="bg-gray-900 rounded-xl p-5 space-y-3">
            <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider text-center">Overall Score</h2>
            <div className="flex items-center justify-center gap-4">
              <GaugeChart
                value={totalScore(sig.buyScore)}
                max={100}
                size={180}
                sublabel={`Pro ${totalScore(sig.buyScore)} / Normal ${normalTotal(sig.normalBuyScore)}`}
              />
              <div className="flex flex-col gap-1">
                <p className={`text-2xl font-bold ${decisionColor(sig.decision)}`}>{sig.decision}</p>
                <p className={`text-sm font-semibold ${riskColor(sig.risk)}`}>Risk: {sig.risk}</p>
              </div>
            </div>
          </div>

          {/* Normal Score */}
          <div className="bg-gray-900 rounded-xl p-5 space-y-3">
            <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider">Normal Score: {normalTotal(sig.normalBuyScore)} / 100</h2>
            <div className="space-y-2.5">
              <ScoreRow label="15m Trend" score={sig.normalBuyScore.trend} max={30} infoAction={() => setActiveHelpTopic('normalTrend')} />
              <ScoreRow label="Momentum" score={sig.normalBuyScore.momentum} max={25} infoAction={() => setActiveHelpTopic('normalMomentum')} />
              <ScoreRow label="Volume" score={sig.normalBuyScore.volume} max={15} infoAction={() => setActiveHelpTopic('normalVolume')} />
              <ScoreRow label="5m Entry" score={sig.normalBuyScore.entry} max={15} infoAction={() => setActiveHelpTopic('normalEntry')} />
              <ScoreRow label="Risk/Reward" score={sig.normalBuyScore.riskReward} max={15} infoAction={() => setActiveHelpTopic('normalRiskReward')} />
            </div>
          </div>

          {/* Pro Score — New 6-Category Model */}
          <div className="bg-gray-900 rounded-xl p-5 space-y-3">
            <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider">Pro Score: {totalScore(sig.buyScore)} / 100</h2>
            <div className="space-y-2.5">
              <ScoreRow label="HTF Bias (1H/4H)" score={sig.buyScore.higherTimeframeBias} max={25} infoAction={() => setActiveHelpTopic('higherTimeframeBias')} />
              <ScoreRow label="Market Structure" score={sig.buyScore.marketStructure} max={25} infoAction={() => setActiveHelpTopic('marketStructure')} />
              <ScoreRow label="Liquidity" score={sig.buyScore.liquidity} max={15} infoAction={() => setActiveHelpTopic('liquidity')} />
              <ScoreRow label="Volatility + Session" score={sig.buyScore.volatilitySession} max={15} infoAction={() => setActiveHelpTopic('volatilitySession')} />
              <ScoreRow label="Risk/Reward" score={sig.buyScore.riskReward} max={15} infoAction={() => setActiveHelpTopic('riskReward')} />
              <ScoreRow label="Indicator Confirm" score={sig.buyScore.indicatorConfirmation} max={5} infoAction={() => setActiveHelpTopic('indicatorConfirmation')} />
            </div>
          </div>
        </div>

        {/* Right Column — Buy/Sell + Sell Score + Market Context */}
        <div className="space-y-3">
          {/* Buy/Sell Tile */}
          <div className="bg-gray-900 rounded-xl p-5 flex flex-col items-center justify-center gap-3">
            <div className="w-full">
              <label className="text-xs text-gray-400 mb-1 block">Amount ({vm.fiatCurrency})</label>
              <input
                type="text"
                value={vm.investmentAmount.toLocaleString()}
                onChange={(e) => { const val = e.target.value.replace(/,/g, ''); vm.setInvestmentAmount(Number(val) || 0); }}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-[#f0b90b] transition-colors"
              />
              {vm.investmentAmount > 0 && sig.price > 0 && (
                <div className="flex items-center gap-1.5 mt-1.5 bg-gray-800/50 rounded px-2 py-1">
                  <span className="text-[#f0b90b] text-xs">→</span>
                  <span className="text-sm font-medium text-white">
                    {number(vm.fiatCurrency === 'USD' ? vm.investmentAmount / sig.price : vm.investmentAmount / toFiat(sig.price), 6)} {vm.cryptoPair.split('/')[0]}
                  </span>
                  {vm.fiatCurrency !== 'USD' && (
                    <span className="text-xs text-gray-500">≈ ${number(vm.fiatCurrency === 'USD' ? vm.investmentAmount : vm.investmentAmount / getExchangeRate(), 2)} USD</span>
                  )}
                </div>
              )}
            </div>
            {!hasPosition && (
              <div className="w-full space-y-1 border-t border-gray-700 pt-2">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-400">Entry</span>
                  <span className="text-gray-300 font-mono">{usd(sig.entryPrice)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-[#0ecb81]">Target 1</span>
                  <span className="text-[#0ecb81] font-mono">{usd(sig.target1)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-[#0ecb81]">Target 2</span>
                  <span className="text-[#0ecb81] font-mono">{usd(sig.target2)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-400">Breakeven</span>
                  <span className="text-gray-300 font-mono">{usd(sig.breakevenPrice)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-[#f6465d]">Stop Loss</span>
                  <span className="text-[#f6465d] font-mono">{usd(sig.stopLoss)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-400">Reward/Risk</span>
                  <span className="text-gray-300 font-mono">{number(sig.rewardRisk)}:1</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-400">Position Size</span>
                  <span className="text-gray-300 font-mono">{number(sig.suggestedPositionSize, 6)} {vm.cryptoPair.split('/')[0]}</span>
                </div>
              </div>
            )}
            {hasPosition && (
              <div className="w-full space-y-1 border-t border-gray-700 pt-2">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-400">Entry</span>
                  <span className="text-gray-300 font-mono">{usd(pt.openPosition!.entryPrice)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-[#0ecb81]">Target 1</span>
                  <span className="text-[#0ecb81] font-mono">{usd(sig.target1)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-[#0ecb81]">Target 2</span>
                  <span className="text-[#0ecb81] font-mono">{usd(sig.target2)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-400">Breakeven</span>
                  <span className="text-gray-300 font-mono">{usd(sig.breakevenPrice)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-[#f6465d]">Stop Loss</span>
                  <span className="text-[#f6465d] font-mono">{usd(sig.stopLoss)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-400">Reward/Risk</span>
                  <span className="text-gray-300 font-mono">{number(sig.rewardRisk)}:1</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-400">Position Size</span>
                  <span className="text-gray-300 font-mono">{number(sig.suggestedPositionSize, 6)} {vm.cryptoPair.split('/')[0]}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-400">Sell Value</span>
                  <span className="text-gray-300 font-mono">{fiat(toFiat(pt.openPosition!.remainingQuantity * sig.price * 0.9995))}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-400">Open P/L</span>
                  <span className={`font-mono font-bold ${profit >= 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>{profit >= 0 ? '+' : ''}{fiat(profit)}</span>
                </div>
              </div>
            )}
            <div className="w-full flex gap-2">
              <button
                onClick={() => { const err = vm.buyPaperTrade(); if (err) alert(err); }}
                className="flex-1 bg-green-600 hover:bg-green-500 text-white text-xs font-bold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-1.5"
              >
                ▲ BUY
              </button>
              <button
                onClick={() => { const r = vm.sellPaperTrade(); if ('error' in r) alert(r.error); }}
                className="flex-1 bg-pink-600 hover:bg-pink-500 text-white text-xs font-bold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-1.5"
              >
                ▼ SELL
              </button>
            </div>
          </div>

          {/* Sell Score */}
          {sig.sellScore > 0 && (
            <div className="bg-gray-900 rounded-xl p-5 space-y-3">
              <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                Sell Score: {sig.sellScore} / 100
                <button onClick={() => setActiveHelpTopic('sellScore')} className="text-blue-400 hover:text-blue-300 text-xs" title="What is Sell Score?">ⓘ</button>
              </h2>
              <div className="space-y-2.5">
                <ScoreRow label="Structure Weakness" score={sig.sellScoreBreakdown.structureWeakness} max={25} infoAction={() => setActiveHelpTopic('structureWeakness')} />
                <ScoreRow label="Liquidity Rejection" score={sig.sellScoreBreakdown.liquidityRejection} max={20} infoAction={() => setActiveHelpTopic('liquidityRejection')} />
                <ScoreRow label="Momentum Weakness" score={sig.sellScoreBreakdown.momentumWeakness} max={20} infoAction={() => setActiveHelpTopic('momentumWeakness')} />
                <ScoreRow label="Volatility Risk" score={sig.sellScoreBreakdown.volatilityRisk} max={15} infoAction={() => setActiveHelpTopic('volatilityRisk')} />
                <ScoreRow label="Exit Risk" score={sig.sellScoreBreakdown.exitRisk} max={20} infoAction={() => setActiveHelpTopic('exitRisk')} />
              </div>
            </div>
          )}

          {/* Trailing Stop & Market Context */}
          <div className="bg-gray-900 rounded-xl p-5 space-y-3">
            <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider">Market Context</h2>
            <MetricRow label="HTF Bias (4H/1H)" value={sig.bias} color={sig.bias === 'Bullish' ? 'text-green-400' : sig.bias === 'Bearish' ? 'text-red-400' : 'text-yellow-400'} infoAction={() => setActiveHelpTopic('bias')} />
            <MetricRow label="Market State" value={sig.marketState} color={sig.marketState === 'Bullish Trend' ? 'text-green-400' : sig.marketState === 'Bearish Trend' ? 'text-red-400' : sig.marketState === 'Transitioning' ? 'text-orange-400' : 'text-yellow-400'} infoAction={() => setActiveHelpTopic('marketRegime')} />
            <MetricRow label="Market Regime" value={sig.marketRegime} color={regimeColor(sig.marketRegime)} infoAction={() => setActiveHelpTopic('marketRegime')} />
            <MetricRow label="Confidence" value={`${sig.confidence}%`} color={sig.confidence >= 70 ? 'text-green-400' : sig.confidence >= 50 ? 'text-yellow-400' : 'text-red-400'} infoAction={() => setActiveHelpTopic('confidence')} />
            <MetricRow label="Risk Profile" value={`1:${sig.rewardRisk.toFixed(1)} RR`} color={sig.rewardRisk >= 2 ? 'text-green-400' : 'text-red-400'} infoAction={() => setActiveHelpTopic('riskReward')} />
            {sig.trailingStop.activeTrailingStop !== null && (
              <MetricRow label="Trailing Stop" value={usd(sig.trailingStop.activeTrailingStop)} color="text-orange-400" infoAction={() => setActiveHelpTopic('trailingStop')} />
            )}
            {sig.trailingStop.target1Hit && (
              <p className="text-sm text-green-400">✓ Target 1 hit — stop moved to breakeven</p>
            )}
            {sig.confluenceWarning && (
              <p className="text-sm text-orange-400 flex items-center gap-1.5">
                ⚠️ {sig.confluenceWarning}
                <button onClick={() => setActiveHelpTopic('confluenceWarning')} className="text-blue-400 hover:text-blue-300 text-xs" title="What is this?">ⓘ</button>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricRow({ label, value, color, infoAction }: { label: string; value: string; color?: string; infoAction?: () => void }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-gray-400 text-sm flex items-center gap-1.5">
        {infoAction && (
          <button onClick={infoAction} className="text-blue-400 hover:text-blue-300 text-xs leading-none" title="What is this?">ⓘ</button>
        )}
        {label}
      </span>
      <span className={`text-sm font-medium ${color ?? 'text-gray-200'}`}>{value}</span>
    </div>
  );
}

function CryptoLogo({ pair }: { pair: string }) {
  const symbol = pair.split('/')[0].toLowerCase();
  return (
    <img
      src={`https://assets.coincap.io/assets/icons/${symbol}@2x.png`}
      alt={pair}
      className="w-5 h-5 shrink-0"
      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
    />
  );
}

function ScoreRow({ label, score, max, infoAction }: { label: string; score: number; max: number; infoAction?: () => void }) {
  const pct = max > 0 ? (score / max) * 100 : 0;
  const barColor = pct >= 70 ? 'bg-green-500' : pct >= 40 ? 'bg-yellow-500' : 'bg-gray-700';
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-gray-400 flex items-center gap-1.5">
          {infoAction && (
            <button onClick={infoAction} className="text-blue-400 hover:text-blue-300 text-xs leading-none" title="What is this?">ⓘ</button>
          )}
          {label}
        </span>
        <span className="text-gray-300 font-medium">{score}/{max}</span>
      </div>
      <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
