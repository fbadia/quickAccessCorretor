# Sprint 2 — Qualidade, Confiabilidade e Alertas de Vencimento

**Período:** 2026-10-14 → a definir (proposta: 2 semanas)  
**Status:** 📝 Proposta — aguardando aprovação de escopo (Gate 1)  
**Objetivo:** Tornar o SeguroNaMão confiável para operar em produção — deploy funcionando e verificado, ambientes de teste isolados do banco de produção, testes automatizados como gate de merge e falhas visíveis antes de chegarem ao corretor — e entregar ao corretor a visão de apólices próximas do vencimento.

**Épicos relacionados:** [Épico 1 — Qualidade e Confiabilidade](../roadmap.md) · [Épico 3 — Busca e Consulta](../roadmap.md)

---

## Contexto

A [Sprint 1](./sprint-1.md) entregou a criptografia e a conformidade LGPD, mas expôs fragilidades operacionais:

- **O deploy da `develop` falhou de 2026-09-04 a 2026-10-14** (`ZS_TOKEN` de sessão expirado) e ninguém percebeu por mais de um mês. Corrigido com uma API key, mas sem nenhum alerta de falha.
- **Homologação e produção são o mesmo app:** o `zs.yaml` usa o nome `seguronamao` para qualquer branch e, sem o secret `ZS_TOKEN_DEV`, o deploy da `develop` usa a mesma conta da produção. O merge da Sprint 1 na `develop` substituiu o app de produção.
- **Não há ambiente de teste isolado:** o `.env` local e o `zs.yaml` (fixo para todas as branches) apontam para o Supabase de produção. Os testes da Sprint 1 gravaram e apagaram dados no banco de produção.
- **Dependências externas falharam em silêncio:** o modelo `gemini-1.5-flash` foi descontinuado e os créditos do Gemini acabaram; ambos só apareceram como erros de upload.
- **Não há testes automatizados de API:** o backend não tem script `test`. A validação da Sprint 1 foi manual ou chamando funções diretamente. O `test_agent.py` (Python) existe, mas não roda no CI.
- **O backend sobe "saudável" sem Supabase:** com o `.env` não carregado, o `/health` respondia `ok` e todas as rotas autenticadas davam 500.

Do lado do produto, o app já mostra "Ativa/Vencida" por apólice, mas o corretor não consegue ver quais apólices **vão vencer** — e a renovação é o momento de maior valor (e receita) para ele.

---

## User Stories da Sprint (`pm-agent`)

### 📋 STORY 2.0: Destravar e Verificar o Deploy de Homologação *(bloqueio herdado — T1.18)*
**Como** responsável pelo produto  
**Quero** que todo merge na `develop` seja publicado e verificado automaticamente  
**Para que** a homologação reflita o código atual e falhas de deploy sejam notadas no mesmo dia.

#### Critérios de Aceite (Gherkin):
- [x] **Autenticação estável no CI:** Dado o workflow de deploy, quando ele autenticar no ZeroServer, então deve usar uma API key (`zsk_...`) em vez de token de sessão. *(2026-10-14)*
- [x] **Deploy atualizado:** Dado o merge do PR #2, quando o deploy terminar, então `zs list` mostra o app `RUNNING` com o código atual. *(2026-10-14 — deploy `SUCCESS`, `/health` ok)*
- [x] **Chaves compatíveis:** Dado o app publicado, quando o corretor fizer login e visualizar clientes e apólices, então os dados aparecem decifrados. *(2026-10-14 — validado pelo responsável)*
- [ ] **Falha visível:** Dado um deploy que falhe, então o responsável é notificado (e-mail do GitHub Actions habilitado e verificado).
- [ ] **Go/No-Go da Sprint 0:** checklist validado e decisão registrada sobre descomissionar Vercel + Render.

**Complexidade:** S  
**Dependências:** ~~API key do ZeroServer~~ (criada em 2026-10-14).

---

### 📋 STORY 2.1: Ambientes Isolados — Homologação Separada de Produção
**Como** desenvolvedor  
**Quero** que homologação e produção sejam ambientes separados de ponta a ponta — app no ZeroServer, banco Supabase e chaves  
**Para que** um merge na `develop` nunca chegue aos corretores e testes, migrations e backfills nunca toquem dados reais.

