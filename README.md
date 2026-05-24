# QuickAccessCorretor

QuickAccessCorretor é um MVP mobile-first criado para corretores de seguros automotivos localizarem rapidamente os dados de segurados, suas apólices e contatos de assistência das seguradoras, mesmo estando fora do escritório.

O projeto utiliza um monitor automático de arquivos no Google Drive que lê apólices em formato PDF (de seguradoras como Yelum, Porto Seguro, Bradesco, HDI e Allianz), extrai os dados estruturados usando a API do Gemini 1.5 Flash, e os armazena no Supabase.

---

## 🛠️ Arquitetura do Projeto

*   **Frontend**: React + Vite + CSS Vanilla (Mobile-first, responsivo, temas dark/light, buscas instantâneas). Publicado na **Vercel**.
*   **Backend**: Node.js + Express (Processamento periódico de PDFs do Drive + integração com Gemini). Publicado no **Render**.
*   **Banco de Dados & Autenticação**: Supabase (PostgreSQL com RLS + Magic Link por e-mail).

---

## 🚀 Como Rodar Localmente

### 1. Requisitos Prévios
*   Node.js (v18 ou superior) instalado.
*   Uma conta no [Supabase](https://supabase.com/).
*   Uma chave de API do [Google Gemini (Google AI Studio)](https://aistudio.google.com/).

### 2. Configurando o Banco de Dados (Supabase)
1.  Crie um projeto no Supabase.
2.  Acesse o menu **SQL Editor** no painel do Supabase.
3.  Abra o arquivo [supabase/schema.sql](file:///Users/flaviobadia/ai_Dev/quickAccessCorretor/supabase/schema.sql), copie todo o seu conteúdo, cole no SQL Editor do Supabase e clique em **Run**. Isso criará todas as tabelas (`profiles`, `insurers`, `clients`, `policies`, `vehicles`), índices, triggers de novos usuários e políticas de segurança (RLS).

### 3. Configurando o Backend (Render)
1.  Acesse a pasta `backend/`.
2.  Copie o arquivo `.env.example` e crie um arquivo chamado `.env`:
    ```bash
    cp .env.example .env
    ```
3.  Preencha as variáveis de ambiente:
    *   `SUPABASE_URL`: URL da API do seu projeto Supabase.
    *   `SUPABASE_SERVICE_ROLE_KEY`: Chave de Service Role do Supabase (Bypass RLS - guarde em segredo).
    *   `GEMINI_API_KEY`: Chave de API do Gemini.
    *   `GOOGLE_DRIVE_FOLDER_ID`: ID da pasta do Google Drive onde estão as apólices.
    *   `GOOGLE_SERVICE_ACCOUNT_JSON`: O conteúdo de texto completo do arquivo JSON da sua Conta de Serviço do Google (veja instruções abaixo).
4.  Instale as dependências e inicie o servidor:
    ```bash
    npm install
    npm run dev
    ```
    *O servidor iniciará em `http://localhost:3001` e fará o seed das seguradoras básicas no banco automaticamente.*

### 4. Configurando o Frontend (Vercel)
1.  Acesse a pasta `frontend/`.
2.  Copie o arquivo `.env.example` e crie um arquivo chamado `.env`:
    ```bash
    cp .env.example .env
    ```
3.  Preencha as variáveis de ambiente:
    *   `VITE_SUPABASE_URL`: URL da API do seu projeto Supabase.
    *   `VITE_SUPABASE_ANON_KEY`: Chave anônima (anon key) do seu projeto Supabase.
    *   `VITE_BACKEND_URL`: URL do seu backend local (`http://localhost:3001`).
4.  Instale as dependências e inicie o app:
    ```bash
    npm install
    npm run dev
    ```
    *O app abrirá no navegador (geralmente em `http://localhost:5173`).*

---

## 📄 Testando o Extrator de PDFs do Gemini Localmente

Criamos um utilitário exclusivo para você testar a leitura de apólices em PDF no seu computador sem precisar do Google Drive:

1.  Gere sua `GEMINI_API_KEY` e salve no seu arquivo `backend/.env`.
2.  Execute o script na pasta `backend/` fornecendo o caminho para qualquer PDF de apólice:
    ```bash
    node testParser.js /caminho/para/sua_apolice.pdf
    ```
3.  O terminal mostrará em tempo real os dados extraídos em formato JSON (Segurado, CPF, Vigência, Placa, Modelo, Seguradora).

---

## 🔑 Configurando a Integração com o Google Drive
Para permitir que o backend leia as apólices de uma pasta do Google Drive:

1.  Vá para o [Google Cloud Console](https://console.cloud.google.com/).
2.  Crie um projeto e ative a **Google Drive API**.
3.  Vá em **Credentials** -> **Create Credentials** -> **Service Account**.
4.  Gere uma chave para essa conta no formato **JSON** e faça o download.
5.  Abra o arquivo JSON baixado, copie todo o seu conteúdo e cole-o na variável `GOOGLE_SERVICE_ACCOUNT_JSON` do seu arquivo `.env` (em uma única linha ou string escapada no Render).
6.  Abra a conta de serviço gerada e copie o e-mail dela (ex: `drive-monitor@nome-do-projeto.iam.gserviceaccount.com`).
7.  No Google Drive, vá na pasta onde estão as apólices, clique em **Compartilhar** e dê acesso de **Leitor** para o e-mail da conta de serviço.

---

## 🌐 Publicação (Produção)

### 1. Backend (Render)
*   Crie um **Web Service** no Render conectado ao seu repositório do GitHub.
*   Configure o build command: `npm install` e start command: `node index.js`.
*   Nas configurações do serviço, insira todas as variáveis do arquivo `backend/.env` nas **Environment Variables**.

### 2. Frontend (Vercel)
*   Crie um projeto na Vercel conectado ao seu repositório do GitHub.
*   Aponte a pasta raiz para `frontend/`.
*   Nas configurações do projeto, defina as variáveis de ambiente do `frontend/.env` (lembrando de usar a URL de produção do Render na variável `VITE_BACKEND_URL`).
