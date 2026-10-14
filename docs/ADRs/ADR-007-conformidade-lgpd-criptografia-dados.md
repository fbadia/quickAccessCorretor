# ADR-007 — Proteção de Dados Sensíveis e Conformidade com a LGPD

**Data:** 2026-09-04  
**Status:** ✅ Aceita  
**Contexto:** Criptografia de dados pessoais (PII), proteção de apólices no Storage e adequação aos princípios da LGPD  

---

## Contexto

O **SeguroNaMão** armazena apólices de seguros em formato PDF e dados estruturados de clientes (nome, CPF/CNPJ), veículos (placa, chassi, marca/modelo) e vigências contratuais. 

Atualmente, o sistema apresenta os seguintes riscos de segurança e privacidade:
1. **Armazenamento de PDFs em texto claro:** Os arquivos PDF enviados ao Supabase Storage (bucket `policies`) são gravados sem criptografia em nível de aplicação (em repouso). Em caso de comprometimento das credenciais do storage ou vazamento do bucket, contratos inteiros com dados altamente sensíveis ficam expostos.
2. **Dados cadastrais em texto limpo no banco:** As tabelas `clients` (`name`, `cpf_cnpj`) e `vehicles` (`plate`) armazenam dados de identificação pessoal (PII) sem cifragem, e a coluna `policies.raw_extracted_data` retém o payload bruto extraído pela IA.
3. **Pipeline de IA sem schema estrito:** A chamada à API do Gemini não restringe rigidamente as saídas via `responseSchema`, permitindo que dados contextuais desnecessários de terceiros possam ser gravados.
4. **Cache local no PWA:** O Service Worker do frontend não restringe explicitamente o armazenamento em cache de rotas da API ou do Supabase no dispositivo móvel do corretor.
5. **Direito ao Esquecimento (Art. 18 LGPD):** Inexistência de procedimento técnico automatizado para anonimização ou exclusão definitiva a pedido do titular.

---

## Decisão

Adotar uma arquitetura de **Privacidade por Design (*Privacy by Design*)** e **Defesa em Profundidade**, baseada no documento de diretrizes [docs/LGPD_COMPLIANCE.md](../LGPD_COMPLIANCE.md), estruturada em 5 pilares:

---

### 1. Criptografia de PDFs em Repouso no Storage (Envelope Encryption)

Os arquivos PDF não serão gravados em formato bruto no Supabase Storage:
* **Algoritmo:** **AES-256-GCM** executado no backend Node.js via módulo nativo `crypto`.
* **Fluxo de Upload:** O arquivo PDF recebido em memória é cifrado no backend antes de ser transmitido ao Supabase Storage. O vetor de inicialização (`IV`) e a tag de autenticação (`auth_tag`) são armazenados junto aos metadados da apólice no PostgreSQL.
* **Fluxo de Download:** A rota autenticada `GET /api/policies/:policyId/download` faz o download do arquivo cifrado do bucket, valida o isolamento da organização via token JWT, decifra o PDF em memória no container backend e entrega o arquivo ao corretor com o cabeçalho `Cache-Control: private, no-store`.

```
[Cliente] ──(Upload PDF)──▶ [Backend Node] ──(AES-256-GCM)──▶ [Supabase Storage (Cifrado)]
[Cliente] ◀──(Download)─── [Backend Node] ◀──(Decifra Buffer)─ [Supabase Storage]
```

---

### 2. Criptografia no Banco com Decifração no Backend (Opção 1) & Blind Indexing

Proteger os dados de identificação pessoal (PII) contra vazamentos ou *dumps* do banco de dados relacional, preservando a experiência de busca rápida do corretor:

