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
  validarCredenciaisLogin,
  validarDefinicaoLogin,
  validarServico,
  validarProduto,
  validarBloqueio,
} = require("./validation");
const {
  hashSenha,
  verificarSenha,
  criarSessao,
  removerSessao,
  resolverToken,
  autenticar,
  barrarSeNaoForDono,
} = require("./auth");

const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
app.use(express.json());

// ---------- Helpers ----------

function servicosAtivosDoBarbeiro(barbeiroId) {
  return db
    .prepare("SELECT nome FROM catalogo_itens WHERE tipo = 'servico' AND ativo = 1 AND barbeiro_id = ?")
    .all(barbeiroId)
    .map((r) => r.nome);
}

// Catálogo disponível pra um barbeiro finalizar um atendimento: os próprios
// serviços + todos os produtos compartilhados (ambos ativos).
function catalogoAtivoMap(barbeiroId) {
  const itens = db
    .prepare(
      `SELECT id, nome, tipo, preco, estoque FROM catalogo_itens
       WHERE ativo = 1 AND (tipo = 'produto' OR barbeiro_id = ?)`
    )
    .all(barbeiroId);
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

// Dia inteiro (horario NULL) ou o horário específico bloqueado pelo barbeiro.
function slotBloqueado(barbeiroId, data, horario) {
  return db
    .prepare(
      "SELECT * FROM barbeiro_bloqueios WHERE barbeiro_id = ? AND data = ? AND (horario IS NULL OR horario = ?)"
    )
    .get(barbeiroId, data, horario);
}

// ---------- Login ----------

app.post("/barbeiros/login", (req, res) => {
  const { errors, valido, data } = validarCredenciaisLogin(req.body);
  if (!valido) return res.status(400).json({ erros: errors });

  const barbeiro = db.prepare("SELECT * FROM barbeiros WHERE usuario = ?").get(data.usuario);

  // Mensagem genérica de propósito — não revela se foi o usuário ou a senha.
  if (!barbeiro || !verificarSenha(data.senha, barbeiro.senha_hash)) {
    return res.status(401).json({ erro: "Usuário ou senha inválidos." });
  }

  const { token, expiraEm } = criarSessao(barbeiro.id);
  res.json({
    token,
    expiraEm,
    barbeiro: { id: barbeiro.id, nome: barbeiro.nome, usuario: barbeiro.usuario },
  });
});

app.post("/barbeiros/logout", (req, res) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (token) removerSessao(token);
  res.status(204).send();
});

// Define ou troca usuário+senha de um barbeiro. Primeira configuração é
// aberta (o barbeiro ainda não tem como se autenticar); depois de
// configurado, só o próprio dono (autenticado) pode trocar.
app.put("/barbeiros/:id/login", (req, res) => {
  const id = Number(req.params.id);
  const barbeiro = db.prepare("SELECT * FROM barbeiros WHERE id = ?").get(id);
  if (!barbeiro) return res.status(404).json({ erro: "Barbeiro não encontrado." });

  if (barbeiro.usuario) {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    const autenticado = resolverToken(token);
    if (!autenticado || autenticado.id !== id) {
      return res.status(403).json({ erro: "Faça login como esse barbeiro pra trocar as credenciais." });
    }
  }

  const { errors, valido, data } = validarDefinicaoLogin(req.body);
  if (!valido) return res.status(400).json({ erros: errors });

  const usuarioEmUso = db
    .prepare("SELECT id FROM barbeiros WHERE usuario = ? AND id != ?")
    .get(data.usuario, id);
  if (usuarioEmUso) return res.status(409).json({ erro: "Esse nome de usuário já está em uso." });

  db.prepare("UPDATE barbeiros SET usuario = ?, senha_hash = ? WHERE id = ?").run(
    data.usuario,
    hashSenha(data.senha),
    id
  );

  res.json({ id: barbeiro.id, nome: barbeiro.nome, usuario: data.usuario });
});

// ---------- Barbeiros ----------

app.get("/barbeiros", (req, res) => {
  // Nunca expõe usuario/senha_hash na listagem pública.
  const barbeiros = db
    .prepare("SELECT id, nome, ativo, criado_em, (usuario IS NOT NULL) AS tem_login FROM barbeiros ORDER BY nome")
    .all();
  res.json(barbeiros);
});

