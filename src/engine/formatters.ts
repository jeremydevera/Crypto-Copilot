// ============================================================
// Formatters — Ported from Formatters.swift
// ============================================================

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  PHP: '₱',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  KRW: '₩',
  INR: '₹',
  AUD: 'A$',
  CAD: 'C$',
  SGD: 'S$',
};

let _fiatCurrency = 'USD';

export function setFiatCurrency(currency: string) {
  _fiatCurrency = currency;
}

export function fiat(value: number): string {
  if (!Number.isFinite(value)) return '--';
  const sym = CURRENCY_SYMBOLS[_fiatCurrency] ?? _fiatCurrency;
  return sym + new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

export function usd(value: number): string {
  if (!Number.isFinite(value)) return '--';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

export function peso(value: number): string {
  if (!Number.isFinite(value)) return '--';
  return '₱' + new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

export function percent(value: number): string {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(1) + '%';
}

export function number(value: number, decimals: number = 2): string {
  if (!Number.isFinite(value)) return '--';
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);
}

export function compact(value: number): string {
  if (!Number.isFinite(value)) return '--';
  if (Math.abs(value) >= 1e6) return (value / 1e6).toFixed(2) + 'M';
  if (Math.abs(value) >= 1e3) return (value / 1e3).toFixed(2) + 'K';
  return value.toFixed(2);
}