#### A. Segregação de Responsabilidades (Proteção contra Dumps)
* **No Banco de Dados (PostgreSQL):** Os campos `clients.name`, `clients.cpf_cnpj` e `vehicles.plate` são gravados cifrados com **AES-256-GCM** (armazenando ciphertext, IV e auth tag).
* **No Servidor Backend (ZeroServer):** As chaves de criptografia (`DB_ENCRYPTION_KEY`) ficam armazenadas **exclusivamente nas variáveis de ambiente do backend**, nunca sendo salvas no banco.
* **Resiliência a Invasões:** Em caso de SQL Injection, comprometimento de credenciais do Supabase ou extração de backup físico (`pg_dump`), o atacante terá acesso apenas a sequências ininteligíveis de bytes criptografados, incapaz de correlacionar clientes, placas ou apólices.

```
┌────────────────────────────────┐         ┌────────────────────────────────┐
│   ZERO SERVER (Backend Node)   │         │     SUPABASE (PostgreSQL)      │
│                                │         │                                │
│  Chave Secreta:                │         │  Dados Cifrados (ALE):         │
│  DB_ENCRYPTION_KEY             │         │  name: "7f8b91c0a8... (cifrado)│
│  (Em ambiente seguro)          │         │  cpf:  "1a82c409fb... (cifrado)│
└──────────────┬─────────────────┘         └────────────────┬───────────────┘
               │                                            │
               │         Chave NUNCA gravada no banco       │
               └──────────────────────X─────────────────────┘
```

#### B. Viabilização da Busca Parcial por Nome e Placa
* O SeguroNaMão adota arquitetura mobile-first onde a listagem de veículos da corretora é carregada no início da sessão e filtrada instantaneamente no cliente React (`vehicles.filter(...)`).
* A consulta de listagem passará pelo backend autenticado: o backend recupera os registros da organização no banco, decifra-os em memória e retorna o JSON descriptografado via HTTPS para o cliente autenticado.
* **Resultado para o usuário:** O corretor continua digitando qualquer trecho do nome (ex.: `"João"`, `"Silva"`, `"Carlos"`) ou placa e os resultados aparecem em tempo real, sem qualquer degradação de usabilidade.

#### C. Blind Index para Validações Exatas no Servidor
* Para consultas pontuais no banco que precisam de verificação exata antes de decifrar tudo (ex.: deduplicação de CPF ou busca rápida de placa na importação de apólices), utiliza-se um hash HMAC determinístico:
  $$\text{cpf\_bidx} = \text{HMAC-SHA256}(\text{cpf\_limpo}, \text{SEARCH\_HMAC\_KEY})$$
  $$\text{plate\_bidx} = \text{HMAC-SHA256}(\text{placa\_limpa}, \text{SEARCH\_HMAC\_KEY})$$
* **Higienização de `raw_extracted_data`:** Remoção de dados sensíveis ou criptografia de envelope do payload JSONB completo antes da persistência.

---

### 3. Minimização de Dados na Extração com Gemini (Structured Outputs)

* **Schema Rígido:** Utilizar a funcionalidade de `responseSchema` do SDK oficial da Google para forçar o modelo Gemini Flash a retornar estritamente os campos catalogados (seguradora, vigência, dados do veículo e segurado essenciais ao seguro).
* **Descarte de Metadados Excedentes:** Configurar o prompt e o validador para rejeitar dados não pertinentes ao contrato (ex.: filiação, estado civil, renda, profissão, dados bancários).

---

### 4. Proteção de Cache e Isolamento no Frontend PWA

* Atualizar o [vite.config.js](../../frontend/vite.config.js) com configuração do Workbox para garantir que nenhuma requisição de dados (`/api/*` e chamadas ao Supabase) seja gravada no Cache Storage do navegador/celular do corretor:
  ```javascript
  runtimeCaching: [
    {
      urlPattern: /.*(supabase\.co|\/api\/).*/,
      handler: 'NetworkOnly'
    }
  ]
  ```

---

### 5. Governança e Direito ao Esquecimento (Art. 18 LGPD)

