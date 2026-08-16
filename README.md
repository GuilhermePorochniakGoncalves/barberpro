# BarberPro

Sistema de gestão pra barbearia: agenda por barbeiro, catálogo de serviços/produtos com estoque,
lista de espera, clientes com histórico, agendamento público online e relatório mensal.

- `backend/` — API Node.js/Express + Postgres.
- `frontend/` — SPA React (Vite).

Sem login por pessoa: qualquer barbeiro/recepção gerencia a agenda de qualquer barbeiro — decisão
intencional, ver comentário no topo de `backend/server.js`. O painel inteiro fica atrás de uma senha
única da barbearia (`PANEL_PASSWORD`), só pra barrar visitante casual — a tela pública de agendamento
(`/agendar`, também servida na raiz `/`) não precisa dessa senha.

## Rodando localmente

**Backend**
```
cd backend
cp .env.example .env   # preencha DATABASE_URL com um Postgres seu (ex.: Neon)
npm install
npm run dev             # http://localhost:3001
```

**Frontend**
```
cd frontend
cp .env.example .env   # opcional em dev — sem ele, aponta pra localhost:3001 sozinho
npm install
npm run dev              # http://localhost:5173
```

**Testes** (backend usa um Postgres em memória via `pg-mem` — não precisa de banco real):
```
cd backend && npm test
cd frontend && npm test
```

---

## Deploy grátis: backend no Render + banco no Neon + frontend no Netlify

Esse é o passo a passo **bem simples**, pra quem nunca usou nenhum dos dois painéis.

### Parte 1 — Banco de dados (Neon)

Você já tem uma conta no Neon com um banco criado. Só precisa da **connection string**:

