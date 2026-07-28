# Configuração de Ambientes — SeguroNaMão

Este documento descreve a estratégia de branches e a configuração de cada ambiente.

---

## Estratégia de Branches

```
main      → Produção (Vercel prod + Render prod + Supabase prod)
develop   → Desenvolvimento (Vercel preview + Render dev + Supabase dev)
feature/* → Features em desenvolvimento (PRs para develop)
fix/*     → Hotfixes (PRs para main + backmerge para develop)
```

### Fluxo de trabalho

```
feature/xyz ──PR──▶ develop ──PR──▶ main
                                     │
                              (produção validada)
```

**Regras:**
- Nunca commitar diretamente em `main`
- Features sempre partem de `develop`
- Hotfixes críticos podem ir direto para `main` + backmerge para `develop`
- Todo PR para `main` deve ter passado por validação em `develop`

---

## Ambientes

> **Migração em andamento:** o projeto está sendo migrado para o [ZeroServer Community Cloud](https://zeroserver.cc).
> Vercel + Render permanecem no ar durante a janela de validação. Ver seção **Rollback** abaixo.

### Produção (`main`) — Destino: ZeroServer

| Serviço | Plataforma atual | Plataforma destino |
|---------|-----------------|-------------------|
| **Frontend** | Vercel (auto-deploy) | ZeroServer (imagem Nginx via GHCR) |
| **Backend** | Render | ZeroServer (imagem Node.js via GHCR) |
| **Banco** | Supabase produção | Supabase produção (não muda) |

### Desenvolvimento (`develop`) — Destino: ZeroServer

| Serviço | Plataforma atual | Plataforma destino |
|---------|-----------------|-------------------|
| **Frontend** | Vercel preview | ZeroServer (imagem Nginx, tag `develop`) |
| **Backend** | Render dev | ZeroServer (imagem Node.js, tag `develop`) |
| **Banco** | Supabase dev | Supabase dev (não muda) |

### Local (todos os devs)

```bash
# Sobe backend (porta 3001) + frontend (porta 5173) com hot-reload
docker compose up --build
```

Pré-requisitos: Docker Desktop + `backend/.env` + `frontend/.env` preenchidos.

---

## Checklist de Configuração Inicial

### 1. Supabase (Banco de Dados Dev)

- [ ] Criar novo projeto em [supabase.com](https://supabase.com): `seguronamao-dev`
- [ ] No SQL Editor, executar `supabase/schema.sql`
- [ ] Executar todas as migrations em ordem:
  - [ ] `supabase/migrations/20260619_add_endorsements.sql`
  - [ ] `supabase/migrations/20260623_fix_multitenancy_rls.sql`
- [ ] Anotar `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` do projeto dev
- [ ] Anotar `SUPABASE_URL` e `SUPABASE_ANON_KEY` do projeto dev (para o frontend)

### 2. Render (Backend Dev)

- [ ] Acessar [dashboard.render.com](https://dashboard.render.com)
- [ ] **New Web Service** → conectar ao mesmo repositório
- [ ] Branch: `develop`
- [ ] Root Directory: `backend`
- [ ] Build Command: `npm install`
- [ ] Start Command: `node index.js`
- [ ] Configurar variáveis de ambiente do serviço dev:
  ```
  SUPABASE_URL              = https://xxx-dev.supabase.co
  SUPABASE_SERVICE_ROLE_KEY = key_dev
  GEMINI_API_KEY            = sua_chave
  PORT                      = 3001
  ```
- [ ] Anotar a URL do serviço dev: `https://seguronamao-dev.onrender.com`

### 3. Vercel (Frontend Dev)

- [ ] Acessar [vercel.com](https://vercel.com) → projeto QuickAccess
- [ ] **Settings → Environment Variables**
- [ ] Adicionar variáveis para o ambiente **Preview** (branch `develop`):
  ```
  VITE_SUPABASE_URL      = https://xxx-dev.supabase.co
  VITE_SUPABASE_ANON_KEY = anon_key_dev
  VITE_BACKEND_URL       = https://seguronamao-dev.onrender.com
  ```
- [ ] Confirmar que as variáveis de **Production** continuam apontando para prod:
  ```
  VITE_SUPABASE_URL      = https://xxx-prod.supabase.co
  VITE_SUPABASE_ANON_KEY = anon_key_prod
  VITE_BACKEND_URL       = https://seguronamao-prod.onrender.com
  ```

### 4. Variáveis locais (desenvolvimento local)

Copie os exemplos e preencha com as credenciais do ambiente dev:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

`backend/.env`:
```
SUPABASE_URL=https://xxx-dev.supabase.co
SUPABASE_SERVICE_ROLE_KEY=key_dev
GEMINI_API_KEY=sua_chave
PORT=3001
```

`frontend/.env`:
```
VITE_SUPABASE_URL=https://xxx-dev.supabase.co
VITE_SUPABASE_ANON_KEY=anon_key_dev
VITE_BACKEND_URL=http://localhost:3001
```

---

## Fluxo para Nova Feature

```bash
# 1. Partir sempre de develop atualizado
git checkout develop
git pull origin develop

# 2. Criar branch de feature
git checkout -b feature/nome-da-feature

# 3. Desenvolver e commitar
git add .
git commit -m "feat: descrição"

# 4. Push e abrir PR para develop
git push -u origin feature/nome-da-feature
# Abrir PR: feature/nome-da-feature → develop

# 5. Após validação em develop, abrir PR: develop → main
```

## Fluxo para Hotfix em Produção

```bash
# 1. Partir de main
git checkout main
git pull origin main
git checkout -b fix/descricao-do-bug

# 2. Corrigir e commitar
git commit -m "fix: descrição"

# 3. PR para main + após merge, backmerge para develop
git checkout develop
git merge main
git push origin develop
```

---

## Migrations

**Regra:** sempre testar uma migration no ambiente dev antes de aplicar em prod.

Ordem de execução em um banco novo:
1. `supabase/schema.sql` (schema base)
2. `supabase/migrations/*.sql` (em ordem cronológica pelo nome do arquivo)

---

## Rollback da Migração ZeroServer

Ponto de restauração criado antes da migração: tag `v-pre-zeroserver`.

### Nível 1 — Rollback de tráfego (< 5 min, sem código)

```bash
# Redirecionar frontend de volta para Render no Vercel
vercel env rm VITE_BACKEND_URL production
vercel env add VITE_BACKEND_URL production   # inserir URL do Render
vercel --prod --force
```

### Nível 2 — Rollback de imagem no ZeroServer (3–5 min)

```bash
# Re-deploy da imagem anterior pelo SHA
zs deploy ghcr.io/SEU_USUARIO/seguronamao-backend:SHA_ANTERIOR --name backend
zs deploy ghcr.io/SEU_USUARIO/seguronamao-frontend:SHA_ANTERIOR --name frontend
zs list
```

### Nível 3 — Rollback completo de código

```bash
# Restaurar repositório ao estado pré-migração
git checkout v-pre-zeroserver
git checkout -b fix/revert-zeroserver
git push origin fix/revert-zeroserver
# Abrir PR: fix/revert-zeroserver → main
```

### Declaração de Go/No-Go

Só descomissionar Vercel + Render após **todos** os itens abaixo confirmados:

- [ ] `docker compose up` funciona localmente
- [ ] ZeroServer: `zs list` mostra status RUNNING
- [ ] HTTPS da URL pública abre no browser
- [ ] Login Magic Link funciona
- [ ] Listagem de apólices carrega
- [ ] Upload PDF extrai dados corretamente
- [ ] Isolamento multi-tenant validado
- [ ] 24h de uptime estável (`zs logs` sem erros)
