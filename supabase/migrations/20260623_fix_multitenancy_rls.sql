-- =============================================================
-- MIGRAÇÃO: Correção Crítica de Isolamento Multi-Tenant (RLS)
-- QuickAccessCorretor · Junho 2026
-- Execute no Supabase SQL Editor
-- =============================================================
-- PROBLEMA: As políticas RLS originais usam USING (true), permitindo
-- que qualquer usuário autenticado veja dados de todas as organizações.
-- Além disso, as tabelas clients, policies e vehicles não tinham a
-- coluna organization_id, impossibilitando o isolamento por organização.
-- =============================================================

-- ─────────────────────────────────────────────────────────────
-- ETAPA 0: Remover constraints UNIQUE globais que impedem multi-tenancy
-- ─────────────────────────────────────────────────────────────
-- clients: CPF/CNPJ era único globalmente, deve ser único por org
ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_cpf_cnpj_key;

-- insurers: name era único globalmente, deve ser único por org
ALTER TABLE public.insurers DROP CONSTRAINT IF EXISTS insurers_name_key;

-- ─────────────────────────────────────────────────────────────
-- ETAPA 1: Adicionar organization_id às tabelas de dados
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.policies
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

-- vehicles já tem organization_id da migração de endossos; garantir sem erro:
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.insurers
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

-- ─────────────────────────────────────────────────────────────
-- ETAPA 2: Popular organization_id nos registros existentes
-- Associa todos os registros sem org à primeira organização ativa.
-- ─────────────────────────────────────────────────────────────

DO $$
DECLARE
  first_org_id UUID;
BEGIN
  SELECT id INTO first_org_id
  FROM public.organizations
  WHERE status = 'active'
  ORDER BY created_at ASC
  LIMIT 1;

  IF first_org_id IS NOT NULL THEN
    UPDATE public.clients
      SET organization_id = first_org_id
      WHERE organization_id IS NULL;

    UPDATE public.policies
      SET organization_id = first_org_id
      WHERE organization_id IS NULL;

    UPDATE public.vehicles
      SET organization_id = first_org_id
      WHERE organization_id IS NULL;

    UPDATE public.insurers
      SET organization_id = first_org_id
      WHERE organization_id IS NULL;

    RAISE NOTICE 'Dados existentes associados à organização %', first_org_id;
  ELSE
    RAISE NOTICE 'Nenhuma organização ativa encontrada. Registros permanecerão com organization_id NULL.';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────
-- ETAPA 3: Adicionar unique constraints por org
-- ─────────────────────────────────────────────────────────────
-- clients: CPF/CNPJ único por organização
ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS clients_cpf_cnpj_org_unique;
ALTER TABLE public.clients
  ADD CONSTRAINT clients_cpf_cnpj_org_unique UNIQUE (cpf_cnpj, organization_id);

-- insurers: nome único por organização
ALTER TABLE public.insurers
  DROP CONSTRAINT IF EXISTS insurers_name_org_unique;
ALTER TABLE public.insurers
  ADD CONSTRAINT insurers_name_org_unique UNIQUE (name, organization_id);