1. Entre em [neon.tech](https://neon.tech) e abra o seu projeto.
2. No painel do projeto, procure por **"Connection string"** (geralmente aparece bem no topo do Dashboard).
3. Tem um seletor escrito algo como **"Pooled connection"** — deixe marcado assim (é o recomendado pra apps
   como esse, que abrem várias conexões curtas).
4. Clique no ícone de copiar ao lado da string. Ela é parecida com:
   `postgresql://usuario:senha@algumhost.neon.tech/neondb?sslmode=require&channel_binding=require`
5. Guarde essa string num lugar seguro (não vai num arquivo do git) — você vai colar ela no Render daqui a pouco.

### Parte 2 — Backend (Render)

1. Entre em [render.com](https://render.com) e faça login (você já conectou sua conta ao GitHub).
2. No Dashboard, clique no botão **"New +"** (canto superior direito) → escolha **"Web Service"**.
3. Na lista de repositórios, procure o repositório do BarberPro e clique em **"Connect"**.
   - Se ele não aparecer na lista, clique em "Configure account" e libere o acesso do Render a esse repositório.
4. Você vai cair numa tela de configuração. Preencha assim:
   - **Name**: qualquer nome, ex. `barberpro-api` (isso vira parte da URL: `barberpro-api.onrender.com`).
   - **Region**: a mais próxima de você (ex. Ohio, se estiver no Brasil, costuma ter boa latência).
   - **Branch**: `main`.
   - **Root Directory**: `backend` (importante — o projeto tem duas pastas, e o Render precisa saber que é
     essa que roda o servidor).
   - **Runtime**: `Node`.
   - **Build Command**: `npm install`.
   - **Start Command**: `npm start`.
   - **Instance Type**: `Free`.
5. Role até **"Environment Variables"** (ou "Advanced" → "Add Environment Variable", dependendo da versão
   da tela) e adicione, uma de cada vez, clicando em **"Add Environment Variable"**:
   - `DATABASE_URL` → cole aqui a connection string do Neon que você copiou na Parte 1.
   - `CORS_ORIGIN` → por enquanto pode deixar `*`. **Depois de criar o site no Netlify (Parte 3), volte
     aqui e troque pelo endereço do Netlify** (ex. `https://barberpro.netlify.app`), pra travar o backend
     pra só aceitar chamadas do seu site.
   - `PANEL_PASSWORD` → **obrigatória**, sem ela o painel inteiro fica bloqueado (a tela pública de
     agendamento continua funcionando normal). Escolha uma senha só, que qualquer barbeiro/recepção vai
     digitar pra entrar no painel — não é senha por pessoa, é só uma barreira contra visitante que ache
     a URL por acaso.
   - Não precisa adicionar `PORT` — o Render define isso sozinho.
6. Clique em **"Create Web Service"** (ou "Deploy Web Service") no final da página.
7. Espere a tela de logs rodar (leva 1–3 minutos na primeira vez). Quando aparecer algo como
   `Servidor BarberPro rodando na porta ...` e o status ficar **"Live"** (bolinha verde), deu certo.
8. No topo da página, tem a URL do seu backend, algo como `https://barberpro-api.onrender.com`.
   **Copie essa URL** — você vai usar no Netlify agora.

   Teste se está no ar: abra `https://SUA-URL.onrender.com/health` no navegador — deve aparecer
   `{"status":"ok"}`.

   ⚠️ Plano free do Render "dorme" depois de ~15 min sem uso, e demora ~30–50s pra acordar na próxima
   chamada. É normal a primeira requisição do dia demorar um pouco.

### Parte 3 — Frontend (Netlify)

1. Entre em [netlify.com](https://netlify.com) e faça login.
2. No Dashboard, clique em **"Add new site"** → **"Import an existing project"**.
3. Escolha **"Deploy with GitHub"** e autorize se ele pedir. Selecione o repositório do BarberPro.
4. Na tela de configuração do build:
   - **Base directory**: `frontend`.
   - **Build command**: `npm run build`.
   - **Publish directory**: `frontend/dist` (se o campo "Base directory" já estiver preenchido como
     `frontend`, esse campo pode pedir só `dist`).
5. Antes de clicar em deploy, abra a seção **"Environment variables"** (ou "Add environment variables") e
   adicione:
   - `VITE_API_URL` → cole a URL do backend que você copiou no fim da Parte 2
     (ex. `https://barberpro-api.onrender.com`, **sem barra no final**).
6. Clique em **"Deploy site"**.
7. Espere o build rodar (1–2 minutos). Quando terminar, o Netlify te dá uma URL tipo
   `https://algum-nome-aleatorio.netlify.app` — esse é o seu site no ar.
   - Opcional: em **"Site settings" → "Change site name"**, você troca esse nome aleatório por algo
     como `barberpro-suaideia`, deixando a URL mais bonita (`barberpro-suaideia.netlify.app`).

### Parte 4 — Travar o CORS (volta rápida no Render)

Agora que você tem a URL final do Netlify:

1. Volte no Render → seu serviço → aba **"Environment"**.
2. Edite a variável `CORS_ORIGIN` e troque o `*` pela URL do Netlify (ex.: `https://barberpro-suaideia.netlify.app`,
   sem barra no final).
3. Salve — o Render redeploya sozinho.

Pronto: backend na Render, banco no Neon, frontend no Netlify, tudo de graça.

## Backup do banco

O Neon já mantém histórico próprio do banco (restauração por ponto no tempo — "Point-in-time restore" /
"Restore" no dashboard do projeto, cobrindo as últimas horas/dias dependendo do plano). Pra um backup
adicional, independente do Neon, tem um script manual:

```
cd backend
npm run backup
```

Isso roda `pg_dump` contra o `DATABASE_URL` do seu `.env` e salva em `backend/backups/`, um arquivo
`.dump` com timestamp no nome. Mantém só os 7 mais recentes — mais antigos são apagados automaticamente
a cada execução. Requer o `pg_dump` instalado na máquina (vem com qualquer instalação do Postgres, ou
`apt install postgresql-client` / `brew install libpq`; no Windows, instala junto com o
[instalador oficial do Postgres](https://www.postgresql.org/download/windows/)).

**Pra rodar sozinho todo dia**, sem precisar lembrar: agende o comando `npm run backup` (dentro de
`backend/`) no Agendador de Tarefas do Windows, ou num `cron` se rodar em Linux/Mac. O Render (plano
free) não tem disco persistente nem cron nativo, então esse agendamento é pensado pra rodar numa máquina
sua, não no servidor — é um backup "de segurança pessoal" complementar ao do Neon, não o principal.

**Pra restaurar** um `.dump` gerado pelo script:
```
pg_restore --clean --if-exists --dbname="SUA_DATABASE_URL_AQUI" backend/backups/barberpro-2026-08-12T....dump
```
⚠️ `--clean` apaga as tabelas existentes antes de recriar — só rode isso contra o banco que você
realmente quer sobrescrever (nunca contra produção sem ter certeza).

### Se algo der errado

- **Site abre mas fica em branco / erro de rede no console**: confira se `VITE_API_URL` no Netlify aponta
  pro backend certo, e se o backend está "Live" no Render (não "Suspended"/"Failed").
- **Erro de CORS no console do navegador**: `CORS_ORIGIN` no Render não bate com a URL do Netlify — confira
  se não tem barra `/` sobrando no final de nenhuma das duas.
- **Backend não sobe no Render (logs mostram erro de banco)**: confira se `DATABASE_URL` foi colada certinha,
  sem espaços, e se o projeto no Neon não está pausado (planos free do Neon também pausam por inatividade,
  mas acordam sozinhos na primeira conexão).
