// ============================================================
// Signal Engine — Ported from SignalEngine.swift
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
} from './types';

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
} from './types';

import { snapshot } from './IndicatorEngine';

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
    quote
  );

  const fifteenMinuteStructure = getMarketStructure(fifteenMinuteCandles);
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

  // ── Market Structure scoring ──

  if (isBullishStructure(fifteenMinuteStructure)) {
    buyScore.marketStructure += 10;
    reasons.push('15m structure is bullish with higher high and higher low');
  }

  if (price > (fifteenMinute.ema50 ?? Infinity)) {
    buyScore.marketStructure += 5;
    reasons.push('15m price is above EMA50');
  }

  if (fifteenMinute.ema9 !== null && fifteenMinute.ema21 !== null && fifteenMinute.ema9 > fifteenMinute.ema21) {
    buyScore.marketStructure += 5;
    reasons.push('15m EMA9 is above EMA21');
  }

  // ── Liquidity scoring ──

  if (latestFiveMinuteSwingLow !== null && latest.low < latestFiveMinuteSwingLow.price && latest.close > latestFiveMinuteSwingLow.price) {
    buyScore.liquidity += 10;
    reasons.push('price swept a recent low and reclaimed it');
  }

  const riskPerUnit = Math.max(price - quote.stopLoss, 0);
  if (nearestResistance !== null) {
    if (nearestResistance.price - price >= riskPerUnit * 2) {
      buyScore.liquidity += 5;
      reasons.push('nearest resistance leaves at least 2R of room');
    }

    if (price < nearestResistance.price * 0.995) {
      buyScore.liquidity += 5;
      reasons.push('price is not directly under resistance');
    }
  } else {
    buyScore.liquidity += 10;
    reasons.push('no nearby swing resistance is blocking the setup');
  }

  const depthImbalance = microDepthImbalance(marketMicrostructure);
  if (depthImbalance !== null) {
    if (depthImbalance > 0.05) {
      buyScore.liquidity = Math.min(20, buyScore.liquidity + 5);
      reasons.push('order book depth has stronger bid support');
    } else if (depthImbalance < -0.2) {
      warnings.push('Order book depth shows ask-side pressure');
    }
  }

  // ── Volatility scoring ──

  if (atrRatioVal !== null) {
    if (atrRatioVal >= 0.8 && atrRatioVal <= 1.8) {
      buyScore.volatility += 15;
      reasons.push('ATR volatility is in the tradable range');
    } else if ((atrRatioVal >= 0.5 && atrRatioVal < 0.8) || (atrRatioVal >= 1.8 && atrRatioVal <= 2.5)) {
      buyScore.volatility += 8;
      reasons.push('ATR volatility is acceptable but imperfect');
    } else if (atrRatioVal < 0.5) {
      hardFilterFailed = true;
      warnings.push('Hard filter: volatility is too low');
    } else if (atrRatioVal >= 3.0) {
      hardFilterFailed = true;
      warnings.push('Hard filter: volatility is too extreme');
    } else {
      warnings.push('Volatility is elevated');
    }
  } else {
    warnings.push('ATR volatility needs more candles');
  }

  // ── Session scoring ──

  const fiveMinuteVolumeRatio = volumeRatio(fiveMinute);
  if (fiveMinuteVolumeRatio !== null && fiveMinuteVolumeRatio >= 1.2) {
    buyScore.session += 7;
    reasons.push('market participation is active');
  }

  const spreadPct = microSpreadPercent(marketMicrostructure);
  if (spreadPct !== null) {
    if (spreadPct <= 0.05) {
      buyScore.session += 3;
      reasons.push('live bid/ask spread is acceptable');
    } else {
      warnings.push('Live bid/ask spread is wide');
    }
  } else if (feeAndSpreadPercent <= 1.0) {
    buyScore.session += 3;
    reasons.push('estimated spread and fees are acceptable');
  } else {
    warnings.push('Estimated spread and fees are high');
  }

  // ── Entry Confirmation scoring ──

  if (fiveMinute.rsi14 !== null && fiveMinute.rsi14 >= 45 && fiveMinute.rsi14 <= 65 && isRSIRising(fiveMinute)) {
    buyScore.entryConfirmation += 5;
    reasons.push('RSI is in range and rising');
  }

  if (isMACDBullish(fiveMinute)) {
    buyScore.entryConfirmation += 5;
    reasons.push('MACD is bullish on 5m');
  }

  if (fiveMinute.ema21 !== null && latest.close > fiveMinute.ema21) {
    buyScore.entryConfirmation += 5;
    reasons.push('5m candle closed above EMA21');
  } else {
    const previous = fiveMinuteCandles.slice(0, -1)[fiveMinuteCandles.length - 2];
    if (previous !== undefined && price > previous.high) {
      buyScore.entryConfirmation += 5;
      reasons.push('price broke the previous 5m candle high');
    }
  }

  // ── Risk Management scoring ──

  if (quote.rewardRisk >= 2) {
    buyScore.riskManagement += 10;
    reasons.push('reward/risk is at least 2:1');
  }

  if (latestFiveMinuteSwingLow !== null && quote.stopLoss < latestFiveMinuteSwingLow.price) {
    buyScore.riskManagement += 5;
    reasons.push('stop loss is below recent structure');
  } else if (quote.stopLoss < latest.low) {
    buyScore.riskManagement += 5;
    reasons.push('stop loss is below the current candle low');
  }

  if (accountRiskPercent <= 2) {
    buyScore.riskManagement += 5;
    reasons.push('position size risks no more than 2% of demo balance');
  } else {
    hardFilterFailed = true;
    warnings.push('Hard filter: position risk is above 2% of demo balance');
  }

  // ── Sell Score Breakdown (5 categories) ──

  // A. Structure Weakness (max 25)
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

  // B. Liquidity Rejection (max 20)
  if (latestFiveMinuteSwingHigh !== null && latest.high > latestFiveMinuteSwingHigh.price && latest.close < latestFiveMinuteSwingHigh.price) {
    sellBreakdown.liquidityRejection += 10;
  }
  if (fiveMinute.resistance !== null && price >= fiveMinute.resistance * 0.995) {
    sellBreakdown.liquidityRejection += 5;
  }
  if (hasLargeUpperWick(latest)) {
    sellBreakdown.liquidityRejection += 5;
  }

  // C. Momentum Weakness (max 20)
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

  // D. Volatility Risk (max 15)
  if (atrRatioVal !== null && atrRatioVal > 2.5) {
    sellBreakdown.volatilityRisk += 8;
  }
  if (isLargeBearishCandle(latest, fiveMinuteCandles)) {
    sellBreakdown.volatilityRisk += 7;
  }

  // E. Exit Risk (max 20)
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

  const filterResult = applyHardFilters(
    buyScore.marketStructure,
    buyScore.entryConfirmation,
    quote,
    fiveMinute
  );
  hardFilterFailed = hardFilterFailed || filterResult.hardFilterFailed;
  warnings = warnings.concat(filterResult.warnings);

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
    buyScore.entryConfirmation
  );

  // ── Market Regime Detection ──

  const regime = detectMarketRegime(
    atrRatioVal,
    fifteenMinuteStructure,
    fiveMinuteCandles,
    price,
    fifteenMinute
  );
  if (regime === 'Ranging') {
    warnings.push('Market is ranging — trend signals may underperform');
  } else if (regime === 'Volatile / Choppy') {
    warnings.push('Market is volatile/choppy — increased risk of whipsaw');
  } else if (regime === 'Quiet / Low Activity') {
    warnings.push('Market is quiet — low participation may cause false signals');
  }

  // ── Trailing Stop Logic ──

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

  // ── Normal/Pro Confluence Check ──

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

  // Structure-based stop loss: use swing low if available, otherwise fallback to 1.5%
  let stopLoss: number;
  if (structureStopLoss !== null && structureStopLoss < adjustedEntry) {
    // Place stop just below the swing low with a small buffer
    stopLoss = structureStopLoss * (1 - 0.001);
  } else {
    stopLoss = adjustedEntry * 0.985;
  }

  // Structure-based targets: use swing high if available, otherwise fallback to percentages
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
  quote: TradeQuote
): NormalScoreBreakdown {
  const latest = fiveMinuteCandles[fiveMinuteCandles.length - 1];
  if (latest === undefined) return { ...emptyNormalScore };

  const fiveMinute = snapshot(fiveMinuteCandles);
  const fifteenMinute = snapshot(fifteenMinuteCandles);
  const score: NormalScoreBreakdown = { ...emptyNormalScore };
  const price = latest.close;

  if (price > (fifteenMinute.ema50 ?? Infinity)) {
    score.trend += 15;
  }

  if (fifteenMinute.ema9 !== null && fifteenMinute.ema21 !== null && fifteenMinute.ema9 > fifteenMinute.ema21) {
    score.trend += 15;
  }

  if (fiveMinute.rsi14 !== null && fiveMinute.rsi14 >= 45 && fiveMinute.rsi14 <= 65) {
    score.momentum += 10;
  }

  if (isRSIRising(fiveMinute)) {
    score.momentum += 5;
  }

  if (isMACDBullish(fiveMinute)) {
    score.momentum += 10;
  }

  if (volumeAboveAverage(fiveMinute)) {
    score.volume += 15;
  }

  if (fiveMinute.ema21 !== null && price >= fiveMinute.ema21 && price <= fiveMinute.ema21 * 1.01) {
    score.entry += 5;
  }

  if (isBullishCandle(latest)) {
    score.entry += 5;
  }

  const previous = fiveMinuteCandles.slice(0, -1)[fiveMinuteCandles.length - 2];
  if (previous !== undefined && price > previous.high) {
    score.entry += 5;
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

  // After forward window expires, count as win only if clearly profitable
  const lastClose = futureCandles[futureCandles.length - 1]?.close;
  if (lastClose === undefined) return false;
  return lastClose > entry * 1.005; // Must be at least 0.5% above entry
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

// ── Hard Filters ─────────────────────────────────────────────

function applyHardFilters(
  marketStructureScore: number,
  entryConfirmationScore: number,
  quote: TradeQuote,
  fiveMinute: IndicatorSnapshot
): { hardFilterFailed: boolean; warnings: string[] } {
  let hardFilterFailed = false;
  const warnings: string[] = [];

  if (marketStructureScore < 10) {
    hardFilterFailed = true;
    warnings.push('Hard filter: 15m market state is not bullish');
  }

  if (entryConfirmationScore === 0) {
    hardFilterFailed = true;
    warnings.push('Hard filter: 5m entry setup is not valid');
  }

  if (fiveMinute.rsi14 !== null && fiveMinute.rsi14 > 70) {
    hardFilterFailed = true;
    warnings.push('Hard filter: RSI is too high to chase');
  }

  if (quote.rewardRisk < 2) {
    hardFilterFailed = true;
    warnings.push('Hard filter: reward/risk is below 2:1');
  }

  return { hardFilterFailed, warnings };
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

// ── Public helpers for structure-based stops ──

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
  // Quiet: very low volatility
  if (atrRatio !== null && atrRatio < 0.5) {
    return 'Quiet / Low Activity';
  }

  // Volatile/Choppy: extreme volatility
  if (atrRatio !== null && atrRatio > 3.0) {
    return 'Volatile / Choppy';
  }

  // Ranging: price bouncing between support and resistance without clear HH/HL or LH/LL
  const isTrending = isBullishStructure(fifteenMinuteStructure) || isBearishStructure(fifteenMinuteStructure);
  let emaSpread: number;
  if (fifteenMinute.ema9 !== null && fifteenMinute.ema50 !== null && fifteenMinute.ema50 > 0) {
    emaSpread = Math.abs(fifteenMinute.ema9 - fifteenMinute.ema50) / fifteenMinute.ema50;
  } else {
    emaSpread = 0;
  }

  // If EMAs are flat (spread < 0.003 = 0.3%) and no clear structure, market is ranging
  if (!isTrending && emaSpread < 0.003) {
    return 'Ranging';
  }

  // If ATR ratio is in the choppy zone (2.5-3.0), call it volatile
  if (atrRatio !== null && atrRatio > 2.5) {
    return 'Volatile / Choppy';
  }

  // If structure is clear and ATR is reasonable, trending
  if (isTrending) {
    return 'Trending';
  }

  // Default: ranging if no clear trend
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

  // Once price reaches Target 1, move stop to breakeven
  if (price >= target1) {
    state.target1Hit = true;
    state.movedToBreakeven = true;
    state.activeTrailingStop = breakevenPrice;
  }

  // Once Target 1 is hit, trail behind EMA9 or recent swing low
  if (state.target1Hit) {
    const ema9Stop = fiveMinuteEMA9 ?? price * 0.995;
    const swingLowStop = fiveMinuteSwingLow?.price ?? price * 0.99;

    // Use the higher of EMA9 or swing low as the trailing stop
    const trailingCandidate = Math.max(ema9Stop, swingLowStop);

    // Only move the stop up, never down
    if (trailingCandidate > (state.activeTrailingStop ?? 0)) {
      state.activeTrailingStop = trailingCandidate;
    }
  }

  return state;
}

// ── Normal/Pro Confluence Check ──────────────────────────────

function checkConfluence(normalScore: number, proScore: number): string | null {
  // Strong disagreement: Normal says buy but Pro says no trade
  if (normalScore >= 75 && proScore < 60) {
    return 'Normal signal says buy but Pro signal disagrees — be cautious';
  }
  // Strong disagreement: Pro says buy but Normal says no trade
  if (proScore >= 75 && normalScore < 60) {
    return 'Pro signal says buy but Normal signal disagrees — mixed evidence';
  }
  // Moderate disagreement
  if (Math.abs(normalScore - proScore) >= 30) {
    return 'Normal and Pro signals differ significantly — wait for clarity';
  }
  return null;
}