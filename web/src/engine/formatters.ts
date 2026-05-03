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

// Exchange rates: how many local currency units per 1 USD
const DEFAULT_RATES: Record<string, number> = {
  USD: 1,
  PHP: 56.5,
  EUR: 0.92,
  GBP: 0.79,
  JPY: 155,
  KRW: 1360,
  INR: 83.5,
  AUD: 1.53,
  CAD: 1.37,
  SGD: 1.34,
};

let _fiatCurrency = 'USD';
let _exchangeRates: Record<string, number> = { ...DEFAULT_RATES };

export function setFiatCurrency(currency: string) {
  _fiatCurrency = currency;
}

export function setExchangeRates(rates: Record<string, number>) {
  _exchangeRates = { ...DEFAULT_RATES, ...rates };
}

/** Convert a USD value to the current fiat currency */
export function toFiat(usdValue: number): number {
  const rate = _exchangeRates[_fiatCurrency] ?? 1;
  return usdValue * rate;
}

/** Get the current exchange rate (local currency per 1 USD) */
export function getExchangeRate(): number {
  return _exchangeRates[_fiatCurrency] ?? 1;
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