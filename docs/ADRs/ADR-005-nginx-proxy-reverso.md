# ADR-005 — Nginx como único ponto de entrada e proxy reverso

**Data:** 2026-07-28
**Status:** ✅ Aceita
**Contexto:** Roteamento de tráfego externo para os containers no ZeroServer

---

## Contexto

No ZeroServer, apenas **um serviço** pode ter `exposed: true` (URL pública). O frontend React é uma SPA que roda no browser do usuário — ele precisa chamar o backend Express diretamente. Como fazer o browser alcançar o backend se ele não tem URL pública?

## Decisão

Configurar o **container frontend (Nginx)** como proxy reverso: ele recebe todo o tráfego externo e encaminha as chamadas de API para o backend via rede interna do ZeroServer.

```nginx
# nginx.conf
location ~ ^/(api|admin|superadmin|health)(/|$) {
    proxy_pass http://backend:3001;
    proxy_read_timeout 300s;
    client_max_body_size 50M;
}

location / {
    try_files $uri $uri/ /index.html;  # SPA fallback
}
```

O browser chama sempre a **mesma URL** (o domínio público). Nginx roteia:
- `/api/*`, `/admin/*`, `/superadmin/*`, `/health` → backend interno
- `/*` → `index.html` do React SPA

## Alternativas Consideradas

| Alternativa | Motivo da rejeição |
|---|---|
| Expor backend publicamente (segundo `exposed: true`) | ZeroServer MVP só aceita exatamente 1 serviço exposto |
| Criar dois apps ZeroServer separados | Comunicação cruzada complexa; duas URLs para manter |
| Usar `VITE_BACKEND_URL` com URL do backend | Exigiria expor o backend publicamente; chicken-and-egg problem |
| API Gateway dedicado | Overhead desnecessário para escala atual |

## Consequências

**Positivas:**
- Backend nunca acessível diretamente da internet (segurança)
- `VITE_BACKEND_URL` é string vazia em produção — zero configuração de URL
- Upload de PDFs (até 50MB) configurado no Nginx sem timeout curto
- Estrutura idêntica à de grandes SPAs em produção

**Negativas / Trade-offs:**
- Nginx precisa conhecer os prefixos de rota do backend (acoplamento)
- Novo prefixo de rota no backend exige atualização do `nginx.conf` + rebuild da imagem frontend

## Padrão resultante

Qualquer nova rota do backend que precise ser acessível pelo browser **deve** ter prefixo `/api/`, `/admin/` ou `/superadmin/`. Se um novo prefixo for criado, atualizar `nginx.conf` e fazer rebuild do container frontend.

```javascript
// frontend: chamada correta em produção
const backendUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";
// Em prod: VITE_BACKEND_URL="" → chamada para /api/... → mesmo domínio → Nginx roteia
```
