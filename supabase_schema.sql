-- ═══════════════════════════════════════════════════════
-- MaPhoto-ISMGB — Schéma Supabase
-- Exécuter dans l'éditeur SQL de Supabase
-- ═══════════════════════════════════════════════════════

-- Active l'extension UUID
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Albums / Événements (avec support hiérarchie)
CREATE TABLE albums (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nom VARCHAR(255) NOT NULL,
  description TEXT,
  slug VARCHAR(100) UNIQUE NOT NULL,
  date_evenement DATE,
  parent_album_id UUID REFERENCES albums(id) ON DELETE CASCADE,
  ordre INT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Images
CREATE TABLE images (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  album_id UUID REFERENCES albums(id) ON DELETE CASCADE,
  titre VARCHAR(255),
  cloudinary_url TEXT NOT NULL,
  cloudinary_public_id VARCHAR(255) NOT NULL,
  taille_kb INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Log des visites utilisateurs
CREATE TABLE visites (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  prenom VARCHAR(100) NOT NULL,
  nom VARCHAR(100) NOT NULL,
  album_id UUID REFERENCES albums(id) ON DELETE SET NULL,
  date_heure TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  user_agent TEXT
);

-- Index pour performance
CREATE INDEX idx_images_album ON images(album_id);
CREATE INDEX idx_visites_album ON visites(album_id);
CREATE INDEX idx_albums_slug ON albums(slug);
CREATE INDEX idx_albums_parent ON albums(parent_album_id);

-- RLS (Row Level Security) — désactiver pour utilisation avec service key
ALTER TABLE albums  DISABLE ROW LEVEL SECURITY;
ALTER TABLE images  DISABLE ROW LEVEL SECURITY;
ALTER TABLE visites DISABLE ROW LEVEL SECURITY;

-- ═════════════════════════════════════════════════════════════════════
-- ⚠️ MIGRATION POUR BASES DE DONNÉES EXISTANTES
-- ═════════════════════════════════════════════════════════════════════
-- Si vous avez déjà une base de données avec des albums, exécutez ceci :
--
-- ALTER TABLE albums ADD COLUMN parent_album_id UUID REFERENCES albums(id) ON DELETE CASCADE;
-- ALTER TABLE albums ADD COLUMN ordre INT DEFAULT 0;
-- CREATE INDEX idx_albums_parent ON albums(parent_album_id);
--
-- Cela ajoute les colonnes à tous les albums existants (parent_album_id = NULL = albums root)
