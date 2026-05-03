// ============================================================
// Signal Engine — Ported from frontend SignalEngine.ts
// Pure calculation, no browser dependencies
// ============================================================

import type {
  Candle,
  IndicatorSnapshot,
  ScoreBreakdown,
  NormalScoreBreakdown,
  SellScoreBreakdown,
  MarketRegime,
  TrailingStopState,
  BacktestEstimate,
  TradeQuote,
  TradingSignal,
  MarketMicrostructure,
  MarketState,
  SetupType,
  SignalDecision,
  RiskLevel,
  TimeframeBias,
} from './types.js';

import {
  emptyScoreBreakdown,
  emptyNormalScore,
  emptySellScore,
  unavailableBacktest,
  placeholderSignal,
  emptyMicrostructure,
  microSpreadPercent,
  microDepthImbalance,
  totalScore,
  normalTotal,
  sellTotal,
  isRSIRising,
  isMACDBullish,
  isMACDBearish,
  volumeAboveAverage,
  volumeRatio,
} from './types.js';

import { snapshot } from './IndicatorEngine.js';

// ── Constants ────────────────────────────────────────────────

export const tradingFeePercent = 0.1;
export const defaultFeeAndSpreadPercent = 0.5;
export const defaultSlippagePercent = 0.05;

// ── Internal types ───────────────────────────────────────────

interface SwingPoint {
  index: number;
  price: number;
}

interface MarketStructure {
  latestHigh: SwingPoint | null;
  previousHigh: SwingPoint | null;
  latestLow: SwingPoint | null;
  previousLow: SwingPoint | null;
}

function isBullishStructure(ms: MarketStructure): boolean {
  if (!ms.latestHigh || !ms.previousHigh || !ms.latestLow || !ms.previousLow) return false;
  return ms.latestHigh.price > ms.previousHigh.price && ms.latestLow.price > ms.previousLow.price;
}

function isBearishStructure(ms: MarketStructure): boolean {
  if (!ms.latestHigh || !ms.previousHigh || !ms.latestLow || !ms.previousLow) return false;
  return ms.latestHigh.price < ms.previousHigh.price && ms.latestLow.price < ms.previousLow.price;
}

// ── Main analyze ─────────────────────────────────────────────

