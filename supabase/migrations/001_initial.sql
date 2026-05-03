-- ============================================
-- Crypto Copilot — Supabase Migration
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================

-- Enable Row Level Security
-- (Supabase has RLS on by default for new tables, but we enforce it)

-- 1. User configurations (per-user settings)
CREATE TABLE IF NOT EXISTS user_configs (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  risk_percent  NUMERIC(5,2) DEFAULT 1.00,
  account_size  NUMERIC(18,2) DEFAULT 10000.00,
  default_mode  TEXT DEFAULT 'normal' CHECK (default_mode IN ('normal', 'pro')),
  favorite_pairs TEXT[] DEFAULT ARRAY['BTCUSDT', 'ETHUSDT', 'SOLUSDT'],
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);

-- 2. Paper trading journal
CREATE TABLE IF NOT EXISTS paper_trades (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol        TEXT NOT NULL,
  side          TEXT NOT NULL CHECK (side IN ('BUY', 'SELL')),
  entry_price   NUMERIC(18,8) NOT NULL,
  exit_price    NUMERIC(18,8),
  quantity      NUMERIC(18,8) NOT NULL,
  stop_loss     NUMERIC(18,8),
  take_profit1  NUMERIC(18,8),
  take_profit2  NUMERIC(18,8),
  pnl           NUMERIC(18,2),
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'cancelled')),
  mode          TEXT DEFAULT 'normal' CHECK (mode IN ('normal', 'pro')),
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  closed_at     TIMESTAMPTZ
);

-- 3. Trade history / snapshots (optional analytics)
CREATE TABLE IF NOT EXISTS trade_snapshots (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol        TEXT NOT NULL,
  signal_data   JSONB NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- Row Level Security Policies
-- ============================================

-- Users can only see/edit their own data
ALTER TABLE user_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE paper_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_snapshots ENABLE ROW LEVEL SECURITY;

-- user_configs: users can read/write only their own row
CREATE POLICY "Users can view own config"
  ON user_configs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own config"
  ON user_configs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own config"
  ON user_configs FOR UPDATE
  USING (auth.uid() = user_id);

-- paper_trades: users can CRUD only their own trades
CREATE POLICY "Users can view own trades"
  ON paper_trades FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own trades"
  ON paper_trades FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own trades"
  ON paper_trades FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own trades"
  ON paper_trades FOR DELETE
  USING (auth.uid() = user_id);

-- trade_snapshots: users can read/write only their own
CREATE POLICY "Users can view own snapshots"
  ON trade_snapshots FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own snapshots"
  ON trade_snapshots FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ============================================
-- Auto-create user_config on signup
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_configs (user_id)
  VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();