app.post("/barbeiros", (req, res) => {
  const { errors, valido, data } = validarBarbeiro(req.body);
  if (!valido) return res.status(400).json({ erros: errors });

  const info = db.prepare("INSERT INTO barbeiros (nome) VALUES (?)").run(data.nome);
  const barbeiro = db
    .prepare("SELECT id, nome, ativo, criado_em FROM barbeiros WHERE id = ?")
    .get(info.lastInsertRowid);
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
  res.json(
    db.prepare("SELECT id, nome, ativo, criado_em FROM barbeiros WHERE id = ?").get(id)
  );
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
      barbeiro: db.prepare("SELECT id, nome, ativo, criado_em FROM barbeiros WHERE id = ?").get(id),
    });
  }

  db.prepare("DELETE FROM barbeiros WHERE id = ?").run(id);
  res.status(204).send();
});

// ---------- Catálogo (serviços do barbeiro + produtos compartilhados) ----------

app.get("/catalogo", (req, res) => {
  const { barbeiroId } = req.query;

  const itens = barbeiroId
    ? db
        .prepare(
          `SELECT * FROM catalogo_itens
           WHERE ativo = 1 AND (tipo = 'produto' OR barbeiro_id = ?)
           ORDER BY tipo, nome`
        )
        .all(Number(barbeiroId))
    : db.prepare("SELECT * FROM catalogo_itens WHERE ativo = 1 AND tipo = 'produto' ORDER BY nome").all();

  res.json(itens);
});

// -- Serviços (por barbeiro; só o próprio dono gerencia) --

app.post("/barbeiros/:id/servicos", autenticar, (req, res) => {
  const barbeiroId = Number(req.params.id);
  if (barrarSeNaoForDono(req, res, barbeiroId)) return;

  const { errors, valido, data } = validarServico(req.body);
  if (!valido) return res.status(400).json({ erros: errors });

  const duplicado = db
    .prepare("SELECT id FROM catalogo_itens WHERE tipo = 'servico' AND barbeiro_id = ? AND nome = ?")
    .get(barbeiroId, data.nome);
  if (duplicado) return res.status(409).json({ erro: "Você já tem um serviço com esse nome." });

  const info = db
    .prepare(
      "INSERT INTO catalogo_itens (nome, tipo, preco, barbeiro_id) VALUES (?, 'servico', ?, ?)"
    )
    .run(data.nome, data.preco, barbeiroId);

  res.status(201).json(db.prepare("SELECT * FROM catalogo_itens WHERE id = ?").get(info.lastInsertRowid));
});

app.put("/barbeiros/:id/servicos/:itemId", autenticar, (req, res) => {
  const barbeiroId = Number(req.params.id);
  if (barrarSeNaoForDono(req, res, barbeiroId)) return;

  const item = db
    .prepare("SELECT * FROM catalogo_itens WHERE id = ? AND tipo = 'servico' AND barbeiro_id = ?")
    .get(Number(req.params.itemId), barbeiroId);
  if (!item) return res.status(404).json({ erro: "Serviço não encontrado." });

  const { errors, valido, data } = validarServico(req.body);
  if (!valido) return res.status(400).json({ erros: errors });

  const ativo = req.body.ativo !== undefined ? (req.body.ativo ? 1 : 0) : item.ativo;

  db.prepare("UPDATE catalogo_itens SET nome = ?, preco = ?, ativo = ? WHERE id = ?").run(
    data.nome,
    data.preco,
    ativo,
    item.id
  );

  res.json(db.prepare("SELECT * FROM catalogo_itens WHERE id = ?").get(item.id));
});

app.delete("/barbeiros/:id/servicos/:itemId", autenticar, (req, res) => {
  const barbeiroId = Number(req.params.id);
  if (barrarSeNaoForDono(req, res, barbeiroId)) return;

  const item = db
    .prepare("SELECT * FROM catalogo_itens WHERE id = ? AND tipo = 'servico' AND barbeiro_id = ?")
    .get(Number(req.params.itemId), barbeiroId);
  if (!item) return res.status(404).json({ erro: "Serviço não encontrado." });

  db.prepare("DELETE FROM catalogo_itens WHERE id = ?").run(item.id);
  res.status(204).send();
});