export function analyze(
  symbol: string,
  fiveMinuteCandles: Candle[],
  fifteenMinuteCandles: Candle[],
  oneHourCandles: Candle[],
  fourHourCandles: Candle[],
  feeAndSpreadPercent: number = defaultFeeAndSpreadPercent,
  investmentAmount: number = 100_000,
  demoBalance: number = 100_000,
  activeEntryPrice: number | null = null,
  activeInvestmentAmount: number | null = null,
  positionRiskPercent: number = 1,
  marketMicrostructure: MarketMicrostructure = emptyMicrostructure
): TradingSignal {
  const latest = fiveMinuteCandles[fiveMinuteCandles.length - 1];
  if (latest === undefined) {
    return placeholderSignal;
  }

  const fiveMinute = snapshot(fiveMinuteCandles);
  const fifteenMinute = snapshot(fifteenMinuteCandles);
  const price = latest.close;
  const quoteEntryPrice = activeEntryPrice ?? price;
  const quoteInvestmentAmount = activeInvestmentAmount ?? investmentAmount;

  // Pre-compute swing points for structure-based stops/targets
  const preSwingLow = latestSwingLow(fiveMinuteCandles);
  const preSwingHigh = latestSwingHigh(fiveMinuteCandles);
  const preNearestResistance = nearestSwingHighAbovePrice(fiveMinuteCandles, price);
  const nextResistance = nearestSwingHighAbovePrice(fiveMinuteCandles, price * 1.005);
  const farResistance = nearestSwingHighAbovePrice(fiveMinuteCandles, price * 1.02);

  const quote = calculateTradeQuote(
    quoteInvestmentAmount,
    quoteEntryPrice,
    feeAndSpreadPercent,
    defaultSlippagePercent,
    preSwingLow?.price ?? null,
    nextResistance?.price ?? null,
    farResistance?.price ?? null
  );

  let buyScore: ScoreBreakdown = { ...emptyScoreBreakdown };
  let sellBreakdown: SellScoreBreakdown = { ...emptySellScore };
  let reasons: string[] = [];
  let warnings: string[] = [];
  let hardFilterFailed = false;

  const normalBuyScore = calculateNormalBuyScore(
    fiveMinuteCandles,
    fifteenMinuteCandles,
    quote,
    oneHourCandles
  );

  const fifteenMinuteStructure = getMarketStructure(fifteenMinuteCandles);
  const oneHourStructure = getMarketStructure(oneHourCandles);
  const fourHourStructure = getMarketStructure(fourHourCandles);
  const oneHour = snapshot(oneHourCandles);
  const fourHour = snapshot(fourHourCandles);
  const latestFiveMinuteSwingLow = preSwingLow;
  const latestFiveMinuteSwingHigh = preSwingHigh;
  const nearestResistance = preNearestResistance;
  const atrRatioVal = atrRatioFor(fiveMinuteCandles);
  const riskAmount = estimatedRiskAmount(
    quoteInvestmentAmount,
    quote.entryPrice,
    quote.stopLoss
  );
  const accountRiskPercent = demoBalance > 0 ? (riskAmount / demoBalance) * 100 : Infinity;
  const accountRiskAmount = demoBalance * (positionRiskPercent / 100);
  const suggestedPositionSizeVal = suggestedPositionSize(
    accountRiskAmount,
    quote.entryPrice,
    quote.stopLoss
  );
  const suggestedPositionValue = suggestedPositionSizeVal * quote.entryPrice;
  const hasActivePosition = activeEntryPrice !== null;
  const stopLossHit = hasActivePosition && price <= quote.stopLoss;
  const targetHit = hasActivePosition && (price >= quote.target1 || price >= quote.target2);

  // ════════════════════════════════════════════════════════════
  // SCORING MODEL (Reddit-informed)
  // 1. Higher Timeframe Bias — 25 pts
  // 2. Market Structure — 25 pts
  // 3. Liquidity — 15 pts
  // 4. Volatility + Session — 15 pts
  // 5. Risk/Reward — 15 pts
  // 6. Indicator Confirmation — 5 pts
  // ════════════════════════════════════════════════════════════

  // ── 1. Higher Timeframe Bias (25 pts) ──

  const fourHourBullish = isBullishStructure(fourHourStructure);
  const oneHourBullish = isBullishStructure(oneHourStructure);
  const oneHourBearish = isBearishStructure(oneHourStructure);

  if (fourHourBullish) {
    buyScore.higherTimeframeBias += 10;
    reasons.push('4H structure is bullish (higher highs & lows)');
  }
  if (oneHourBullish) {
    buyScore.higherTimeframeBias += 10;
    reasons.push('1H structure is bullish (higher highs & lows)');
  }
  if (oneHour.ema9 !== null && oneHour.ema21 !== null && oneHour.ema9 > oneHour.ema21) {
    buyScore.higherTimeframeBias += 5;
    reasons.push('1H EMA9 above EMA21 confirms bias');
  }

  if (oneHourBearish) {
    hardFilterFailed = true;
    warnings.push('Hard filter: 1H bias is bearish — do not buy against higher TF flow');
  }

  // ── 2. Market Structure (25 pts) ──

  if (isBullishStructure(fifteenMinuteStructure)) {
    buyScore.marketStructure += 8;
    reasons.push('15m higher high + higher low confirmed');
  }

  const fifteenMinuteHighs = swingHighs(fifteenMinuteCandles);
  if (fifteenMinuteHighs.length >= 2) {
    const latest = fifteenMinuteHighs[fifteenMinuteHighs.length - 1];
    const previous = fifteenMinuteHighs[fifteenMinuteHighs.length - 2];
    if (latest.price > previous.price) {
      buyScore.marketStructure += 5;
      reasons.push('15m break of structure upward');
    }
  }

  if (price > (fifteenMinute.ema50 ?? Infinity)) {
    buyScore.marketStructure += 5;
    reasons.push('15m price is above EMA50');
  }

  if (fifteenMinute.ema9 !== null && fifteenMinute.ema21 !== null && fifteenMinute.ema9 > fifteenMinute.ema21) {
    buyScore.marketStructure += 4;
    reasons.push('15m EMA9 is above EMA21');
  }

  const fifteenMinuteLows = swingLows(fifteenMinuteCandles);
  if (fifteenMinuteLows.length >= 2) {
    const latest = fifteenMinuteLows[fifteenMinuteLows.length - 1];
    const previous = fifteenMinuteLows[fifteenMinuteLows.length - 2];
    if (latest.price > previous.price) {
      buyScore.marketStructure += 3;
      reasons.push('15m no bearish break — higher lows intact');
    }
  }

  // ── 3. Liquidity (15 pts) ──

  if (latestFiveMinuteSwingLow !== null && latest.low < latestFiveMinuteSwingLow.price && latest.close > latestFiveMinuteSwingLow.price) {
    buyScore.liquidity += 7;
    reasons.push('price swept a recent low and reclaimed it (liquidity sweep)');
  }

  const riskPerUnit = Math.max(price - quote.stopLoss, 0);
  if (nearestResistance !== null) {
    if (nearestResistance.price - price >= riskPerUnit * 2) {
      buyScore.liquidity += 5;
      reasons.push('target liquidity above is clear (2R room)');
    }
    if (price < nearestResistance.price * 0.995) {
      buyScore.liquidity += 3;
      reasons.push('not directly below resistance');
    }
  } else {
    buyScore.liquidity += 8;
    reasons.push('no nearby swing resistance blocking the setup');
  }

  const depthImbalance = microDepthImbalance(marketMicrostructure);
  if (depthImbalance !== null && depthImbalance < -0.2) {
    warnings.push('Order book depth shows ask-side pressure');
  }

  // ── 4. Volatility + Session (15 pts) ──

  if (atrRatioVal !== null) {
    if (atrRatioVal >= 0.8 && atrRatioVal <= 1.8) {
      buyScore.volatilitySession += 7;
      reasons.push('ATR volatility is in the tradable range');
    } else if ((atrRatioVal >= 0.5 && atrRatioVal < 0.8) || (atrRatioVal >= 1.8 && atrRatioVal <= 2.5)) {
      buyScore.volatilitySession += 4;
      reasons.push('ATR volatility is acceptable but imperfect');
    } else if (atrRatioVal < 0.5) {
      hardFilterFailed = true;
      warnings.push('Hard filter: volatility is too low — dead market');
    } else if (atrRatioVal >= 3.0) {
      hardFilterFailed = true;
      warnings.push('Hard filter: volatility is too extreme');
    }
  }

  const fiveMinuteVolumeRatio = volumeRatio(fiveMinute);
  if (fiveMinuteVolumeRatio !== null && fiveMinuteVolumeRatio >= 1.2) {
    buyScore.volatilitySession += 5;
    reasons.push('market participation is active (volume above average)');
  }

  const spreadPct = microSpreadPercent(marketMicrostructure);
  if (spreadPct !== null) {
    if (spreadPct <= 0.05) {
      buyScore.volatilitySession += 3;
      reasons.push('live bid/ask spread is acceptable');
    } else {
      warnings.push('Live bid/ask spread is wide');
    }
  } else if (feeAndSpreadPercent <= 1.0) {
    buyScore.volatilitySession += 3;
    reasons.push('estimated spread and fees are acceptable');
  }

  // ── 5. Risk/Reward (15 pts) ──

  if (quote.rewardRisk >= 2) {
    buyScore.riskReward += 10;
    reasons.push('reward/risk is at least 2:1');
  }

  if (latestFiveMinuteSwingLow !== null && quote.stopLoss < latestFiveMinuteSwingLow.price) {
    buyScore.riskReward += 3;
    reasons.push('stop loss is below recent structure');
  } else if (quote.stopLoss < latest.low) {
    buyScore.riskReward += 3;
    reasons.push('stop loss is below the current candle low');
  }

  if (accountRiskPercent <= 2) {
    buyScore.riskReward += 2;
    reasons.push('position size risks no more than 2% of demo balance');
  } else {
    hardFilterFailed = true;
    warnings.push('Hard filter: position risk is above 2% of demo balance');
  }

  if (quote.rewardRisk < 2) {
    hardFilterFailed = true;
    warnings.push('Hard filter: reward/risk is below 2:1');
  }

  // ── 6. Indicator Confirmation (5 pts) ──

  if (fiveMinute.rsi14 !== null && fiveMinute.rsi14 >= 45 && fiveMinute.rsi14 <= 65 && isRSIRising(fiveMinute)) {
    buyScore.indicatorConfirmation += 2;
    reasons.push('RSI confirms (45-65 and rising)');
  }

  if (isMACDBullish(fiveMinute)) {
    buyScore.indicatorConfirmation += 2;
    reasons.push('MACD confirms bullish');
  }

  if (fiveMinute.ema21 !== null && latest.close > fiveMinute.ema21) {
    buyScore.indicatorConfirmation += 1;
    reasons.push('EMA alignment confirms');
  }

  if (fiveMinute.rsi14 !== null && fiveMinute.rsi14 > 70) {
    hardFilterFailed = true;
    warnings.push('Hard filter: RSI is too high to chase');
  }

  // ── Sell Score Breakdown ──

  if (latestFiveMinuteSwingLow !== null && price < latestFiveMinuteSwingLow.price) {
    sellBreakdown.structureWeakness += 10;
  }
  if (fiveMinute.ema9 !== null && fiveMinute.ema21 !== null && fiveMinute.ema9 < fiveMinute.ema21) {
    sellBreakdown.structureWeakness += 5;
  }
  if (fifteenMinute.ema9 !== null && fifteenMinute.ema21 !== null && fifteenMinute.ema9 < fifteenMinute.ema21) {
    sellBreakdown.structureWeakness += 5;
  }
  if (price < (fifteenMinute.ema50 ?? 0)) {
    sellBreakdown.structureWeakness += 5;
  }
  if (oneHourBearish) {
    sellBreakdown.structureWeakness += 10;
  }

  if (latestFiveMinuteSwingHigh !== null && latest.high > latestFiveMinuteSwingHigh.price && latest.close < latestFiveMinuteSwingHigh.price) {
    sellBreakdown.liquidityRejection += 10;
  }
  if (fiveMinute.resistance !== null && price >= fiveMinute.resistance * 0.995) {
    sellBreakdown.liquidityRejection += 5;
  }
  if (hasLargeUpperWick(latest)) {
    sellBreakdown.liquidityRejection += 5;
  }

  if (fiveMinute.rsi14 !== null && fiveMinute.previousRSI14 !== null && fiveMinute.rsi14 > 70 && fiveMinute.rsi14 < fiveMinute.previousRSI14) {
    sellBreakdown.momentumWeakness += 7;
    warnings.push('RSI is falling from overbought');
  }
  if (isMACDBearish(fiveMinute)) {
    sellBreakdown.momentumWeakness += 7;
  }
  if (isBearishCandle(latest) && volumeAboveAverage(fiveMinute)) {
    sellBreakdown.momentumWeakness += 6;
  }

  if (atrRatioVal !== null && atrRatioVal > 2.5) {
    sellBreakdown.volatilityRisk += 8;
  }
  if (isLargeBearishCandle(latest, fiveMinuteCandles)) {
    sellBreakdown.volatilityRisk += 7;
  }

  if (price >= quote.target1) {
    sellBreakdown.exitRisk += 10;
  }
  if (price <= quote.stopLoss) {
    sellBreakdown.exitRisk += 20;
    warnings.push('Stop loss level is hit');
  }
  if (quote.rewardRisk < 2) {
    sellBreakdown.exitRisk += 5;
  }

  let sellScore = sellTotal(sellBreakdown);

  if (targetHit) {
    sellScore = 100;
    warnings.push('Hard exit: target hit');
  } else if (stopLossHit) {
    sellScore = 100;
    warnings.push('Hard exit: stop loss hit');
  } else {
    sellScore = Math.min(sellScore, 100);
  }

  const regime = detectMarketRegime(
    atrRatioVal,
    fifteenMinuteStructure,
    fiveMinuteCandles,
    price,
    fifteenMinute
  );
  if (regime === 'Volatile / Choppy') {
    hardFilterFailed = true;
    warnings.push('Hard filter: market is choppy — avoid trading');
  } else if (regime === 'Ranging') {
    warnings.push('Market is ranging — trend signals may underperform');
  } else if (regime === 'Quiet / Low Activity') {
    warnings.push('Market is quiet — low participation may cause false signals');
  }

  const backtest = estimateBacktestProbability(
    fiveMinuteCandles,
    fifteenMinuteCandles,
    totalScore(buyScore),
    quote.rewardRisk,
    feeAndSpreadPercent
  );

  if (backtest.expectedValueR !== null && backtest.total >= 10 && backtest.expectedValueR <= 0 && totalScore(buyScore) >= 75) {
    hardFilterFailed = true;
    warnings.push('Hard filter: backtested expectancy is not positive');
  }

  const decisionVal = makeDecision(totalScore(buyScore), sellScore, hardFilterFailed);
  const marketStateVal = determineMarketState(fifteenMinuteStructure, buyScore.marketStructure, sellScore);
  const setupTypeVal = determineSetupType(
    buyScore.liquidity >= 10,
    latestFiveMinuteSwingHigh !== null ? price > latestFiveMinuteSwingHigh.price : false,
    buyScore.indicatorConfirmation
  );

  const bias: TimeframeBias = determineBias(oneHourStructure, fourHourStructure, oneHour, fourHour);
  const confidence = calculateConfidence(totalScore(buyScore), backtest);

  const trailingStop = calculateTrailingStop(
    price,
    quoteEntryPrice,
    quote.stopLoss,
    quote.breakevenPrice,
    quote.target1,
    quote.target2,
    latestFiveMinuteSwingLow,
    fiveMinute.ema9,
    hasActivePosition
  );

  const confluenceWarning = checkConfluence(normalTotal(normalBuyScore), totalScore(buyScore));

  return {
    symbol,
    price,
    decision: decisionVal,
    risk: riskLevel(totalScore(buyScore), warnings),
    buyScore,
    normalBuyScore,
    sellScoreBreakdown: sellBreakdown,
    sellScore,
    entryPrice: price,
    breakevenPrice: quote.breakevenPrice,
    stopLoss: quote.stopLoss,
    target1: quote.target1,
    target2: quote.target2,
    rewardRisk: quote.rewardRisk,
    suggestedPositionSize: suggestedPositionSizeVal,
    suggestedPositionValue,
    accountRiskAmount,
    accountRiskPercent: Number.isFinite(accountRiskPercent) ? accountRiskPercent : 0,
    positionRiskPercent,
    reasons: reasons.length > 0 ? reasons : ['Market data loaded, but conditions are not aligned yet'],
    warnings,
    fiveMinute,
    fifteenMinute,
    oneHour,
    fourHour,
    bias,
    confidence,
    marketState: marketStateVal,
    marketRegime: regime,
    setupType: setupTypeVal,
    backtest,
    trailingStop,
    confluenceWarning,
  };
}