#### Critérios de Aceite (Gherkin):
- [ ] **Projeto dev criado:** Dado um novo projeto Supabase (dev), quando `schema.sql` e as migrations forem aplicados em ordem cronológica, então o schema é idêntico ao de produção.
- [ ] **App de homologação no ZeroServer:** Dado um deploy da `develop`, então ele publica num app próprio (ex.: `seguronamao-dev`, com URL própria); dado um deploy da `main`, então publica no app `seguronamao`. Um deploy nunca altera o app do outro ambiente.
- [ ] **Configuração por branch:** Dado um deploy da `develop`, então backend e frontend usam o Supabase dev; dado um deploy da `main`, então usam o de produção. O `zs.yaml` deixa de ter o nome do app, a URL e a anon key fixos.
- [ ] **CORS e URLs:** Dado o app de homologação, então o CORS do backend aceita a URL dele, e o `ENVIRONMENTS.md` registra a URL de cada ambiente.
- [ ] **Chaves por ambiente:** Dado o ambiente dev, então ele usa chaves de criptografia próprias (diferentes das de produção), em secrets de ambiente do GitHub (`development` / `production`).
- [ ] **Ambiente local seguro:** Dado o `backend/.env.example` e o `docker-compose.yml`, então apontam para o Supabase dev, e o `AGENTS.md`/`ENVIRONMENTS.md` documentam o fluxo.
- [ ] **Dados de teste:** Dado o banco dev, então existe um seed com organizações e usuários de cada papel (superadmin, admin, corretor) e PDFs fictícios.

**Complexidade:** M  
**Dependências:** Criação do projeto Supabase de testes (ação do responsável). Decidir se a homologação usa a mesma conta do ZeroServer (com app de nome diferente) ou uma conta separada (`ZS_TOKEN_DEV`).

---

### 📋 STORY 2.2: Testes Automatizados de API como Gate de Merge
**Como** desenvolvedor  
**Quero** uma suíte de testes de API que rode em todo PR  
**Para que** regressões em autenticação, isolamento multi-tenant e criptografia sejam bloqueadas antes do merge.

#### Critérios de Aceite (Gherkin):
- [ ] **Suíte executável:** Dado o backend, quando rodar `npm test`, então executa os testes unitários (`testCryptoService.js` migrado) e os de API.
- [ ] **Cobertura por papel:** Dado cada rota crítica (upload, listagem, download, anonimização, vínculo de endosso), então há testes para admin, corretor, usuário de outra organização e sem token, com os status esperados (2xx / 403 / 404 / 401).
- [ ] **Criptografia verificada:** Dado um upload no teste, então o registro gravado no banco contém `enc:v1:` em nome, CPF e placa, e o PDF no Storage começa com o envelope `SNM1`.
- [ ] **Gemini isolado:** Dado o ambiente de teste, então a extração é simulada (mock) — os testes não consomem créditos nem dependem da API.
- [ ] **Gate no CI:** Dado um PR para `develop` ou `main`, quando os testes falharem, então o merge fica bloqueado (workflow `ci.yml` + branch protection).

**Complexidade:** L  
**Dependências:** Story 2.1 (testes rodam contra o Supabase dev).

---

### 📋 STORY 2.3: Fail-fast e Health Check Real
**Como** responsável pela operação  
**Quero** que o backend se recuse a subir sem as dependências essenciais e que o `/health` reflita o estado real  
**Para que** um backend mal configurado seja detectado no deploy, e não pelo corretor.

#### Critérios de Aceite (Gherkin):
- [ ] **Fail-fast do Supabase:** Dado `SUPABASE_URL` ou `SUPABASE_SERVICE_ROLE_KEY` ausentes ou inválidos, quando o backend iniciar, então ele encerra com erro claro (como já ocorre com as chaves de criptografia em produção).
- [ ] **Health real:** Dado `GET /health`, então ele verifica a conexão com o Supabase e a configuração de criptografia e retorna `503` se algo falhar — sem expor detalhes internos.
- [ ] **Deploy verificado:** Dado o passo final do workflow de deploy, então ele consulta o `/health` da homologação e falha o job se não responder `200`.

**Complexidade:** S  
**Dependências:** Nenhuma.

---

### 📋 STORY 2.4: Monitoramento de Erros e Alertas de Dependências Externas
**Como** responsável pelo produto  
**Quero** ser alertado quando erros acontecerem em produção — especialmente falhas do Gemini  
**Para que** problemas como créditos esgotados ou modelo descontinuado sejam resolvidos antes de afetar os corretores.

#### Critérios de Aceite (Gherkin):
- [ ] **Captura de erros:** Dado um erro não tratado no backend ou no frontend, então ele é registrado na ferramenta de monitoramento com contexto técnico (rota, status, organização por ID).
- [ ] **Sem PII:** Dado qualquer evento enviado ao monitoramento, então não contém nome, CPF, placa, e-mail, nome de arquivo nem conteúdo de PDF (filtro de envio + teste).
- [ ] **Alerta do Gemini:** Dado um erro 402 (créditos), 404 (modelo indisponível) ou falhas consecutivas de extração, então um alerta é enviado ao responsável.
- [ ] **Logs estruturados:** Dado o backend, então os logs saem em JSON com nível (`info`/`warn`/`error`), mantendo a regra de nunca logar PII.

