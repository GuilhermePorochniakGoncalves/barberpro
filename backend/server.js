// Carrega backend/.env se existir (PORT, CORS_ORIGIN, DB_PATH). Opcional —
// sem o arquivo, os defaults abaixo mantêm o comportamento de sempre.
try {
  process.loadEnvFile();
} catch {
  // .env não existe (ex.: ambiente de teste, ou ninguém criou um ainda) — ok.
}

const express = require("express");
const cors = require("cors");
const db = require("./db");
const {
  validarAgendamento,
  validarCliente,
  validarBarbeiro,
  validarVenda,
} = require("./validation");

const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
app.use(express.json());

// ---------- Helpers ----------

function servicosAtivos() {
  return db
    .prepare("SELECT nome FROM catalogo_itens WHERE tipo = 'servico' AND ativo = 1")
    .all()
    .map((r) => r.nome);
}

function catalogoAtivoMap() {
  const itens = db.prepare("SELECT nome, tipo, preco FROM catalogo_itens WHERE ativo = 1").all();
  return new Map(itens.map((i) => [i.nome, i]));
}

function upsertCliente({ nome, telefone }) {
  const existente = db.prepare("SELECT * FROM clientes WHERE telefone = ?").get(telefone);

  if (!existente) {
    db.prepare("INSERT INTO clientes (nome, telefone) VALUES (?, ?)").run(nome, telefone);
  } else if (existente.nome !== nome) {
    db.prepare("UPDATE clientes SET nome = ? WHERE telefone = ?").run(nome, telefone);
  }
}

function buscarConflitoAgendamento({ barbeiroId, data, horario }, ignorarId = null) {
  if (ignorarId) {
    return db
      .prepare(
        "SELECT * FROM agendamentos WHERE barbeiro_id = ? AND data = ? AND horario = ? AND id != ?"
      )
      .get(barbeiroId, data, horario, ignorarId);
  }
  return db
    .prepare("SELECT * FROM agendamentos WHERE barbeiro_id = ? AND data = ? AND horario = ?")
    .get(barbeiroId, data, horario);
}

// ---------- Barbeiros ----------

app.get("/barbeiros", (req, res) => {
  const barbeiros = db.prepare("SELECT * FROM barbeiros ORDER BY nome").all();
  res.json(barbeiros);
});

app.post("/barbeiros", (req, res) => {
  const { errors, valido, data } = validarBarbeiro(req.body);
  if (!valido) return res.status(400).json({ erros: errors });

  const info = db.prepare("INSERT INTO barbeiros (nome) VALUES (?)").run(data.nome);
  const barbeiro = db.prepare("SELECT * FROM barbeiros WHERE id = ?").get(info.lastInsertRowid);
  res.status(201).json(barbeiro);
});

app.put("/barbeiros/:id", (req, res) => {
  const id = Number(req.params.id);
  const existente = db.prepare("SELECT * FROM barbeiros WHERE id = ?").get(id);
  if (!existente) return res.status(404).json({ erro: "Barbeiro não encontrado." });

  const nome = req.body.nome !== undefined ? String(req.body.nome).trim() : existente.nome;
  const ativo = req.body.ativo !== undefined ? (req.body.ativo ? 1 : 0) : existente.ativo;

  if (!nome || nome.length < 2) {
    return res.status(400).json({ erros: ["Nome inválido."] });
  }

  db.prepare("UPDATE barbeiros SET nome = ?, ativo = ? WHERE id = ?").run(nome, ativo, id);
  res.json(db.prepare("SELECT * FROM barbeiros WHERE id = ?").get(id));
});

app.delete("/barbeiros/:id", (req, res) => {
  const id = Number(req.params.id);
  const existente = db.prepare("SELECT * FROM barbeiros WHERE id = ?").get(id);
  if (!existente) return res.status(404).json({ erro: "Barbeiro não encontrado." });

  const temHistorico = db
    .prepare("SELECT COUNT(*) AS total FROM agendamentos WHERE barbeiro_id = ?")
    .get(id).total;

  if (temHistorico > 0) {
    // Preserva integridade do histórico: em vez de apagar, desativa.
    db.prepare("UPDATE barbeiros SET ativo = 0 WHERE id = ?").run(id);
    return res.status(200).json({
      aviso: "Barbeiro tem agendamentos/atendimentos no histórico — foi desativado em vez de excluído.",
      barbeiro: db.prepare("SELECT * FROM barbeiros WHERE id = ?").get(id),
    });
  }

  db.prepare("DELETE FROM barbeiros WHERE id = ?").run(id);
  res.status(204).send();
});

// ---------- Catálogo (serviços e produtos) ----------

app.get("/catalogo", (req, res) => {
  const itens = db.prepare("SELECT * FROM catalogo_itens WHERE ativo = 1 ORDER BY tipo, nome").all();
  res.json(itens);
});

// ---------- Clientes ----------

app.get("/clientes", (req, res) => {
  const clientes = db
    .prepare(
      `SELECT c.*, (
         SELECT MAX(v.criado_em) FROM vendas v WHERE v.cliente_telefone = c.telefone
       ) AS ultimo_atendimento
       FROM clientes c
       ORDER BY c.nome`
    )
    .all();
  res.json(clientes);
});

