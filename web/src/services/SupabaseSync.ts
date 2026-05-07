// ============================================================
// Supabase Sync — Paper trades & user configs
// ============================================================

import { supabase } from '../lib/supabase'
import type { PaperPosition, ClosedPaperTrade } from '../engine/types'

// ---- Paper Trades ----

export async function syncOpenPositionToSupabase(position: PaperPosition | null) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  // Upsert open position as a single-row record
  if (position) {
    await supabase
      .from('paper_trades')
      .upsert({
        id: position.id,
        user_id: user.id,
        symbol: position.symbol,
        side: 'BUY',
        entry_price: position.entryPrice,
        quantity: position.quantity,
        stop_loss: null,
        status: 'open',
        mode: 'normal',
        notes: JSON.stringify({
          investedAmount: position.investedAmount,
          buyFee: position.buyFee,
          remainingQuantity: position.remainingQuantity,
          entryDate: position.entryDate,
        }),
      }, { onConflict: 'id' })
  } else {
    // No open position — delete any open trades
    await supabase
      .from('paper_trades')
      .delete()
      .eq('user_id', user.id)
      .eq('status', 'open')
  }
}

export async function syncClosedTradeToSupabase(trade: ClosedPaperTrade) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  await supabase
    .from('paper_trades')
    .upsert({
      id: trade.id,
      user_id: user.id,
      symbol: trade.symbol,
      side: 'BUY',
      entry_price: trade.entryPrice,
      exit_price: trade.exitPrice,
      quantity: trade.quantity,
      pnl: trade.profit,
      status: 'closed',
      mode: 'normal',
      notes: JSON.stringify({
        investedAmount: trade.investedAmount,
        buyFee: trade.buyFee,
        sellFee: trade.sellFee,
        entryDate: trade.entryDate,
        exitDate: trade.exitDate,
      }),
    }, { onConflict: 'id' })
}

export async function deleteClosedTradeFromSupabase(tradeId: string) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  await supabase
    .from('paper_trades')
    .delete()
    .eq('id', tradeId)
    .eq('user_id', user.id)
}

export async function loadPaperTradesFromSupabase(): Promise<{
  openPosition: PaperPosition | null;
  history: ClosedPaperTrade[];
  demoBalance: number;
} | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Load config for demo balance
  const { data: config } = await supabase
    .from('user_configs')
    .select('account_size')
    .eq('user_id', user.id)
    .single()

  // Load open trades
  const { data: openRows } = await supabase
    .from('paper_trades')
    .select('*')
    .eq('user_id', user.id)
    .eq('status', 'open')

  // Load closed trades
  const { data: closedRows } = await supabase
    .from('paper_trades')
    .select('*')
    .eq('user_id', user.id)
    .eq('status', 'closed')
    .order('created_at', { ascending: false })

  let openPosition: PaperPosition | null = null
  if (openRows && openRows.length > 0) {
    const row = openRows[0]
    const notes = row.notes ? JSON.parse(row.notes) : {}
    openPosition = {
      id: row.id,
      symbol: row.symbol,
      entryDate: notes.entryDate ?? new Date(row.created_at).getTime(),
      entryPrice: Number(row.entry_price),
      investedAmount: notes.investedAmount ?? Number(row.entry_price) * Number(row.quantity),
      buyFee: notes.buyFee ?? 0,
      quantity: Number(row.quantity),
      remainingQuantity: notes.remainingQuantity ?? Number(row.quantity),
    }
  }

  const history: ClosedPaperTrade[] = (closedRows ?? []).map((row: any) => {
    const notes = row.notes ? JSON.parse(row.notes) : {}
    return {
      id: row.id,
      symbol: row.symbol,
      entryDate: notes.entryDate ?? new Date(row.created_at).getTime(),
      exitDate: notes.exitDate ?? new Date(row.created_at).getTime(),
      entryPrice: Number(row.entry_price),
      exitPrice: Number(row.exit_price ?? row.entry_price),
      investedAmount: notes.investedAmount ?? Number(row.entry_price) * Number(row.quantity),
      buyFee: notes.buyFee ?? 0,
      sellFee: notes.sellFee ?? 0,
      quantity: Number(row.quantity),
      profit: Number(row.pnl ?? 0),
    }
  })

  return {
    openPosition,
    history,
    demoBalance: config?.account_size ?? 100000,
  }
}

// ---- User Config ----

export async function loadUserConfigFromSupabase(): Promise<{
  riskPercent: number;
  accountSize: number;
  defaultMode: string;
  favoritePairs: string[];
} | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('user_configs')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (!data) return null

  return {
    riskPercent: Number(data.risk_percent) || 1,
    accountSize: Number(data.account_size) || 10000,
    defaultMode: data.default_mode || 'normal',
    favoritePairs: data.favorite_pairs ?? ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'],
  }
}

export async function saveUserConfigToSupabase(config: {
  riskPercent?: number;
  accountSize?: number;
  defaultMode?: string;
  favoritePairs?: string[];
}) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const updates: Record<string, any> = {}
  if (config.riskPercent !== undefined) updates.risk_percent = config.riskPercent
  if (config.accountSize !== undefined) updates.account_size = config.accountSize
  if (config.defaultMode !== undefined) updates.default_mode = config.defaultMode
  if (config.favoritePairs !== undefined) updates.favorite_pairs = config.favoritePairs
  updates.updated_at = new Date().toISOString()

  await supabase
    .from('user_configs')
    .upsert({ user_id: user.id, ...updates }, { onConflict: 'user_id' })
}

// ---- Auto-Trade Config (Backend API) ----

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'https://trading-copilot-backend-1p9r.onrender.com';

export async function setAutoTradeEnabled(enabled: boolean, symbol: string = 'BTCUSDT', investmentAmount: number = 10000, riskPercent: number = 1) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const res = await fetch(`${BACKEND_URL}/api/users/${user.id}/auto-trade`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled, symbol, investmentAmount, riskPercent }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.details || err.error || 'Failed to update auto-trade setting')
  }

  return res.json()
}

export async function getAutoTradeStats() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const res = await fetch(`${BACKEND_URL}/api/users/${user.id}/auto-trade-stats`)

  if (!res.ok) {
    throw new Error('Failed to fetch auto-trade stats')
  }

  return res.json()
}