# Sprint 1 — Segurança de Dados e Conformidade LGPD

**Período:** 2026-09-04 → 2026-10-14 (desenvolvimento concluído; aguardando validação em homologação)  
**Status:** ✅ Gates 1 e 2 concluídos · Gate 3: auditoria ✅, busca sem regressão ✅, deploy em homologação ⏳  
**Objetivo:** Implementar a arquitetura de segurança e conformidade LGPD aprovada na ADR-007, introduzindo criptografia em repouso no Storage de apólices, criptografia em nível de aplicação (ALE) para dados de clientes/veículos no banco com preservação da busca instantânea no frontend, blindagem de cache PWA e rotina de direito ao esquecimento.

**Épico relacionado:** [Épico — Segurança e Conformidade LGPD](../../ADRs/ADR-007-conformidade-lgpd-criptografia-dados.md)

---

## Contexto

A [ADR-007](../../ADRs/ADR-007-conformidade-lgpd-criptografia-dados.md) foi aprovada para sanar as vulnerabilidades de armazenamento de dados sensíveis (PII) e PDFs em texto limpo. Esta sprint executa o plano técnico em 4 fases incrementais coordenadas entre o time de agentes.

**ADR aprovada nesta sprint:**
* [ADR-007 — Proteção de Dados Sensíveis e Conformidade com a LGPD](../../ADRs/ADR-007-conformidade-lgpd-criptografia-dados.md) (✅ Aceita)

---

## User Stories da Sprint (`pm-agent`)

### 📋 STORY 1.1: Criptografia de Apólices em Repouso no Storage
**Como** corretor de seguros credenciado  
**Quero** que os arquivos PDF de apólices e endossos sejam salvos criptografados no Supabase Storage  
**Para que** nenhum atacante tenha acesso a contratos de clientes caso o bucket ou credenciais S3 sejam comprometidos.

#### Critérios de Aceite (Gherkin):
- [x] **Cifragem no Upload:** Dado o upload de um PDF no endpoint `POST /api/policies/upload`, quando o backend enviar o arquivo ao Supabase Storage, então ele deve ser cifrado com AES-256-GCM antes de ser transmitido.
- [x] **Decifragem no Download:** Dado um corretor autenticado solicitando download via `GET /api/policies/:policyId/download`, quando o backend buscar o blob cifrado, então deve decifrá-lo em memória e retornar o PDF legível com cabeçalho `Cache-Control: private, no-store`.
- [x] **Isolamento Multi-tenant:** Dado um usuário de outra organização tentando baixar o arquivo, o sistema deve retornar 403 / 404 sem decifrar o buffer.

> **Validação:** upload de 12 PDFs com cifragem SNM1 confirmada no log; 50/50 PDFs baixados e legíveis após o backfill; a rota de download busca a apólice filtrando por `organization_id` antes de decifrar (404 para outra organização).

**Complexidade:** M  
**Dependências:** Geração de segredo `STORAGE_ENCRYPTION_KEY`.

---

### 📋 STORY 1.2: Minimização de Dados e Sanitização no Pipeline Gemini
**Como** responsável pela privacidade dos dados  
**Quero** que a extração por IA capture estritamente os campos necessários do contrato  
**Para que** informações irrelevantes de terceiros ou dados financeiros dispensáveis não sejam persistidos.

#### Critérios de Aceite (Gherkin):
- [x] **Structured Outputs:** Dado o processamento de um documento no `geminiService.js`, quando a API do Gemini for acionada, então a chamada deve utilizar `responseSchema` com tipagem fechada para apólices e endossos.
- [x] **Sanitização do JSONB:** Dado o salvamento da apólice em `savePolicyData()`, quando o payload `raw_extracted_data` for gravado, então campos não essenciais ou excedentes devem ser removidos.

> **Validação:** `responseSchema` fechado com todos os campos obrigatórios (aceitando `null`) e `sanitizeExtractedData()`; 8 PDFs fictícios de seguradoras diferentes extraídos corretamente. Além da minimização, os campos pessoais do `raw_extracted_data` passaram a ser **cifrados** (`protectExtractedData`).

**Complexidade:** S  
**Dependências:** Nenhuma.

---

### 📋 STORY 1.3: Isolamento de Cache no Frontend PWA
**Como** corretor utilizando o aplicativo no smartphone  
**Quero** que as requisições com dados de segurados não fiquem persistidas no cache local do dispositivo  
**Para que** os dados não fiquem expostos após encerramento da sessão ou em caso de perda do aparelho.

