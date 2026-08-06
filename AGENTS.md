# AGENTS.md — SeguroNaMão

> Contexto completo do projeto para agentes de IA (Claude, Gemini, Cursor, Copilot etc.).
> Leia este arquivo antes de qualquer tarefa neste repositório.

---

## 1. Visão Geral

**SeguroNaMão** é uma aplicação SaaS multi-tenant mobile-first para corretores de seguros automotivos. Permite localizar rapidamente dados de segurados, apólices e contatos de assistência das seguradoras, mesmo fora do escritório.

**Funcionalidade principal:** monitora uma pasta do Google Drive, lê apólices em PDF de seguradoras (Yelum, Porto Seguro, Bradesco, HDI, Allianz), extrai dados estruturados via Gemini 1.5 Flash e armazena no Supabase.

---

## 2. Arquitetura

```
┌─── ZeroServer Community Cloud ────────────────────────────────┐
│  Container: frontend (Nginx)  — porta 80 — URL pública HTTPS  │
│    /api/*, /admin/*, /superadmin/*, /health                   │
│      → proxy reverso interno → backend:3001                   │
│    /* → serve index.html (React SPA)                          │
│                                                               │
│  Container: backend (Node.js) — porta 3001 — interno          │
└────────────────────────────────┬──────────────────────────────┘
                                 │
                                 ▼
                      Supabase Cloud (PostgreSQL + Auth + Storage)
```

| Camada | Tecnologia | Hospedagem |
|---|---|---|
| **Frontend** | React 19 + Vite 8 + CSS Vanilla (mobile-first) | ZeroServer (Nginx container) |
| **Backend** | Node.js 20 + Express | ZeroServer (Node container) |
| **Banco / Auth / Storage** | Supabase (PostgreSQL + RLS + Magic Link) | Supabase Cloud |
| **IA** | Google Gemini 1.5 Flash (extração de PDFs) | Google AI Studio |
| **Armazenamento de PDFs** | Supabase Storage (bucket `policies`) | Supabase Cloud |
| **CI/CD** | GitHub Actions → build Docker → push GHCR → `zs deploy` | GitHub + ZeroServer |

---

## 3. Estrutura de Diretórios

```
quickAccessCorretor/
├── backend/
│   ├── index.js           # Servidor Express principal (1095 linhas)
│   ├── dbService.js       # Todas as queries ao Supabase
│   ├── geminiService.js   # Integração com Gemini API (extração de PDFs)
│   ├── storageService.js  # Upload/download/delete no Supabase Storage
│   ├── testParser.js      # Utilitário CLI para testar extração de PDF local
│   ├── Dockerfile         # Multi-stage: dev (nodemon) + production (node)
│   ├── .dockerignore
│   ├── package.json
│   └── .env.example
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx            # Componente principal (~2800 linhas)
│   │   ├── SuperadminDashboard.jsx  # Dashboard superadmin (~1800 linhas)
│   │   ├── supabaseClient.js  # Instância do cliente Supabase
│   │   ├── index.css          # Estilos globais (mobile-first, dark/light)
│   │   └── App.css
│   ├── Dockerfile         # Multi-stage: dev (Vite) + production (Nginx)
│   ├── nginx.conf         # Proxy reverso + SPA fallback
│   ├── .dockerignore
│   ├── vite.config.js     # Inclui VitePWA (Progressive Web App)
│   ├── package.json
│   └── .env.example
│
├── supabase/
│   ├── schema.sql                              # Schema base do banco
│   └── migrations/
│       ├── 20260619_add_endorsements.sql       # Tabela de endossos
│       └── 20260623_fix_multitenancy_rls.sql   # Isolamento multi-tenant crítico
│
├── .github/
│   └── workflows/
│       └── deploy.yml     # CI/CD: build → push GHCR → zs deploy
│
├── zs.yaml                # Orquestrador ZeroServer (equivalente ao compose em prod)
├── docker-compose.yml     # Desenvolvimento local com hot-reload
└── ENVIRONMENTS.md        # Guia de ambientes e rollback
```

---

## 4. Modelo de Dados (Supabase / PostgreSQL)

### Tabelas Principais