// ── Trade Quote ──────────────────────────────────────────────

export function calculateTradeQuote(
  investmentAmount: number,
  entryPrice: number,
  feeAndSpreadPercent: number,
  slippagePercent: number = defaultSlippagePercent,
  structureStopLoss: number | null = null,
  structureTarget1: number | null = null,
  structureTarget2: number | null = null
): TradeQuote {
  if (entryPrice <= 0) {
    return {
      investmentAmount,
      entryPrice,
      feeAndSpreadPercent,
      slippagePercent,
      breakevenPrice: 0,
      target1: 0,
      target2: 0,
      stopLoss: 0,
      rewardRisk: 0,
    };
  }

  const costPercent = feeAndSpreadPercent / 100;
  const slippageMultiplier = 1 + slippagePercent / 100;
  const adjustedEntry = entryPrice * slippageMultiplier;
  const breakeven = adjustedEntry * (1 + costPercent);

  let stopLoss: number;
  if (structureStopLoss !== null && structureStopLoss < adjustedEntry) {
    stopLoss = structureStopLoss * (1 - 0.001);
  } else {
    stopLoss = adjustedEntry * 0.985;
  }

  let target1: number;
  if (structureTarget1 !== null && structureTarget1 > adjustedEntry) {
    target1 = structureTarget1;
  } else {
    target1 = adjustedEntry * 1.015;
  }

  let target2: number;
  if (structureTarget2 !== null && structureTarget2 > adjustedEntry) {
    target2 = structureTarget2;
  } else {
    target2 = adjustedEntry * 1.03;
  }

  const risk = adjustedEntry - stopLoss;
  const reward = target2 - adjustedEntry;
  const rewardRisk = risk > 0 ? reward / risk : 0;

  return {
    investmentAmount,
    entryPrice: adjustedEntry,
    feeAndSpreadPercent,
    slippagePercent,
    breakevenPrice: breakeven,
    target1,
    target2,
    stopLoss,
    rewardRisk,
  };
}