**Complexidade:** M  
**Dependências:** Decisão da ferramenta (ver "Decisões necessárias").

---

### 📋 STORY 2.5: Rate Limiting no Upload e nas Rotas Sensíveis
**Como** responsável pela segurança e pelos custos  
**Quero** limitar o volume de requisições por usuário nas rotas caras ou sensíveis  
**Para que** abuso ou erro de cliente não esgote os créditos do Gemini nem sobrecarregue o backend.

#### Critérios de Aceite (Gherkin):
- [ ] **Limite no upload:** Dado um usuário enviando PDFs, quando exceder o limite por minuto, então recebe `429` com mensagem amigável e `Retry-After`; o envio de um lote legítimo (ex.: 150 PDFs com o upload sequencial do app) continua funcionando.
- [ ] **Limite por usuário:** Dado o limitador, então a chave é o ID do usuário autenticado (não só o IP, já que o tráfego passa pelo Nginx).
- [ ] **Rotas sensíveis:** Dado as rotas de anonimização e de criação de usuários, então também têm limite.

**Complexidade:** S  
**Dependências:** Nenhuma.

---

### 📋 STORY 2.6: Filtro e Alertas de Vencimento no App
**Como** corretor de seguros  
**Quero** ver quais apólices vão vencer nos próximos dias  
**Para que** eu entre em contato com o segurado a tempo de renovar.

#### Critérios de Aceite (Gherkin):
- [ ] **Indicador por apólice:** Dado uma apólice que vence em até 30 dias, então o card mostra "Vence em N dias" com destaque visual (além de "Ativa"/"Vencida").
- [ ] **Filtro de vencimento:** Dado a lista de apólices, quando o corretor escolher "Vencendo em 7 / 15 / 30 dias" ou "Vencidas", então a lista mostra só as correspondentes, combinável com a busca por nome/placa.
- [ ] **Resumo na tela inicial:** Dado o corretor abrindo o app, então vê um contador de apólices vencendo nos próximos 30 dias, que leva à lista filtrada.
- [ ] **Mobile-first:** Dado uma tela de 375px, então filtro, contador e indicador funcionam sem quebra de layout, nos temas claro e escuro.

**Complexidade:** M  
**Dependências:** Nenhuma (os dados de vigência já chegam decifrados via `GET /api/vehicles`).

---

## Tabela de Tarefas e Agentes Responsáveis

| ID | Tarefa | Story | Agente Responsável | Status |
|---|---|---|---|:---:|
| **T2.1** | Criar API key no ZeroServer e atualizar o secret `ZS_TOKEN` | 2.0 | Responsável (manual) | ✅ |
| **T2.2** | Re-executar o deploy, validar o app e as chaves; fechar T1.18 da Sprint 1 | 2.0 | `devops-agent` | ✅ |
| **T2.3** | Habilitar e testar notificação de falha de workflow; checklist Go/No-Go | 2.0 | `devops-agent` | ⏳ |
| **T2.4** | Criar projeto Supabase dev e aplicar schema + migrations | 2.1 | Responsável (manual) + `devops-agent` | ⏳ |
| **T2.5** | GitHub Environments (`development`/`production`) com secrets por ambiente; `zs.yaml` e `deploy.yml` sem nome de app, URL e anon key fixos | 2.1 | `devops-agent` | ⏳ |
| **T2.5b** | App de homologação no ZeroServer (`seguronamao-dev`) e CORS para a URL dele | 2.1 | `devops-agent` | ⏳ |
| **T2.6** | Seed do banco dev (organizações, usuários por papel, PDFs fictícios) | 2.1 | `developer-agent` | ⏳ |
| **T2.7** | Separar `app` de `app.listen` no `index.js` para permitir testes | 2.2 | `developer-agent` | ⏳ |
| **T2.8** | Suíte `npm test` (node:test + supertest) com mock do Gemini | 2.2 | `qa-agent` | ⏳ |
| **T2.9** | Testes de API por papel nas rotas críticas | 2.2 | `qa-agent` | ⏳ |
| **T2.10** | Workflow `ci.yml` em PRs + branch protection em `develop` e `main` | 2.2 | `devops-agent` | ⏳ |
| **T2.11** | Fail-fast do Supabase e `/health` real | 2.3 | `developer-agent` | ⏳ |
| **T2.12** | Verificação do `/health` no fim do deploy | 2.3 | `devops-agent` | ⏳ |
| **T2.13** | Integrar a ferramenta de monitoramento (backend + frontend) com filtro de PII | 2.4 | `developer-agent` / `security-agent` | ⏳ |
| **T2.14** | Alertas de falhas do Gemini | 2.4 | `developer-agent` | ⏳ |
| **T2.15** | Logs estruturados em JSON | 2.4 | `developer-agent` | ⏳ |
| **T2.16** | Rate limiting por usuário (upload, anonimização, criação de usuários) | 2.5 | `developer-agent` | ⏳ |
| **T2.17** | Indicador, filtro e contador de vencimento no `App.jsx` | 2.6 | `developer-agent` | ⏳ |
| **T2.18** | Documentação (`AGENTS.md`, `ENVIRONMENTS.md`, `api.md`) e roadmap atualizado | — | `documentation-agent` | ⏳ |

