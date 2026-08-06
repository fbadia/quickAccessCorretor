# ADR-001 — Supabase como banco de dados, autenticação e storage

**Data:** 2026-05 (estimada)
**Status:** ✅ Aceita
**Contexto:** Escolha da camada de persistência, autenticação e armazenamento de arquivos

---

## Contexto

O projeto SeguroNaMão precisava de:
- Banco de dados relacional com suporte a Row Level Security para multi-tenancy
- Autenticação sem senha (Magic Link) para corretores de campo
- Armazenamento seguro de PDFs de apólices
- Solução gerenciada com baixo overhead operacional para uma equipe pequena

## Decisão

Adotar **Supabase** como plataforma unificada cobrindo:
- **PostgreSQL** como banco de dados principal
- **Supabase Auth** para autenticação via Magic Link
- **Supabase Storage** para armazenamento dos PDFs (`bucket: policies`)
- **Row Level Security (RLS)** nativo do PostgreSQL para isolamento multi-tenant

## Alternativas Consideradas

| Alternativa | Motivo da rejeição |
|---|---|
| Firebase (Firestore) | Sem suporte nativo a SQL e RLS para multi-tenancy |
| AWS RDS + Cognito + S3 | Complexidade operacional e custo elevado |
| PlanetScale + Clerk + S3 | Três serviços distintos com integrações adicionais |
| MongoDB Atlas | Sem suporte nativo a RLS; multi-tenancy manual complexo |

## Consequências

**Positivas:**
- RLS garante isolamento de dados entre organizações no nível do banco
- Magic Link remove fricção de autenticação para usuários de campo
- Storage e banco no mesmo serviço simplifica CORS e autenticação
- Dashboard do Supabase facilita debugging e gestão de dados

**Negativas / Trade-offs:**
- Vendor lock-in no Supabase
- `SERVICE_ROLE_KEY` no backend deve ser tratada como segredo máximo (bypass RLS)
- Variáveis `VITE_*` expostas no bundle — `ANON_KEY` deve ter políticas RLS rígidas

## Padrão resultante

```sql
-- Toda tabela multi-tenant deve ter:
organization_id UUID REFERENCES organizations(id) NOT NULL

-- Toda política RLS usa:
USING (organization_id = public.get_user_org_id())
```