// ── Normal Buy Score ─────────────────────────────────────────

function calculateNormalBuyScore(
  fiveMinuteCandles: Candle[],
  fifteenMinuteCandles: Candle[],
  quote: TradeQuote,
  oneHourCandles: Candle[] = [],
): NormalScoreBreakdown {
  const latest = fiveMinuteCandles[fiveMinuteCandles.length - 1];
  if (latest === undefined) return { ...emptyNormalScore };

  const fifteenMinute = snapshot(fifteenMinuteCandles);
  const oneHour = snapshot(oneHourCandles);
  const oneHourStructure = getMarketStructure(oneHourCandles);
  const score: NormalScoreBreakdown = { ...emptyNormalScore };
  const price = latest.close;

  if (isBullishStructure(oneHourStructure)) {
    score.trend += 15;
  }
  if (oneHour.ema9 !== null && oneHour.ema21 !== null && oneHour.ema9 > oneHour.ema21) {
    score.trend += 10;
  }
  if (price > (fifteenMinute.ema50 ?? Infinity)) {
    score.trend += 5;
  }

  if (fifteenMinute.ema9 !== null && fifteenMinute.ema21 !== null && fifteenMinute.ema9 > fifteenMinute.ema21) {
    score.momentum += 10;
  }

  const fiveMinute = snapshot(fiveMinuteCandles);
  if (fiveMinute.rsi14 !== null && fiveMinute.rsi14 >= 45 && fiveMinute.rsi14 <= 65) {
    score.momentum += 5;
  }
  if (isRSIRising(fiveMinute)) {
    score.momentum += 3;
  }
  if (isMACDBullish(fiveMinute)) {
    score.momentum += 7;
  }

  if (volumeAboveAverage(fiveMinute)) {
    score.volume += 15;
  }

  const fifteenMinuteStructure = getMarketStructure(fifteenMinuteCandles);
  if (isBullishStructure(fifteenMinuteStructure)) {
    score.entry += 8;
  }
  if (fifteenMinute.ema21 !== null && price >= fifteenMinute.ema21 && price <= fifteenMinute.ema21 * 1.01) {
    score.entry += 4;
  }
  if (isBullishCandle(latest)) {
    score.entry += 3;
  }

  if (quote.rewardRisk >= 2) {
    score.riskReward += 15;
  }

  return score;
}

