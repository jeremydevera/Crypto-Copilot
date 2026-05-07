// ============================================================
// Auto-Trade Service — Backend paper trading automation
// Runs every 30s after signal refresh
// Checks users with auto_trade_enabled and executes paper trades
// ============================================================

import type { TradingSignal } from '../engine/types.js';
import { supabaseAdmin } from '../lib/supabase.js';

type UserConfig = {
  user_id: string;
  symbol: string | null;
  auto_trade_enabled: boolean | null;
  investment_amount: number | null;
  risk_percent: number | null;
  max_trades_per_day: number | null;
  cooldown_minutes: number | null;
};

const BUY_DECISIONS = new Set(['Strong Buy', 'Consider Buy']);
const SELL_DECISIONS = new Set(['Sell / Exit', 'Consider Sell']);

export async function processAutoTrades(
  symbol: string,
  signal: TradingSignal,
  options: {
    signalAgeSeconds?: number;
  } = {},
): Promise<void> {
  const normalizedSymbol = symbol.toUpperCase();

  if (!signal || signal.price <= 0) {
    console.warn(`[AutoTrade] Skipping ${normalizedSymbol}: invalid signal price`);
    return;
  }

  if (typeof options.signalAgeSeconds === 'number' && options.signalAgeSeconds > 90) {
    console.warn(`[AutoTrade] Skipping ${normalizedSymbol}: stale signal age=${options.signalAgeSeconds}s`);
    return;
  }

  const { data: configs, error } = await supabaseAdmin
    .from('user_configs')
    .select('*')
    .eq('auto_trade_enabled', true)
    .eq('symbol', normalizedSymbol);

  if (error) {
    console.error('[AutoTrade] Failed to load user configs:', error.message);
    return;
  }

  if (!configs || configs.length === 0) {
    return; // No users with auto-trade enabled for this symbol
  }

  for (const config of configs as UserConfig[]) {
    try {
      await processUserAutoTrade(config, signal);
    } catch (error: any) {
      console.error(`[AutoTrade] Failed for user=${config.user_id}:`, error.message);
    }
  }
}

async function processUserAutoTrade(
  config: UserConfig,
  signal: TradingSignal,
): Promise<void> {
  const userId = config.user_id;
  const symbol = (config.symbol ?? signal.symbol).toUpperCase();

  // Check for open position
  const { data: openPosition, error: openError } = await supabaseAdmin
    .from('paper_trades')
    .select('*')
    .eq('user_id', userId)
    .eq('symbol', symbol)
    .eq('status', 'open')
    .maybeSingle();

  if (openError) {
    throw openError;
  }

  if (openPosition) {
    if (shouldAutoSell(signal)) {
      await autoSell(config, signal, openPosition);
    }
    return;
  }

  if (shouldAutoBuy(signal)) {
    const allowed = await passesTradeLimits(config);
    if (!allowed) {
      console.log(`[AutoTrade] Trade limit/cooldown blocked buy for user=${userId}`);
      return;
    }

    await autoBuy(config, signal);
  }
}

function shouldAutoBuy(signal: TradingSignal): boolean {
  return (
    BUY_DECISIONS.has(signal.decision) &&
    signal.rewardRisk >= 2 &&
    signal.price > 0 &&
    signal.risk !== 'High'
  );
}

function shouldAutoSell(signal: TradingSignal): boolean {
  return (
    SELL_DECISIONS.has(signal.decision) &&
    signal.price > 0
  );
}

async function passesTradeLimits(config: UserConfig): Promise<boolean> {
  const userId = config.user_id;
  const maxTradesPerDay = Number(config.max_trades_per_day ?? 5);
  const cooldownMinutes = Number(config.cooldown_minutes ?? 15);

  const sinceStartOfDay = new Date();
  sinceStartOfDay.setHours(0, 0, 0, 0);

  const { count, error: countError } = await supabaseAdmin
    .from('trade_history')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('closed_at', sinceStartOfDay.toISOString());

  if (countError) {
    throw countError;
  }

  if ((count ?? 0) >= maxTradesPerDay) {
    return false;
  }

  const cooldownSince = new Date(Date.now() - cooldownMinutes * 60_000);

  const { data: recentTrade, error: recentError } = await supabaseAdmin
    .from('trade_history')
    .select('id, closed_at')
    .eq('user_id', userId)
    .gte('closed_at', cooldownSince.toISOString())
    .order('closed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (recentError) {
    throw recentError;
  }

  return !recentTrade;
}