app.get("/clientes/:id/historico", (req, res) => {
  const id = Number(req.params.id);
  const cliente = db.prepare("SELECT * FROM clientes WHERE id = ?").get(id);
  if (!cliente) return res.status(404).json({ erro: "Cliente não encontrado." });

  const vendas = db
    .prepare(
      `SELECT v.*, b.nome AS barbeiro_nome
       FROM vendas v
       JOIN barbeiros b ON b.id = v.barbeiro_id
       WHERE v.cliente_telefone = ?
       ORDER BY v.criado_em DESC`
    )
    .all(cliente.telefone);

  res.json({ cliente, vendas });
});

app.post("/clientes", (req, res) => {
  const { errors, valido, data } = validarCliente(req.body);
  if (!valido) return res.status(400).json({ erros: errors });

  const existente = db.prepare("SELECT * FROM clientes WHERE telefone = ?").get(data.telefone);
  if (existente) {
    return res.status(409).json({ erro: "Já existe um cliente com esse telefone." });
  }

  const info = db
    .prepare("INSERT INTO clientes (nome, telefone) VALUES (?, ?)")
    .run(data.nome, data.telefone);

  res.status(201).json(db.prepare("SELECT * FROM clientes WHERE id = ?").get(info.lastInsertRowid));
});

// ---------- Agendamentos ----------

app.get("/agendamentos", (req, res) => {
  const { barbeiroId, data } = req.query;

  const condicoes = [];
  const params = [];

  if (barbeiroId) {
    condicoes.push("barbeiro_id = ?");
    params.push(Number(barbeiroId));
  }
  if (data) {
    condicoes.push("data = ?");
    params.push(data);
  }

  const where = condicoes.length ? `WHERE ${condicoes.join(" AND ")}` : "";
  const agendamentos = db
    .prepare(`SELECT * FROM agendamentos ${where} ORDER BY data, horario`)
    .all(...params);

  res.json(agendamentos);
});

app.post("/agendamentos", (req, res) => {
  const { errors, valido, data } = validarAgendamento(req.body, servicosAtivos());
  if (!valido) return res.status(400).json({ erros: errors });

  const barbeiro = db.prepare("SELECT * FROM barbeiros WHERE id = ?").get(data.barbeiroId);
  if (!barbeiro) return res.status(400).json({ erros: ["Barbeiro não encontrado."] });

  const conflito = buscarConflitoAgendamento(data);
  if (conflito) {
    return res.status(409).json({
      erro: `${barbeiro.nome} já tem um agendamento em ${data.data} às ${data.horario} (${conflito.nome}).`,
    });
  }

  const info = db
    .prepare(
      `INSERT INTO agendamentos (barbeiro_id, nome, telefone, servico, data, horario)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(data.barbeiroId, data.nome, data.telefone, data.servico, data.data, data.horario);

  upsertCliente(data);

  res
    .status(201)
    .json(db.prepare("SELECT * FROM agendamentos WHERE id = ?").get(info.lastInsertRowid));
});

app.put("/agendamentos/:id", (req, res) => {
  const id = Number(req.params.id);
  const existente = db.prepare("SELECT * FROM agendamentos WHERE id = ?").get(id);
  if (!existente) return res.status(404).json({ erro: "Agendamento não encontrado." });
  if (existente.status === "concluido") {
    return res.status(409).json({ erro: "Atendimento já concluído não pode ser alterado." });
  }

  const { errors, valido, data } = validarAgendamento(req.body, servicosAtivos());
  if (!valido) return res.status(400).json({ erros: errors });

  const barbeiro = db.prepare("SELECT * FROM barbeiros WHERE id = ?").get(data.barbeiroId);
  if (!barbeiro) return res.status(400).json({ erros: ["Barbeiro não encontrado."] });

  const conflito = buscarConflitoAgendamento(data, id);
  if (conflito) {
    return res.status(409).json({
      erro: `${barbeiro.nome} já tem um agendamento em ${data.data} às ${data.horario} (${conflito.nome}).`,
    });
  }

  db.prepare(
    `UPDATE agendamentos
     SET barbeiro_id = ?, nome = ?, telefone = ?, servico = ?, data = ?, horario = ?,
         atualizado_em = datetime('now')
     WHERE id = ?`
  ).run(data.barbeiroId, data.nome, data.telefone, data.servico, data.data, data.horario, id);

  upsertCliente(data);

  res.json(db.prepare("SELECT * FROM agendamentos WHERE id = ?").get(id));
});

app.delete("/agendamentos/:id", (req, res) => {
  const id = Number(req.params.id);
  const existente = db.prepare("SELECT * FROM agendamentos WHERE id = ?").get(id);
  if (!existente) return res.status(404).json({ erro: "Agendamento não encontrado." });
  if (existente.status === "concluido") {
    return res.status(409).json({ erro: "Atendimento já concluído não pode ser cancelado." });
  }

  db.prepare("DELETE FROM agendamentos WHERE id = ?").run(id);
  res.status(204).send();
});

// ---------- Vendas (finalizar atendimento) ----------

app.get("/vendas", (req, res) => {
  const { barbeiroId, de, ate } = req.query;

  const condicoes = [];
  const params = [];

  if (barbeiroId) {
    condicoes.push("v.barbeiro_id = ?");
    params.push(Number(barbeiroId));
  }
  if (de) {
    condicoes.push("date(v.criado_em) >= date(?)");
    params.push(de);
  }
  if (ate) {
    condicoes.push("date(v.criado_em) <= date(?)");
    params.push(ate);
  }

  const where = condicoes.length ? `WHERE ${condicoes.join(" AND ")}` : "";
  const vendas = db
    .prepare(
      `SELECT v.*, b.nome AS barbeiro_nome
       FROM vendas v
       JOIN barbeiros b ON b.id = v.barbeiro_id
       ${where}
       ORDER BY v.criado_em DESC`
    )
    .all(...params);

  const itensStmt = db.prepare("SELECT * FROM venda_itens WHERE venda_id = ?");
  const vendasComItens = vendas.map((v) => ({ ...v, itens: itensStmt.all(v.id) }));

  res.json(vendasComItens);
});

app.post("/vendas", (req, res) => {
  const agendamento = db
    .prepare("SELECT * FROM agendamentos WHERE id = ?")
    .get(Number(req.body?.agendamentoId));

  if (!agendamento) {
    return res.status(404).json({ erro: "Agendamento não encontrado." });
  }
  if (agendamento.status === "concluido") {
    return res.status(409).json({ erro: "Este atendimento já foi finalizado." });
  }

  const { errors, valido, data } = validarVenda(req.body, catalogoAtivoMap());
  if (!valido) return res.status(400).json({ erros: errors });

  try {
    db.exec("BEGIN");

    const infoVenda = db
      .prepare(
        `INSERT INTO vendas (agendamento_id, barbeiro_id, cliente_nome, cliente_telefone, forma_pagamento, valor_total)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        agendamento.id,
        agendamento.barbeiro_id,
        agendamento.nome,
        agendamento.telefone,
        data.formaPagamento,
        data.valorTotal
      );

    const vendaId = infoVenda.lastInsertRowid;

    const inserirItem = db.prepare(
      "INSERT INTO venda_itens (venda_id, descricao, tipo, preco, quantidade) VALUES (?, ?, ?, ?, ?)"
    );
    for (const item of data.itens) {
      inserirItem.run(vendaId, item.descricao, item.tipo, item.preco, item.quantidade);
    }

    db.prepare(
      "UPDATE agendamentos SET status = 'concluido', atualizado_em = datetime('now') WHERE id = ?"
    ).run(agendamento.id);

    db.exec("COMMIT");

    const venda = db.prepare("SELECT * FROM vendas WHERE id = ?").get(vendaId);
    const itens = db.prepare("SELECT * FROM venda_itens WHERE venda_id = ?").all(vendaId);
    res.status(201).json({ ...venda, itens });
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
});