// ── Backtest Estimation ──────────────────────────────────────

function estimateBacktestProbability(
  fiveMinuteCandles: Candle[],
  fifteenMinuteCandles: Candle[],
  currentBuyScore: number,
  rewardRisk: number,
  feeAndSpreadPercent: number
): BacktestEstimate {
  const forwardWindow = 24;
  if (fiveMinuteCandles.length <= 90 || fifteenMinuteCandles.length <= 60 || rewardRisk <= 0) {
    return unavailableBacktest;
  }

  let wins = 0;
  let total = 0;
  const minimumIndex = 60;
  const maximumIndex = fiveMinuteCandles.length - forwardWindow - 1;

  if (minimumIndex >= maximumIndex) return unavailableBacktest;

  for (let index = minimumIndex; index <= maximumIndex; index++) {
    const candidate = fiveMinuteCandles[index];
    const fiveHistory = fiveMinuteCandles.slice(0, index + 1);
    const fifteenHistory = fifteenMinuteCandles.filter(c => c.openTime <= candidate.openTime);
    if (fifteenHistory.length < 60) continue;

    const candidateScore = quickEnhancedBuyScore(
      fiveHistory,
      fifteenHistory,
      feeAndSpreadPercent
    );

    if (Math.abs(candidateScore - currentBuyScore) > 10 || candidateScore < 60) {
      continue;
    }

    total += 1;
    if (tradeWouldWin(candidate.close, fiveMinuteCandles.slice(index + 1, index + 1 + forwardWindow))) {
      wins += 1;
    }
  }

  if (total === 0) return unavailableBacktest;

  const probability = wins / total;
  const feeImpactR = feeAndSpreadPercent / 1.5;
  const expectedValueR = (probability * rewardRisk) - ((1 - probability) * 1) - feeImpactR;

  return {
    probability: probability * 100,
    wins,
    total,
    expectedValueR,
  };
}

