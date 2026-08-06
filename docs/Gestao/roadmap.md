# Roadmap — SeguroNaMão

> Visão de produto e entregas planejadas. Atualizado ao final de cada sprint.
> **Última atualização:** 2026-08-06

---

## Visão de Produto

Tornar o SeguroNaMão a ferramenta de referência para corretores de seguros automotivos brasileiros acessarem dados de apólices e contatos de assistência de qualquer lugar, sem depender de acesso ao sistema da corretora.

**Público-alvo:** Corretores de seguros automotivos (mobile-first)
**Modelo:** SaaS multi-tenant por organização (corretora)

---

## Status Atual

| Módulo | Status |
|---|---|
| Autenticação via Magic Link | ✅ Pronto |
| Upload e extração de apólices via Gemini | ✅ Pronto |
| Gestão de apólices e veículos | ✅ Pronto |
| Gestão de segurados (clientes) | ✅ Pronto |
| Gestão de seguradoras e contatos | ✅ Pronto |
| Endossos (criação e vínculo) | ✅ Pronto |
| Dashboard superadmin | ✅ Pronto |
| Gestão de usuários e organizações | ✅ Pronto |
| PWA (instalável no celular) | ✅ Pronto |
| Containerização Docker | ✅ Pronto |
| Deploy ZeroServer | 🔄 Em andamento |
| CI/CD automatizado (GitHub Actions) | 🔄 Em andamento |
| CORS atualizado para ZeroServer URL | ⏳ Pendente |

---

## Épicos e Entregas

### 🏁 Épico 0 — Infraestrutura e Deploy (Sprint 0)

**Objetivo:** Migrar a aplicação para containers Docker e fazer o primeiro deploy no ZeroServer.

| Item | Status |
|---|---|
| Dockerfiles multi-stage (backend + frontend) | ✅ |
| nginx.conf com proxy reverso | ✅ |
| docker-compose.yml para dev local | ✅ |
| zs.yaml (manifesto ZeroServer) | ✅ |
| GitHub Actions CI/CD | ✅ |
| Login no GHCR e push das imagens | 🔄 |
| Deploy no ZeroServer (`zs deploy`) | ⏳ |
| Configurar secrets GitHub Actions | ⏳ |
| Atualizar CORS com URL do ZeroServer | ⏳ |
| Descomissionar Vercel + Render | ⏳ |

---

### 📱 Épico 1 — Qualidade e Confiabilidade

**Objetivo:** Garantir estabilidade do sistema em produção.

| Item | Prioridade | Status |
|---|---|---|
| Testes automatizados (backend) | Alta | ⏳ |
| Testes E2E (frontend) | Média | ⏳ |
| Monitoramento de erros (Sentry ou similar) | Alta | ⏳ |
| Alertas de saúde do sistema | Média | ⏳ |
| Rate limiting nas rotas de upload | Alta | ⏳ |
| Logging estruturado com nível de log | Média | ⏳ |

---

### 🔐 Épico 2 — Segurança e Compliance

**Objetivo:** Garantir conformidade com LGPD e boas práticas de segurança.

| Item | Prioridade | Status |
|---|---|---|
| Auditoria completa de segurança | Alta | ⏳ |
| Política de retenção de dados | Alta | ⏳ |
| Termo de uso e política de privacidade | Alta | ⏳ |
| 2FA opcional para admins | Baixa | ⏳ |
| Rotação de credenciais (Supabase keys) | Média | ⏳ |

---

### 💼 Épico 3 — Produto: Busca e Consulta

**Objetivo:** Tornar a busca de apólices e segurados mais rápida e eficiente.

| Item | Prioridade | Status |
|---|---|---|
| Busca por placa do veículo | Alta | ⏳ |
| Busca full-text por nome do segurado | Alta | ⏳ |
| Filtro por seguradora | Média | ⏳ |
| Filtro por vigência (vencendo em X dias) | Alta | ⏳ |
| Alertas de apólices próximas do vencimento | Alta | ⏳ |
| Exportação de lista em PDF/Excel | Baixa | ⏳ |

---

### 🤖 Épico 4 — Automação via Google Drive

**Objetivo:** Processamento automático de PDFs enviados à pasta do Drive.

| Item | Prioridade | Status |
|---|---|---|
| Integração com Google Drive API | Média | ⏳ |
| Watcher de pasta Drive (polling ou webhook) | Média | ⏳ |
| Processamento automático sem upload manual | Média | ⏳ |
| Dashboard de sincronização (`last_sync_at`) | Baixa | ⏳ |

> Nota: `GOOGLE_DRIVE_FOLDER_ID` e `GOOGLE_SERVICE_ACCOUNT_JSON` já estão previstos no backend.

---

### 💰 Épico 5 — Monetização e Crescimento

**Objetivo:** Estruturar o modelo de negócio SaaS.

| Item | Prioridade | Status |
|---|---|---|
| Definição de planos (basic, pro, enterprise) | Alta | ⏳ |
| Integração com gateway de pagamento | Alta | ⏳ |
| Onboarding guiado para novas corretoras | Média | ⏳ |
| Página de marketing / landing page | Média | ⏳ |
| Trial gratuito por 30 dias | Média | ⏳ |

---

## Legenda

| Símbolo | Significado |
|---|---|
| ✅ | Concluído |
| 🔄 | Em andamento |
| ⏳ | Pendente / Backlog |
| ❌ | Cancelado |