// ---------- Relatórios ----------

app.get("/relatorios/mensal", (req, res) => {
  const mes = req.query.mes || new Date().toISOString().slice(0, 7); // 'YYYY-MM'

  const totais = db
    .prepare(
      `SELECT COUNT(*) AS totalAtendimentos, COALESCE(SUM(valor_total), 0) AS faturamentoTotal
       FROM vendas WHERE strftime('%Y-%m', criado_em) = ?`
    )
    .get(mes);

  const porBarbeiro = db
    .prepare(
      `SELECT b.id AS barbeiroId, b.nome AS barbeiro,
              COUNT(*) AS atendimentos, COALESCE(SUM(v.valor_total), 0) AS faturamento
       FROM vendas v
       JOIN barbeiros b ON b.id = v.barbeiro_id
       WHERE strftime('%Y-%m', v.criado_em) = ?
       GROUP BY b.id
       ORDER BY faturamento DESC`
    )
    .all(mes);

  const porFormaPagamento = db
    .prepare(
      `SELECT forma_pagamento AS formaPagamento, COUNT(*) AS quantidade,
              COALESCE(SUM(valor_total), 0) AS faturamento
       FROM vendas
       WHERE strftime('%Y-%m', criado_em) = ?
       GROUP BY forma_pagamento
       ORDER BY quantidade DESC`
    )
    .all(mes);

  res.json({
    mes,
    totalAtendimentos: totais.totalAtendimentos,
    faturamentoTotal: totais.faturamentoTotal,
    porBarbeiro,
    porFormaPagamento,
  });
});

// ---------- Utilidades ----------

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use((req, res) => {
  res.status(404).json({ erro: "Rota não encontrada." });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ erro: "Erro interno do servidor." });
});

const PORT = process.env.PORT || 3001;

// Só sobe o servidor quando o arquivo é executado diretamente (`node
// server.js` / `nodemon server.js`). Quando é importado (ex.: pelos testes
// via `require("../server")`), só expõe o `app` — quem importou decide
// se/quando chamar `.listen()`.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Servidor BarberPro rodando na porta ${PORT}`);
  });
}

module.exports = app;