```
organizations
  id UUID PK
  name TEXT
  status TEXT ('active' | 'inactive' | 'suspended')
  plan TEXT
  organization_id UUID (auto-ref via RLS)
  last_sync_at TIMESTAMPTZ
  last_sync_status TEXT

profiles
  id UUID PK → auth.users.id
  name TEXT
  email TEXT
  role TEXT ('superadmin' | 'admin' | 'broker')
  organization_id UUID → organizations.id
  is_active BOOLEAN

clients
  id UUID PK
  name TEXT
  cpf_cnpj TEXT        -- único por org (constraint: clients_cpf_cnpj_org_unique)
  organization_id UUID → organizations.id

policies
  id UUID PK
  client_id UUID → clients.id
  insurer_id UUID → insurers.id
  policy_number TEXT
  start_date DATE
  end_date DATE
  storage_path TEXT    -- caminho no Supabase Storage
  file_hash TEXT       -- SHA-256 para deduplicação
  raw_extracted_data JSONB
  organization_id UUID → organizations.id

vehicles
  id UUID PK
  policy_id UUID → policies.id
  plate TEXT
  brand_model TEXT
  year INTEGER
  organization_id UUID → organizations.id

insurers
  id UUID PK
  name TEXT            -- único por org
  assistance_phone TEXT
  assistance_whatsapp TEXT
  claims_phone TEXT
  claims_url TEXT
  organization_id UUID → organizations.id

endorsements
  id UUID PK
  policy_id UUID → policies.id (nullable — pode estar pendente)
  endorsement_number TEXT
  type TEXT
  storage_path TEXT
  file_hash TEXT
  status TEXT ('pending' | 'applied' | 'expired')
  organization_id UUID → organizations.id
  expires_at TIMESTAMPTZ
```

### Isolamento Multi-Tenant (RLS)

Todas as tabelas de dados usam Row Level Security com a função helper:

```sql
-- Retorna o organization_id do usuário autenticado
public.get_user_org_id() → UUID
```

**Regra crítica:** Toda query de INSERT, UPDATE, SELECT, DELETE é filtrada por `organization_id = public.get_user_org_id()`. O `superadmin` usa a `SERVICE_ROLE_KEY` no backend (bypass RLS) e tem acesso cross-org.

---

## 5. API Backend (Express)

**Base URL em produção:** `https://APP.apps.zeroserver.cc` (roteado via Nginx)  
**Base URL local:** `http://localhost:3001`

### Autenticação

Todas as rotas (exceto `/health`) exigem header:
```
Authorization: Bearer <supabase_access_token>
```

O middleware `authenticate()` valida o token no Supabase e anexa `req.user` e `req.profile`.

### Roles

| Role | Acesso |
|---|---|
| `superadmin` | Todas as rotas + cross-org via SERVICE_ROLE_KEY |
| `admin` | Rotas `/admin/*` + todas as rotas de corretores |
| `broker` | Rotas `/api/*` dentro da própria organização |

### Rotas

```
GET  /health                                   # Health check (sem auth)

# Superadmin
GET  /superadmin/metrics                       # Métricas agregadas
GET  /superadmin/users                         # Lista todos os usuários
GET  /superadmin/organizations/:orgId/users    # Usuários de uma org
POST /superadmin/organizations                 # Criar organização
POST /superadmin/superadmins                   # Criar superadmin
POST /superadmin/users                         # Criar usuário em org

# Admin de Organização
GET  /admin/users                              # Usuários da própria org
POST /admin/users                              # Convidar usuário

# Corretores / Uso geral
POST /api/policies/upload                      # Upload PDF (apólice ou endosso)
GET  /api/endorsements/pending                 # Endossos pendentes de vínculo
GET  /api/endorsements/:id/download            # Download de endosso
GET  /api/policies/:policyId/download          # Download de apólice
```

### Upload de PDF (`POST /api/policies/upload`)

Fluxo:
1. Recebe arquivo via `multipart/form-data` (campo `file`, max 10MB)
2. Calcula SHA-256 para deduplicação
3. Faz upload para Supabase Storage (`policies/{orgId}/{filename}`)
4. Chama Gemini para extrair dados e detectar tipo (apólice ou endosso)
5. Salva no banco via `dbService.js`
6. Retorna `201` (criado) ou `202` (endosso pendente de vínculo) ou `200` (duplicado)

