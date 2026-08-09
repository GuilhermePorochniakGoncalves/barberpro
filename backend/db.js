const path = require("path");
const fs = require("fs");
const { DatabaseSync } = require("node:sqlite");

// Banco SQLite em arquivo — os dados sobrevivem a restart do servidor.
// DB_PATH permite apontar pra outro arquivo (ou ':memory:' nos testes,
// pra não misturar dado de teste com o banco de desenvolvimento).
const dbPath = process.env.DB_PATH || path.join(__dirname, "data", "barberpro.db");

if (dbPath !== ":memory:") {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

const db = new DatabaseSync(dbPath);

db.exec("PRAGMA foreign_keys = ON;");

db.exec(`
  CREATE TABLE IF NOT EXISTS barbeiros (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    ativo INTEGER NOT NULL DEFAULT 1,
    criado_em TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS clientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    telefone TEXT NOT NULL UNIQUE
  );
`);

// Serviço e produto vivem na mesma tabela (mesma forma: nome+tipo+preço),
// mas serviço pertence a um barbeiro (cada um define os próprios, com seu
// preço) enquanto produto é compartilhado pela barbearia inteira e tem
// estoque. `barbeiro_id` NULL identifica produto; preenchido, serviço.
db.exec(`
  CREATE TABLE IF NOT EXISTS catalogo_itens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('servico', 'produto')),
    preco REAL NOT NULL,
    ativo INTEGER NOT NULL DEFAULT 1,
    barbeiro_id INTEGER REFERENCES barbeiros(id),
    estoque INTEGER,
    CHECK (
      (tipo = 'servico' AND barbeiro_id IS NOT NULL AND estoque IS NULL) OR
      (tipo = 'produto' AND barbeiro_id IS NULL AND estoque IS NOT NULL)
    )
  );
`);

// Nome de serviço só precisa ser único dentro do mesmo barbeiro; nome de
// produto precisa ser único no catálogo compartilhado inteiro. Índices
// parciais (SQLite suporta WHERE em índice) em vez de UNIQUE na coluna,
// porque um único UNIQUE(nome) impediria dois barbeiros de terem o mesmo
// nome de serviço (ex.: "Corte masculino" pros dois).
db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_catalogo_servico_nome
  ON catalogo_itens (barbeiro_id, nome) WHERE tipo = 'servico';
`);
db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_catalogo_produto_nome
  ON catalogo_itens (nome) WHERE tipo = 'produto';
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS agendamentos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    barbeiro_id INTEGER NOT NULL REFERENCES barbeiros(id),
    nome TEXT NOT NULL,
    telefone TEXT NOT NULL,
    servico TEXT NOT NULL,
    data TEXT NOT NULL,
    horario TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'agendado' CHECK (status IN ('agendado', 'concluido')),
    criado_em TEXT NOT NULL DEFAULT (datetime('now')),
    atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Conflito de horário agora é por barbeiro — dois barbeiros podem atender
// clientes diferentes no mesmo dia/horário.
db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_agendamentos_barbeiro_data_horario
  ON agendamentos (barbeiro_id, data, horario);
`);

// Folga (dia inteiro, horario NULL) ou horário específico bloqueado pelo
// próprio barbeiro. Sem UNIQUE no banco — SQLite trata cada NULL de
// `horario` como distinto, então duplicidade de "dia inteiro" é evitada na
// rota, não no schema.
db.exec(`
  CREATE TABLE IF NOT EXISTS barbeiro_bloqueios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    barbeiro_id INTEGER NOT NULL REFERENCES barbeiros(id),
    data TEXT NOT NULL,
    horario TEXT
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS vendas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agendamento_id INTEGER NOT NULL REFERENCES agendamentos(id),
    barbeiro_id INTEGER NOT NULL REFERENCES barbeiros(id),
    cliente_nome TEXT NOT NULL,
    cliente_telefone TEXT NOT NULL,
    forma_pagamento TEXT NOT NULL CHECK (forma_pagamento IN ('debito', 'credito', 'dinheiro', 'pix')),
    valor_total REAL NOT NULL,
    criado_em TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS venda_itens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    venda_id INTEGER NOT NULL REFERENCES vendas(id),
    descricao TEXT NOT NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('servico', 'produto')),
    preco REAL NOT NULL,
    quantidade INTEGER NOT NULL DEFAULT 1
  );
`);

// Seed de produtos compartilhados — só roda se o catálogo estiver vazio
// (não sobrescreve edições futuras feitas via API). Serviço não é semeado:
// cada barbeiro cadastra os próprios depois de criado.
const { total } = db.prepare("SELECT COUNT(*) AS total FROM catalogo_itens").get();

if (total === 0) {
  const inserirProduto = db.prepare(
    "INSERT INTO catalogo_itens (nome, tipo, preco, barbeiro_id, estoque) VALUES (?, 'produto', ?, NULL, ?)"
  );

  const seed = [
    ["Pomada modeladora", 35, 20],
    ["Óleo de barba", 28, 15],
    ["Bebida", 8, 50],
  ];

  for (const [nome, preco, estoque] of seed) {
    inserirProduto.run(nome, preco, estoque);
  }
}

module.exports = db;
