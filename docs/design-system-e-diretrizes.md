# Design System & Diretrizes Visuais — SeguroNaMão

> Guia oficial de identidade visual, design tokens, componentes e padrões de interface do SeguroNaMão.  
> Este documento serve como referência canônica para o frontend da aplicação e para o desenvolvimento de **Landing Pages**, materiais promocionais e expansões de produto.

---

## 1. Filosofia de Design & Identidade

O **SeguroNaMão** foi projetado para corretores de seguros automotivos que precisam de agilidade em campo (em trânsito, pelo celular) e no escritório.

### Pilares Visuais
* **Mobile-First & Touch-Friendly:** Áreas de clique confortáveis (mínimo 44x44px), navegação facilitada e zero interferência de toques fantasmas (`-webkit-tap-highlight-color: transparent`).
* **Dark Mode por Padrão (Estética Moderna SaaS):** Fundo escuro profundo com alto contraste, transmitindo sofisticação, tecnologia e economia de bateria em telas OLED.
* **Glassmorphism com Micro-Glows:** Superfícies translúcidas com desfoque de fundo (`backdrop-filter: blur`), bordas sutis e sombras com emissão de luz suave (*glow*) em pontos de destaque.
* **Agilidade & Foco na Ação:** Elementos de busca instantânea, badges semânticos e botões de chamada rápida (ex: discar para seguradora, disparar WhatsApp para o segurado).

---

## 2. Paleta de Cores & Design Tokens

### 2.1 Cores Principais da Marca & Acentos

| Nome | Hex / Valor | Função Principal | Exemplo de Aplicação |
|---|---|---|---|
| **Brand Violet** | `#863bff` | Cor institucional / PWA / Marca | Favicon, meta theme-color, gradiente de branding, destaques superadmin |
| **Brand Violet Dark** | `#6a2dd4` | Degradê da marca | Gradientes com `#863bff` em botões e banners |
| **Accent Emerald** | `#10b981` | Acento primário do sistema / Ação / Sucesso | Botões principais, ícones de destaque, foco de inputs, badges de status ativo |
| **Accent Cyan** | `#06b6d4` | Acento secundário / Tecnologia | Degradês com Emerald, tags de admin, indicadores de sincronização |
| **WhatsApp Green** | `#25d366` | Ação de contato direto | Botão de WhatsApp (`linear-gradient(135deg, #25d366, #128c7e)`) |
| **Danger / Vencido**| `#ef4444` | Erros, apólices vencidas, deleção | Badges de status expirado, toasts de erro, ações destrutivas |
| **Warning / Atenção**| `#f59e0b` | Alertas, avisos de cota limite | Notificações de limite de usuários, pendências |

---

### 2.2 Tema Escuro (Padrão)

```css
:root {
  /* Tipografia */
  --font-family: 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;

  /* Superfícies & Fundos */
  --bg-primary: #0a0d14;         /* Fundo da tela inteira (fundo profundo) */
  --bg-secondary: #111625;       /* Fundo do container principal / header / footer */
  --bg-card: rgba(22, 28, 45, 0.7); /* Fundo de cartões translúcidos (Glassmorphism) */
  --bg-glass: rgba(17, 22, 37, 0.6);/* Barras fixas com blur elevado */
  --border-color: rgba(255, 255, 255, 0.08); /* Linhas divisórias e contornos sutis */

  /* Tipografia & Contrastes */
  --text-primary: #f3f4f6;       /* Títulos e textos de alta legibilidade */
  --text-secondary: #9ca3af;     /* Rótulos secundários, descrições */
  --text-muted: #6b7280;         /* Placeholders, ícones inativos */

  /* Cores de Acento & Efeitos de Luz */
  --accent-color: #10b981;
  --accent-glow: rgba(16, 185, 129, 0.15);
  --secondary-accent: #06b6d4;
  --secondary-accent-glow: rgba(6, 182, 212, 0.15);

  /* Status Semântico */
  --danger-color: #ef4444;
  --danger-glow: rgba(239, 68, 68, 0.15);
  --warning-color: #f59e0b;
  --success-color: #10b981;

  /* Sombras & Profundidade */
  --shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.15);
  --shadow-md: 0 4px 20px rgba(0, 0, 0, 0.25);
  --shadow-lg: 0 10px 30px rgba(0, 0, 0, 0.4);
  --shadow-glow: 0 0 20px rgba(16, 185, 129, 0.2);

  /* Curvaturas de Borda */
  --border-radius-sm: 8px;
  --border-radius-md: 14px;
  --border-radius-lg: 24px;

  /* Animações & Transições */
  --transition-fast: 0.15s ease;
  --transition-normal: 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}
```

---

### 2.3 Tema Claro (Suporte Opcional)