---

## 6. Frontend

**Stack:** React 19 + Vite 8 + CSS Vanilla + PWA (VitePWA)

**Arquivo principal:** `frontend/src/App.jsx` (~2800 linhas)  
**Dashboard superadmin:** `frontend/src/SuperadminDashboard.jsx` (~1800 linhas)

### Variáveis de Ambiente

```env
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_BACKEND_URL=            # vazio em prod (Nginx proxy); http://localhost:3001 em dev
```

> ⚠️ As variáveis `VITE_*` são **build-time** — embutidas no bundle pelo Vite.
> Modificá-las exige rebuildar a imagem Docker.

### Padrão de chamada ao backend

```javascript
const backendUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";
const response = await fetch(`${backendUrl}/api/policies/upload`, { ... });
```

### Autenticação

Magic Link via Supabase Auth. O token de sessão é enviado como Bearer em todas as chamadas ao backend.

---

## 7. Docker e Deploy

### Desenvolvimento Local

```bash
# Pré-requisito: Docker Desktop instalado e rodando
cp backend/.env.example backend/.env   # preencher com credenciais
cp frontend/.env.example frontend/.env

docker compose up --build
# Backend: http://localhost:3001
# Frontend: http://localhost:5173 (hot-reload ativo)
```

### Imagens Docker (Multi-Stage)

| Stage | Comando base | Usado em |
|---|---|---|
| `dev` | nodemon / vite dev | `docker compose up` local |
| `production` | node index.js / nginx | CI/CD + ZeroServer |

### Deploy no ZeroServer

```bash
# Instalar CLI
curl -fsSL https://raw.githubusercontent.com/zeroserver-cc/zsc-cli/main/install.sh | sh

# Autenticar
zs login

# Deploy (lê o zs.yaml na raiz)
zs deploy

# Ver status e URL pública
zs list

# Ver logs
zs logs backend
zs logs frontend
```

O arquivo `zs.yaml` define:
- `app: seguronamao`
- `placement: country: br` (nós brasileiros — LGPD)
- `service: backend` — imagem GHCR, apenas interno
- `service: frontend` — imagem GHCR, `exposed: true` (URL pública)

### CI/CD (GitHub Actions)

Push para `main` → build ambas as imagens → push `ghcr.io/fbadia/seguronamao-*:latest` → `zs deploy`  
Push para `develop` → mesma pipeline com tag `:develop`

**Secrets necessários no GitHub:**

| Secret | Descrição |
|---|---|
| `VITE_SUPABASE_URL` | URL do Supabase |
| `VITE_SUPABASE_ANON_KEY` | Anon key do Supabase |
| `ZS_TOKEN` | Token do ZeroServer (produção) |
| `ZS_TOKEN_DEV` | Token do ZeroServer (dev) |

---

## 8. Variáveis de Ambiente do Backend

```env
SUPABASE_URL=                  # URL do projeto Supabase
SUPABASE_SERVICE_ROLE_KEY=     # Service role key (bypass RLS — manter segredo)
GEMINI_API_KEY=                # Google AI Studio API key
GOOGLE_DRIVE_FOLDER_ID=        # ID da pasta do Drive (opcional)
GOOGLE_SERVICE_ACCOUNT_JSON=   # JSON da service account do Google (uma linha)
PORT=3001
```

---

## 9. Regras de Desenvolvimento

### Segurança (CRÍTICO)

- **Nunca** usar `SUPABASE_SERVICE_ROLE_KEY` no frontend. Apenas no backend.
- **Nunca** commitar `.env` com credenciais reais. Apenas `.env.example`.
- Todo dado de usuário/org deve respeitar o isolamento RLS — sempre incluir `organization_id` nas queries.
- O `superadmin` faz chamadas ao backend que usa `SERVICE_ROLE_KEY` — nunca expor essa role ao cliente.
- Uploads: validar MIME type (`application/pdf`) e tamanho (≤10MB) antes de processar.

### Banco de Dados

- Toda nova tabela de dados de usuário DEVE ter `organization_id UUID → organizations.id`.
- Toda nova política RLS DEVE usar `organization_id = public.get_user_org_id()`.
- Nunca criar constraints UNIQUE globais em tabelas multi-tenant — usar `UNIQUE (coluna, organization_id)`.
- Testar migrations no banco dev antes de aplicar em produção.
- Ordem de aplicação em banco novo: `schema.sql` → migrations em ordem cronológica.

