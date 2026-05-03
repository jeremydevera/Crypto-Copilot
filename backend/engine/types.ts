// ============================================================
// Market Models — Ported from frontend types.ts
// Browser-specific code removed (DataFreshness UI helpers, etc.)
// ============================================================

export type Timeframe = '1s' | '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

export const TIMEFRAMES: Timeframe[] = ['1s', '1m', '5m', '15m', '1h', '4h', '1d'];

export function timeframeSeconds(tf: Timeframe): number {
  const map: Record<Timeframe, number> = {
    '1s': 1, '1m': 60, '5m': 300, '15m': 900,
    '1h': 3600, '4h': 14400, '1d': 86400,
  };
  return map[tf];
}

export interface Candle {
  openTime: number; // Unix ms
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  isClosed?: boolean; // true if candle is finalized
}

export interface IndicatorSnapshot {
  ema9: number | null;
  ema21: number | null;
  ema50: number | null;
  rsi14: number | null;
  previousRSI14: number | null;
  macd: number | null;
  macdSignal: number | null;
  previousMACD: number | null;
  previousMACDSignal: number | null;
  averageVolume20: number | null;
  currentVolume: number | null;
  support: number | null;
  resistance: number | null;
}

export const emptyIndicatorSnapshot: IndicatorSnapshot = {
  ema9: null, ema21: null, ema50: null,
  rsi14: null, previousRSI14: null,
  macd: null, macdSignal: null,
  previousMACD: null, previousMACDSignal: null,
  averageVolume20: null, currentVolume: null,
  support: null, resistance: null,
};

export function isRSIRising(snap: IndicatorSnapshot): boolean {
  return snap.rsi14 !== null && snap.previousRSI14 !== null && snap.rsi14 > snap.previousRSI14;
}

export function isMACDBullish(snap: IndicatorSnapshot): boolean {
  return snap.macd !== null && snap.macdSignal !== null && snap.macd > snap.macdSignal;
}

export function isMACDBearish(snap: IndicatorSnapshot): boolean {
  return snap.macd !== null && snap.macdSignal !== null && snap.macd < snap.macdSignal;
}

export function volumeAboveAverage(snap: IndicatorSnapshot): boolean {
  return snap.currentVolume !== null && snap.averageVolume20 !== null && snap.currentVolume > snap.averageVolume20;
}

export function volumeRatio(snap: IndicatorSnapshot): number | null {
  if (snap.currentVolume === null || snap.averageVolume20 === null || snap.averageVolume20 === 0) return null;
  return snap.currentVolume / snap.averageVolume20;
}

// Score Breakdowns
export interface ScoreBreakdown {
  higherTimeframeBias: number;
  marketStructure: number;
  liquidity: number;
  volatilitySession: number;
  riskReward: number;
  indicatorConfirmation: number;
}

export const emptyScoreBreakdown: ScoreBreakdown = {
  higherTimeframeBias: 0, marketStructure: 0, liquidity: 0,
  volatilitySession: 0, riskReward: 0, indicatorConfirmation: 0,
};

export function totalScore(s: ScoreBreakdown): number {
  return s.higherTimeframeBias + s.marketStructure + s.liquidity +
    s.volatilitySession + s.riskReward + s.indicatorConfirmation;
}

export interface NormalScoreBreakdown {
  trend: number;
  momentum: number;
  volume: number;
  entry: number;
  riskReward: number;
}

export const emptyNormalScore: NormalScoreBreakdown = { trend: 0, momentum: 0, volume: 0, entry: 0, riskReward: 0 };

export function normalTotal(s: NormalScoreBreakdown): number {
  return s.trend + s.momentum + s.volume + s.entry + s.riskReward;
}

export interface SellScoreBreakdown {
  structureWeakness: number;
  liquidityRejection: number;
  momentumWeakness: number;
  volatilityRisk: number;
  exitRisk: number;
}

export const emptySellScore: SellScoreBreakdown = {
  structureWeakness: 0, liquidityRejection: 0,
  momentumWeakness: 0, volatilityRisk: 0, exitRisk: 0,
};

export function sellTotal(s: SellScoreBreakdown): number {
  return s.structureWeakness + s.liquidityRejection + s.momentumWeakness + s.volatilityRisk + s.exitRisk;
}

export type MarketRegime = 'Trending' | 'Ranging' | 'Volatile / Choppy' | 'Quiet / Low Activity';

export interface TrailingStopState {
  activeTrailingStop: number | null;
  target1Hit: boolean;
  movedToBreakeven: boolean;
}

export interface BacktestEstimate {
  probability: number | null;
  wins: number;
  total: number;
  expectedValueR: number | null;
}

export const unavailableBacktest: BacktestEstimate = { probability: null, wins: 0, total: 0, expectedValueR: null };

export interface BookTicker {
  symbol: string;
  bidPrice: number;
  bidQuantity: number;
  askPrice: number;
  askQuantity: number;
}

