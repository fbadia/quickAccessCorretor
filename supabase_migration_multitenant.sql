-- =============================================================
-- MIGRAÇÃO MULTI-TENANT — QuickAccess Corretor
-- Execute no Supabase SQL Editor (Settings > SQL Editor)
-- ATENÇÃO: Esta migração é IRREVERSÍVEL — apaga dados existentes
-- =============================================================

-- ─────────────────────────────────────────────────────────────
-- ETAPA 1: Tabela organizations
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS organizations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'disabled')),
  drive_folder_id   TEXT,
  last_sync_at      TIMESTAMPTZ,
  last_sync_status  TEXT DEFAULT 'never'
                    CHECK (last_sync_status IN ('never', 'ok', 'error')),
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────
-- ETAPA 2: Modificar profiles (organization_id + is_active)
-- ─────────────────────────────────────────────────────────────

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id),
  ADD COLUMN IF NOT EXISTS is_active       BOOLEAN NOT NULL DEFAULT true;

-- ─────────────────────────────────────────────────────────────
-- ETAPA 3: Adicionar organization_id às tabelas de dados
-- ─────────────────────────────────────────────────────────────

-- Primeiro remover NOT NULL constraint temporariamente para migração
-- (as tabelas serão truncadas logo após)
ALTER TABLE policies  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE clients   ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE vehicles  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE insurers  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);

-- ─────────────────────────────────────────────────────────────
-- ETAPA 4: Migração destrutiva (IRREVERSÍVEL)
-- ─────────────────────────────────────────────────────────────

-- Limpar todos os dados de negócio
TRUNCATE TABLE vehicles  RESTART IDENTITY CASCADE;
TRUNCATE TABLE policies  RESTART IDENTITY CASCADE;
TRUNCATE TABLE clients   RESTART IDENTITY CASCADE;
TRUNCATE TABLE insurers  RESTART IDENTITY CASCADE;

-- Remover todos os profiles EXCETO fbadia@gmail.com
DELETE FROM profiles WHERE email != 'fbadia@gmail.com';

-- Atualizar fbadia para superadmin (sem organização)
UPDATE profiles
SET
  role            = 'superadmin',
  organization_id = NULL,
  is_active       = true
WHERE email = 'fbadia@gmail.com';

-- Remover todos os usuários Supabase Auth EXCETO fbadia
-- (Executa via função para evitar erros se não houver outros usuários)
DO $$
DECLARE
  uid UUID;
BEGIN
  FOR uid IN
    SELECT id FROM auth.users WHERE email != 'fbadia@gmail.com'
  LOOP
    PERFORM auth.admin.delete_user(uid::text);
  END LOOP;
EXCEPTION WHEN OTHERS THEN
  -- Ignorar erros individuais
  NULL;
END $$;

-- ─────────────────────────────────────────────────────────────
-- ETAPA 5: Aplicar NOT NULL em organization_id (pós-truncate)
-- ─────────────────────────────────────────────────────────────

ALTER TABLE policies ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE clients  ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE vehicles ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE insurers ALTER COLUMN organization_id SET NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- ETAPA 6: Funções helper para RLS
-- ─────────────────────────────────────────────────────────────

-- Retorna o organization_id do usuário autenticado (NULL para superadmin)
CREATE OR REPLACE FUNCTION current_user_org_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT organization_id FROM profiles WHERE id = auth.uid();
$$;

-- Verifica se o usuário autenticado é superadmin
CREATE OR REPLACE FUNCTION is_superadmin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT COALESCE(
    (SELECT role = 'superadmin' FROM profiles WHERE id = auth.uid()),
    false
  );
$$;

-- Verifica se o usuário e sua org estão ativos (bloqueia se desabilitados)
CREATE OR REPLACE FUNCTION is_user_active()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT COALESCE(
    (
      SELECT
        p.is_active = true
        AND (
          p.role = 'superadmin'
          OR EXISTS (
            SELECT 1 FROM organizations o
            WHERE o.id = p.organization_id
              AND o.status = 'active'
          )
        )
      FROM profiles p
      WHERE p.id = auth.uid()
    ),
    false
  );
$$;

