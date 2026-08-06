# ADR-004 — Migração para ZeroServer Community Cloud

**Data:** 2026-07-28
**Status:** ✅ Aceita — Em implantação
**Contexto:** Escolha de plataforma de hospedagem para produção

---

## Contexto

O projeto estava hospedado em:
- **Frontend:** Vercel (React SPA)
- **Backend:** Render (Node.js Express)

Problemas com essa configuração:
- Render free tier hiberna o servidor após 15min de inatividade → cold start perceptível
- Dois serviços em plataformas distintas → CORS complexo, dois dashboards, duas pipelines
- Sem suporte nativo a containers — cada deploy requer adaptar ao modelo de cada plataforma

## Decisão

Migrar para **ZeroServer Community Cloud**, plataforma de containers baseada em Docker que:
- Aceita imagens pré-buildadas via GitHub Container Registry (GHCR)
- Co-localiza todos os containers em um nó privado (sem cold start)
- Permite comunicação interna entre serviços por nome (DNS interno)
- Expõe HTTPS automático para o serviço com `exposed: true`
- Suporta preferência geográfica (`placement: country: br`) para LGPD

### Estratégia de migração paralela

Vercel + Render permanecem no ar durante a janela de validação. Só são descomissionados após 24h de uptime estável no ZeroServer e todos os itens do checklist Go/No-Go validados.

### Ponto de rollback

Tag git `v-pre-zeroserver` criada antes do início da migração. Três níveis de rollback documentados em `ENVIRONMENTS.md`.

## Alternativas Consideradas

| Alternativa | Motivo da rejeição |
|---|---|
| Railway | Custo mais alto na escala esperada |
| Fly.io | Configuração de rede mais complexa para comunicação interna |
| AWS ECS / GCP Cloud Run | Overhead operacional muito alto para equipe pequena |
| Manter Vercel + Render | Resolve o problema de cold start apenas no backend; não é containerizado |
| DigitalOcean App Platform | Sem comunicação interna nativa entre serviços |

## Consequências

**Positivas:**
- Deploy via `zs deploy` (CLI simples)
- CI/CD automatizado: push → GitHub Actions → `zs deploy`
- Backend não exposto publicamente (segurança extra)
- Containers co-localizados → latência interna < 1ms
- `placement: country: br` — conformidade LGPD

**Negativas / Trade-offs:**
- ZeroServer está em fase MVP — sem load balancing ainda (Phase 2)
- `VITE_*` são build-args — mudança de variáveis exige rebuild da imagem frontend
- Imagens privadas no GHCR requerem PAT com `write:packages`

## Arquivos criados

| Arquivo | Propósito |
|---|---|
| `backend/Dockerfile` | Multi-stage: dev (nodemon) + production (node) |
| `frontend/Dockerfile` | Multi-stage: dev (vite) + production (nginx) |
| `frontend/nginx.conf` | SPA fallback + proxy reverso |
| `zs.yaml` | Manifesto ZeroServer |
| `docker-compose.yml` | Dev local com hot-reload |
| `.github/workflows/deploy.yml` | CI/CD automatizado |
