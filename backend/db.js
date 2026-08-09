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

db.exec(`
  CREATE TABLE IF NOT EXISTS catalogo_itens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL UNIQUE,
    tipo TEXT NOT NULL CHECK (tipo IN ('servico', 'produto')),
    preco REAL NOT NULL,
    ativo INTEGER NOT NULL DEFAULT 1
  );
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

// Seed do catálogo — só roda se a tabela estiver vazia (não sobrescreve
// edições futuras feitas via API).
const { total } = db.prepare("SELECT COUNT(*) AS total FROM catalogo_itens").get();

if (total === 0) {
  const inserirItem = db.prepare(
    "INSERT INTO catalogo_itens (nome, tipo, preco) VALUES (?, ?, ?)"
  );

  const seed = [
    ["Corte masculino", "servico", 40],
    ["Corte + Barba", "servico", 60],
    ["Barba", "servico", 25],
    ["Pomada modeladora", "produto", 35],
    ["Bebida", "produto", 8],
  ];

  for (const item of seed) {
    inserirItem.run(...item);
  }
}

module.exports = db;