function quickEnhancedBuyScore(
  fiveMinuteCandles: Candle[],
  fifteenMinuteCandles: Candle[],
  feeAndSpreadPercent: number
): number {
  const latest = fiveMinuteCandles[fiveMinuteCandles.length - 1];
  if (latest === undefined) return 0;

  const fiveMinute = snapshot(fiveMinuteCandles);
  const fifteenMinute = snapshot(fifteenMinuteCandles);
  const price = latest.close;
  const swingLow = latestSwingLow(fiveMinuteCandles);
  const quote = calculateTradeQuote(
    100_000,
    price,
    feeAndSpreadPercent,
    defaultSlippagePercent,
    swingLow?.price ?? null
  );
  const structure = getMarketStructure(fifteenMinuteCandles);
  const resistance = nearestSwingHighAbovePrice(fiveMinuteCandles, price);
  const riskPerUnit = Math.max(price - quote.stopLoss, 0);
  let score = 0;

  if (isBullishStructure(structure)) { score += 10; }
  if (price > (fifteenMinute.ema50 ?? Infinity)) { score += 5; }
  if (fifteenMinute.ema9 !== null && fifteenMinute.ema21 !== null && fifteenMinute.ema9 > fifteenMinute.ema21) { score += 5; }

  if (swingLow !== null && latest.low < swingLow.price && latest.close > swingLow.price) { score += 10; }
  if (resistance !== null) {
    if (resistance.price - price >= riskPerUnit * 2) { score += 5; }
    if (price < resistance.price * 0.995) { score += 5; }
  } else {
    score += 10;
  }

  const atrRatioVal = atrRatioFor(fiveMinuteCandles);
  if (atrRatioVal !== null) {
    if (atrRatioVal >= 0.8 && atrRatioVal <= 1.8) { score += 15; }
    else if ((atrRatioVal >= 0.5 && atrRatioVal < 0.8) || (atrRatioVal >= 1.8 && atrRatioVal <= 2.5)) { score += 8; }
  }

  const fiveMinuteVolumeRatio = volumeRatio(fiveMinute);
  if (fiveMinuteVolumeRatio !== null && fiveMinuteVolumeRatio >= 1.2) { score += 7; }
  if (feeAndSpreadPercent <= 1.0) { score += 3; }

  if (fiveMinute.rsi14 !== null && fiveMinute.rsi14 >= 45 && fiveMinute.rsi14 <= 65 && isRSIRising(fiveMinute)) { score += 5; }
  if (isMACDBullish(fiveMinute)) { score += 5; }
  if (fiveMinute.ema21 !== null && latest.close > fiveMinute.ema21) { score += 5; }
  else {
    const previous = fiveMinuteCandles.slice(0, -1)[fiveMinuteCandles.length - 2];
    if (previous !== undefined && price > previous.high) { score += 5; }
  }

  if (quote.rewardRisk >= 2) { score += 10; }
  if (swingLow !== null && quote.stopLoss < swingLow.price) { score += 5; }
  else if (quote.stopLoss < latest.low) { score += 5; }
  score += 5;

  return Math.min(score, 100);
}

function tradeWouldWin(entry: number, futureCandles: Candle[]): boolean {
  const stopLoss = entry * 0.985;
  const target = entry * 1.03;

  for (const candle of futureCandles) {
    if (candle.low <= stopLoss) return false;
    if (candle.high >= target) return true;
  }

  const lastClose = futureCandles[futureCandles.length - 1]?.close;
  if (lastClose === undefined) return false;
  return lastClose > entry * 1.005;
}

// ── Decision ─────────────────────────────────────────────────

function makeDecision(buyScore: number, sellScore: number, hardFilterFailed: boolean): SignalDecision {
  if (sellScore >= 80) return 'Sell / Exit';
  if (sellScore >= 65) return 'Consider Sell';
  if (hardFilterFailed) return 'No Trade';

  if (buyScore >= 85) return 'Strong Buy';
  if (buyScore >= 75) return 'Consider Buy';
  if (buyScore >= 60) return 'Wait';
  return 'No Trade';
}

// ── Risk Level ───────────────────────────────────────────────

function riskLevel(score: number, warnings: string[]): RiskLevel {
  if (warnings.some(w => w.startsWith('Hard filter'))) {
    return 'High';
  }

  if (score >= 80) return 'Low';
  if (score >= 60) return 'Medium';
  return 'High';
}

// ── Market State ──────────────────────────────────────────────

function determineMarketState(
  fifteenMinuteStructure: MarketStructure,
  marketStructureScore: number,
  sellScore: number
): MarketState {
  if (sellScore >= 65) return 'Transitioning';
  if (isBullishStructure(fifteenMinuteStructure)) return 'Bullish Trend';
  if (marketStructureScore >= 10) return 'Bullish Trend';
  if (isBearishStructure(fifteenMinuteStructure)) return 'Bearish Trend';
  return 'Ranging';
}

// ── Setup Type ───────────────────────────────────────────────

function determineSetupType(hasSweep: boolean, isBreakout: boolean, entryScore: number): SetupType {
  if (hasSweep && entryScore > 0) return 'Sweep & Reverse';
  if (isBreakout && entryScore > 0) return 'Breakout';
  if (entryScore > 0) return 'Pullback Entry';
  return 'No Clear Setup';
}

// ── Bias from Higher Timeframes ──────────────────────────────

