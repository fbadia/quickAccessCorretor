# ADR-006 — Multi-tenancy via RLS com `organization_id`

**Data:** 2026-06-23
**Status:** ✅ Aceita
**Contexto:** Estratégia de isolamento de dados entre organizações (corretoras)

---

## Contexto

O SeguroNaMão é um SaaS multi-tenant: múltiplas corretoras (organizações) usam a mesma instância do banco. A versão inicial tinha políticas RLS com `USING (true)`, o que permitia que qualquer usuário autenticado visse dados de **todas** as organizações — uma falha crítica de segurança.

## Decisão

Implementar isolamento completo por `organization_id` em todas as tabelas de dados, usando Row Level Security do PostgreSQL.

### Função helper

```sql
CREATE OR REPLACE FUNCTION public.get_user_org_id()
RETURNS UUID AS $$
  SELECT organization_id FROM public.profiles WHERE id = auth.uid()
$$ LANGUAGE sql STABLE SECURITY DEFINER;
```

### Padrão de política RLS

```sql
-- Toda tabela de dados: SELECT, INSERT, UPDATE, DELETE filtrado por org
CREATE POLICY "tabela_org_isolation_select"
  ON public.tabela FOR SELECT TO authenticated
  USING (organization_id = public.get_user_org_id());

CREATE POLICY "tabela_org_isolation_insert"
  ON public.tabela FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.get_user_org_id());
```

### Constraints únicas por organização (não globais)

```sql
-- ERRADO (bloqueia multi-tenancy):
UNIQUE (cpf_cnpj)

-- CORRETO:
UNIQUE (cpf_cnpj, organization_id)
```

### Superadmin

O superadmin usa `SUPABASE_SERVICE_ROLE_KEY` no backend, que bypassa completamente o RLS. Isso permite acesso cross-org para administração da plataforma.

## Alternativas Consideradas

| Alternativa | Motivo da rejeição |
|---|---|
| Schemas separados por org (schema-per-tenant) | Complexidade de migrations; impossível com Supabase gerenciado |
| Filtro manual `WHERE org_id = ?` em todas as queries | Propenso a erros humanos; um esquecimento expõe dados |
| Banco separado por org | Inviável em SaaS; custo e gestão exponencialmente maiores |
| RLS com `USING (true)` (situação anterior) | ❌ Qualquer usuário autenticado via dados de todas as orgs |

## Consequências

**Positivas:**
- Isolamento garantido no nível do banco — impossível vazar dados entre orgs via SQL
- Zero chance de bug de filtragem no código da aplicação comprometer segurança
- Superadmin com bypass controlado via SERVICE_ROLE_KEY
- Auditoria simples: qualquer dado tem `organization_id` explícito

**Negativas / Trade-offs:**
- Toda nova tabela de dados de usuário **deve** ter `organization_id`
- Constraints UNIQUE devem ser compostas `(campo, organization_id)` — nunca globais
- SERVICE_ROLE_KEY é um segredo crítico: vazamento dá acesso irrestrito ao banco

## Migration aplicada

`supabase/migrations/20260623_fix_multitenancy_rls.sql`

Aplicou:
- `organization_id` em `clients`, `policies`, `vehicles`, `insurers`
- Removeu constraints UNIQUE globais; adicionou compostas
- Criou `get_user_org_id()` 
- Substituiu todas as políticas `USING (true)` por políticas com isolamento por org
