-- ============================================
-- MIGRATION: Add reward_minutes to materials
-- ============================================
-- Wykonaj ten skrypt w Supabase SQL Editor
-- Dodaje kolumnę reward_minutes do istniejącej tabeli materials

ALTER TABLE materials 
ADD COLUMN IF NOT EXISTS reward_minutes INTEGER CHECK (reward_minutes > 0);

-- Sprawdź czy kolumna została dodana
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'materials' AND column_name = 'reward_minutes';