function determineBias(
  oneHourStructure: MarketStructure,
  fourHourStructure: MarketStructure,
  oneHour: IndicatorSnapshot,
  _fourHour: IndicatorSnapshot
): TimeframeBias {
  let bullish = 0;
  let bearish = 0;

  if (isBullishStructure(fourHourStructure)) bullish += 2;
  if (isBearishStructure(fourHourStructure)) bearish += 2;

  if (isBullishStructure(oneHourStructure)) bullish += 2;
  if (isBearishStructure(oneHourStructure)) bearish += 2;

  if (oneHour.ema9 !== null && oneHour.ema21 !== null) {
    if (oneHour.ema9 > oneHour.ema21) bullish += 1;
    if (oneHour.ema9 < oneHour.ema21) bearish += 1;
  }

  if (oneHour.ema50 !== null) {
    if (oneHour.ema9 !== null && oneHour.ema9 > oneHour.ema50) bullish += 1;
    if (oneHour.ema9 !== null && oneHour.ema9 < oneHour.ema50) bearish += 1;
  }

  if (bullish > bearish + 1) return 'Bullish';
  if (bearish > bullish + 1) return 'Bearish';
  return 'Neutral';
}

// ── Confidence Calculation ────────────────────────────────────

function calculateConfidence(totalBuyScore: number, backtest: BacktestEstimate): number {
  let conf = totalBuyScore;

  if (backtest.expectedValueR !== null && backtest.expectedValueR > 0) {
    conf += 5;
  }

  if (backtest.probability !== null && backtest.probability < 0.4) {
    conf -= 10;
  }

  return Math.max(0, Math.min(100, Math.round(conf)));
}

// ── Candle helpers ────────────────────────────────────────────

function isBullishCandle(candle: Candle): boolean {
  return candle.close > candle.open;
}

function isBearishCandle(candle: Candle): boolean {
  return candle.close < candle.open;
}

function hasLargeUpperWick(candle: Candle): boolean {
  const body = Math.abs(candle.close - candle.open);
  const upperWick = candle.high - Math.max(candle.open, candle.close);
  return upperWick > Math.max(body, 0.0001) * 1.5;
}

function isLargeBearishCandle(candle: Candle, candles: Candle[]): boolean {
  if (!isBearishCandle(candle)) return false;
  const ranges = candles.slice(-20).map(c => c.high - c.low);
  if (ranges.length === 0) return false;
  const averageRange = ranges.reduce((a, b) => a + b, 0) / ranges.length;
  return candle.high - candle.low > averageRange * 1.5;
}

// ── Risk / Position Sizing ───────────────────────────────────

function estimatedRiskAmount(investmentAmount: number, entryPrice: number, stopLoss: number): number {
  if (entryPrice <= 0 || stopLoss >= entryPrice) return Infinity;
  const quantity = investmentAmount / entryPrice;
  return quantity * (entryPrice - stopLoss);
}

function suggestedPositionSize(accountRiskAmount: number, entryPrice: number, stopLoss: number): number {
  const riskPerCoin = entryPrice - stopLoss;
  if (accountRiskAmount <= 0 || riskPerCoin <= 0) return 0;
  return accountRiskAmount / riskPerCoin;
}

// ── Swing Point Detection ────────────────────────────────────

function getMarketStructure(candles: Candle[]): MarketStructure {
  const highs = swingHighs(candles);
  const lows = swingLows(candles);

  return {
    latestHigh: highs.length > 0 ? highs[highs.length - 1] : null,
    previousHigh: highs.length > 1 ? highs[highs.length - 2] : null,
    latestLow: lows.length > 0 ? lows[lows.length - 1] : null,
    previousLow: lows.length > 1 ? lows[lows.length - 2] : null,
  };
}

function latestSwingLow(candles: Candle[]): SwingPoint | null {
  const allButLast = candles.slice(0, -1);
  const lows = swingLows(allButLast);
  return lows.length > 0 ? lows[lows.length - 1] : null;
}

function latestSwingHigh(candles: Candle[]): SwingPoint | null {
  const allButLast = candles.slice(0, -1);
  const highs = swingHighs(allButLast);
  return highs.length > 0 ? highs[highs.length - 1] : null;
}

function nearestSwingHighAbovePrice(candles: Candle[], price: number): SwingPoint | null {
  const highs = swingHighs(candles).filter(sp => sp.price > price);
  if (highs.length === 0) return null;
  return highs.reduce((min, sp) => sp.price < min.price ? sp : min, highs[0]);
}

export function latestSwingLowPublic(fiveMinuteCandles: Candle[]): number | null {
  return latestSwingLow(fiveMinuteCandles)?.price ?? null;
}

export function nearestSwingHighAbovePricePublic(fiveMinuteCandles: Candle[], price: number): number | null {
  return nearestSwingHighAbovePrice(fiveMinuteCandles, price)?.price ?? null;
}

function swingHighs(candles: Candle[], radius: number = 4): SwingPoint[] {
  if (candles.length < radius * 2 + 1) return [];
  const result: SwingPoint[] = [];

  for (let index = radius; index < candles.length - radius; index++) {
    const high = candles[index].high;
    let isSwing = true;
    for (let nearbyIndex = index - radius; nearbyIndex <= index + radius; nearbyIndex++) {
      if (nearbyIndex === index) continue;
      if (high <= candles[nearbyIndex].high) {
        isSwing = false;
        break;
      }
    }
    if (isSwing) {
      result.push({ index, price: high });
    }
  }

  return result;
}

