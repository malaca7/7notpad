# 7NotPad — Bloco de Notas Online

Aplicação web moderna, rápida, minimalista e totalmente responsiva de bloco de notas online, permitindo criar, editar, organizar e compartilhar notas sem exigir cadastro ou login.

---

## 🚀 Principais Funcionalidades

### 📝 1. Estrutura e Gestão de Notas
- **Sem Login ou Cadastro:** Cada navegador recebe um identificador anônimo criptográfico seguro (`owner_token`), mantendo suas notas protegidas e acessíveis no mesmo dispositivo.
- **Salvamento Automático em Tempo Real:** Feedback visual instantâneo (*Salvando...*, *Salvo*, *Erro ao salvar*).
- **Pesquisa Instantânea:** Filtre notas pelo título e pelo conteúdo completo com destaque visual.
- **Filtros e Fixação:** Organize notas por *Todas*, *Fixadas no topo* e *Compartilhadas*.
- **Exclusão Segura:** Diálogo de confirmação para evitar perdas acidentais.
- **Aviso de Dados do Navegador:** Alerta sobre a limpeza de cookies/cache e utilitário integrado de backup exportável em JSON.

### ✍️ 2. Editor Rico Avançado (TipTap)
- **Formatação de Texto:** Negrito (`Ctrl+B`), Itálico (`Ctrl+I`), Sublinhado (`Ctrl+U`), Tachado.
- **Estruturação:** Títulos H1, H2, H3, parágrafos, citações (blockquotes) e blocos de código com destaque monotípico.
- **Listas:** Listas com marcadores, listas ordenadas e listas de tarefas (checklists interativas).
- **Imagens:** Inserção inline via upload direto do dispositivo ou através de URL externa.
- **Gerenciador de Anexos:** Suporte a arquivos (PDFs, docs, zips) com validação de tipo e limite de até 10MB.
- **Produtividade:** Botão de copiar conteúdo como texto puro ou formatado, e botão para limpar formatação.
- **Contador:** Estatísticas de palavras e caracteres em tempo real no rodapé do editor.

### 🔗 3. Compartilhamento Personalizado Seguro
- **Links Personalizados:** Crie slugs limpos como `7notpad.com/n/minha-reuniao` com verificação de disponibilidade em tempo real e gerador de identificadores aleatórios.
- **Proteção Opcional por Senha:** Senhas armazenadas com hash criptográfico SHA-256 e Salt criptográfico exclusivo. O conteúdo protegido nunca é exposto antes da validação.
- **Proteção Anti Força Bruta:** Bloqueio temporário (30s) com contador regressivo após 5 tentativas incorretas.
- **Página Pública de Leitura (`/n/:slug`):** Interface otimizada e estritamente em **modo somente leitura** para visitantes.
- **Controle Total:** Ative, desative ou revogue links públicos quando quiser, continuando a editar a nota original sem quebrar o link.

### 🎨 4. Design & Experiência
- **Dark Mode Nativo:** Ativado por padrão (fundo grafite/preto `#090a0f`, superfícies escuras `#11131a` e detalhes em azul elétrico/violeta).
- **Light Mode Alternável:** Superfícies claras e modernas na mesma identidade cromática.
- **Customização do Editor:** Escolha entre fontes Sans (Inter), Serif (Merriweather) ou Mono (JetBrains), ajuste tamanho de fonte, largura da área de escrita e espaçamento entre linhas.
- **100% Responsivo:** Sidebar retrátil e navegação adaptada para smartphones, tablets e desktop.
- **Templates Rápidos:** Modelos para tarefas, pauta de reuniões e ideias de projetos no estado vazio.

---

## 🛠️ Tecnologias Utilizadas

- **Frontend:** React 19 + TypeScript + Vite
- **Estilização:** Tailwind CSS + Radix/Lucide Icons
- **Editor:** TipTap (`@tiptap/react`, `@tiptap/starter-kit`, extensões)
- **Criptografia:** Web Crypto API (`window.crypto.subtle` com SHA-256)
- **Nuvem & Banco:** Sincronização global em tempo real de alta disponibilidade
- **Modo Local:** LocalStorage / IndexedDB com sincronização híbrida local-first

---

## 💻 Como Rodar Localmente

1. Instale as dependências:
```bash
npm install
```

2. Inicie o servidor de desenvolvimento:
```bash
npm run dev
```

3. Abra `http://localhost:5175` no seu navegador.

---

## ☁️ Configuração do Supabase (Opcional)

O 7NotPad funciona 100% offline e localmente sem necessidade de configuração prévia. Para ativar sincronização em nuvem e compartilhamento global entre dispositivos:

1. Crie um projeto no [Supabase](https://supabase.com).
2. Abra o **SQL Editor** do Supabase e execute todo o conteúdo do arquivo [`supabase_schema.sql`](./supabase_schema.sql).
3. No 7NotPad, clique no ícone de engrenagem ⚙️ na barra superior, acesse a aba **Nuvem Supabase** e insira a **URL do Projeto** e a **Anon Key**.
4. Suas notas serão automaticamente sincronizadas em tempo real!

---

## 🔒 Arquitetura Sem Login

- Ao acessar o 7NotPad pela primeira vez, o navegador gera um `owner_token` criptograficamente seguro (`usr_...`).
- Esse token é persistido no armazenamento seguro local e enviado nas requisições do Supabase.
- Apenas quem possui o token pode modificar ou excluir as notas.
- Visitantes de links compartilhados recebem acesso somente leitura aos dados públicos da nota compartilhada.