// -- Produtos (compartilhados; qualquer barbeiro autenticado gerencia —
// sem conceito de admin ainda, ver plano/observação no código) --

app.post("/produtos", autenticar, (req, res) => {
  const { errors, valido, data } = validarProduto(req.body);
  if (!valido) return res.status(400).json({ erros: errors });

  const duplicado = db
    .prepare("SELECT id FROM catalogo_itens WHERE tipo = 'produto' AND nome = ?")
    .get(data.nome);
  if (duplicado) return res.status(409).json({ erro: "Já existe um produto com esse nome." });

  const info = db
    .prepare(
      "INSERT INTO catalogo_itens (nome, tipo, preco, barbeiro_id, estoque) VALUES (?, 'produto', ?, NULL, ?)"
    )
    .run(data.nome, data.preco, data.estoque);

  res.status(201).json(db.prepare("SELECT * FROM catalogo_itens WHERE id = ?").get(info.lastInsertRowid));
});

app.put("/produtos/:itemId", autenticar, (req, res) => {
  const item = db
    .prepare("SELECT * FROM catalogo_itens WHERE id = ? AND tipo = 'produto'")
    .get(Number(req.params.itemId));
  if (!item) return res.status(404).json({ erro: "Produto não encontrado." });

  const { errors, valido, data } = validarProduto(req.body);
  if (!valido) return res.status(400).json({ erros: errors });

  const ativo = req.body.ativo !== undefined ? (req.body.ativo ? 1 : 0) : item.ativo;

  db.prepare("UPDATE catalogo_itens SET nome = ?, preco = ?, estoque = ?, ativo = ? WHERE id = ?").run(
    data.nome,
    data.preco,
    data.estoque,
    ativo,
    item.id
  );

  res.json(db.prepare("SELECT * FROM catalogo_itens WHERE id = ?").get(item.id));
});

app.delete("/produtos/:itemId", autenticar, (req, res) => {
  const item = db
    .prepare("SELECT * FROM catalogo_itens WHERE id = ? AND tipo = 'produto'")
    .get(Number(req.params.itemId));
  if (!item) return res.status(404).json({ erro: "Produto não encontrado." });

  db.prepare("DELETE FROM catalogo_itens WHERE id = ?").run(item.id);
  res.status(204).send();
});

// ---------- Bloqueios de agenda (folga / horário indisponível) ----------

app.get("/barbeiros/:id/bloqueios", (req, res) => {
  const barbeiroId = Number(req.params.id);
  const { data } = req.query;

  const bloqueios = data
    ? db.prepare("SELECT * FROM barbeiro_bloqueios WHERE barbeiro_id = ? AND data = ?").all(barbeiroId, data)
    : db.prepare("SELECT * FROM barbeiro_bloqueios WHERE barbeiro_id = ? ORDER BY data").all(barbeiroId);

  res.json(bloqueios);
});

app.post("/barbeiros/:id/bloqueios", autenticar, (req, res) => {
  const barbeiroId = Number(req.params.id);
  if (barrarSeNaoForDono(req, res, barbeiroId)) return;

  const { errors, valido, data } = validarBloqueio(req.body);
  if (!valido) return res.status(400).json({ erros: errors });

  const jaBloqueado = slotBloqueado(barbeiroId, data.data, data.horario);
  if (jaBloqueado) {
    return res.status(409).json({ erro: "Esse dia/horário já está bloqueado." });
  }

  const info = db
    .prepare("INSERT INTO barbeiro_bloqueios (barbeiro_id, data, horario) VALUES (?, ?, ?)")
    .run(barbeiroId, data.data, data.horario);

  res.status(201).json(db.prepare("SELECT * FROM barbeiro_bloqueios WHERE id = ?").get(info.lastInsertRowid));
});

