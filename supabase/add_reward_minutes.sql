-- ============================================
-- MIGRATION: Add reward_minutes to materials
-- ============================================
-- Run this script in the Supabase SQL Editor
-- Adds the reward_minutes column to an existing materials table

ALTER TABLE materials 
ADD COLUMN IF NOT EXISTS reward_minutes INTEGER CHECK (reward_minutes > 0);

-- Verify the column was added
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'materials' AND column_name = 'reward_minutes';

