# API Reference — SeguroNaMão

> Base URL em produção: `https://app-xxx.apps.zeroserver.cc`
> Base URL local: `http://localhost:3001`

## Autenticação

Todas as rotas (exceto `/health`) exigem:

```
Authorization: Bearer <supabase_access_token>
```

O token é obtido via Supabase Auth (Magic Link) e enviado automaticamente pelo frontend em todas as chamadas.

---

## Roles e Permissões

| Role | Escopo |
|---|---|
| `superadmin` | Todas as rotas + acesso cross-org (bypass RLS) |
| `admin` | Rotas `/admin/*` + todas as rotas de `broker` |
| `broker` | Rotas `/api/*` dentro da própria organização |

---

## Rotas

### `GET /health`

Health check público. Sem autenticação.

**Resposta `200`:**
```json
{ "status": "ok", "timestamp": "2026-08-06T22:00:00.000Z" }
```

---

### Superadmin — `/superadmin/*`

> Requer `role = superadmin`

#### `GET /superadmin/metrics`

Métricas agregadas de todas as organizações.

**Resposta `200`:**
```json
{
  "totalOrgs": 5,
  "activeOrgs": 4,
  "totalUsers": 23,
  "totalPolicies": 312
}
```

#### `GET /superadmin/users`

Lista todos os usuários de todas as organizações.

#### `GET /superadmin/organizations/:orgId/users`

Usuários de uma organização específica.

#### `POST /superadmin/organizations`

Cria uma nova organização.

**Body:**
```json
{ "name": "Nome da Corretora", "plan": "basic" }
```

#### `POST /superadmin/superadmins`

Cria um novo superadmin.

**Body:**
```json
{ "name": "Nome", "email": "admin@exemplo.com" }
```

#### `POST /superadmin/users`

Cria um usuário em uma organização.

**Body:**
```json
{
  "name": "Nome",
  "email": "usuario@exemplo.com",
  "role": "admin" | "broker",
  "organization_id": "uuid"
}
```

---

### Admin — `/admin/*`

> Requer `role = admin`

#### `GET /admin/users`

Lista usuários da própria organização do admin.

#### `POST /admin/users`

Convida um novo usuário para a própria organização.

**Body:**
```json
{
  "name": "Nome",
  "email": "usuario@exemplo.com",
  "role": "broker"
}
```

---

### Corretores — `/api/*`

> Requer qualquer role autenticado

#### `POST /api/policies/upload`

Upload e processamento de PDF (apólice ou endosso).

**Request:** `multipart/form-data`
- Campo `file`: arquivo PDF (máx 10 MB)

**Fluxo interno:**
1. Valida MIME type (`application/pdf`)
2. Calcula SHA-256 e verifica duplicata
3. Faz upload para Supabase Storage
4. Envia para Gemini → detecta tipo + extrai dados
5. Salva no banco

**Respostas:**

| Código | Situação |
|---|---|
| `200` | Arquivo já processado anteriormente (duplicado) |
| `201` | Apólice ou endosso criado com sucesso |
| `202` | Endosso criado mas aguardando vínculo com apólice |

**Resposta `201` — apólice:**
```json
{
  "message": "Arquivo apolice.pdf processado com sucesso.",
  "alreadyExists": false,
  "document_type": "policy",
  "policyId": "uuid",
  "data": { ... }
}
```

**Resposta `202` — endosso pendente:**
```json
{
  "message": "Endosso 001 processado — aguardando vínculo.",
  "alreadyExists": false,
  "document_type": "endorsement",
  "endorsementId": "uuid",
  "applied": false,
  "pending": true,
  "data": { ... }
}
```

---

#### `GET /api/endorsements/pending`

Lista endossos pendentes de vínculo da organização do usuário.

**Resposta `200`:**
```json
[
  {
    "id": "uuid",
    "endorsement_number": "001",
    "type": "vehicle_change",
    "status": "pending",
    "expires_at": "2026-09-01T00:00:00Z"
  }
]
```

---

#### `GET /api/endorsements/:id/download`

Download do PDF de um endosso (retorna o arquivo diretamente).

**Resposta `200`:** `Content-Type: application/pdf`

---

#### `GET /api/policies/:policyId/download`

Download do PDF de uma apólice (retorna o arquivo diretamente).

**Resposta `200`:** `Content-Type: application/pdf`

---

## Erros Comuns

| Código | Mensagem | Causa |
|---|---|---|
| `400` | Nenhum arquivo PDF enviado | Campo `file` ausente no form |
| `401` | Sessão inválida ou expirada | Token Bearer inválido ou expirado |
| `403` | Usuário desabilitado | `is_active = false` no perfil |
| `403` | Organização desabilitada | `status != 'active'` na org |
| `403` | Acesso restrito a superadmins | Role insuficiente |
| `404` | Apólice não encontrada | ID inválido ou de outra org |
| `500` | Erro interno | Ver logs do backend |