### Backend

- Toda rota nova DEVE passar pelo middleware `authenticate()`.
- Rotas de admin usam `requireOrgAdmin`. Rotas de superadmin usam `requireSuperAdmin`.
- O CORS está configurado para aceitar `*.vercel.app` e `localhost:*` — adicionar ZeroServer URL quando disponível.
- O servidor usa ES Modules (`"type": "module"` no package.json) — usar `import`/`export`, não `require`.

### Frontend

- Estilo: CSS Vanilla (sem Tailwind, sem CSS-in-JS). Arquivo: `src/index.css`.
- Mobile-first: todos os componentes devem funcionar em telas de 375px.
- Tema: dark/light com variáveis CSS. Cor primária: `#863bff`.
- `VITE_BACKEND_URL` deve ser vazio (`""`) em produção — o Nginx faz o proxy.

### Docker

- **Não usar** `command`, `args`, `restart`, `healthcheck` no `zs.yaml` — não suportados pelo ZeroServer MVP.
- O `zs.yaml` só aceita `exposed: true` em exatamente **1 serviço**.
- `VITE_*` são build-args do Docker — precisam ser passados no `docker build`, não como env runtime.

### Git / Branches

```
main      → Produção (ZeroServer prod)
develop   → Desenvolvimento (ZeroServer dev)
feature/* → PRs para develop
fix/*     → Hotfixes (PR para main + backmerge para develop)
```

**Nunca** commitar diretamente em `main`.

---

## 10. Rollback

Tag de segurança pré-migração: `v-pre-zeroserver`

### Rollback Rápido (< 5 min)
Se ZeroServer falhar, redirecionar tráfego de volta para Render/Vercel alterando `VITE_BACKEND_URL` no Vercel e forçando redeploy.

### Rollback de Imagem (3–5 min)
```bash
zs deploy ghcr.io/fbadia/seguronamao-backend:SHA_ANTERIOR --name backend
zs deploy ghcr.io/fbadia/seguronamao-frontend:SHA_ANTERIOR --name frontend
```

### Rollback Total
```bash
git checkout v-pre-zeroserver
git checkout -b fix/revert-zeroserver
git push origin fix/revert-zeroserver
# Abrir PR: fix/revert-zeroserver → main
```

---

## 11. Agents e Skills Disponíveis

O projeto usa o framework de agentes localizado em `.agent/`:

| Skill | Quando usar |
|---|---|
| `architect-agent` | Design de sistema, ADRs, decisões de API, trade-offs |
| `developer-agent` | Implementação de features, correção de bugs, refatoração |
| `devops-agent` | CI/CD, Docker, deploy, infraestrutura |
| `qa-agent` | Planos de teste, validação de features, relatórios de bug |
| `security-agent` | Auditoria de código, OWASP, RLS, autenticação |
| `code-review-agent` | Revisão de PRs, padrões de código |
| `pm-agent` | Requisitos, user stories, priorização de backlog |
| `architect-agent` | Arquitetura, decisões técnicas |
| `orchestrator-agent` | Coordenação entre múltiplos agentes |
| `documentation-agent` | READMEs, changelogs, guias |

Workflows disponíveis em `.agent/workflows/`:
- `/nova-feature` — fluxo completo de desenvolvimento
- `/review` — revisão de código
- `/security-audit` — auditoria de segurança

---

## 12. Comandos Frequentes

```bash
# Desenvolvimento local com Docker
docker compose up --build       # primeira vez
docker compose up               # após já ter feito build
docker compose logs -f backend  # logs do backend
docker compose down             # parar tudo

# Git
git checkout develop && git pull origin develop
git checkout -b feature/nome-da-feature

# Supabase (executar no SQL Editor do Supabase)
# Ver schema: supabase/schema.sql
# Ver migrations: supabase/migrations/*.sql

# Deploy ZeroServer
zs login
zs deploy
zs list
zs logs backend
zs logs frontend
zs stop seguronamao

# Testar extrator de PDF localmente (sem Drive)
cd backend
node testParser.js /caminho/para/apolice.pdf
```
