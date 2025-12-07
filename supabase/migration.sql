-- BrainGain Database Migration Script
-- Run this script in Supabase SQL Editor

-- Enable UUID extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- TABLE: materials
-- Przechowuje lekcje (YouTube lub PDF)
-- ============================================
CREATE TABLE IF NOT EXISTS materials (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('youtube', 'pdf')),
    content_text TEXT NOT NULL, -- Treść z PDF lub transkrypt z YouTube
    video_url VARCHAR(500), -- URL wideo YouTube (NULL dla PDF)
    start_offset INTEGER DEFAULT 0, -- Czas startu wideo w sekundach (dla YouTube)
    reward_minutes INTEGER CHECK (reward_minutes > 0), -- Liczba minut nagrody za zaliczenie materiału
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index dla szybkiego wyszukiwania
CREATE INDEX IF NOT EXISTS idx_materials_type ON materials(type);
CREATE INDEX IF NOT EXISTS idx_materials_created_at ON materials(created_at DESC);

-- ============================================
-- TABLE: attempts
-- Śledzi próby rozwiązania quizów
-- ============================================
CREATE TABLE IF NOT EXISTS attempts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    material_id UUID NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
    score INTEGER NOT NULL CHECK (score >= 0 AND score <= 10),
    passed BOOLEAN NOT NULL DEFAULT FALSE, -- TRUE jeśli score >= 9
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexy dla szybkiego wyszukiwania
CREATE INDEX IF NOT EXISTS idx_attempts_material_id ON attempts(material_id);
CREATE INDEX IF NOT EXISTS idx_attempts_created_at ON attempts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_attempts_passed ON attempts(material_id, passed, created_at DESC);

-- ============================================
-- TABLE: rewards
-- Sumuje minuty za zaliczone materiały
-- ============================================
CREATE TABLE IF NOT EXISTS rewards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    material_id UUID NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
    minutes INTEGER NOT NULL CHECK (minutes > 0), -- Liczba minut nagrody
    claimed BOOLEAN NOT NULL DEFAULT FALSE, -- Czy nagroda została wykorzystana
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexy dla szybkiego wyszukiwania
CREATE INDEX IF NOT EXISTS idx_rewards_material_id ON rewards(material_id);
CREATE INDEX IF NOT EXISTS idx_rewards_claimed ON rewards(claimed);

-- ============================================
-- TABLE: quizzes (opcjonalna - do cache'owania)
-- Można użyć do cache'owania wygenerowanych quizów
-- ============================================
CREATE TABLE IF NOT EXISTS quizzes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    material_id UUID NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
    questions JSONB NOT NULL, -- Przechowuje pytania w formacie JSON
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(material_id) -- Jeden quiz na materiał (opcjonalnie)
);

CREATE INDEX IF NOT EXISTS idx_quizzes_material_id ON quizzes(material_id);

-- ============================================
-- FUNCTIONS & TRIGGERS
-- ============================================

-- Funkcja do automatycznej aktualizacji updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger dla materials
CREATE TRIGGER update_materials_updated_at
    BEFORE UPDATE ON materials
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- Wyłączamy RLS, ponieważ nie mamy systemu Auth
-- ============================================

-- Wyłącz RLS dla wszystkich tabel
ALTER TABLE materials DISABLE ROW LEVEL SECURITY;
ALTER TABLE attempts DISABLE ROW LEVEL SECURITY;
ALTER TABLE rewards DISABLE ROW LEVEL SECURITY;
ALTER TABLE quizzes DISABLE ROW LEVEL SECURITY;

-- ============================================
-- STORAGE BUCKET: documents
-- ============================================
-- Uwaga: Bucket musi być utworzony ręcznie w Supabase Dashboard
-- Patrz instrukcje w pliku SETUP.md

-- ============================================
-- MIGRATION: Add reward_minutes to materials
-- ============================================
-- Dodaj kolumnę reward_minutes do tabeli materials (dla istniejących baz danych)
-- Uwaga: Jeśli tworzysz nową bazę, dodaj tę kolumnę bezpośrednio w definicji tabeli powyżej
ALTER TABLE materials 
ADD COLUMN IF NOT EXISTS reward_minutes INTEGER CHECK (reward_minutes > 0);


