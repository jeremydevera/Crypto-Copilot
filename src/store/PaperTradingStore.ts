// ============================================================
// Paper Trading Store — Ported from PaperTradingStore.swift
// ============================================================

import type { PaperPosition, ClosedPaperTrade } from '../engine/types';

const FEE_PERCENT = 0.1;
const SLIPPAGE_PERCENT = 0.05;

export class PaperTradingStore {
  demoBalance: number = 100000;
  openPosition: PaperPosition | null = null;
  history: ClosedPaperTrade[] = [];

  constructor() {
    this.loadFromDisk();
  }

  get totalProfit(): number {
    return this.history.reduce((s, t) => s + t.profit, 0);
  }

  get winRate(): number {
    if (this.history.length === 0) return 0;
    const wins = this.history.filter(t => t.profit > 0).length;
    return wins / this.history.length * 100;
  }

  buy(symbol: string, price: number, amount: number): string | null {
    if (this.openPosition) return 'You already have an open demo trade.';
    if (price <= 0) return 'The current price is not available yet.';
    if (amount <= 0) return 'Enter a valid investment amount.';
    if (amount > this.demoBalance) return 'Your demo balance is not enough for that amount.';

    const slippedPrice = price * (1 + SLIPPAGE_PERCENT / 100);
    const buyFee = amount * FEE_PERCENT / 100;
    const usableAmount = amount - buyFee;
    const quantity = usableAmount / slippedPrice;

    this.demoBalance -= amount;
    this.openPosition = {
      id: crypto.randomUUID(),
      symbol,
      entryDate: Date.now(),
      entryPrice: slippedPrice,
      investedAmount: amount,
      buyFee,
      quantity,
      remainingQuantity: quantity,
    };
    this.saveToDisk();
    return null;
  }

  sell(price: number): { trade: ClosedPaperTrade } | { error: string } {
    if (!this.openPosition) return { error: 'There is no open demo trade to sell.' };
    if (price <= 0) return { error: 'The current price is not available yet.' };

    const pos = this.openPosition;
    const slippedPrice = price * (1 - SLIPPAGE_PERCENT / 100);
    const grossSellValue = pos.remainingQuantity * slippedPrice;
    const sellFee = grossSellValue * FEE_PERCENT / 100;
    const netSellValue = grossSellValue - sellFee;
    const costBasis = pos.investedAmount * (pos.remainingQuantity / pos.quantity);
    const profit = netSellValue - costBasis;

    this.demoBalance += netSellValue;
    const closedTrade: ClosedPaperTrade = {
      id: crypto.randomUUID(),
      symbol: pos.symbol,
      entryDate: pos.entryDate,
      exitDate: Date.now(),
      entryPrice: pos.entryPrice,
      exitPrice: slippedPrice,
      investedAmount: costBasis,
      buyFee: pos.buyFee * (pos.remainingQuantity / pos.quantity),
      sellFee,
      quantity: pos.remainingQuantity,
      profit,
    };

    this.history.unshift(closedTrade);
    this.openPosition = null;
    this.saveToDisk();
    return { trade: closedTrade };
  }

  sellPartial(price: number, percent: number): { trade: ClosedPaperTrade | null } | { error: string } {
    if (!this.openPosition) return { error: 'There is no open demo trade to sell.' };
    if (price <= 0) return { error: 'The current price is not available yet.' };
    if (percent <= 0 || percent >= 100) return { error: 'Partial sell must be between 1% and 99%.' };

    const pos = this.openPosition;
    const slippedPrice = price * (1 - SLIPPAGE_PERCENT / 100);
    const sellQuantity = pos.remainingQuantity * (percent / 100);
    const grossSellValue = sellQuantity * slippedPrice;
    const sellFee = grossSellValue * FEE_PERCENT / 100;
    const netSellValue = grossSellValue - sellFee;
    const costBasis = pos.investedAmount * (sellQuantity / pos.quantity);
    const profit = netSellValue - costBasis;

    const closedTrade: ClosedPaperTrade = {
      id: crypto.randomUUID(),
      symbol: pos.symbol,
      entryDate: pos.entryDate,
      exitDate: Date.now(),
      entryPrice: pos.entryPrice,
      exitPrice: slippedPrice,
      investedAmount: costBasis,
      buyFee: pos.buyFee * (sellQuantity / pos.quantity),
      sellFee,
      quantity: sellQuantity,
      profit,
    };

    this.history.unshift(closedTrade);
    const updated = { ...pos, remainingQuantity: pos.remainingQuantity - sellQuantity };

    if (updated.remainingQuantity * slippedPrice < 1.0) {
      this.openPosition = null;
    } else {
      this.openPosition = updated;
    }
    this.saveToDisk();
    return { trade: closedTrade };
  }

  unrealizedProfit(currentPrice: number): number {
    if (!this.openPosition || currentPrice <= 0) return 0;
    const pos = this.openPosition;
    const slippedSellPrice = currentPrice * (1 - SLIPPAGE_PERCENT / 100);
    const grossSellValue = pos.remainingQuantity * slippedSellPrice;
    const sellFee = grossSellValue * FEE_PERCENT / 100;
    const costBasis = pos.investedAmount * (pos.remainingQuantity / pos.quantity);
    return grossSellValue - sellFee - costBasis;
  }

  reset(balance: number = 100000) {
    this.demoBalance = balance;
    this.openPosition = null;
    this.history = [];
    this.saveToDisk();
  }

  deleteTrade(index: number) {
    this.history.splice(index, 1);
    this.saveToDisk();
  }

  private saveToDisk() {
    try {
      localStorage.setItem('ptc_demoBalance', JSON.stringify(this.demoBalance));
      localStorage.setItem('ptc_openPosition', JSON.stringify(this.openPosition));
      localStorage.setItem('ptc_history', JSON.stringify(this.history));
    } catch {}
  }

  private loadFromDisk() {
    try {
      const bal = localStorage.getItem('ptc_demoBalance');
      if (bal !== null) this.demoBalance = JSON.parse(bal);

      const pos = localStorage.getItem('ptc_openPosition');
      if (pos !== null && pos !== 'null') this.openPosition = JSON.parse(pos);

      const hist = localStorage.getItem('ptc_history');
      if (hist !== null) this.history = JSON.parse(hist);
    } catch {}
  }
}