function swingLows(candles: Candle[], radius: number = 4): SwingPoint[] {
  if (candles.length < radius * 2 + 1) return [];
  const result: SwingPoint[] = [];

  for (let index = radius; index < candles.length - radius; index++) {
    const low = candles[index].low;
    let isSwing = true;
    for (let nearbyIndex = index - radius; nearbyIndex <= index + radius; nearbyIndex++) {
      if (nearbyIndex === index) continue;
      if (low >= candles[nearbyIndex].low) {
        isSwing = false;
        break;
      }
    }
    if (isSwing) {
      result.push({ index, price: low });
    }
  }

  return result;
}

// ── ATR Ratio ────────────────────────────────────────────────

function atrRatioFor(candles: Candle[]): number | null {
  const values = atrValues(candles, 14).filter((v): v is number => v !== null);
  const current = values[values.length - 1];
  if (current === undefined || current <= 0) return null;
  const baseline = values.slice(-100);
  const med = median(baseline);
  if (med === null || med <= 0) return null;
  return current / med;
}

function atrValues(candles: Candle[], period: number): (number | null)[] {
  if (candles.length <= period) {
    return Array(candles.length).fill(null);
  }

  const trueRanges: number[] = new Array(candles.length).fill(0);
  for (let index = 0; index < candles.length; index++) {
    if (index === 0) {
      trueRanges[index] = candles[index].high - candles[index].low;
    } else {
      const highLow = candles[index].high - candles[index].low;
      const highPreviousClose = Math.abs(candles[index].high - candles[index - 1].close);
      const lowPreviousClose = Math.abs(candles[index].low - candles[index - 1].close);
      trueRanges[index] = Math.max(highLow, highPreviousClose, lowPreviousClose);
    }
  }

  const result: (number | null)[] = new Array(candles.length).fill(null);
  for (let index = period - 1; index < trueRanges.length; index++) {
    let sum = 0;
    for (let i = index - period + 1; i <= index; i++) {
      sum += trueRanges[i];
    }
    result[index] = sum / period;
  }
  return result;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle];
}

// ── Market Regime Detection ──────────────────────────────────

function detectMarketRegime(
  atrRatio: number | null,
  fifteenMinuteStructure: MarketStructure,
  _fiveMinuteCandles: Candle[],
  _price: number,
  fifteenMinute: IndicatorSnapshot
): MarketRegime {
  if (atrRatio !== null && atrRatio < 0.5) {
    return 'Quiet / Low Activity';
  }

  if (atrRatio !== null && atrRatio > 3.0) {
    return 'Volatile / Choppy';
  }

  const isTrending = isBullishStructure(fifteenMinuteStructure) || isBearishStructure(fifteenMinuteStructure);
  let emaSpread: number;
  if (fifteenMinute.ema9 !== null && fifteenMinute.ema50 !== null && fifteenMinute.ema50 > 0) {
    emaSpread = Math.abs(fifteenMinute.ema9 - fifteenMinute.ema50) / fifteenMinute.ema50;
  } else {
    emaSpread = 0;
  }

  if (!isTrending && emaSpread < 0.003) {
    return 'Ranging';
  }

  if (atrRatio !== null && atrRatio > 2.5) {
    return 'Volatile / Choppy';
  }

  if (isTrending) {
    return 'Trending';
  }

  return 'Ranging';
}

// ── Trailing Stop Calculation ────────────────────────────────

function calculateTrailingStop(
  price: number,
  entryPrice: number,
  _stopLoss: number,
  breakevenPrice: number,
  target1: number,
  _target2: number,
  fiveMinuteSwingLow: SwingPoint | null,
  fiveMinuteEMA9: number | null,
  hasActivePosition: boolean
): TrailingStopState {
  const state: TrailingStopState = {
    activeTrailingStop: null,
    target1Hit: false,
    movedToBreakeven: false,
  };

  if (!hasActivePosition || price <= entryPrice) {
    return state;
  }

  if (price >= target1) {
    state.target1Hit = true;
    state.movedToBreakeven = true;
    state.activeTrailingStop = breakevenPrice;
  }

  if (state.target1Hit) {
    const ema9Stop = fiveMinuteEMA9 ?? price * 0.995;
    const swingLowStop = fiveMinuteSwingLow?.price ?? price * 0.99;

    const trailingCandidate = Math.max(ema9Stop, swingLowStop);

    if (trailingCandidate > (state.activeTrailingStop ?? 0)) {
      state.activeTrailingStop = trailingCandidate;
    }
  }

  return state;
}

// ── Normal/Pro Confluence Check ──────────────────────────────

function checkConfluence(normalScore: number, proScore: number): string | null {
  if (normalScore >= 75 && proScore < 60) {
    return 'Normal signal says buy but Pro signal disagrees — be cautious';
  }
  if (proScore >= 75 && normalScore < 60) {
    return 'Pro signal says buy but Normal signal disagrees — mixed evidence';
  }
  if (Math.abs(normalScore - proScore) >= 30) {
    return 'Normal and Pro signals differ significantly — wait for clarity';
  }
  return null;
}