-- =============================================================
-- MIGRAÇÃO: Suporte a Endossos de Apólices
-- QuickAccessCorretor · Junho 2026
-- Execute no Supabase SQL Editor (Settings > SQL Editor)
-- =============================================================

-- ─────────────────────────────────────────────────────────────
-- ETAPA 1: Criar tabela endorsements
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.endorsements (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id           UUID REFERENCES public.policies(id) ON DELETE SET NULL,
  organization_id     UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  endorsement_number  TEXT,
  endorsement_type    TEXT CHECK (endorsement_type IN ('vehicle_change', 'insured_change', 'coverage_change', 'other')),
  status              TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('applied', 'pending', 'expired')),
  issued_at           DATE,
  expires_at          TIMESTAMPTZ,
  storage_path        TEXT UNIQUE,
  file_hash           TEXT,
  raw_extracted_data  JSONB,
  created_at          TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────
-- ETAPA 2: Adicionar colunas de histórico à tabela vehicles
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS is_current  BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS replaced_at TIMESTAMPTZ;

-- ─────────────────────────────────────────────────────────────
-- ETAPA 3: RLS na tabela endorsements
-- Mesmo padrão de isolamento por org das demais tabelas
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.endorsements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_isolation_endorsements" ON public.endorsements;
CREATE POLICY "org_isolation_endorsements" ON public.endorsements
  FOR ALL
  USING (
    is_user_active()
    AND organization_id = current_user_org_id()
  );

-- ─────────────────────────────────────────────────────────────
-- ETAPA 4: Índices de performance
-- ─────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_endorsements_organization_id ON public.endorsements(organization_id);
CREATE INDEX IF NOT EXISTS idx_endorsements_policy_id       ON public.endorsements(policy_id);
CREATE INDEX IF NOT EXISTS idx_endorsements_status          ON public.endorsements(status);
CREATE INDEX IF NOT EXISTS idx_endorsements_file_hash       ON public.endorsements(file_hash);
CREATE INDEX IF NOT EXISTS idx_endorsements_expires_at      ON public.endorsements(expires_at) WHERE status = 'pending';

-- Índice composto para a query de busca de veículo atual por apólice
CREATE INDEX IF NOT EXISTS idx_vehicles_policy_is_current   ON public.vehicles(policy_id, is_current);

-- ─────────────────────────────────────────────────────────────
-- FIM DA MIGRAÇÃO
-- Verificar resultado:
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'endorsements';
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'vehicles' AND column_name IN ('is_current', 'replaced_at');
-- ─────────────────────────────────────────────────────────────