async function autoBuy(
  config: UserConfig,
  signal: TradingSignal,
): Promise<void> {
  const userId = config.user_id;
  const symbol = (config.symbol ?? signal.symbol).toUpperCase();
  const investmentAmount = Number(config.investment_amount ?? 10_000);

  if (investmentAmount <= 0) {
    throw new Error('Invalid investment amount');
  }

  const entryPrice = signal.price;
  const quantity = investmentAmount / entryPrice;

  const { error } = await supabaseAdmin
    .from('paper_trades')
    .insert({
      user_id: userId,
      symbol,
      side: 'BUY',
      entry_price: entryPrice,
      quantity,
      invested_amount: investmentAmount,
      stop_loss: signal.stopLoss,
      take_profit1: signal.target1,
      take_profit2: signal.target2,
      status: 'open',
      entry_decision: signal.decision,
      entry_score: totalBuyScore(signal),
      entry_reward_risk: signal.rewardRisk,
      opened_at: new Date().toISOString(),
    });

  if (error) {
    throw error;
  }

  console.log(
    `[AutoTrade] PAPER BUY user=${userId} symbol=${symbol} price=${entryPrice} amount=${investmentAmount}`,
  );
}

async function autoSell(
  config: UserConfig,
  signal: TradingSignal,
  openPosition: any,
): Promise<void> {
  const userId = config.user_id;
  const symbol = (config.symbol ?? signal.symbol).toUpperCase();

  const entryPrice = Number(openPosition.entry_price);
  const exitPrice = signal.price;
  const quantity = Number(openPosition.quantity);
  const investedAmount = Number(openPosition.invested_amount ?? openPosition.entry_price * openPosition.quantity);

  const exitValue = quantity * exitPrice;
  const profitLoss = exitValue - investedAmount;
  const profitLossPercent =
    investedAmount > 0 ? (profitLoss / investedAmount) * 100 : 0;

  const openedAt = openPosition.opened_at
    ? new Date(openPosition.opened_at)
    : new Date();

  const closedAt = new Date();
  const durationMinutes =
    (closedAt.getTime() - openedAt.getTime()) / 60_000;

  const { error: historyError } = await supabaseAdmin
    .from('trade_history')
    .insert({
      user_id: userId,
      symbol,
      entry_price: entryPrice,
      exit_price: exitPrice,
      quantity,
      invested_amount: investedAmount,
      profit_loss: profitLoss,
      profit_loss_percent: profitLossPercent,
      entry_decision: openPosition.entry_decision,
      exit_decision: signal.decision,
      entry_score: openPosition.entry_score,
      exit_score: totalBuyScore(signal),
      entry_reward_risk: openPosition.entry_reward_risk,
      opened_at: openPosition.opened_at,
      closed_at: closedAt.toISOString(),
      duration_minutes: durationMinutes,
      source: 'backend_auto_trade',
    });

  if (historyError) {
    throw historyError;
  }

  const { error: updateError } = await supabaseAdmin
    .from('paper_trades')
    .update({
      exit_price: exitPrice,
      pnl: profitLoss,
      status: 'closed',
      closed_at: closedAt.toISOString(),
    })
    .eq('id', openPosition.id);

  if (updateError) {
    throw updateError;
  }

  console.log(
    `[AutoTrade] PAPER SELL user=${userId} symbol=${symbol} exit=${exitPrice} pnl=${profitLoss.toFixed(2)}`,
  );
}

function totalBuyScore(signal: TradingSignal): number {
  const s = signal.buyScore;
  return (
    s.higherTimeframeBias +
    s.marketStructure +
    s.liquidity +
    s.volatilitySession +
    s.riskReward +
    s.indicatorConfirmation
  );
}