#### Critérios de Aceite (Gherkin):
- [x] **Workbox NetworkOnly:** Dado o Service Worker configurado no `frontend/vite.config.js`, quando ocorrer qualquer requisição para `/api/*` ou endpoints do Supabase, então o handler deve ser estritamente `NetworkOnly`.

> **Validação:** regra `NetworkOnly` para `/api`, `/admin`, `/superadmin` e `*.supabase.co`, conferida no `sw.js` gerado pelo build.

**Complexidade:** S  
**Dependências:** Nenhuma.

---

### 📋 STORY 1.4: Criptografia no Banco (ALE) com Busca Parcial no Frontend
**Como** corretor buscando clientes no SeguroNaMão  
**Quero** pesquisar apólices por trecho do nome do cliente ou placa  
**Para que** eu localize o segurado rapidamente, mantendo o banco protegido contra vazamentos de dumps.

#### Critérios de Aceite (Gherkin):
- [x] **Proteção contra Dump:** Dado um dump SQL do banco (`pg_dump`), quando inspecionadas as tabelas `clients` e `vehicles`, então os campos `name`, `cpf_cnpj` e `plate` devem conter apenas ciphertexts ilegíveis.
- [x] **Listagem Segura via Backend:** Dado o carregamento da lista de apólices no app, quando o frontend autenticado chamar o backend, então o backend decifra os registros da organização em memória e entrega o JSON para a sessão do corretor.
- [x] **Busca Parcial Instantânea:** Dado um corretor digitando qualquer parte do nome (ex.: "Silv", "Carlos") ou placa, o frontend React deve filtrar os resultados instantaneamente sem falhas.
- [x] **Blind Index:** Para validações exatas no banco (ex.: deduplicação de CPF/placa), colunas determinísticas HMAC-SHA256 (`cpf_bidx`, `plate_bidx`) devem ser utilizadas.

> **Validação:** após o backfill (`encryptLegacyData.js --apply`), 0 registros legíveis em `clients` (29), `vehicles` (50) e `raw_extracted_data` (50); 50/50 veículos decifrados pela listagem; busca parcial testada no app sem regressão.

**Complexidade:** L  
**Dependências:** Story 1.1 e migrations no Supabase.

---

### 📋 STORY 1.5: Direito ao Esquecimento e Anonimização (Art. 18 LGPD)
**Como** titular de dados ou administrador de corretora  
**Quero** solicitar a exclusão / anonimização dos dados de um segurado  
**Para que** a plataforma cumpra a obrigação legal de eliminação de dados da LGPD.

#### Critérios de Aceite (Gherkin):
- [x] **Exclusão do Storage:** Dado o comando de anonimização/exclusão de uma apólice, o arquivo cifrado correspondente no Supabase Storage deve ser deletado fisicamente.
- [x] **Anonimização Cadastral:** Caso a apólice deva ser mantida por exigência regulatória fiscal/SUSEP, os dados pessoais devem ser substituídos por valores anonimizados irreversíveis (`name = "TITULAR ANONIMIZADO"`, `cpf_cnpj = NULL`).

> **Validação:** teste em apólice da organização de teste — outra organização bloqueada (404); PDF apagado do Storage; titular `TITULAR ANONIMIZADO` com `cpf_cnpj` e `cpf_bidx` nulos; veículo anonimizado; segunda execução sem erro. Rota protegida por `authenticate` + `requireOrgAdmin` (401 sem token ou com token inválido).

**Complexidade:** M  
**Dependências:** Story 1.4.

---

## Tabela de Tarefas e Agentes Responsáveis

