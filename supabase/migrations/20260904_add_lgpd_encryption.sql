-- =============================================================
-- MIGRAÇÃO: Suporte a Blind Indexing e Criptografia LGPD (ADR-007)
-- SeguroNaMão · Setembro 2026
-- Execute no Supabase SQL Editor
-- =============================================================
-- Permite armazenar campos PII (CPF, Nome, Placa) criptografados com
-- AES-256-GCM no backend, viabilizando buscas e deduplicações exatas 
-- através de hashes determinísticos HMAC-SHA256 (Blind Indexes).
-- =============================================================

-- ─────────────────────────────────────────────────────────────
-- ETAPA 1: Adicionar colunas de Blind Index
-- ─────────────────────────────────────────────────────────────

-- 1.1 Tabela clients: cpf_bidx para buscas/deduplicação exata de segurados
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS cpf_bidx TEXT;

-- 1.2 Tabela vehicles: plate_bidx para buscas exatas de veículos
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS plate_bidx TEXT;

-- ─────────────────────────────────────────────────────────────
-- ETAPA 2: Criar índices de performance nas colunas de Blind Index
-- ─────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_clients_cpf_bidx 
  ON public.clients (cpf_bidx, organization_id);

CREATE INDEX IF NOT EXISTS idx_vehicles_plate_bidx 
  ON public.vehicles (plate_bidx, organization_id);

-- ─────────────────────────────────────────────────────────────
-- ETAPA 2.1: Permitir anonimização (Direito ao Esquecimento — Story 1.5)
-- ─────────────────────────────────────────────────────────────
-- Titulares anonimizados ficam com cpf_cnpj = NULL. A UNIQUE continua válida,
-- pois o PostgreSQL permite múltiplos NULLs numa coluna UNIQUE.
ALTER TABLE public.clients
  ALTER COLUMN cpf_cnpj DROP NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- ETAPA 3: Política de Storage (Proteção adicional no Supabase Storage)
-- ─────────────────────────────────────────────────────────────
-- Garante que o bucket 'policies' permaneça estritamente privado
UPDATE storage.buckets
SET public = false
WHERE id = 'policies';

COMMENT ON COLUMN public.clients.cpf_bidx IS 'Blind index determinístico (HMAC-SHA256) para pesquisa segura de CPF sem expor PII';
COMMENT ON COLUMN public.vehicles.plate_bidx IS 'Blind index determinístico (HMAC-SHA256) para pesquisa segura de Placa sem expor PII';