export function spreadPercent(ticker: BookTicker): number | null {
  if (ticker.askPrice <= 0 || ticker.bidPrice <= 0) return null;
  const mid = (ticker.askPrice + ticker.bidPrice) / 2;
  return (ticker.askPrice - ticker.bidPrice) / mid * 100;
}

export interface OrderBookLevel { price: number; quantity: number; }

export interface OrderBookSnapshot {
  lastUpdateId: number;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
}

export function bidAskImbalance(ob: OrderBookSnapshot): number | null {
  const bidNotional = ob.bids.reduce((s, b) => s + b.price * b.quantity, 0);
  const askNotional = ob.asks.reduce((s, a) => s + a.price * a.quantity, 0);
  const total = bidNotional + askNotional;
  return total > 0 ? (bidNotional - askNotional) / total : null;
}

export interface MarketMicrostructure {
  bookTicker: BookTicker | null;
  orderBook: OrderBookSnapshot | null;
}

export const emptyMicrostructure: MarketMicrostructure = { bookTicker: null, orderBook: null };

export function microSpreadPercent(m: MarketMicrostructure): number | null {
  return m.bookTicker ? spreadPercent(m.bookTicker) : null;
}

export function microDepthImbalance(m: MarketMicrostructure): number | null {
  return m.orderBook ? bidAskImbalance(m.orderBook) : null;
}

// Signal Decision
export type SignalDecision = 'Strong Buy' | 'Consider Buy' | 'Wait' | 'No Trade' | 'Hold' | 'Consider Sell' | 'Sell / Exit';

export type RiskLevel = 'Low' | 'Medium' | 'High';

export type MarketState = 'Bullish Trend' | 'Bearish Trend' | 'Ranging' | 'Transitioning';
export type SetupType = 'Sweep & Reverse' | 'Breakout' | 'Pullback Entry' | 'No Clear Setup';
export type TimeframeBias = 'Bullish' | 'Bearish' | 'Neutral';

export interface TradeQuote {
  investmentAmount: number;
  entryPrice: number;
  feeAndSpreadPercent: number;
  slippagePercent: number;
  breakevenPrice: number;
  target1: number;
  target2: number;
  stopLoss: number;
  rewardRisk: number;
}

export interface TradingSignal {
  symbol: string;
  price: number;
  decision: SignalDecision;
  risk: RiskLevel;
  buyScore: ScoreBreakdown;
  normalBuyScore: NormalScoreBreakdown;
  sellScoreBreakdown: SellScoreBreakdown;
  sellScore: number;
  entryPrice: number;
  breakevenPrice: number;
  stopLoss: number;
  target1: number;
  target2: number;
  rewardRisk: number;
  suggestedPositionSize: number;
  suggestedPositionValue: number;
  accountRiskAmount: number;
  accountRiskPercent: number;
  positionRiskPercent: number;
  reasons: string[];
  warnings: string[];
  fiveMinute: IndicatorSnapshot;
  fifteenMinute: IndicatorSnapshot;
  oneHour: IndicatorSnapshot;
  fourHour: IndicatorSnapshot;
  marketState: MarketState;
  marketRegime: MarketRegime;
  setupType: SetupType;
  bias: TimeframeBias;
  confidence: number;
  backtest: BacktestEstimate;
  trailingStop: TrailingStopState;
  confluenceWarning: string | null;
  microstructure?: MarketMicrostructure;
}

export const placeholderSignal: TradingSignal = {
  symbol: 'BTCUSDT',
  price: 0,
  decision: 'Wait',
  risk: 'Medium',
  buyScore: { ...emptyScoreBreakdown },
  normalBuyScore: { ...emptyNormalScore },
  sellScoreBreakdown: { ...emptySellScore },
  sellScore: 0,
  entryPrice: 0, breakevenPrice: 0, stopLoss: 0,
  target1: 0, target2: 0, rewardRisk: 0,
  suggestedPositionSize: 0, suggestedPositionValue: 0,
  accountRiskAmount: 0, accountRiskPercent: 0, positionRiskPercent: 1,
  reasons: ['Waiting for market data'],
  warnings: [],
  fiveMinute: { ...emptyIndicatorSnapshot },
  fifteenMinute: { ...emptyIndicatorSnapshot },
  oneHour: { ...emptyIndicatorSnapshot },
  fourHour: { ...emptyIndicatorSnapshot },
  marketState: 'Ranging',
  marketRegime: 'Quiet / Low Activity',
  setupType: 'No Clear Setup',
  bias: 'Neutral',
  confidence: 0,
  backtest: { ...unavailableBacktest },
  trailingStop: { activeTrailingStop: null, target1Hit: false, movedToBreakeven: false },
  confluenceWarning: null,
};

export interface TradeTick {
  price: number;
  quantity: number;
  time: number;
}