// Postgres (via `pg`) no lugar do SQLite antigo. Em teste (NODE_ENV=test)
// usa pg-mem — um Postgres compatível rodando em memória — pra não
// precisar de um banco real pra rodar a suíte.
//
// Todo o resto do backend fala com o banco só através de query()/one()/
// many() daqui, nunca direto com `pool`/`Pool`.

let pool;

if (process.env.NODE_ENV === "test") {
  const { newDb } = require("pg-mem");
  const mem = newDb({ autoCreateForeignKeyIndices: true });
  mem.public.registerFunction({
    name: "now",
    implementation: () => new Date(),
  });
  // pg-mem não implementa to_char nativamente — só cobrimos o único uso
  // real do projeto (relatório mensal: to_char(col, 'YYYY-MM')).
  mem.public.registerFunction({
    name: "to_char",
    args: ["timestamptz", "text"],
    returns: "text",
    implementation: (ts, fmt) => {
      const d = ts instanceof Date ? ts : new Date(ts);
      if (fmt === "YYYY-MM") {
        return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      }
      return d.toISOString();
    },
  });
  const adapter = mem.adapters.createPg();
  pool = new adapter.Pool();
} else {
  const { Pool } = require("pg");
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL não configurada. Copie backend/.env.example pra backend/.env e preencha com a connection string do Postgres."
    );
  }
  pool = new Pool({ connectionString });
}

async function query(text, params = []) {
  return pool.query(text, params);
}

// Uma linha ou null — equivalente ao antigo `.get()` do node:sqlite.
async function one(text, params = []) {
  const { rows } = await query(text, params);
  return rows[0] ?? null;
}

// Várias linhas — equivalente ao antigo `.all()`.
async function many(text, params = []) {
  const { rows } = await query(text, params);
  return rows;
}

async function initSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS barbeiros (
      id SERIAL PRIMARY KEY,
      nome TEXT NOT NULL,
      ativo BOOLEAN NOT NULL DEFAULT TRUE,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS clientes (
      id SERIAL PRIMARY KEY,
      nome TEXT NOT NULL,
      telefone TEXT NOT NULL UNIQUE
    );
  `);

  // Serviço e produto vivem na mesma tabela (mesma forma: nome+tipo+preço),
  // mas serviço pertence a um barbeiro (cada um define os próprios, com seu
  // preço) enquanto produto é compartilhado pela barbearia inteira e tem
  // estoque. `barbeiro_id` NULL identifica produto; preenchido, serviço.
  await query(`
    CREATE TABLE IF NOT EXISTS catalogo_itens (
      id SERIAL PRIMARY KEY,
      nome TEXT NOT NULL,
      tipo TEXT NOT NULL CHECK (tipo IN ('servico', 'produto')),
      preco REAL NOT NULL,
      ativo BOOLEAN NOT NULL DEFAULT TRUE,
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
  // parciais (Postgres suporta WHERE em índice) em vez de UNIQUE na coluna,
  // porque um único UNIQUE(nome) impediria dois barbeiros de terem o mesmo
  // nome de serviço (ex.: "Corte masculino" pros dois).
  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_catalogo_servico_nome
    ON catalogo_itens (barbeiro_id, nome) WHERE tipo = 'servico';
  `);
  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_catalogo_produto_nome
    ON catalogo_itens (nome) WHERE tipo = 'produto';
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS agendamentos (
      id SERIAL PRIMARY KEY,
      barbeiro_id INTEGER NOT NULL REFERENCES barbeiros(id),
      nome TEXT NOT NULL,
      telefone TEXT NOT NULL,
      servico TEXT NOT NULL,
      data TEXT NOT NULL,
      horario TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'agendado' CHECK (status IN ('agendado', 'concluido')),
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Conflito de horário agora é por barbeiro — dois barbeiros podem atender
  // clientes diferentes no mesmo dia/horário.
  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_agendamentos_barbeiro_data_horario
    ON agendamentos (barbeiro_id, data, horario);
  `);

  // Folga (dia inteiro, horario NULL) ou horário específico bloqueado pelo
  // próprio barbeiro. Sem UNIQUE no banco — cada NULL de `horario` conta
  // como distinto, então duplicidade de "dia inteiro" é evitada na rota.
  await query(`
    CREATE TABLE IF NOT EXISTS barbeiro_bloqueios (
      id SERIAL PRIMARY KEY,
      barbeiro_id INTEGER NOT NULL REFERENCES barbeiros(id),
      data TEXT NOT NULL,
      horario TEXT
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS vendas (
      id SERIAL PRIMARY KEY,
      agendamento_id INTEGER NOT NULL REFERENCES agendamentos(id),
      barbeiro_id INTEGER NOT NULL REFERENCES barbeiros(id),
      cliente_nome TEXT NOT NULL,
      cliente_telefone TEXT NOT NULL,
      forma_pagamento TEXT NOT NULL CHECK (forma_pagamento IN ('debito', 'credito', 'dinheiro', 'pix')),
      valor_total REAL NOT NULL,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS venda_itens (
      id SERIAL PRIMARY KEY,
      venda_id INTEGER NOT NULL REFERENCES vendas(id),
      descricao TEXT NOT NULL,
      tipo TEXT NOT NULL CHECK (tipo IN ('servico', 'produto')),
      preco REAL NOT NULL,
      quantidade INTEGER NOT NULL DEFAULT 1
    );
  `);

  // Lista de espera de um horário/dia lotado. Quando o agendamento daquele
  // slot é cancelado, quem está "aguardando" vira "notificado" (ver
  // DELETE /agendamentos/:id) — por ora só marca o registro; o envio real
  // (WhatsApp) fica pra uma integração futura.
  await query(`
    CREATE TABLE IF NOT EXISTS lista_espera (
      id SERIAL PRIMARY KEY,
      barbeiro_id INTEGER NOT NULL REFERENCES barbeiros(id),
      nome TEXT NOT NULL,
      telefone TEXT NOT NULL,
      servico TEXT,
      data TEXT NOT NULL,
      horario TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'aguardando' CHECK (status IN ('aguardando', 'notificado', 'cancelado')),
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      notificado_em TIMESTAMPTZ
    );
  `);

  // Seed de produtos compartilhados — só roda se o catálogo estiver vazio
  // (não sobrescreve edições futuras feitas via API). Serviço não é
  // semeado: cada barbeiro cadastra os próprios depois de criado.
  const { total } = await one("SELECT COUNT(*) AS total FROM catalogo_itens");

  if (Number(total) === 0) {
    const seed = [
      ["Pomada modeladora", 35, 20],
      ["Óleo de barba", 28, 15],
      ["Bebida", 8, 50],
    ];

    for (const [nome, preco, estoque] of seed) {
      await query(
        "INSERT INTO catalogo_itens (nome, tipo, preco, barbeiro_id, estoque) VALUES ($1, 'produto', $2, NULL, $3)",
        [nome, preco, estoque]
      );
    }
  }
}

// Dispara a criação do schema assim que o módulo é carregado; quem for
// usar o banco (server.js, testes) espera essa promise antes da primeira
// query — ver `await db.ready` em server.js e test/helpers.js.
const ready = initSchema().catch((err) => {
  console.error("Falha ao inicializar o schema do banco:", err);
  throw err;
});

module.exports = { query, one, many, pool, ready };