app.delete("/barbeiros/:id/bloqueios/:bloqueioId", autenticar, (req, res) => {
  const barbeiroId = Number(req.params.id);
  if (barrarSeNaoForDono(req, res, barbeiroId)) return;

  const bloqueio = db
    .prepare("SELECT * FROM barbeiro_bloqueios WHERE id = ? AND barbeiro_id = ?")
    .get(Number(req.params.bloqueioId), barbeiroId);
  if (!bloqueio) return res.status(404).json({ erro: "Bloqueio não encontrado." });

  db.prepare("DELETE FROM barbeiro_bloqueios WHERE id = ?").run(bloqueio.id);
  res.status(204).send();
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
  const barbeiroId = Number(req.body?.barbeiroId);
  const { errors, valido, data } = validarAgendamento(req.body, servicosAtivosDoBarbeiro(barbeiroId));
  if (!valido) return res.status(400).json({ erros: errors });

  const barbeiro = db.prepare("SELECT * FROM barbeiros WHERE id = ?").get(data.barbeiroId);
  if (!barbeiro) return res.status(400).json({ erros: ["Barbeiro não encontrado."] });

  if (slotBloqueado(data.barbeiroId, data.data, data.horario)) {
    return res.status(409).json({ erro: `${barbeiro.nome} não atende nesse dia/horário.` });
  }

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

app.put("/agendamentos/:id", autenticar, (req, res) => {
  const id = Number(req.params.id);
  const existente = db.prepare("SELECT * FROM agendamentos WHERE id = ?").get(id);
  if (!existente) return res.status(404).json({ erro: "Agendamento não encontrado." });
  if (barrarSeNaoForDono(req, res, existente.barbeiro_id)) return;
  if (existente.status === "concluido") {
    return res.status(409).json({ erro: "Atendimento já concluído não pode ser alterado." });
  }

  const barbeiroId = Number(req.body?.barbeiroId);
  const { errors, valido, data } = validarAgendamento(req.body, servicosAtivosDoBarbeiro(barbeiroId));
  if (!valido) return res.status(400).json({ erros: errors });

  const barbeiro = db.prepare("SELECT * FROM barbeiros WHERE id = ?").get(data.barbeiroId);
  if (!barbeiro) return res.status(400).json({ erros: ["Barbeiro não encontrado."] });

  if (slotBloqueado(data.barbeiroId, data.data, data.horario)) {
    return res.status(409).json({ erro: `${barbeiro.nome} não atende nesse dia/horário.` });
  }

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

app.delete("/agendamentos/:id", autenticar, (req, res) => {
  const id = Number(req.params.id);
  const existente = db.prepare("SELECT * FROM agendamentos WHERE id = ?").get(id);
  if (!existente) return res.status(404).json({ erro: "Agendamento não encontrado." });
  if (barrarSeNaoForDono(req, res, existente.barbeiro_id)) return;
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

app.post("/vendas", autenticar, (req, res) => {
  const agendamento = db
    .prepare("SELECT * FROM agendamentos WHERE id = ?")
    .get(Number(req.body?.agendamentoId));

  if (!agendamento) {
    return res.status(404).json({ erro: "Agendamento não encontrado." });
  }
  if (barrarSeNaoForDono(req, res, agendamento.barbeiro_id)) return;
  if (agendamento.status === "concluido") {
    return res.status(409).json({ erro: "Este atendimento já foi finalizado." });
  }

  const catalogoMap = catalogoAtivoMap(agendamento.barbeiro_id);
  const { errors, valido, data } = validarVenda(req.body, catalogoMap);
  if (!valido) return res.status(400).json({ erros: errors });

  const semEstoque = data.itens.filter(
    (item) => item.tipo === "produto" && catalogoMap.get(item.descricao).estoque < item.quantidade
  );
  if (semEstoque.length > 0) {
    return res.status(409).json({
      erro: `Estoque insuficiente: ${semEstoque.map((i) => i.descricao).join(", ")}.`,
    });
  }

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
    const baixarEstoque = db.prepare(
      "UPDATE catalogo_itens SET estoque = estoque - ? WHERE id = ?"
    );

    for (const item of data.itens) {
      inserirItem.run(vendaId, item.descricao, item.tipo, item.preco, item.quantidade);
      if (item.tipo === "produto") {
        baixarEstoque.run(item.quantidade, item.id);
      }
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
