# Sprint 0 — Infraestrutura e Deploy no ZeroServer

**Período:** 2026-07-28 → 2026-08-13
**Objetivo:** Migrar a aplicação para containers Docker e realizar o primeiro deploy no ZeroServer Community Cloud, mantendo a plataforma anterior (Vercel + Render) em paralelo até validação completa.

**Épico relacionado:** [Épico 0 — Infraestrutura e Deploy](../roadmap.md#-épico-0--infraestrutura-e-deploy-sprint-0)

---

## Contexto

O sistema estava hospedado em Vercel (frontend) + Render (backend), sem containerização. Esta sprint migra a infraestrutura para Docker + ZeroServer, habilitando deploys reproduzíveis e comunicação interna eficiente entre serviços.

**ADRs aprovadas nesta sprint:**
- [ADR-002](../../ADRs/ADR-002-separacao-frontend-backend-containers.md) — Separação em containers
- [ADR-004](../../ADRs/ADR-004-migracao-zeroserver.md) — Migração para ZeroServer
- [ADR-005](../../ADRs/ADR-005-nginx-proxy-reverso.md) — Nginx como único ponto de entrada

---

## Critérios de Aceite da Sprint

- [ ] `docker compose up --build` sobe backend (3001) + frontend (5173) sem erros
- [ ] Imagens de produção buildadas localmente com sucesso
- [ ] Imagens publicadas no GHCR (`ghcr.io/fbadia/seguronamao-*:latest`)
- [ ] `zs deploy` executa sem erros
- [ ] `zs list` mostra ambos os containers com status RUNNING
- [ ] URL pública HTTPS abre o app no browser
- [ ] Login via Magic Link funciona end-to-end
- [ ] Upload de PDF processa e extrai dados corretamente
- [ ] Dashboard superadmin carrega sem erros
- [ ] Isolamento multi-tenant validado (org A não vê dados de org B)
- [ ] CORS atualizado com a URL pública do ZeroServer
- [ ] GitHub Actions configurado com secrets e pipeline funcional
- [ ] 24h de uptime estável (sem erros críticos em `zs logs`)

---

## Tarefas

### ✅ Concluídas

| Tarefa | Responsável | Commit |
|---|---|---|
| Tag `v-pre-zeroserver` (checkpoint de rollback) | fbadia | — |
| `backend/Dockerfile` (multi-stage: dev + production) | IA | `feat(docker)` |
| `backend/.dockerignore` | IA | `feat(docker)` |
| `frontend/Dockerfile` (multi-stage: dev + production) | IA | `feat(docker)` |
| `frontend/nginx.conf` (SPA + proxy reverso) | IA | `feat(docker)` + `fix(docker)` |
| `frontend/.dockerignore` | IA | `feat(docker)` |
| `zs.yaml` (manifesto ZeroServer, placement BR) | IA | `feat(docker)` + ajustes |
| `docker-compose.yml` (dev local hot-reload) | IA | `feat(docker)` |
| `.github/workflows/deploy.yml` (CI/CD GHCR → ZS) | IA | `feat(docker)` |
| `AGENTS.md` (contexto completo para IAs) | IA | `docs` |
| `ENVIRONMENTS.md` atualizado com ZeroServer | IA | `feat(docker)` |
| Estrutura `docs/` (ADRs, Gestão, API, Arquitetura) | IA | `docs` |

### 🔄 Em Andamento

| Tarefa | Bloqueio |
|---|---|
| Login no GHCR e push das imagens de produção | Necessário PAT GitHub com `write:packages` (Classic token) |
| Primeiro `zs deploy` manual | Aguarda push das imagens + instalação do CLI `zs` |

### ⏳ Pendentes

| Tarefa | Dependência |
|---|---|
| Configurar 4 secrets no GitHub Actions | PAT + ZS_TOKEN do ZeroServer |
| Atualizar CORS no `backend/index.js` com URL do ZeroServer | URL pública disponível após primeiro deploy |
| Validar checklist Go/No-Go completo | Deploy funcional |
| Descomissionar Vercel + Render | 24h de uptime estável no ZeroServer |

---

## Decisões Técnicas Tomadas nesta Sprint

### CORS ainda aponta para Vercel
O regex de CORS em `backend/index.js` ainda aceita apenas `*.vercel.app` e `localhost:*`. Após o primeiro deploy, adicionar o domínio ZeroServer:

```javascript
// backend/index.js — atualizar após obter URL pública
const allowedOriginRegex = /^(
  https:\/\/quick-access-corretor\.vercel\.app|
  https:\/\/.*\.vercel\.app|
  https:\/\/.*\.apps\.zeroserver\.cc|   ← ADICIONAR
  http:\/\/localhost:\d+
)$/x;
```

### Token GHCR — deve ser Classic, não Fine-grained
O GitHub Container Registry requer Personal Access Token do tipo **Classic** com scope `write:packages`. Tokens Fine-grained ainda não suportam GHCR completamente.

### `VITE_BACKEND_URL` vazio em produção
Com o proxy reverso Nginx, a URL do backend em produção é string vazia. O frontend chama `/api/...` no mesmo domínio; o Nginx roteia internamente.

---

## Rollback

Se algo der errado após o deploy:

```bash
# Nível 1 — Tráfego de volta para Render/Vercel (< 5 min)
# Alterar VITE_BACKEND_URL no painel Vercel → forçar redeploy

# Nível 2 — Rollback de imagem no ZeroServer (3-5 min)
zs deploy ghcr.io/fbadia/seguronamao-backend:SHA_ANTERIOR --name backend
zs deploy ghcr.io/fbadia/seguronamao-frontend:SHA_ANTERIOR --name frontend

# Nível 3 — Rollback total de código
git checkout v-pre-zeroserver
git checkout -b fix/revert-zeroserver
git push origin fix/revert-zeroserver
```

---

## Retrospectiva

> *A preencher ao final da sprint (após validação do deploy em produção)*

**O que funcionou bem:**
- ...

**O que pode melhorar:**
- ...

**Itens para próxima sprint:**
- Testes automatizados (Épico 1)
- Rate limiting no endpoint de upload
- Monitoramento de erros