---

## Decisões Necessárias Antes de Começar

| # | Decisão | Opções | Recomendação |
|---|---|---|---|
| D1 | Ferramenta de monitoramento de erros (Story 2.4) | Sentry (plano gratuito) · Better Stack · só logs + alerta por e-mail | ✅ **Decidido: Sentry** — SDK para Node e React, filtro de envio (`beforeSend`) para remover PII, alertas por e-mail no plano gratuito |
| D2 | Banco de testes (Story 2.1) | Segundo projeto Supabase · banco em container no ZeroServer | ✅ **Decidido: duas instâncias Supabase** (produção e testes). O banco em container no ZeroServer foi avaliado e fica no backlog como ADR futura (ver nota abaixo) |
| D3 | Limites do rate limiting (Story 2.5) | Ex.: 60 uploads/min por usuário | ✅ **Decidido:** limite conservador nesta sprint. O upload hoje é sequencial (~5 s por apólice); a performance do upload em lote vai para o roadmap |
| D4 | Alertas de vencimento (Story 2.6) | Só no app · e-mail · push (PWA) | ⏳ **Em discussão:** o responsável tem uma ideia de feature para avisos de vencimento |

> **Nota sobre D2 — por que não o banco em container no ZeroServer agora:** o app usa do Supabase muito mais que o PostgreSQL — Auth (Magic Link), Storage (PDFs), RLS com `auth.uid()` e o cliente `supabase-js` consultando o banco direto do frontend. Um PostgreSQL em container (`zs db`) substituiria só o banco, exigindo reescrever autenticação, armazenamento e as consultas do frontend; e auto-hospedar o Supabase completo são cerca de 10 serviços, com backup e atualizações por nossa conta. A vantagem real (dados em nós brasileiros, custo) justifica uma ADR própria, não uma tarefa desta sprint.

---

## Fora do Escopo (backlog)

Itens levantados na Sprint 1 que ficam para sprints seguintes, salvo se houver capacidade:

- Botão de anonimização no app (hoje só pela API).
- Decisão de produto sobre apólices residenciais e empresariais (entram sem placa).
- Procedimento documentado de rotação das chaves de criptografia.
- Testes E2E do frontend.
- Alertas de vencimento por e-mail ou push.
- **Performance do upload em lote:** hoje ~5 s por apólice, uma por vez (upload sequencial no app + extração síncrona no Gemini). Avaliar processamento paralelo/fila assíncrona.
- **ADR: banco de dados no ZeroServer** (PostgreSQL em container vs. Supabase gerenciado).
- Revisão geral do roadmap (desatualizado desde 2026-08-06 — ex.: "busca por placa/nome" já existe).

---

## Gates de Qualidade da Sprint

* **Gate 1 — Aprovação de Escopo:** Stories, decisões D1–D4 e prioridades aprovadas pelo responsável.
* **Gate 2 — Revisão de Código e Testes:** Code review sem bloqueadores; `npm test` passando no CI; nenhum teste toca o Supabase de produção.
* **Gate 3 — Auditoria e Deploy:** Auditoria de segurança das mudanças (com foco em PII no monitoramento e nos logs); deploy em homologação verificado pelo `/health`; filtro de vencimento validado em tela de 375px.

**Ordem sugerida:** 2.0 (✅ parcial) → 2.1 → 2.3 → 2.2 → 2.5 → 2.4 → 2.6. A separação dos ambientes sobe para o início: enquanto ela não existir, todo merge na `develop` vai direto para produção. O ambiente de testes vem antes dos testes automatizados, que dependem dele.

---

## Retrospectiva

> *A preencher ao final da sprint.*

**O que funcionou bem:**
- ...

**O que pode melhorar:**
- ...

**Itens para próxima sprint:**
- ...
