# Arquitetura — SeguroNaMão

> Documento técnico completo. Atualizado a cada ADR aprovada.

---

## Visão Geral

**SeguroNaMão** é uma SaaS multi-tenant mobile-first para corretores de seguros automotivos. O sistema extrai dados estruturados de apólices em PDF usando IA (Google Gemini) e os disponibiliza em um app React com acesso offline via PWA.

---

## Stack Completo

| Camada | Tecnologia | Versão | Hospedagem |
|---|---|---|---|
| Frontend | React + Vite | 19 / 8 | ZeroServer (Nginx container) |
| Backend | Node.js + Express | 20 / 4 | ZeroServer (Node container) |
| Banco de dados | PostgreSQL (via Supabase) | 15 | Supabase Cloud |
| Autenticação | Supabase Auth (Magic Link) | — | Supabase Cloud |
| Armazenamento de PDFs | Supabase Storage | — | Supabase Cloud |
| IA / Extração | Google Gemini 1.5 Flash | — | Google AI Studio |
| Estilo | CSS Vanilla (mobile-first) | — | — |
| PWA | VitePWA + Workbox | — | — |
| CI/CD | GitHub Actions | — | GHCR + ZeroServer |

---

## Diagrama de Arquitetura

```
                         Internet
                             │
                    HTTPS (porta 443)
                             │
                    ┌────────▼────────┐
                    │   ZeroServer    │
                    │   (Nginx:80)    │  ← URL pública: https://app-xxx.apps.zeroserver.cc
                    │    frontend     │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
         /api/*        /admin/*      /superadmin/*
         /health
              │
              ▼  rede interna ZeroServer
        ┌─────────────────────────┐
        │  Node.js:3001 (backend) │
        └────────────┬────────────┘
                     │
         ┌───────────┼────────────┐
         ▼           ▼            ▼
   Supabase DB   Supabase     Google
   (PostgreSQL)   Storage      Gemini
                 (PDFs)      (extração)
```

---

## Containers Docker

### frontend (Nginx)

- **Imagem:** `ghcr.io/fbadia/seguronamao-frontend:latest`
- **Build:** multi-stage — stage `build` roda `vite build`, stage `production` copia para Nginx Alpine
- **Responsabilidades:**
  - Serve os assets estáticos do React SPA
  - Faz proxy reverso de `/api/*`, `/admin/*`, `/superadmin/*`, `/health` para `backend:3001`
  - SPA fallback: qualquer rota não encontrada serve `index.html`
- **Variáveis embutidas no build:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_BACKEND_URL` (vazio em prod)

### backend (Node.js)

- **Imagem:** `ghcr.io/fbadia/seguronamao-backend:latest`
- **Build:** multi-stage — stage `dev` usa nodemon, stage `production` usa `node index.js`
- **Responsabilidades:**
  - API REST Express (autenticação, CRUD, upload, download)
  - Integração com Supabase via `SERVICE_ROLE_KEY` (bypass RLS)
  - Extração de PDFs via Gemini API
  - Job periódico de expiração de endossos (24h)
- **Não tem URL pública** — acessível apenas pelo Nginx internamente

---

## Multi-tenancy

Toda tabela de dados de usuário tem `organization_id UUID → organizations.id`.

O isolamento é garantido por Row Level Security no PostgreSQL via a função:

```sql
public.get_user_org_id() → UUID
-- Retorna o organization_id do usuário autenticado via auth.uid()
```

Políticas RLS filtram todas as operações por `organization_id = public.get_user_org_id()`.

O `superadmin` usa `SUPABASE_SERVICE_ROLE_KEY` no backend, que bypassa RLS e tem acesso cross-org.

---

## Fluxo de Upload de PDF

```
Browser → POST /api/policies/upload (multipart/form-data)
   │
   ▼
backend: calcula SHA-256
   │
   ├── duplicado? → retorna 200 + dados existentes
   │
   ▼
backend: upload → Supabase Storage (policies/{orgId}/{filename})
   │
   ▼
backend: Gemini 1.5 Flash analisa PDF → JSON estruturado
   │
   ├── document_type = "policy"      → savePolicyData() → 201
   └── document_type = "endorsement" → saveEndorsementData()
          │
          ├── apólice base encontrada? → vincula + aplica → 201
          └── não encontrada?          → status "pending"  → 202
```

---

## Autenticação e Autorização

| Método | Descrição |
|---|---|
| **Magic Link** | Supabase Auth envia link por e-mail. Sem senha. |
| **Bearer Token** | Supabase `access_token` enviado em todas as chamadas ao backend |
| **Middleware `authenticate()`** | Valida token, carrega `profile`, verifica se user e org estão ativos |
| **`requireOrgAdmin()`** | Verifica `role === 'admin'` |
| **`requireSuperAdmin()`** | Verifica `role === 'superadmin'` |

---

## CORS

Atualmente configurado para aceitar:
- `https://quick-access-corretor.vercel.app`
- `https://*.vercel.app`
- `http://localhost:*`

> ⚠️ **Pendente:** adicionar URL pública do ZeroServer após primeiro deploy.

---

## PWA

Configurado via VitePWA + Workbox:
- `registerType: 'prompt'` — usuário escolhe instalar
- Cache de assets Vite (imutáveis, 1 ano)
- Cache de fontes Google (1 ano)
- Offline: serve `index.html` para todas as rotas (exceto `/api/*`)
- Tema: `#863bff` / Background: `#0f0f1a`

---

## Decisões Técnicas

Ver [docs/ADRs/](./ADRs/) para o histórico detalhado de cada decisão arquitetural.
