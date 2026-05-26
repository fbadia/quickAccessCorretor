# 🧪 Agente de Testes Inteligente — Guia de Uso

O **Agente de Testes (Test Agent)** é uma ferramenta em Python 3 criada para entender o escopo do projeto, analisar alterações de código e executar testes de integração ponta a ponta na arquitetura multi-tenant.

## 🚀 Funcionalidades Principais

1. **Análise de Escopo com IA (Gemini)**: Utiliza a API do Gemini para ler o diff das últimas alterações no repositório (`git diff`) e sugerir pontos críticos que devem ser validados.
2. **Modo Real (API Integration)**: Executa chamadas HTTP reais contra o backend local (`http://localhost:3001`), simulando fluxos de autenticação, limite de usuários e RLS diretamente contra o banco de dados Supabase de testes.
3. **Modo Mock (Fallback)**: Caso a conexão ou as chaves reais do Supabase não estejam configuradas localmente, o agente roda em modo simulado. Ele intercepta as chamadas e demonstra como os testes devem se comportar na especificação, sem quebrar.
4. **Relatórios Automáticos**: Gera relatórios detalhados contendo o resumo dos testes na pasta `test_reports/test_report_YYYYMMDD_HHMMSS.md`.

---

## 🛠️ Instalação e Dependências

O Agente foi desenvolvido para ser independente e rápido, utilizando apenas as bibliotecas nativas do Python 3 e a biblioteca `requests` para chamadas HTTP.

Certifique-se de ter o `requests` instalado globalmente ou em seu ambiente virtual:
```bash
pip install requests
```

---

## 💻 Como Executar

### 1. Rodar os testes no modo Mock (Simulado)
Excelente para testar a suite lógica localmente sem depender do banco de dados estar no ar ou de chaves de API:
```bash
python test_agent.py --mock
```

### 2. Rodar os testes no modo Real
Para rodar testes de integração reais na API local:
1. Certifique-se de que o backend está ativo: `npm run dev` na pasta `backend` (porta `3001`).
2. Certifique-se de que o arquivo `backend/.env` possui credenciais reais e válidas do Supabase (`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`).
3. Execute o script na raiz do projeto:
```bash
python test_agent.py
```

### 3. Rodar os testes com Análise de IA (Gemini)
Para fazer o Gemini analisar as alterações recentes do código antes de iniciar os testes:
1. Certifique-se de que `GEMINI_API_KEY` está configurada no `.env` do backend.
2. Execute com a flag `--ai`:
```bash
python test_agent.py --ai
```

### 4. Rodar testes especificando a URL do Servidor
Caso queira apontar os testes para um servidor de staging ou produção hospedado no Render:
```bash
python test_agent.py --target https://seu-backend.onrender.com
```

---

## 🧪 Casos de Teste Cobertos

O agente valida de forma rigorosa as regras da arquitetura multi-tenant:
- **Caso 1**: Healthcheck e Conectividade do backend.
- **Caso 2**: Bloqueio de requisições sem token JWT de autenticação.
- **Caso 3**: Impedimento de acesso para corretores (brokers) nas rotas de superadmin.
- **Caso 4**: Criação de novas organizações pelo superadmin.
- **Caso 5**: Validação do limite máximo de **5 usuários por organização**.
- **Caso 6**: Isolamento de dados multi-tenant (RLS) - valida se usuários de uma organização não conseguem ver ou editar dados de outra.
- **Caso 7**: Bloqueio imediato de acessos caso a Organização inteira seja desativada.
- **Caso 8**: Bloqueio imediato de acessos caso um usuário individual seja desativado.

---

## 📊 Relatórios de Testes

Ao término de cada execução, o relatório é exibido no terminal e gravado no diretório:
`test_reports/test_report_YYYYMMDD_HHMMSS.md`

Exemplo de Relatório gerado:
```markdown
# 🧪 Relatório de Testes Automatizados — QuickAccess Corretor

> **Alvo:** `http://localhost:3001`
> **Data:** 26/05/2026 18:00:00
> **Modo de Execução:** MOCKS
> **Status Geral:** 🟢 Aprovado

## 📝 Resultados por Caso de Teste
### 🟢 Caso 1: Health Check da API
- **Resultado:** PASS
- **Status HTTP:** Esperado 200 | Obtido 200

### 🟢 Caso 5: Validação do Limite Máximo de 5 Usuários
- **Resultado:** PASS
- **Status HTTP:** Esperado 409 | Obtido 409
- **Mensagem:** Bloqueio de 6º usuário realizado (Correto).
```
