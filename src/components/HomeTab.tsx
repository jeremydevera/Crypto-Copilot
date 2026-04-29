import { useState } from 'react';
import type { TradingSignal, DataFreshness, SignalDecision, RiskLevel, MarketRegime } from '../engine/types';
import { totalScore, normalTotal, freshnessLabel, freshnessDotColor } from '../engine/types';
import { usd, percent, number } from '../engine/formatters';
import HelpModal from './HelpModal';

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
  const profit = pt.openPosition ? pt.unrealizedProfit(sig.price) : 0;
  const hasPosition = pt.openPosition !== null;
  const [activeHelpTopic, setActiveHelpTopic] = useState<string | null>(null);

  return (
    <div className="p-6 space-y-5 max-w-6xl mx-auto">
      <HelpModal topicId={activeHelpTopic} onClose={() => setActiveHelpTopic(null)} />
      {/* Top Panel — Price + Decision */}
      <div className="bg-gray-900 rounded-xl p-5 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div>
            <h1 className="text-2xl font-bold text-white">BTC/USDT</h1>
            <p className="text-sm text-gray-500">{vm.statusMessage}</p>
          </div>
          <div className="border-l border-gray-700 pl-6">
            <p className="text-3xl font-bold text-white">{usd(sig.price)}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <div className={`w-2 h-2 rounded-full ${freshnessDot(vm.dataFreshness)}`} />
              <span className="text-xs text-gray-500">{freshnessLabel(vm.dataFreshness)}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div>
            <p className={`text-2xl font-bold ${decisionColor(sig.decision)}`}>{sig.decision}</p>
            <p className={`text-sm font-semibold ${riskColor(sig.risk)}`}>Risk: {sig.risk}</p>
          </div>
          <div className="flex gap-2">
            {!hasPosition ? (
              <button
                onClick={() => { const err = vm.buyPaperTrade(); if (err) alert(err); }}
                className="bg-green-600 hover:bg-green-500 text-white text-sm font-bold px-6 py-2.5 rounded-lg transition-colors"
              >
                BUY
              </button>
            ) : (
              <>
                <button
                  onClick={() => vm.sellPartialPaperTrade(50)}
                  className="bg-orange-600 hover:bg-orange-500 text-white text-sm font-bold px-4 py-2.5 rounded-lg transition-colors"
                >
                  SELL 50%
                </button>
                <button
                  onClick={() => { const r = vm.sellPaperTrade(); if ('error' in r) alert(r.error); }}
                  className="bg-pink-600 hover:bg-pink-500 text-white text-sm font-bold px-4 py-2.5 rounded-lg transition-colors"
                >
                  SELL ALL
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Main Grid — Calculator + Scores */}
      <div className="grid grid-cols-3 gap-5">
        {/* Left Column — Calculator + Indicators */}
        <div className="space-y-5">
          {/* Calculator */}
          <div className="bg-gray-900 rounded-xl p-5 space-y-3">
            <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider">Trade Calculator</h2>
            <div className="space-y-2">
              <MetricRow label="Entry" value={usd(sig.entryPrice)} infoAction={() => setActiveHelpTopic('entry')} />
              <MetricRow label="Target 1" value={usd(sig.target1)} color="text-green-400" infoAction={() => setActiveHelpTopic('target1')} />
              <MetricRow label="Target 2" value={usd(sig.target2)} color="text-green-400" infoAction={() => setActiveHelpTopic('target2')} />
              <MetricRow label="Breakeven" value={usd(sig.breakevenPrice)} infoAction={() => setActiveHelpTopic('breakeven')} />
              <MetricRow label="Stop Loss" value={usd(sig.stopLoss)} color="text-pink-400" infoAction={() => setActiveHelpTopic('stopLoss')} />
              {hasPosition && (
                <MetricRow label="Open P/L" value={peso(profit)} color={profit >= 0 ? 'text-green-400' : 'text-pink-400'} infoAction={() => setActiveHelpTopic('openProfit')} />
              )}
              <MetricRow label="Reward/Risk" value={`${number(sig.rewardRisk)}:1`} infoAction={() => setActiveHelpTopic('rewardRisk')} />
              <MetricRow label="Position Size" value={`${number(sig.suggestedPositionSize, 6)} BTC`} infoAction={() => setActiveHelpTopic('positionSize')} />
            </div>
            {vm.lastUpdated && (
              <p className="text-xs text-gray-600">Updated {new Date(vm.lastUpdated).toLocaleTimeString()}</p>
            )}
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

        {/* Middle Column — Normal + Pro Score */}
        <div className="space-y-5">
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

          {/* Pro Score */}
          <div className="bg-gray-900 rounded-xl p-5 space-y-3">
            <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider">Pro Score: {totalScore(sig.buyScore)} / 100</h2>
            <div className="space-y-2.5">
              <ScoreRow label="Market Structure" score={sig.buyScore.marketStructure} max={20} infoAction={() => setActiveHelpTopic('marketStructure')} />
              <ScoreRow label="Liquidity" score={sig.buyScore.liquidity} max={20} infoAction={() => setActiveHelpTopic('liquidity')} />
              <ScoreRow label="Volatility" score={sig.buyScore.volatility} max={15} infoAction={() => setActiveHelpTopic('volatility')} />
              <ScoreRow label="Session" score={sig.buyScore.session} max={10} infoAction={() => setActiveHelpTopic('session')} />
              <ScoreRow label="Entry Confirmation" score={sig.buyScore.entryConfirmation} max={15} infoAction={() => setActiveHelpTopic('entryConfirmation')} />
              <ScoreRow label="Risk Management" score={sig.buyScore.riskManagement} max={20} infoAction={() => setActiveHelpTopic('riskManagement')} />
            </div>
          </div>
        </div>

        {/* Right Column — Sell Score + Risk + Regime */}
        <div className="space-y-5">
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

          {/* Trailing Stop & Market Regime */}
          <div className="bg-gray-900 rounded-xl p-5 space-y-3">
            <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider">Market Context</h2>
            {sig.trailingStop.activeTrailingStop !== null && (
              <MetricRow label="Trailing Stop" value={usd(sig.trailingStop.activeTrailingStop)} color="text-orange-400" infoAction={() => setActiveHelpTopic('trailingStop')} />
            )}
            {sig.trailingStop.target1Hit && (
              <p className="text-sm text-green-400">✓ Target 1 hit — stop moved to breakeven</p>
            )}
            <MetricRow label="Market Regime" value={sig.marketRegime} color={regimeColor(sig.marketRegime)} infoAction={() => setActiveHelpTopic('marketRegime')} />
            {sig.confluenceWarning && (
              <p className="text-sm text-orange-400 flex items-center gap-1.5">
                ⚠️ {sig.confluenceWarning}
                <button onClick={() => setActiveHelpTopic('confluenceWarning')} className="text-blue-400 hover:text-blue-300 text-xs" title="What is this?">ⓘ</button>
              </p>
            )}
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

function peso(value: number): string {
  return '₱' + new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}