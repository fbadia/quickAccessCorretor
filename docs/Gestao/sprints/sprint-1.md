# Sprint 1 — Segurança de Dados e Conformidade LGPD

**Período:** 2026-09-04 → Em planejamento  
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
- [ ] **Cifragem no Upload:** Dado o upload de um PDF no endpoint `POST /api/policies/upload`, quando o backend enviar o arquivo ao Supabase Storage, então ele deve ser cifrado com AES-256-GCM antes de ser transmitido.
- [ ] **Decifragem no Download:** Dado um corretor autenticado solicitando download via `GET /api/policies/:policyId/download`, quando o backend buscar o blob cifrado, então deve decifrá-lo em memória e retornar o PDF legível com cabeçalho `Cache-Control: private, no-store`.
- [ ] **Isolamento Multi-tenant:** Dado um usuário de outra organização tentando baixar o arquivo, o sistema deve retornar 403 / 404 sem decifrar o buffer.

**Complexidade:** M  
**Dependências:** Geração de segredo `STORAGE_ENCRYPTION_KEY`.

---

### 📋 STORY 1.2: Minimização de Dados e Sanitização no Pipeline Gemini
**Como** responsável pela privacidade dos dados  
**Quero** que a extração por IA capture estritamente os campos necessários do contrato  
**Para que** informações irrelevantes de terceiros ou dados financeiros dispensáveis não sejam persistidos.

#### Critérios de Aceite (Gherkin):
- [ ] **Structured Outputs:** Dado o processamento de um documento no `geminiService.js`, quando a API do Gemini for acionada, então a chamada deve utilizar `responseSchema` com tipagem fechada para apólices e endossos.
- [ ] **Sanitização do JSONB:** Dado o salvamento da apólice em `savePolicyData()`, quando o payload `raw_extracted_data` for gravado, então campos não essenciais ou excedentes devem ser removidos.

**Complexidade:** S  
**Dependências:** Nenhuma.

---

### 📋 STORY 1.3: Isolamento de Cache no Frontend PWA
**Como** corretor utilizando o aplicativo no smartphone  
**Quero** que as requisições com dados de segurados não fiquem persistidas no cache local do dispositivo  
**Para que** os dados não fiquem expostos após encerramento da sessão ou em caso de perda do aparelho.

#### Critérios de Aceite (Gherkin):
- [ ] **Workbox NetworkOnly:** Dado o Service Worker configurado no `frontend/vite.config.js`, quando ocorrer qualquer requisição para `/api/*` ou endpoints do Supabase, então o handler deve ser estritamente `NetworkOnly`.

**Complexidade:** S  
**Dependências:** Nenhuma.

---

### 📋 STORY 1.4: Criptografia no Banco (ALE) com Busca Parcial no Frontend
**Como** corretor buscando clientes no SeguroNaMão  
**Quero** pesquisar apólices por trecho do nome do cliente ou placa  
**Para que** eu localize o segurado rapidamente, mantendo o banco protegido contra vazamentos de dumps.

#### Critérios de Aceite (Gherkin):
- [ ] **Proteção contra Dump:** Dado um dump SQL do banco (`pg_dump`), quando inspecionadas as tabelas `clients` e `vehicles`, então os campos `name`, `cpf_cnpj` e `plate` devem conter apenas ciphertexts ilegíveis.
- [ ] **Listagem Segura via Backend:** Dado o carregamento da lista de apólices no app, quando o frontend autenticado chamar o backend, então o backend decifra os registros da organização em memória e entrega o JSON para a sessão do corretor.
- [ ] **Busca Parcial Instantânea:** Dado um corretor digitando qualquer parte do nome (ex.: "Silv", "Carlos") ou placa, o frontend React deve filtrar os resultados instantaneamente sem falhas.
- [ ] **Blind Index:** Para validações exatas no banco (ex.: deduplicação de CPF/placa), colunas determinísticas HMAC-SHA256 (`cpf_bidx`, `plate_bidx`) devem ser utilizadas.

**Complexidade:** L  
**Dependências:** Story 1.1 e migrations no Supabase.

---

### 📋 STORY 1.5: Direito ao Esquecimento e Anonimização (Art. 18 LGPD)
**Como** titular de dados ou administrador de corretora  
**Quero** solicitar a exclusão / anonimização dos dados de um segurado  
**Para que** a plataforma cumpra a obrigação legal de eliminação de dados da LGPD.

#### Critérios de Aceite (Gherkin):
- [ ] **Exclusão do Storage:** Dado o comando de anonimização/exclusão de uma apólice, o arquivo cifrado correspondente no Supabase Storage deve ser deletado fisicamente.
- [ ] **Anonimização Cadastral:** Caso a apólice deva ser mantida por exigência regulatória fiscal/SUSEP, os dados pessoais devem ser substituídos por valores anonimizados irreversíveis (`name = "TITULAR ANONIMIZADO"`, `cpf_cnpj = NULL`).

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

---

## Gates de Qualidade da Sprint

* **Gate 1 — Aprovação de Escopo:** User Stories e ADR-007 aprovadas. (✅ Concluído)
* **Gate 2 — Revisão de Código e Testes:** Code Review sem bloqueadores e testes unitários passando. (✅ Concluído em 2026-10-08 — ver notas abaixo)
* **Gate 3 — Auditoria e Deploy:** Security audit aprovada, sem regressão na busca do frontend e deploy validado em homologação.

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