-- Verifica se o usuário autenticado tem role 'admin' na sua org
CREATE OR REPLACE FUNCTION is_org_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT COALESCE(
    (SELECT role = 'admin' AND is_active = true FROM profiles WHERE id = auth.uid()),
    false
  );
$$;

-- ─────────────────────────────────────────────────────────────
-- ETAPA 7: Habilitar RLS em todas as tabelas
-- ─────────────────────────────────────────────────────────────

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE policies      ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients       ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurers      ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────
-- ETAPA 8: Políticas RLS — organizations
-- ─────────────────────────────────────────────────────────────

-- Remover políticas anteriores se existirem
DROP POLICY IF EXISTS "superadmin_all_orgs"   ON organizations;
DROP POLICY IF EXISTS "user_own_org"          ON organizations;

-- Superadmin vê e gerencia todas as orgs
CREATE POLICY "superadmin_all_orgs" ON organizations
  FOR ALL
  USING (is_superadmin());

-- Usuário de org vê apenas a própria org
CREATE POLICY "user_own_org" ON organizations
  FOR SELECT
  USING (
    is_user_active()
    AND id = current_user_org_id()
  );

-- ─────────────────────────────────────────────────────────────
-- ETAPA 9: Políticas RLS — profiles
-- ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "superadmin_all_profiles"  ON profiles;
DROP POLICY IF EXISTS "admin_org_profiles"        ON profiles;
DROP POLICY IF EXISTS "user_own_profile"          ON profiles;

-- Superadmin vê e gerencia todos os profiles
CREATE POLICY "superadmin_all_profiles" ON profiles
  FOR ALL
  USING (is_superadmin());

-- Admin de org vê e gerencia profiles da própria org
CREATE POLICY "admin_org_profiles" ON profiles
  FOR ALL
  USING (
    is_org_admin()
    AND (
      organization_id = current_user_org_id()
      OR id = auth.uid() -- sempre acessa o próprio profile
    )
  );

-- Broker vê apenas o próprio profile
CREATE POLICY "user_own_profile" ON profiles
  FOR SELECT
  USING (
    is_user_active()
    AND id = auth.uid()
  );

-- ─────────────────────────────────────────────────────────────
-- ETAPA 10: Políticas RLS — tabelas de dados (policies, clients, vehicles, insurers)
-- Isolamento por organization_id + org ativa + usuário ativo
-- Superadmin NUNCA acessa dados de orgs (sem organization_id)
-- ─────────────────────────────────────────────────────────────

-- policies
DROP POLICY IF EXISTS "org_isolation_policies" ON policies;
CREATE POLICY "org_isolation_policies" ON policies
  FOR ALL
  USING (
    is_user_active()
    AND organization_id = current_user_org_id()
  );

-- clients
DROP POLICY IF EXISTS "org_isolation_clients" ON clients;
CREATE POLICY "org_isolation_clients" ON clients
  FOR ALL
  USING (
    is_user_active()
    AND organization_id = current_user_org_id()
  );

-- vehicles
DROP POLICY IF EXISTS "org_isolation_vehicles" ON vehicles;
CREATE POLICY "org_isolation_vehicles" ON vehicles
  FOR ALL
  USING (
    is_user_active()
    AND organization_id = current_user_org_id()
  );

-- insurers (cada org tem seus próprios registros de seguradora)
DROP POLICY IF EXISTS "org_isolation_insurers" ON insurers;
CREATE POLICY "org_isolation_insurers" ON insurers
  FOR ALL
  USING (
    is_user_active()
    AND organization_id = current_user_org_id()
  );

-- ─────────────────────────────────────────────────────────────
-- ETAPA 11: Índices de performance
-- ─────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_profiles_organization_id  ON profiles(organization_id);
CREATE INDEX IF NOT EXISTS idx_policies_organization_id  ON policies(organization_id);
CREATE INDEX IF NOT EXISTS idx_clients_organization_id   ON clients(organization_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_organization_id  ON vehicles(organization_id);
CREATE INDEX IF NOT EXISTS idx_insurers_organization_id  ON insurers(organization_id);

-- ─────────────────────────────────────────────────────────────
-- FIM DA MIGRAÇÃO
-- Verificar resultado:
-- SELECT email, role, organization_id, is_active FROM profiles;
-- SELECT * FROM organizations;
-- ─────────────────────────────────────────────────────────────
