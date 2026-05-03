// ============================================================
// Indicator Engine — Ported from frontend IndicatorEngine.ts
// Pure calculation, no browser dependencies
// ============================================================

import type { Candle, IndicatorSnapshot } from './types.js';
import { emptyIndicatorSnapshot } from './types.js';

export function ema(values: number[], period: number): (number | null)[] {
  if (period <= 0 || values.length < period) {
    return Array(values.length).fill(null);
  }

  const result: (number | null)[] = Array(values.length).fill(null);
  const multiplier = 2.0 / (period + 1);
  const seed = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result[period - 1] = seed;

  let previousEMA = seed;
  for (let i = period; i < values.length; i++) {
    const currentEMA = (values[i] - previousEMA) * multiplier + previousEMA;
    result[i] = currentEMA;
    previousEMA = currentEMA;
  }

  return result;
}

function rsiValue(avgGain: number, avgLoss: number): number {
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export function rsi(values: number[], period: number = 14): (number | null)[] {
  if (values.length <= period) {
    return Array(values.length).fill(null);
  }

  const result: (number | null)[] = Array(values.length).fill(null);
  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const change = values[i] - values[i - 1];
    if (change >= 0) gains += change;
    else losses += Math.abs(change);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;
  result[period] = rsiValue(avgGain, avgLoss);

  if (values.length <= period + 1) return result;

  for (let i = period + 1; i < values.length; i++) {
    const change = values[i] - values[i - 1];
    const gain = Math.max(change, 0);
    const loss = Math.max(-change, 0);
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    result[i] = rsiValue(avgGain, avgLoss);
  }

  return result;
}

export function macd(values: number[]): { macd: (number | null)[]; signal: (number | null)[] } {
  const ema12 = ema(values, 12);
  const ema26 = ema(values, 26);
  const macdLine: (number | null)[] = Array(values.length).fill(null);

  for (let i = 0; i < values.length; i++) {
    if (ema12[i] !== null && ema26[i] !== null) {
      macdLine[i] = ema12[i]! - ema26[i]!;
    }
  }

  const compactMACD = macdLine.filter((v): v is number => v !== null);
  const compactSignal = ema(compactMACD, 9);
  const signalLine: (number | null)[] = Array(values.length).fill(null);
  let compactIdx = 0;

  for (let i = 0; i < macdLine.length; i++) {
    if (macdLine[i] !== null) {
      if (compactIdx < compactSignal.length) {
        signalLine[i] = compactSignal[compactIdx];
      }
      compactIdx++;
    }
  }

  return { macd: macdLine, signal: signalLine };
}

function previousValue(values: (number | null)[]): number | null {
  const compact = values.filter((v): v is number => v !== null);
  return compact.length >= 2 ? compact[compact.length - 2] : null;
}

export function snapshot(candles: Candle[]): IndicatorSnapshot {
  if (candles.length === 0) return { ...emptyIndicatorSnapshot };

  const closes = candles.map(c => c.close);
  const volumes = candles.map(c => c.volume);
  const latest = candles[candles.length - 1];

  const ema9Values = ema(closes, 9);
  const ema21Values = ema(closes, 21);
  const ema50Values = ema(closes, 50);
  const rsiValues = rsi(closes);
  const macdValues = macd(closes);

  const avgVol20: number | null = volumes.length >= 20
    ? volumes.slice(-20).reduce((a, b) => a + b, 0) / 20
    : null;

  const recent = candles.slice(-20);
  const support = Math.min(...recent.map(c => c.low));
  const resistance = Math.max(...recent.map(c => c.high));

  return {
    ema9: ema9Values[ema9Values.length - 1] ?? null,
    ema21: ema21Values[ema21Values.length - 1] ?? null,
    ema50: ema50Values[ema50Values.length - 1] ?? null,
    rsi14: rsiValues[rsiValues.length - 1] ?? null,
    previousRSI14: previousValue(rsiValues),
    macd: macdValues.macd[macdValues.macd.length - 1] ?? null,
    macdSignal: macdValues.signal[macdValues.signal.length - 1] ?? null,
    previousMACD: previousValue(macdValues.macd),
    previousMACDSignal: previousValue(macdValues.signal),
    averageVolume20: avgVol20,
    currentVolume: latest.volume,
    support,
    resistance,
  };
}