* Implementar endpoint e serviço de **exclusão / anonimização a pedido do titular**:
  * Exclusão definitiva do arquivo físico criptografado no Supabase Storage.
  * Anonimização dos registros contratuais necessários para cumprimento de dever regulatório fiscal/SUSEP:
    * `name` $\rightarrow$ `"TITULAR ANONIMIZADO"`
    * `cpf_cnpj` $\rightarrow$ `NULL` ou hash irreversível
    * `plate` $\rightarrow$ `NULL`
  * Caso não haja pendência de retenção legal, executar deleção física completa em cascata (`CASCADE`).

---

## Alternativas Consideradas

| Alternativa | Motivo da rejeição |
|---|---|
| **Token-based Blind Index (quebra de nomes em palavras indexadas)** | Adiciona alta complexidade relacional (tabela intermediária com múltiplos hashes por cliente) e não resolve buscas por prefixos ou partes curtas de palavras (ex: digitar 2 ou 3 letras). A Opção 1 é mais enxuta e resolve com perfeição a busca no React. |
| **Criptografia Seletiva (deixar Nome em texto limpo e cifrar apenas CPF/PDF)** | Embora mais simples, expõe a lista de clientes em caso de dump do banco de dados, enfraquecendo o princípio de Confidencialidade e Defesa em Profundidade. |
| **Criptografia gerenciada nativa pelo Cloud Provider (ex: AWS KMS / SSE do S3)** | O Supabase Cloud não oferece controle granular de chaves KMS por organização na camada padrão. A criptografia em nível de aplicação (ALE) garante independência de infraestrutura e soberania total dos dados. |
| **Apenas restrição de acesso via RLS (sem criptografia)** | Insuficiente: em caso de dump do banco ou vazamento da service role key, todos os dados de clientes ficam instantaneamente legíveis em texto plano. |

---

## Consequências

### Positivas
* **Conformidade com a LGPD:** Atendimento aos princípios de Finalidade, Adequação, Minimização, Segurança e Prevenção (Art. 6º e Art. 46).
* **Resiliência a Vazamentos e Dumps:** Mesmo em caso de extração completa do banco de dados via `pg_dump` ou invasão do bucket de storage, os atacantes não terão acesso a documentos inteligíveis nem a nomes/CPFs legíveis, pois a chave reside unicamente no backend.
* **Experiência do Usuário Preservada:** A busca parcial por nome e placa continua instantânea no frontend React.
* **Isolamento e Controle de Acesso:** O download de apólices e a listagem passam obrigatoriamente pelo backend autenticado com validação estrita de organização (`organization_id`).

### Negativas / Trade-offs
* **Roteamento de Listagem via Backend:** A busca de veículos/apólices passa a ser intermediada pelo backend Node.js (para decifração segura), em vez do frontend bater diretamente no Supabase SDK.
* **Sobrecarga de CPU no Backend:** Pequeno acréscimo de processamento em memória no container Node.js para decifrar os registros da organização durante a carga inicial.
* **Gestão de Chaves Criptográficas:** Exige configuração rigorosa de segredos (`DB_ENCRYPTION_KEY`, `STORAGE_ENCRYPTION_KEY`, `SEARCH_HMAC_KEY`) no ambiente de produção do ZeroServer; a perda dessas chaves impossibilita a recuperação dos dados.

---

## Fases de Implementação Recomendadas

1. **Fase 1 (Storage Seguro):** Módulo de criptografia AES-256-GCM para os arquivos do Supabase Storage e ajuste no proxy autenticado de download.
2. **Fase 2 (Frontend PWA & Gemini):** Blindagem do Workbox (`NetworkOnly`) no Vite e Structured Outputs no Gemini.
3. **Fase 3 (Banco de Dados ALE & Proxy de Dados):** Criação das colunas cifradas e migração do endpoint de listagem para decifração em memória no backend.
4. **Fase 4 (Governança):** Endpoint de expurgo e anonimização (Direito ao Esquecimento).