| ID | Tarefa | Agente Responsável | Status |
|---|---|---|:---:|
| **T1.1** | Atualizar `.env.example` com chaves de criptografia e HMAC | `developer-agent` | ✅ Concluído |
| **T1.2** | Criar módulo de criptografia AES-256-GCM (`backend/cryptoService.js`) | `developer-agent` | ✅ Concluído |
| **T1.3** | Integrar criptografia no upload e download de PDFs (`storageService.js` e `index.js`) | `developer-agent` | ✅ Concluído |
| **T1.4** | Configurar sanitização e minimização no `geminiService.js` | `developer-agent` | ✅ Concluído |
| **T1.5** | Atualizar regras de cache no `frontend/vite.config.js` (`NetworkOnly`) | `developer-agent` | ✅ Concluído |
| **T1.6** | Testes unitários para o módulo criptográfico e compatibilidade (`testCryptoService.js`) | `qa-agent` | ✅ Concluído |
| **T1.7** | Migration SQL para colunas de blind index (`bidx`) e bucket policies | `architect-agent` / `developer-agent` | ✅ Concluído |
| **T1.8** | Endpoint de listagem `GET /api/vehicles` com decifração em memória | `developer-agent` | ✅ Concluído |
| **T1.9** | Endpoint de Direito ao Esquecimento `DELETE /api/policies/:id` | `developer-agent` | ✅ Concluído |
| **T1.10** | Documentação técnica em `docs/api.md`, `ADR-007` e sprint report | `documentation-agent` | ✅ Concluído |
| **T1.11** | Correções do code review (10 itens — ver notas do Gate 2) | `developer-agent` | ✅ Concluído |
| **T1.12** | Troca do modelo do Gemini (`gemini-1.5-flash` descontinuado → `gemini-flash-latest`) e fallback em 503/429 | `developer-agent` | ✅ Concluído |
| **T1.13** | Upload sem PDFs órfãos: extração antes do Storage e limpeza em caso de falha | `developer-agent` | ✅ Concluído |
| **T1.14** | Cifragem dos campos pessoais no `raw_extracted_data` | `developer-agent` | ✅ Concluído |
| **T1.15** | Script de backfill dos dados legados (`encryptLegacyData.js`) — aplicado | `developer-agent` | ✅ Concluído |
| **T1.16** | Auditoria de segurança do PR e correção dos achados pré-existentes | `security-agent` | ✅ Concluído |
| **T1.17** | Atualização do `AGENTS.md` e documentação | `documentation-agent` | ✅ Concluído |
| **T1.18** | Merge na `develop` e validação do deploy em homologação | `devops-agent` | ⏳ Pendente |

---

## Gates de Qualidade da Sprint