```css
[data-theme="light"] {
  --bg-primary: #f8fafc;
  --bg-secondary: #ffffff;
  --bg-card: rgba(255, 255, 255, 0.8);
  --bg-glass: rgba(248, 250, 252, 0.7);
  --border-color: rgba(0, 0, 0, 0.08);

  --text-primary: #0f172a;
  --text-secondary: #475569;
  --text-muted: #94a3b8;

  --accent-color: #059669;
  --accent-glow: rgba(5, 150, 105, 0.1);
  --secondary-accent: #0891b2;
  --secondary-accent-glow: rgba(8, 145, 178, 0.1);

  --shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 16px rgba(0, 0, 0, 0.08);
  --shadow-lg: 0 10px 25px rgba(0, 0, 0, 0.12);
  --shadow-glow: 0 0 15px rgba(5, 150, 105, 0.15);
}
```

---

## 3. Tipografia

* **Fonte Primária:** Google Fonts [Outfit](https://fonts.google.com/specimen/Outfit) (`weights: 300, 400, 500, 600, 700, 800`).
* **Importação Web:**
  ```html
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  ```

### Hierarquia Recomendada para Landing Page

| Nível | Tamanho | Peso | Letter-Spacing | Descrição / Estilo |
|---|---|---|---|---|
| **Hero Display (H1)** | `2.5rem` a `3.5rem` | 800 (Extra Bold) | `-1px` | Título principal de impacto com gradiente de texto |
| **Section Title (H2)**| `1.75rem` a `2.25rem` | 700 (Bold) | `-0.5px` | Cabeçalhos das seções |
| **Card / Feature (H3)**| `1.25rem` a `1.5rem` | 600 (Semi Bold) | `-0.25px` | Título de benefícios ou funcionalidades |
| **Subhead / Overline**| `0.85rem` a `0.95rem` | 700 (Bold) | `+0.75px` | Texto em maiúsculas (`text-transform: uppercase`) na cor de destaque |
| **Body (Corpo)** | `1.0rem` a `1.125rem` | 400 / 500 | `normal` | Textos explicativos, cor `--text-secondary` |
| **Badges / Tags** | `0.75rem` a `0.85rem` | 700 / 800 | `+0.5px` | Pílulas de status, placas, chips de categoria |

### Efeito de Gradiente em Títulos (Text Gradient)
```css
.text-gradient {
  background: linear-gradient(135deg, var(--text-primary) 30%, var(--accent-color) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

/* Variação Institucional com Brand Violet */
.text-gradient-brand {
  background: linear-gradient(135deg, #ffffff 30%, #863bff 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}
```

---

## 4. Componentes Chave & Padrões CSS

### 4.1 Cartão Glassmorphism (Features / Depoimentos)
```css
.glass-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-lg);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  box-shadow: var(--shadow-md);
  padding: 24px;
  transition: transform var(--transition-normal), border-color var(--transition-normal), box-shadow var(--transition-normal);
}

.glass-card:hover {
  transform: translateY(-4px);
  border-color: rgba(16, 185, 129, 0.35);
  box-shadow: var(--shadow-lg), 0 0 20px rgba(16, 185, 129, 0.15);
}
```

### 4.2 Botões de Ação (CTAs)

#### Botão Primário (Gradiente Emerald/Cyan)
```css
.btn-primary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 14px 28px;
  background: linear-gradient(135deg, var(--accent-color), var(--secondary-accent));
  color: #ffffff;
  font-family: var(--font-family);
  font-size: 1rem;
  font-weight: 700;
  border: none;
  border-radius: var(--border-radius-md);
  cursor: pointer;
  box-shadow: var(--shadow-sm);
  transition: all var(--transition-normal);
  text-decoration: none;
}

.btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-glow);
  filter: brightness(1.1);
}
```

#### Botão Secundário / Ghost
```css
.btn-secondary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 14px 28px;
  background-color: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  font-family: var(--font-family);
  font-size: 1rem;
  font-weight: 600;
  border-radius: var(--border-radius-md);
  cursor: pointer;
  transition: all var(--transition-normal);
  text-decoration: none;
}

.btn-secondary:hover {
  background-color: rgba(255, 255, 255, 0.1);
  transform: translateY(-2px);
  border-color: rgba(255, 255, 255, 0.2);
}
```

#### Botão WhatsApp
```css
.btn-whatsapp {
  background: linear-gradient(135deg, #25d366, #128c7e);
  color: #ffffff;
  border: none;
  border-radius: var(--border-radius-md);
  padding: 14px 24px;
  font-weight: 700;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  transition: all var(--transition-normal);
}

.btn-whatsapp:hover {
  transform: translateY(-2px);
  filter: brightness(1.08);
  box-shadow: 0 4px 15px rgba(37, 211, 102, 0.3);
}
```

### 4.3 Badges de Status & Chips
```css
/* Pílula de Placa de Veículo */
.badge-plate {
  background: linear-gradient(135deg, rgba(6, 182, 212, 0.15), rgba(16, 185, 129, 0.15));
  border: 1px solid rgba(16, 185, 129, 0.3);
  color: var(--accent-color);
  font-size: 0.9rem;
  font-weight: 800;
  padding: 4px 10px;
  border-radius: 6px;
  letter-spacing: 0.5px;
  font-family: monospace, var(--font-family);
}

/* Badge de Seguradora */
.badge-insurer {
  background-color: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  font-size: 0.8rem;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 4px;
}

/* Status Ativo */
.badge-active {
  background-color: rgba(16, 185, 129, 0.15);
  color: var(--accent-color);
  font-size: 0.75rem;
  font-weight: 700;
  padding: 3px 10px;
  border-radius: 20px;
}
```

### 4.4 Micro-Animações
```css
/* Efeito de pulso luminoso (Glow) */
@keyframes pulse-glow {
  0% {
    opacity: 0.6;
    box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.4);
  }
  70% {
    opacity: 1;
    box-shadow: 0 0 0 8px rgba(16, 185, 129, 0);
  }
  100% {
    opacity: 0.6;
    box-shadow: 0 0 0 0 rgba(16, 185, 129, 0);
  }
}

.pulse-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: var(--accent-color);
  animation: pulse-glow 2s infinite ease-in-out;
}
```

---

## 5. Estrutura Recomendada para a Landing Page

Para criar uma landing page com alta taxa de conversão e alinhada à proposta de valor do **SeguroNaMão**, recomenda-se a seguinte estrutura de seções:

### 1. Header (Navegação Superior)
* **Logo:** Ícone com glow luminoso + Texto "SeguroNaMão" com gradiente.
* **Links:** Recursos, Seguradoras Atendidas, Segurança & LGPD, Planos.
* **Ação no Header:** Botão "Acessar Sistema" (Ghost) e "Criar Conta / Testar Grátis" (Primary).

### 2. Hero Section (Dobra Principal)
* **Tag de Lançamento / Novidade:** Ex: `✨ Leitura Automática de Apólices por IA`.
* **Headline Forte:**  
  *Ex: "As apólices dos seus clientes e os números de assistência sempre na palma da sua mão."*
* **Sub-headline:**  
  *Ex: "Busca instantânea por placa, CPF ou nome. Extração inteligente de PDFs com Gemini AI e acionamento de guincho em 1 clique — mesmo fora do escritório."*
* **CTAs Duplos:** `[Começar Gratuitamente]` + `[Ver Demonstração de 1 min]`.
* **Visual do Produto (Hero Visual):** Mockup flutuante de um smartphone em Dark Mode exibindo o card de apólice detalhado com o botão de WhatsApp e discador 24h em destaque.

### 3. Barra de Confiança (Seguradoras Homologadas)
Logotipos ou badges sutis das seguradoras com leitura e extração testadas:
* **Porto Seguro**
* **Yelum (antiga Liberty)**
* **Bradesco Seguros**
* **HDI Seguros**
* **Allianz**

### 4. Dores do Corretor vs. Solução (Antes x Depois)
* **O Problema:** Cliente ligando no fim de semana parado na rodovia; corretor sem acesso ao sistema pesado do escritório; demora para achar o PDF em pastas desorganizadas.
* **A Solução:** Puxar o celular, digitar a placa do carro, e em 3 segundos copiar o número da apólice e ligar direto para a assistência certa ou enviar o cartão para o WhatsApp do segurado.

### 5. Grid de Recursos Principais (Cards Glassmorphism)
1. **Extração Inteligente por IA (Gemini 1.5):** Basta soltar o PDF no app ou pasta vinculada; os dados do segurado, veículo e vigência são lidos e organizados automaticamente.
2. **Busca Instantânea Inteligente:** Localize clientes por placa do veículo, CPF/CNPJ ou nome, com resultados instantâneos.
3. **Assistência 24h & Sinistro em 1 Clique:** Telefones e links oficiais de assistência pré-configurados por seguradora.
4. **Histórico de Endossos:** Acompanhamento automático de alterações, substituições e pendências de vínculo de apólices.
5. **Segurança de Nível Bancário (LGPD):** Isolamento estrito entre corretoras (Multi-Tenant RLS), criptografia em repouso e servidores em território nacional.

### 6. Demonstração Interativa / Visual do App
* Demonstração do layout responsivo: como a tela se comporta em celulares pequenos (375px) até o modo desktop split-screen (1200px).

### 7. Planos & Preços (Pricing)
* **Individual / Corretor Solo:** Ideal para corretores autônomos.
* **Corretora / Equipe:** Múltiplos corretores com permissões gerenciadas pelo administrador.
* **Enterprise:** Volumes customizados de armazenamento de PDFs e suporte dedicado.

### 8. Rodapé (Footer)
* Links de Termos de Uso, Política de Privacidade (LGPD), Status do Sistema e Direitos Autorais.

---

## 6. Recursos & Ativos de Mídia Disponíveis no Projeto

Ao construir a Landing Page, os seguintes arquivos do repositório podem ser reaproveitados:

* **Ícone / Favicon SVG:** `frontend/public/favicon.svg` (marca vetorial nas cores Brand Violet).
* **Manifest PWA:** `frontend/vite.config.js` (cores oficiais e metadados).
* **Estilos Base:** `frontend/src/index.css`.
