const TUTORIAL_SECTIONS = [
  {
    title: '🧠 How the AI Signal Works',
    content: `The app uses two scoring systems to decide whether to buy or sell:

**Normal Score (100 pts):** Simple checks on trend, momentum, volume, entry timing, and risk/reward ratio.

**Pro Score (100 pts):** Advanced checks on market structure, liquidity sweeps, volatility, session activity, entry confirmation, and risk management.

A score of 75+ triggers a "Consider Buy" signal. 85+ triggers "Strong Buy". The app also checks for sell signals when you have an open position.`,
  },
  {
    title: '📊 Technical Indicators',
    content: `**EMA (Exponential Moving Average):** Lines that follow price. EMA 9 is fast, EMA 50 is slow. Price above EMA = bullish.

**RSI (Relative Strength Index):** 0-100 scale. Above 70 = overbought. Below 30 = oversold. 45-65 = healthy.

**MACD:** Shows momentum direction. Bullish = upward momentum. Bearish = downward momentum.

**Volume:** High volume makes price moves more trustworthy. Low volume = suspicious moves.

**ATR (Average True Range):** Measures how much BTC typically moves. Used for volatility assessment.`,
  },
  {
    title: '🎯 Entry & Exit Logic',
    content: `**Entry:** The app waits for multiple confirmations — trend alignment, momentum, volume, and a good risk/reward ratio.

**Stop Loss:** Placed below the nearest swing low (with 0.1% buffer). This is your emergency exit.

**Target 1:** The nearest swing high above entry. You can sell 50% here.

**Target 2:** The next swing high. Sell the rest here.

**Trailing Stop:** Once Target 1 is hit, the stop loss moves to breakeven (can't lose). Then it trails behind EMA 9.`,
  },
  {
    title: '⚠️ Risk Management',
    content: `**1% Rule:** The app risks only 1% of your demo balance per trade. This means even a string of losses won't wipe you out.

**Hard Filters:** The app blocks trades when:
- Backtested expected value is negative
- Reward/risk ratio is below 1.5:1
- Market is too volatile or too quiet

**Confluence Warning:** When Normal and Pro scores disagree, the app warns you to be cautious.`,
  },
  {
    title: '🔄 Market Regimes',
    content: `The app detects 4 market conditions:

**Trending:** BTC is moving clearly in one direction. Best for buy signals.

**Ranging:** BTC is bouncing sideways. Trend signals may fail.

**Volatile/Choppy:** Wild swings. Dangerous — whipsaw risk.

**Quiet:** Low participation. Signals may be unreliable.

The app adds warnings when the regime is unfavorable.`,
  },
  {
    title: '💰 Paper Trading',
    content: `Paper trading lets you practice without real money. The app simulates:

**Fees:** 0.1% per trade (like Binance)
**Slippage:** 0.05% (price moves against you on execution)
**Partial Sells:** Sell 50% at Target 1, rest at Target 2

Your trades are saved locally so you can review your performance over time.`,
  },
];

export default function TutorialTab() {
  return (
    <div className="p-6 space-y-4 max-w-4xl mx-auto">
      <h1 className="text-xl font-bold">📖 Tutorial</h1>
      {TUTORIAL_SECTIONS.map((section, i) => (
        <details key={i} className="bg-gray-900 rounded-xl overflow-hidden" open={i === 0}>
          <summary className="p-4 cursor-pointer hover:bg-gray-800 transition-colors text-sm font-bold">
            {section.title}
          </summary>
          <div className="p-4 pt-0 text-sm text-gray-400 leading-relaxed whitespace-pre-line">
            {section.content}
          </div>
        </details>
      ))}
    </div>
  );
}