* **Gate 1 — Aprovação de Escopo:** User Stories e ADR-007 aprovadas. (✅ Concluído)
* **Gate 2 — Revisão de Código e Testes:** Code Review sem bloqueadores e testes unitários passando. (✅ Concluído em 2026-10-08 — ver notas abaixo)
* **Gate 3 — Auditoria e Deploy:** Security audit aprovada, sem regressão na busca do frontend e deploy validado em homologação.
  * Security audit: ✅ aprovada em 2026-10-13 (nenhuma vulnerabilidade alta/média nas mudanças; 3 achados pré-existentes corrigidos — ver abaixo)
  * Busca sem regressão: ✅ validada localmente em 2026-10-13
  * Deploy em homologação: ⏳ pendente (merge do [PR #2](https://github.com/fbadia/quickAccessCorretor/pull/2) na `develop`)

---

## Notas do Code Review (Gate 2 — 2026-10-08)

O code review encontrou 10 problemas, todos corrigidos antes do merge:

1. **Endossos sem criptografia:** `applyEndorsementChanges` gravava placa, nome e CPF em texto claro. Agora usa ALE + blind index.
2. **Veículo de endosso sem `organization_id`:** o veículo novo sumia da listagem da organização.
3. **Chaves ausentes no deploy:** `deploy.yml`/`zs.yaml` não injetavam as chaves. Agora o CI aborta sem elas e o backend recusa subir em produção sem configuração completa (`assertEncryptionConfig`).
4. **Placeholders `__SUBSTITUIR__`** chegavam ao container como valores reais. Agora as linhas não preenchidas são removidas e a substituição é literal.
5. **Fallback do frontend** caía no Supabase direto em qualquer erro do backend e exibia ciphertext. Agora só cai em falha de rede.
6. **Regra `NetworkOnly`** capturava `fonts.googleapis.com`. Agora casa só `/api|admin|superadmin/` e `*.supabase.co`.
7. **Anonimização** ignorava erros e gravava CPF fixo numa coluna UNIQUE. Agora checa erros e grava `cpf_cnpj = NULL` (a migration remove o `NOT NULL`).
8. **Listagem:** um registro indecifrável derrubava `GET /api/vehicles`. Agora o campo é ocultado e o erro logado.
9. **Erro da busca por blind index** era descartado.
10. **Chave HMAC** caía para a `DB_ENCRYPTION_KEY`. Agora é obrigatória e separada, e usa a mesma conversão hex de `parseKey`.

Além disso, Story 1.2: a chamada ao Gemini passou a usar `responseSchema` (SDK `@google/generative-ai` 0.11 → 0.24.1), e o modelo primário `gemini-1.5-flash` (descontinuado) foi trocado por `gemini-flash-latest`.

---

## Correções Após o Gate 2 (2026-10-13)

Encontradas durante os testes locais e a preparação do Gate 3:

1. **URL do backend em produção:** `VITE_BACKEND_URL=""` virava `http://localhost:3001` por causa do `||`; todas as chamadas ao backend falhavam no aparelho. Corrigido com `??` (problema anterior à sprint).
2. **Campos omitidos pelo Gemini:** com o `responseSchema` de campos opcionais, o modelo devolvia só tipo e nome, e o upload falhava com `null value in column "start_date"`. Todos os campos passaram a ser obrigatórios (aceitando `null`).
3. **PDFs órfãos no Storage:** o arquivo era gravado antes da extração e ficava no bucket quando ela falhava (81 arquivos após o fim dos créditos do Gemini). A extração passou a rodar antes, e falhas posteriores removem o arquivo não referenciado. Os 81 órfãos foram apagados.
4. **PII no `raw_extracted_data`:** o JSON do Gemini era gravado com nome, CPF e placa em texto claro, inclusive em uploads novos. Os campos pessoais passaram a ser cifrados.
5. **`.env` dependente da pasta de execução:** iniciado de outra pasta, o backend subia sem Supabase e sem chaves. O `.env` passou a ser lido da pasta do backend.
6. **Containers Docker antigos** (de 2026-10-08, sem as correções) rodavam nas portas 3000/3001 contra o banco; foram removidos.

## Auditoria de Segurança (Gate 3 — 2026-10-13)

Nenhuma vulnerabilidade de severidade alta ou média nas mudanças do PR. Três pontos pré-existentes foram corrigidos:

1. **Nome do arquivo com PII:** PDFs eram gravados com o nome original (ex. `Apolice-<Nome>-<PLACA>-<Seguradora>.pdf`), expondo nome e placa no bucket e em `storage_path`. Agora o caminho é `{orgId}/{sha256}.pdf`, e o backfill renomeou os 50 arquivos existentes.
2. **PII nos logs:** removidos e-mails, nomes de arquivo e a resposta bruta do Gemini; erros do Postgres logados sem o `details` (que trazia a linha recusada).
3. **Erros internos devolvidos ao cliente:** só mensagens de `UserFacingError` chegam ao app; o resto vira mensagem genérica (`toHttpError`).

---

## Retrospectiva

**O que funcionou bem:**
- A arquitetura da ADR-007 (AES-256-GCM + blind index + decifração no backend) se manteve: a busca parcial continuou instantânea no React e nenhuma decisão precisou ser revista.
- Code review e auditoria antes do merge pegaram problemas graves que não apareceriam em testes de caminho feliz (endossos sem criptografia, chaves ausentes no deploy, PII no JSONB e nos nomes de arquivo).
- Falhar cedo: o backend recusa subir em produção sem as chaves e o CI aborta o deploy, em vez de gravar dados em texto claro silenciosamente.
- O script de backfill em modo simulação por padrão permitiu revisar o impacto antes de alterar o banco.

**O que pode melhorar:**
- **Validar com dados reais desde o início:** o `responseSchema` foi validado com um texto curto e passou; com o prompt completo e PDFs reais, o modelo omitia os campos. Testes de extração devem usar o prompt e os PDFs de produção.
- **Dependências externas sem monitoramento:** o modelo do Gemini estava descontinuado e os créditos acabaram sem nenhum alerta; ambos só foram percebidos por falhas no upload.
- **Ambiente local divergente:** containers antigos e o `.env` lido pela pasta de execução fizeram o app rodar com código ou configuração errados sem sinal claro. O backend também sobe mesmo quando o Supabase não inicializa.
- **Sem testes automatizados de API:** rotas como a anonimização foram testadas chamando a função diretamente; falta um teste de ponta a ponta com usuários de cada papel.
- **Banco de testes = banco de produção:** o ambiente local aponta para o mesmo Supabase de produção. O `AGENTS.md` pede migrations testadas no banco dev antes de produção.

**Itens para a próxima sprint:**
- Merge do PR #2 e validação em homologação (T1.18), incluindo a confirmação de que as chaves do `.env` local são as mesmas dos secrets do GitHub.
- Supabase separado para desenvolvimento/homologação.
- Backend falhar ao subir quando o Supabase não inicializar.
- Testes automatizados de API (upload, listagem, download e anonimização por papel: admin, corretor, outra organização).
- Monitoramento de erros e alerta de falhas do Gemini (créditos, modelo indisponível).
- Botão de anonimização no app (hoje só pela API).
- Decisão de produto sobre apólices residenciais e empresariais, que entram sem placa.
- Procedimento documentado de rotação das chaves de criptografia.

