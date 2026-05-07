-- ============================================
-- Crypto Copilot — Auto-Trade Migration
-- Adds auto_trade columns to user_configs,
-- trade_history table, and updates paper_trades
-- ============================================

-- 1. Add auto-trade columns to user_configs
ALTER TABLE user_configs ADD COLUMN IF NOT EXISTS auto_trade_enabled BOOLEAN DEFAULT false;
ALTER TABLE user_configs ADD COLUMN IF NOT EXISTS symbol TEXT DEFAULT 'BTCUSDT';
ALTER TABLE user_configs ADD COLUMN IF NOT EXISTS investment_amount NUMERIC(18,2) DEFAULT 10000;
ALTER TABLE user_configs ADD COLUMN IF NOT EXISTS max_trades_per_day INTEGER DEFAULT 5;
ALTER TABLE user_configs ADD COLUMN IF NOT EXISTS cooldown_minutes INTEGER DEFAULT 15;

-- Change unique constraint from (user_id) to (user_id, symbol) to allow per-symbol configs
-- First drop the old constraint, then add the new one
ALTER TABLE user_configs DROP CONSTRAINT IF EXISTS user_configs_user_id_key;
ALTER TABLE user_configs ADD UNIQUE (user_id, symbol);

-- 2. Add auto-trade columns to paper_trades
ALTER TABLE paper_trades ADD COLUMN IF NOT EXISTS invested_amount NUMERIC(18,2);
ALTER TABLE paper_trades ADD COLUMN IF NOT EXISTS entry_decision TEXT;
ALTER TABLE paper_trades ADD COLUMN IF NOT EXISTS entry_score INTEGER;
ALTER TABLE paper_trades ADD COLUMN IF NOT EXISTS entry_reward_risk NUMERIC(5,2);
ALTER TABLE paper_trades ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ;

-- 3. Create trade_history table for closed trade analytics
CREATE TABLE IF NOT EXISTS trade_history (
  id                    UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol                TEXT NOT NULL,
  entry_price           NUMERIC(18,8) NOT NULL,
  exit_price            NUMERIC(18,8) NOT NULL,
  quantity              NUMERIC(18,8) NOT NULL,
  invested_amount       NUMERIC(18,2),
  profit_loss           NUMERIC(18,2),
  profit_loss_percent   NUMERIC(8,4),
  entry_decision        TEXT,
  exit_decision         TEXT,
  entry_score           INTEGER,
  exit_score            INTEGER,
  entry_reward_risk     NUMERIC(5,2),
  opened_at             TIMESTAMPTZ,
  closed_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  duration_minutes      NUMERIC(10,2),
  source                TEXT DEFAULT 'manual'
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_trade_history_user_id ON trade_history(user_id);
CREATE INDEX IF NOT EXISTS idx_trade_history_user_symbol ON trade_history(user_id, symbol);
CREATE INDEX IF NOT EXISTS idx_trade_history_closed_at ON trade_history(closed_at);
CREATE INDEX IF NOT EXISTS idx_paper_trades_user_symbol_status ON paper_trades(user_id, symbol, status);

-- 4. RLS for trade_history
ALTER TABLE trade_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own trade history"
  ON trade_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own trade history"
  ON trade_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 5. Update the handle_new_user trigger to include symbol
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_configs (user_id, symbol, auto_trade_enabled)
  VALUES (NEW.id, 'BTCUSDT', false);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;