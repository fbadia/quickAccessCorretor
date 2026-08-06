# Documentação — SeguroNaMão

> Índice central de toda a documentação técnica e de gestão do projeto.

---

## Técnica

| Documento | Descrição |
|---|---|
| [Arquitetura](./arquitetura.md) | Visão técnica completa: containers, fluxos, decisões |
| [API Reference](./api.md) | Todas as rotas, payloads, autenticação e exemplos |
| [ENVIRONMENTS.md](../ENVIRONMENTS.md) | Ambientes, estratégia de branches e rollback |

## ADRs — Architecture Decision Records

Decisões técnicas significativas registradas em ordem cronológica.

| ADR | Título | Status |
|---|---|---|
| [ADR-001](./ADRs/ADR-001-supabase-backend-auth.md) | Supabase como banco de dados, auth e storage | ✅ Aceita |
| [ADR-002](./ADRs/ADR-002-separacao-frontend-backend-containers.md) | Separação frontend/backend em containers independentes | ✅ Aceita |
| [ADR-003](./ADRs/ADR-003-gemini-extracao-pdfs.md) | Google Gemini 1.5 Flash para extração de dados de PDFs | ✅ Aceita |
| [ADR-004](./ADRs/ADR-004-migracao-zeroserver.md) | Migração para ZeroServer Community Cloud | ✅ Aceita |
| [ADR-005](./ADRs/ADR-005-nginx-proxy-reverso.md) | Nginx como único ponto de entrada (proxy reverso) | ✅ Aceita |
| [ADR-006](./ADRs/ADR-006-rls-multitenancy.md) | Multi-tenancy via RLS com `organization_id` | ✅ Aceita |

## Gestão

| Documento | Descrição |
|---|---|
| [Roadmap](./Gestao/roadmap.md) | Visão de produto, épicos e entregas planejadas |
| [Sprint 0](./Gestao/sprints/sprint-0.md) | Infra, containerização e deploy ZeroServer |