-- ─────────────────────────────────────────────────────────────
-- ETAPA 4: Criar índices de performance nas novas colunas
-- ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_clients_org_id     ON public.clients (organization_id);
CREATE INDEX IF NOT EXISTS idx_policies_org_id    ON public.policies (organization_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_org_id    ON public.vehicles (organization_id);
CREATE INDEX IF NOT EXISTS idx_insurers_org_id    ON public.insurers (organization_id);

-- ─────────────────────────────────────────────────────────────
-- ETAPA 5: Função helper para obter o organization_id do usuário atual
-- (evita subquery repetida em cada política RLS)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_user_org_id()
RETURNS UUID AS $$
  SELECT organization_id
  FROM public.profiles
  WHERE id = auth.uid()
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────
-- ETAPA 6: Corrigir políticas RLS — CLIENTS
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Clients are viewable by authenticated users" ON public.clients;
DROP POLICY IF EXISTS "Admins can manage clients"                   ON public.clients;

CREATE POLICY "clients_org_isolation_select"
  ON public.clients FOR SELECT
  TO authenticated
  USING (organization_id = public.get_user_org_id());

CREATE POLICY "clients_org_isolation_insert"
  ON public.clients FOR INSERT
  TO authenticated
  WITH CHECK (organization_id = public.get_user_org_id());

CREATE POLICY "clients_org_isolation_update"
  ON public.clients FOR UPDATE
  TO authenticated
  USING (organization_id = public.get_user_org_id())
  WITH CHECK (organization_id = public.get_user_org_id());

CREATE POLICY "clients_org_isolation_delete"
  ON public.clients FOR DELETE
  TO authenticated
  USING (organization_id = public.get_user_org_id());

-- ─────────────────────────────────────────────────────────────
-- ETAPA 7: Corrigir políticas RLS — POLICIES
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Policies are viewable by authenticated users" ON public.policies;
DROP POLICY IF EXISTS "Admins can manage policies"                   ON public.policies;

CREATE POLICY "policies_org_isolation_select"
  ON public.policies FOR SELECT
  TO authenticated
  USING (organization_id = public.get_user_org_id());

CREATE POLICY "policies_org_isolation_insert"
  ON public.policies FOR INSERT
  TO authenticated
  WITH CHECK (organization_id = public.get_user_org_id());

CREATE POLICY "policies_org_isolation_update"
  ON public.policies FOR UPDATE
  TO authenticated
  USING (organization_id = public.get_user_org_id())
  WITH CHECK (organization_id = public.get_user_org_id());

CREATE POLICY "policies_org_isolation_delete"
  ON public.policies FOR DELETE
  TO authenticated
  USING (organization_id = public.get_user_org_id());

-- ─────────────────────────────────────────────────────────────
-- ETAPA 8: Corrigir políticas RLS — VEHICLES
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Vehicles are viewable by authenticated users" ON public.vehicles;
DROP POLICY IF EXISTS "Admins can manage vehicles"                   ON public.vehicles;

CREATE POLICY "vehicles_org_isolation_select"
  ON public.vehicles FOR SELECT
  TO authenticated
  USING (organization_id = public.get_user_org_id());

CREATE POLICY "vehicles_org_isolation_insert"
  ON public.vehicles FOR INSERT
  TO authenticated
  WITH CHECK (organization_id = public.get_user_org_id());

CREATE POLICY "vehicles_org_isolation_update"
  ON public.vehicles FOR UPDATE
  TO authenticated
  USING (organization_id = public.get_user_org_id())
  WITH CHECK (organization_id = public.get_user_org_id());

CREATE POLICY "vehicles_org_isolation_delete"
  ON public.vehicles FOR DELETE
  TO authenticated
  USING (organization_id = public.get_user_org_id());

-- ─────────────────────────────────────────────────────────────
-- ETAPA 9: Corrigir políticas RLS — INSURERS
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Insurers are viewable by authenticated users" ON public.insurers;
DROP POLICY IF EXISTS "Admins can manage insurers"                   ON public.insurers;

CREATE POLICY "insurers_org_isolation_select"
  ON public.insurers FOR SELECT
  TO authenticated
  USING (organization_id = public.get_user_org_id());

CREATE POLICY "insurers_org_isolation_insert"
  ON public.insurers FOR INSERT
  TO authenticated
  WITH CHECK (organization_id = public.get_user_org_id());

CREATE POLICY "insurers_org_isolation_update"
  ON public.insurers FOR UPDATE
  TO authenticated
  USING (organization_id = public.get_user_org_id())
  WITH CHECK (organization_id = public.get_user_org_id());

CREATE POLICY "insurers_org_isolation_delete"
  ON public.insurers FOR DELETE
  TO authenticated
  USING (organization_id = public.get_user_org_id());

-- ─────────────────────────────────────────────────────────────
-- ETAPA 10: Corrigir políticas RLS — PROFILES
-- Apenas vê perfis da própria org (ou o próprio perfil)
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Profiles are viewable by authenticated users" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile name"      ON public.profiles;
DROP POLICY IF EXISTS "Admins can do everything on profiles"         ON public.profiles;

CREATE POLICY "profiles_own_or_same_org"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    id = auth.uid()
    OR organization_id = public.get_user_org_id()
  );

CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- ─────────────────────────────────────────────────────────────
-- ETAPA 11: Validação — deve retornar 0 registros órfãos
-- ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  orphan_clients  INT;
  orphan_policies INT;
  orphan_vehicles INT;
  orphan_insurers INT;
BEGIN
  SELECT COUNT(*) INTO orphan_clients  FROM public.clients  WHERE organization_id IS NULL;
  SELECT COUNT(*) INTO orphan_policies FROM public.policies WHERE organization_id IS NULL;
  SELECT COUNT(*) INTO orphan_vehicles FROM public.vehicles WHERE organization_id IS NULL;
  SELECT COUNT(*) INTO orphan_insurers FROM public.insurers WHERE organization_id IS NULL;

  RAISE NOTICE 'Órfãos restantes — clients: %, policies: %, vehicles: %, insurers: %',
    orphan_clients, orphan_policies, orphan_vehicles, orphan_insurers;
END $$;
