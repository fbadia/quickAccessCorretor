# Diretrizes Técnicas de Conformidade LGPD
**Aplicação:** Sistema de Gestão de Apólices para Corretores de Seguros  
**Stack:** React 19 + Node.js 20 (Express) + Supabase (PostgreSQL/RLS/Storage) + Google Gemini Flash (`gemini-flash-latest`)

Este documento estabelece os padrões arquiteturais e de implementação de código para garantir que a aplicação atenda aos requisitos legais da LGPD (Lei Geral de Proteção de Dados), com foco em segurança por *design* (*Privacy by Design*).

---

## 1. Banco de Dados & Multi-Tenancy (Isolamento Estrito)

O vazamento de dados entre corretoras diferentes representa o maior risco de segurança da aplicação. Para mitigar isso, utilizamos o **Row Level Security (RLS)** nativo do PostgreSQL no Supabase.

### Regras de Implementação
*   **Habilitação Obrigatória:** Toda nova tabela que armazene dados de segurados, veículos, coberturas ou arquivos deve, obrigatoriamente, possuir RLS ativado.
*   **Isolamento via Tenant:** As queries de leitura, escrita e deleção devem ser filtradas pela função auxiliar `public.get_user_org_id()`.

### Exemplo de DDL (Migração SQL)
```sql
-- 1. Ativar RLS na tabela de segurados
ALTER TABLE public.segurados ENABLE ROW LEVEL SECURITY;

-- 2. Criar a política de isolamento baseada na organização do usuário logado
CREATE POLICY segurados_isolation_policy ON public.segurados
    FOR ALL
    TO authenticated
    USING (org_id = public.get_user_org_id());
```

---

## 2. Pipeline de Upload Seguro & Minimização de Dados (Gemini API)

O fluxo de captura do PDF até a extração estruturada de dados pela IA deve impedir a persistência de informações desnecessárias ou logs indevidos.

### Fluxo Técnico
1.  **Manipulação em Memória:** O backend Node.js não deve salvar os PDFs temporariamente no disco do container. Utilize o `multer.memoryStorage()`.
2.  **Deduplicação de Arquivos:** Gere um hash `SHA-256` a partir do buffer do arquivo utilizando o módulo nativo `crypto` para evitar redundância de armazenamento de dados pessoais.
3.  **Extração com Escopo Fechado:** Utilize **Structured Outputs** (`responseSchema`) na API do Gemini para garantir que a IA extraia exclusivamente os campos homologados, ignorando dados de terceiros ou informações irrelevantes contidas na apólice.

### Exemplo de Implementação no Backend Express (`backend/routes/upload.js`)
```javascript
import crypto from 'crypto';
import multer from 'multer';
import { GoogleGenAI } from '@google/genai';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

app.post('/api/upload', upload.single('apolice'), async (req, res) => {
  try {
    // 1. Gerar Hash para deduplicação e integridade do arquivo
    const fileHash = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
    
    // 2. Chamar o Gemini enviando o buffer diretamente em memória (Inline Data)
    const response = await ai.models.generateContent({
      model: 'gemini-flash-latest',
      contents: [
        {
          inlineData: {
            mimeType: 'application/pdf',
            data: req.file.buffer.toString('base64')
          }
        },
        "Extraia os dados da apólice seguindo estritamente o schema fornecido. Ignore dados de terceiros não relacionados ao risco."
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: apoliceSchemaStructure // Schema JSON rígido definido no sistema
      }
    });

    const dadosExtraidos = JSON.parse(response.text);
    
    // 3. Persistência no Supabase Storage e Banco de Dados ocorre aqui...
    res.status(200).json({ success: true, hash: fileHash });
  } catch (error) {
    res.status(500).json({ error: "Erro ao processar documento de forma segura." });
  }
});
```

---

## 3. Criptografia no Nível da Aplicação (Application-Level Encryption)

Dados altamente identificáveis do segurado (CPF, Placa, Chassi) não devem permanecer em texto limpo no banco de dados. Caso a chave mestra (`SERVICE_ROLE_KEY`) seja exposta, as informações continuam ilegíveis.

### Regras de Implementação
*   Utilize o algoritmo **AES-256-GCM** no backend antes de persistir os dados no banco de dados.
*   Armazene o texto cifrado junto com o seu respectivo **Vetor de Inicialização (IV)** e **Authentication Tag**.

---

## 4. Auditoria de Logs e Direito ao Esquecimento

### Logs Anonimizados (Nginx e Node.js)
*   **Proibição de Payloads em Logs:** É estritamente proibido configurar middlewares de log (como `morgan` em modo verbose) que registrem o corpo da requisição (`req.body`) ou parâmetros de URL (`req.params`) contendo CPFs, nomes ou placas.
*   **Identificadores Seguros:** Utilize apenas o UUID do usuário autenticado no Supabase e o ID do evento para rastreabilidade de acessos.

### Rotina de Exclusão (Direito ao Esquecimento)
Ao disparar a exclusão de um segurado ou apólice, o sistema deve garantir a deleção física e não apenas lógica (*soft delete*), a menos que o dado precise ser retido por obrigação legal (ex: fins fiscais). 
Se a retenção for obrigatória, realize a **anonimização real do registro**:
*   Nome → `"Cadastro Anonimizado"`
*   CPF, Placa, Chassi → Deletados (`NULL` ou string vazia).

---

## 5. Frontend React 19 & Configurações de PWA

Dado que o frontend consome diretamente o cliente do Supabase via Row Level Security, medidas de segurança do lado do cliente devem ser aplicadas.

### Isolamento de Cache no Service Worker (`vite.config.js`)
Para evitar que dados de apólices e segurados fiquem armazenados localmente no cache do navegador do dispositivo móvel do corretor, configure o `VitePWA` para bloquear o cache das rotas de dados.

```javascript
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    VitePWA({
      workbox: {
        // Ignora rotas de API do backend e chamadas ao Supabase
        navigateFallbackDenylist: [/^\/api/, /supabase\.co/], 
        runtimeCaching: [
          {
            urlPattern: /.*(api|supabase).*/,
            handler: 'NetworkOnly', // Força requisições direto na rede, sem salvar em cache
          }
        ]
      }
    })
  ]
});
```
