-- BrainGain Database Migration Script
-- Run this script in Supabase SQL Editor

-- Enable UUID extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- TABLE: materials
-- Stores lessons (YouTube or PDF)
-- ============================================
CREATE TABLE IF NOT EXISTS materials (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('youtube', 'pdf')),
    content_text TEXT NOT NULL, -- PDF text or YouTube transcript
    video_url VARCHAR(500), -- YouTube video URL (NULL for PDF)
    start_offset INTEGER DEFAULT 0, -- Video start time in seconds (YouTube)
    end_offset INTEGER, -- Video end time in seconds (YouTube, optional)
    reward_minutes INTEGER CHECK (reward_minutes > 0), -- Reward minutes for passing the material
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_materials_type ON materials(type);
CREATE INDEX IF NOT EXISTS idx_materials_created_at ON materials(created_at DESC);

-- ============================================
-- TABLE: attempts
-- Tracks quiz attempts
-- ============================================
CREATE TABLE IF NOT EXISTS attempts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    material_id UUID NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
    score INTEGER NOT NULL CHECK (score >= 0 AND score <= 10),
    passed BOOLEAN NOT NULL DEFAULT FALSE, -- TRUE if score >= 9
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_attempts_material_id ON attempts(material_id);
CREATE INDEX IF NOT EXISTS idx_attempts_created_at ON attempts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_attempts_passed ON attempts(material_id, passed, created_at DESC);

-- ============================================
-- TABLE: rewards
-- Stores reward minutes for passed materials
-- ============================================
CREATE TABLE IF NOT EXISTS rewards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    material_id UUID NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
    minutes INTEGER NOT NULL CHECK (minutes > 0), -- Reward minutes
    claimed BOOLEAN NOT NULL DEFAULT FALSE, -- Whether the reward has been claimed/used
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_rewards_material_id ON rewards(material_id);
CREATE INDEX IF NOT EXISTS idx_rewards_claimed ON rewards(claimed);

-- ============================================
-- TABLE: quizzes
-- Optional cache for generated quizzes
-- ============================================
CREATE TABLE IF NOT EXISTS quizzes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    material_id UUID NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
    questions JSONB NOT NULL, -- Stores questions in JSON format
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(material_id) -- One quiz per material (optional)
);

CREATE INDEX IF NOT EXISTS idx_quizzes_material_id ON quizzes(material_id);

-- ============================================
-- FUNCTIONS & TRIGGERS
-- ============================================

-- Function to auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for materials
CREATE TRIGGER update_materials_updated_at
    BEFORE UPDATE ON materials
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- RLS is disabled because the app does not use Supabase Auth
-- ============================================

-- Disable RLS for all tables
ALTER TABLE materials DISABLE ROW LEVEL SECURITY;
ALTER TABLE attempts DISABLE ROW LEVEL SECURITY;
ALTER TABLE rewards DISABLE ROW LEVEL SECURITY;
ALTER TABLE quizzes DISABLE ROW LEVEL SECURITY;

-- ============================================
-- STORAGE BUCKET: documents
-- ============================================
-- Note: The bucket must be created manually in the Supabase Dashboard
-- See instructions in SETUP.md

-- ============================================
-- TABLE: rate_limits
-- Tracks quiz generation requests per IP for demo protection
-- ============================================
CREATE TABLE IF NOT EXISTS rate_limits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ip TEXT NOT NULL,
    action TEXT NOT NULL DEFAULT 'quiz_generate',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_ip_action_time ON rate_limits(ip, action, created_at DESC);

-- Disable RLS for rate_limits
ALTER TABLE rate_limits DISABLE ROW LEVEL SECURITY;

-- ============================================
-- MIGRATION: Add reward_minutes to materials
-- ============================================
-- Add reward_minutes column to materials (for existing databases)
-- Note: If you're creating a new database, include this column directly in the table definition above
ALTER TABLE materials 
ADD COLUMN IF NOT EXISTS reward_minutes INTEGER CHECK (reward_minutes > 0);

-- ============================================
-- MIGRATION: Add end_offset to materials
-- ============================================
-- Add end_offset column to materials (for existing databases)
ALTER TABLE materials 
ADD COLUMN IF NOT EXISTS end_offset INTEGER;


