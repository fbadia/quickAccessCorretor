# ADR-002 — Separação frontend/backend em containers independentes

**Data:** 2026-07
**Status:** ✅ Aceita
**Contexto:** Estratégia de containerização da aplicação

---

## Contexto

A aplicação precisava ser migrada para uma plataforma de containers (ZeroServer). A decisão era se empacotá-la em um único container (monolítico) ou em múltiplos containers especializados.

## Decisão

Dois containers independentes com responsabilidades claras:

1. **`frontend`** — Nginx servindo o bundle estático do React + proxy reverso para o backend
2. **`backend`** — Node.js rodando o servidor Express

Cada container tem seu próprio `Dockerfile` multi-stage com targets `dev` e `production`.

## Alternativas Consideradas

| Alternativa | Motivo da rejeição |
|---|---|
| Container único (Node serve frontend e backend) | Acoplamento total; impossibilidade de escalar partes separadas |
| 3 containers (nginx dedicado) | Complexidade desnecessária; o Nginx pode viver no container frontend |
| Serverless (funções individuais) | ZeroServer MVP não suporta; complexidade de cold start |

## Consequências

**Positivas:**
- Imagem de produção do frontend não precisa do Node.js (~150MB vs ~5MB de Nginx Alpine)
- Backend e frontend podem ser redeploy independentemente
- Hot-reload funcional em dev (`docker compose up`)
- Separação de variáveis: `VITE_*` são build-time no frontend; credenciais reais só no backend

**Negativas / Trade-offs:**
- Dois Dockerfiles para manter
- Build do frontend precisa das variáveis Supabase em tempo de build (não runtime)
- CI/CD precisa buildar e fazer push de duas imagens

## Padrão resultante

```yaml
# docker-compose.yml (dev)
services:
  backend:   # nodemon, porta 3001
  frontend:  # vite dev, porta 5173, VITE_BACKEND_URL=http://localhost:3001

# zs.yaml (prod)
services:
  - name: backend   # interno, sem URL pública
  - name: frontend  # exposed: true, Nginx com proxy reverso
```
