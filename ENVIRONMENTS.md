# Configuração de Ambientes — QuickAccessCorretor

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

### Produção (`main`)

| Serviço | Configuração |
|---------|-------------|
| **Frontend** | Vercel — auto-deploy em push para `main` |
| **Backend** | Render — deploy manual ou auto em push para `main` |
| **Banco** | Supabase projeto de **produção** |

### Desenvolvimento (`develop`)

| Serviço | Configuração |
|---------|-------------|
| **Frontend** | Vercel — preview automático da branch `develop` |
| **Backend** | Render — segundo serviço apontando para branch `develop` |
| **Banco** | Supabase projeto de **desenvolvimento** (dados de teste) |

---

## Checklist de Configuração Inicial

### 1. Supabase (Banco de Dados Dev)

- [ ] Criar novo projeto em [supabase.com](https://supabase.com): `quickaccess-dev`
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
- [ ] Anotar a URL do serviço dev: `https://quickaccess-dev.onrender.com`

### 3. Vercel (Frontend Dev)

- [ ] Acessar [vercel.com](https://vercel.com) → projeto QuickAccess
- [ ] **Settings → Environment Variables**
- [ ] Adicionar variáveis para o ambiente **Preview** (branch `develop`):
  ```
  VITE_SUPABASE_URL      = https://xxx-dev.supabase.co
  VITE_SUPABASE_ANON_KEY = anon_key_dev
  VITE_BACKEND_URL       = https://quickaccess-dev.onrender.com
  ```
- [ ] Confirmar que as variáveis de **Production** continuam apontando para prod:
  ```
  VITE_SUPABASE_URL      = https://xxx-prod.supabase.co
  VITE_SUPABASE_ANON_KEY = anon_key_prod
  VITE_BACKEND_URL       = https://quickaccess-prod.onrender.com
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
