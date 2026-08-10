// Carrega backend/.env se existir (PORT, CORS_ORIGIN, DATABASE_URL). Opcional —
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
  validarServico,
  validarProduto,
  validarBloqueio,
  validarListaEspera,
} = require("./validation");

const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
app.use(express.json());

// Sem login: qualquer pessoa (recepção, qualquer barbeiro) gerencia a
// agenda de qualquer barbeiro — na prática do salão, um barbeiro cobre o
// outro o tempo todo, então uma conta por barbeiro atrapalhava mais do
// que ajudava. Ver histórico do projeto se precisar reintroduzir login.

// ---------- Helpers ----------

async function servicosAtivosDoBarbeiro(barbeiroId) {
  const rows = await db.many(
    "SELECT nome FROM catalogo_itens WHERE tipo = 'servico' AND ativo = TRUE AND barbeiro_id = $1",
    [barbeiroId]
  );
  return rows.map((r) => r.nome);
}

// Catálogo disponível pra um barbeiro finalizar um atendimento: os próprios
// serviços + todos os produtos compartilhados (ambos ativos).
async function catalogoAtivoMap(barbeiroId) {
  const itens = await db.many(
    `SELECT id, nome, tipo, preco, estoque FROM catalogo_itens
     WHERE ativo = TRUE AND (tipo = 'produto' OR barbeiro_id = $1)`,
    [barbeiroId]
  );
  return new Map(itens.map((i) => [i.nome, i]));
}

async function upsertCliente({ nome, telefone }) {
  const existente = await db.one("SELECT * FROM clientes WHERE telefone = $1", [telefone]);

  if (!existente) {
    await db.query("INSERT INTO clientes (nome, telefone) VALUES ($1, $2)", [nome, telefone]);
  } else if (existente.nome !== nome) {
    await db.query("UPDATE clientes SET nome = $1 WHERE telefone = $2", [nome, telefone]);
  }
}

async function buscarConflitoAgendamento({ barbeiroId, data, horario }, ignorarId = null) {
  if (ignorarId) {
    return db.one(
      "SELECT * FROM agendamentos WHERE barbeiro_id = $1 AND data = $2 AND horario = $3 AND id != $4",
      [barbeiroId, data, horario, ignorarId]
    );
  }
  return db.one(
    "SELECT * FROM agendamentos WHERE barbeiro_id = $1 AND data = $2 AND horario = $3",
    [barbeiroId, data, horario]
  );
}

// Dia inteiro (horario NULL) ou o horário específico bloqueado pelo barbeiro.
async function slotBloqueado(barbeiroId, data, horario) {
  return db.one(
    "SELECT * FROM barbeiro_bloqueios WHERE barbeiro_id = $1 AND data = $2 AND (horario IS NULL OR horario = $3)",
    [barbeiroId, data, horario]
  );
}

// ---------- Barbeiros ----------

app.get("/barbeiros", async (req, res) => {
  const barbeiros = await db.many("SELECT * FROM barbeiros ORDER BY nome");
  res.json(barbeiros);
});

app.post("/barbeiros", async (req, res) => {
  const { errors, valido, data } = validarBarbeiro(req.body);
  if (!valido) return res.status(400).json({ erros: errors });

  const barbeiro = await db.one("INSERT INTO barbeiros (nome) VALUES ($1) RETURNING *", [data.nome]);
  res.status(201).json(barbeiro);
});

app.put("/barbeiros/:id", async (req, res) => {
  const id = Number(req.params.id);
  const existente = await db.one("SELECT * FROM barbeiros WHERE id = $1", [id]);
  if (!existente) return res.status(404).json({ erro: "Barbeiro não encontrado." });

  const nome = req.body.nome !== undefined ? String(req.body.nome).trim() : existente.nome;
  const ativo = req.body.ativo !== undefined ? Boolean(req.body.ativo) : existente.ativo;

  if (!nome || nome.length < 2) {
    return res.status(400).json({ erros: ["Nome inválido."] });
  }

  const atualizado = await db.one("UPDATE barbeiros SET nome = $1, ativo = $2 WHERE id = $3 RETURNING *", [
    nome,
    ativo,
    id,
  ]);
  res.json(atualizado);
});

app.delete("/barbeiros/:id", async (req, res) => {
  const id = Number(req.params.id);
  const existente = await db.one("SELECT * FROM barbeiros WHERE id = $1", [id]);
  if (!existente) return res.status(404).json({ erro: "Barbeiro não encontrado." });

  const { total } = await db.one("SELECT COUNT(*) AS total FROM agendamentos WHERE barbeiro_id = $1", [id]);

  if (Number(total) > 0) {
    // Preserva integridade do histórico: em vez de apagar, desativa.
    const desativado = await db.one("UPDATE barbeiros SET ativo = FALSE WHERE id = $1 RETURNING *", [id]);
    return res.status(200).json({
      aviso: "Barbeiro tem agendamentos/atendimentos no histórico — foi desativado em vez de excluído.",
      barbeiro: desativado,
    });
  }

  await db.query("DELETE FROM barbeiros WHERE id = $1", [id]);
  res.status(204).send();
});

// ---------- Catálogo (serviços do barbeiro + produtos compartilhados) ----------

app.get("/catalogo", async (req, res) => {
  const { barbeiroId } = req.query;

  const itens = barbeiroId
    ? await db.many(
        `SELECT * FROM catalogo_itens
         WHERE ativo = TRUE AND (tipo = 'produto' OR barbeiro_id = $1)
         ORDER BY tipo, nome`,
        [Number(barbeiroId)]
      )
    : await db.many("SELECT * FROM catalogo_itens WHERE ativo = TRUE AND tipo = 'produto' ORDER BY nome");

  res.json(itens);
});

// -- Serviços (pertencem a um barbeiro, mas qualquer um pode gerenciar) --

app.post("/barbeiros/:id/servicos", async (req, res) => {
  const barbeiroId = Number(req.params.id);
  const barbeiro = await db.one("SELECT * FROM barbeiros WHERE id = $1", [barbeiroId]);
  if (!barbeiro) return res.status(404).json({ erro: "Barbeiro não encontrado." });

  const { errors, valido, data } = validarServico(req.body);
  if (!valido) return res.status(400).json({ erros: errors });

  const duplicado = await db.one(
    "SELECT id FROM catalogo_itens WHERE tipo = 'servico' AND barbeiro_id = $1 AND nome = $2",
    [barbeiroId, data.nome]
  );
  if (duplicado) return res.status(409).json({ erro: "Esse barbeiro já tem um serviço com esse nome." });

  const item = await db.one(
    "INSERT INTO catalogo_itens (nome, tipo, preco, barbeiro_id) VALUES ($1, 'servico', $2, $3) RETURNING *",
    [data.nome, data.preco, barbeiroId]
  );

  res.status(201).json(item);
});

app.put("/barbeiros/:id/servicos/:itemId", async (req, res) => {
  const barbeiroId = Number(req.params.id);

  const item = await db.one(
    "SELECT * FROM catalogo_itens WHERE id = $1 AND tipo = 'servico' AND barbeiro_id = $2",
    [Number(req.params.itemId), barbeiroId]
  );
  if (!item) return res.status(404).json({ erro: "Serviço não encontrado." });

  const { errors, valido, data } = validarServico(req.body);
  if (!valido) return res.status(400).json({ erros: errors });

  const ativo = req.body.ativo !== undefined ? Boolean(req.body.ativo) : item.ativo;

  const atualizado = await db.one(
    "UPDATE catalogo_itens SET nome = $1, preco = $2, ativo = $3 WHERE id = $4 RETURNING *",
    [data.nome, data.preco, ativo, item.id]
  );

  res.json(atualizado);
});

app.delete("/barbeiros/:id/servicos/:itemId", async (req, res) => {
  const barbeiroId = Number(req.params.id);

  const item = await db.one(
    "SELECT * FROM catalogo_itens WHERE id = $1 AND tipo = 'servico' AND barbeiro_id = $2",
    [Number(req.params.itemId), barbeiroId]
  );
  if (!item) return res.status(404).json({ erro: "Serviço não encontrado." });

  await db.query("DELETE FROM catalogo_itens WHERE id = $1", [item.id]);
  res.status(204).send();
});

// -- Produtos (compartilhados pela barbearia inteira) --

app.post("/produtos", async (req, res) => {
  const { errors, valido, data } = validarProduto(req.body);
  if (!valido) return res.status(400).json({ erros: errors });

  const duplicado = await db.one("SELECT id FROM catalogo_itens WHERE tipo = 'produto' AND nome = $1", [
    data.nome,
  ]);
  if (duplicado) return res.status(409).json({ erro: "Já existe um produto com esse nome." });

  const item = await db.one(
    "INSERT INTO catalogo_itens (nome, tipo, preco, barbeiro_id, estoque) VALUES ($1, 'produto', $2, NULL, $3) RETURNING *",
    [data.nome, data.preco, data.estoque]
  );

  res.status(201).json(item);
});

app.put("/produtos/:itemId", async (req, res) => {
  const item = await db.one("SELECT * FROM catalogo_itens WHERE id = $1 AND tipo = 'produto'", [
    Number(req.params.itemId),
  ]);
  if (!item) return res.status(404).json({ erro: "Produto não encontrado." });

  const { errors, valido, data } = validarProduto(req.body);
  if (!valido) return res.status(400).json({ erros: errors });

  const ativo = req.body.ativo !== undefined ? Boolean(req.body.ativo) : item.ativo;

  const atualizado = await db.one(
    "UPDATE catalogo_itens SET nome = $1, preco = $2, estoque = $3, ativo = $4 WHERE id = $5 RETURNING *",
    [data.nome, data.preco, data.estoque, ativo, item.id]
  );

  res.json(atualizado);
});

app.delete("/produtos/:itemId", async (req, res) => {
  const item = await db.one("SELECT * FROM catalogo_itens WHERE id = $1 AND tipo = 'produto'", [
    Number(req.params.itemId),
  ]);
  if (!item) return res.status(404).json({ erro: "Produto não encontrado." });

  await db.query("DELETE FROM catalogo_itens WHERE id = $1", [item.id]);
  res.status(204).send();
});

// ---------- Bloqueios de agenda (folga / horário indisponível) ----------

app.get("/barbeiros/:id/bloqueios", async (req, res) => {
  const barbeiroId = Number(req.params.id);
  const { data } = req.query;

  const bloqueios = data
    ? await db.many("SELECT * FROM barbeiro_bloqueios WHERE barbeiro_id = $1 AND data = $2", [barbeiroId, data])
    : await db.many("SELECT * FROM barbeiro_bloqueios WHERE barbeiro_id = $1 ORDER BY data", [barbeiroId]);

  res.json(bloqueios);
});

app.post("/barbeiros/:id/bloqueios", async (req, res) => {
  const barbeiroId = Number(req.params.id);

  const { errors, valido, data } = validarBloqueio(req.body);
  if (!valido) return res.status(400).json({ erros: errors });

  const jaBloqueado = await slotBloqueado(barbeiroId, data.data, data.horario);
  if (jaBloqueado) {
    return res.status(409).json({ erro: "Esse dia/horário já está bloqueado." });
  }

  const bloqueio = await db.one(
    "INSERT INTO barbeiro_bloqueios (barbeiro_id, data, horario) VALUES ($1, $2, $3) RETURNING *",
    [barbeiroId, data.data, data.horario]
  );

  res.status(201).json(bloqueio);
});

app.delete("/barbeiros/:id/bloqueios/:bloqueioId", async (req, res) => {
  const barbeiroId = Number(req.params.id);

  const bloqueio = await db.one("SELECT * FROM barbeiro_bloqueios WHERE id = $1 AND barbeiro_id = $2", [
    Number(req.params.bloqueioId),
    barbeiroId,
  ]);
  if (!bloqueio) return res.status(404).json({ erro: "Bloqueio não encontrado." });

  await db.query("DELETE FROM barbeiro_bloqueios WHERE id = $1", [bloqueio.id]);
  res.status(204).send();
});

// ---------- Lista de espera ----------

app.get("/barbeiros/:id/lista-espera", async (req, res) => {
  const barbeiroId = Number(req.params.id);
  const { data, status } = req.query;

  const condicoes = ["barbeiro_id = $1"];
  const params = [barbeiroId];

  if (data) {
    params.push(data);
    condicoes.push(`data = $${params.length}`);
  }
  if (status) {
    params.push(status);
    condicoes.push(`status = $${params.length}`);
  }

  const entradas = await db.many(
    `SELECT * FROM lista_espera WHERE ${condicoes.join(" AND ")} ORDER BY criado_em`,
    params
  );

  res.json(entradas);
});

app.post("/barbeiros/:id/lista-espera", async (req, res) => {
  const barbeiroId = Number(req.params.id);
  const barbeiro = await db.one("SELECT * FROM barbeiros WHERE id = $1", [barbeiroId]);
  if (!barbeiro) return res.status(404).json({ erro: "Barbeiro não encontrado." });

  const { errors, valido, data } = validarListaEspera(req.body);
  if (!valido) return res.status(400).json({ erros: errors });

  const entrada = await db.one(
    `INSERT INTO lista_espera (barbeiro_id, nome, telefone, servico, data, horario)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [barbeiroId, data.nome, data.telefone, data.servico, data.data, data.horario]
  );

  res.status(201).json(entrada);
});

app.delete("/barbeiros/:id/lista-espera/:entradaId", async (req, res) => {
  const barbeiroId = Number(req.params.id);

  const entrada = await db.one("SELECT * FROM lista_espera WHERE id = $1 AND barbeiro_id = $2", [
    Number(req.params.entradaId),
    barbeiroId,
  ]);
  if (!entrada) return res.status(404).json({ erro: "Registro não encontrado na lista de espera." });

  await db.query("DELETE FROM lista_espera WHERE id = $1", [entrada.id]);
  res.status(204).send();
});

// ---------- Clientes ----------

app.get("/clientes", async (req, res) => {
  const clientes = await db.many(`
    SELECT c.id, c.nome, c.telefone, MAX(v.criado_em) AS ultimo_atendimento
    FROM clientes c
    LEFT JOIN vendas v ON v.cliente_telefone = c.telefone
    GROUP BY c.id, c.nome, c.telefone
    ORDER BY c.nome
  `);
  res.json(clientes);
});

app.get("/clientes/:id/historico", async (req, res) => {
  const id = Number(req.params.id);
  const cliente = await db.one("SELECT * FROM clientes WHERE id = $1", [id]);
  if (!cliente) return res.status(404).json({ erro: "Cliente não encontrado." });

  const vendas = await db.many(
    `SELECT v.*, b.nome AS barbeiro_nome
     FROM vendas v
     JOIN barbeiros b ON b.id = v.barbeiro_id
     WHERE v.cliente_telefone = $1
     ORDER BY v.criado_em DESC`,
    [cliente.telefone]
  );

  res.json({ cliente, vendas });
});

app.post("/clientes", async (req, res) => {
  const { errors, valido, data } = validarCliente(req.body);
  if (!valido) return res.status(400).json({ erros: errors });

  const existente = await db.one("SELECT * FROM clientes WHERE telefone = $1", [data.telefone]);
  if (existente) {
    return res.status(409).json({ erro: "Já existe um cliente com esse telefone." });
  }

  const cliente = await db.one("INSERT INTO clientes (nome, telefone) VALUES ($1, $2) RETURNING *", [
    data.nome,
    data.telefone,
  ]);

  res.status(201).json(cliente);
});

// ---------- Agendamentos ----------

app.get("/agendamentos", async (req, res) => {
  const { barbeiroId, data } = req.query;

  const condicoes = [];
  const params = [];

  if (barbeiroId) {
    params.push(Number(barbeiroId));
    condicoes.push(`barbeiro_id = $${params.length}`);
  }
  if (data) {
    params.push(data);
    condicoes.push(`data = $${params.length}`);
  }

  const where = condicoes.length ? `WHERE ${condicoes.join(" AND ")}` : "";
  const agendamentos = await db.many(`SELECT * FROM agendamentos ${where} ORDER BY data, horario`, params);

  res.json(agendamentos);
});

app.post("/agendamentos", async (req, res) => {
  const barbeiroIdBruto = Number(req.body?.barbeiroId);
  const { errors, valido, data } = validarAgendamento(req.body, await servicosAtivosDoBarbeiro(barbeiroIdBruto));
  if (!valido) return res.status(400).json({ erros: errors });

  const barbeiro = await db.one("SELECT * FROM barbeiros WHERE id = $1", [data.barbeiroId]);
  if (!barbeiro) return res.status(400).json({ erros: ["Barbeiro não encontrado."] });

  if (await slotBloqueado(data.barbeiroId, data.data, data.horario)) {
    return res.status(409).json({ erro: `${barbeiro.nome} não atende nesse dia/horário.` });
  }

  const conflito = await buscarConflitoAgendamento(data);
  if (conflito) {
    return res.status(409).json({
      erro: `${barbeiro.nome} já tem um agendamento em ${data.data} às ${data.horario} (${conflito.nome}).`,
    });
  }

  const agendamento = await db.one(
    `INSERT INTO agendamentos (barbeiro_id, nome, telefone, servico, data, horario)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [data.barbeiroId, data.nome, data.telefone, data.servico, data.data, data.horario]
  );

  await upsertCliente(data);

  res.status(201).json(agendamento);
});

app.put("/agendamentos/:id", async (req, res) => {
  const id = Number(req.params.id);
  const existente = await db.one("SELECT * FROM agendamentos WHERE id = $1", [id]);
  if (!existente) return res.status(404).json({ erro: "Agendamento não encontrado." });
  if (existente.status === "concluido") {
    return res.status(409).json({ erro: "Atendimento já concluído não pode ser alterado." });
  }

  const barbeiroIdBruto = Number(req.body?.barbeiroId);
  const { errors, valido, data } = validarAgendamento(req.body, await servicosAtivosDoBarbeiro(barbeiroIdBruto));
  if (!valido) return res.status(400).json({ erros: errors });

  const barbeiro = await db.one("SELECT * FROM barbeiros WHERE id = $1", [data.barbeiroId]);
  if (!barbeiro) return res.status(400).json({ erros: ["Barbeiro não encontrado."] });

  if (await slotBloqueado(data.barbeiroId, data.data, data.horario)) {
    return res.status(409).json({ erro: `${barbeiro.nome} não atende nesse dia/horário.` });
  }

  const conflito = await buscarConflitoAgendamento(data, id);
  if (conflito) {
    return res.status(409).json({
      erro: `${barbeiro.nome} já tem um agendamento em ${data.data} às ${data.horario} (${conflito.nome}).`,
    });
  }

  const atualizado = await db.one(
    `UPDATE agendamentos
     SET barbeiro_id = $1, nome = $2, telefone = $3, servico = $4, data = $5, horario = $6,
         atualizado_em = NOW()
     WHERE id = $7
     RETURNING *`,
    [data.barbeiroId, data.nome, data.telefone, data.servico, data.data, data.horario, id]
  );

  await upsertCliente(data);

  res.json(atualizado);
});

app.delete("/agendamentos/:id", async (req, res) => {
  const id = Number(req.params.id);
  const existente = await db.one("SELECT * FROM agendamentos WHERE id = $1", [id]);
  if (!existente) return res.status(404).json({ erro: "Agendamento não encontrado." });
  if (existente.status === "concluido") {
    return res.status(409).json({ erro: "Atendimento já concluído não pode ser cancelado." });
  }

  await db.query("DELETE FROM agendamentos WHERE id = $1", [id]);

  // Libera o slot — se alguém estava na lista de espera desse
  // barbeiro/dia/horário, marca como notificado. O envio de verdade
  // (WhatsApp) é uma integração futura; por ora só registra o estado.
  const aguardando = await db.many(
    "SELECT * FROM lista_espera WHERE barbeiro_id = $1 AND data = $2 AND horario = $3 AND status = 'aguardando'",
    [existente.barbeiro_id, existente.data, existente.horario]
  );

  if (aguardando.length > 0) {
    await db.query(
      `UPDATE lista_espera SET status = 'notificado', notificado_em = NOW()
       WHERE barbeiro_id = $1 AND data = $2 AND horario = $3 AND status = 'aguardando'`,
      [existente.barbeiro_id, existente.data, existente.horario]
    );
  }

  res.status(200).json({ notificadosListaEspera: aguardando.length });
});

// ---------- Vendas (finalizar atendimento) ----------

app.get("/vendas", async (req, res) => {
  const { barbeiroId, de, ate } = req.query;

  const condicoes = [];
  const params = [];

  if (barbeiroId) {
    params.push(Number(barbeiroId));
    condicoes.push(`v.barbeiro_id = $${params.length}`);
  }
  if (de) {
    params.push(de);
    condicoes.push(`v.criado_em::date >= $${params.length}::date`);
  }
  if (ate) {
    params.push(ate);
    condicoes.push(`v.criado_em::date <= $${params.length}::date`);
  }

  const where = condicoes.length ? `WHERE ${condicoes.join(" AND ")}` : "";
  const vendas = await db.many(
    `SELECT v.*, b.nome AS barbeiro_nome
     FROM vendas v
     JOIN barbeiros b ON b.id = v.barbeiro_id
     ${where}
     ORDER BY v.criado_em DESC`,
    params
  );

  const vendasComItens = await Promise.all(
    vendas.map(async (v) => ({
      ...v,
      itens: await db.many("SELECT * FROM venda_itens WHERE venda_id = $1", [v.id]),
    }))
  );

  res.json(vendasComItens);
});

app.post("/vendas", async (req, res) => {
  const agendamento = await db.one("SELECT * FROM agendamentos WHERE id = $1", [
    Number(req.body?.agendamentoId),
  ]);

  if (!agendamento) {
    return res.status(404).json({ erro: "Agendamento não encontrado." });
  }
  if (agendamento.status === "concluido") {
    return res.status(409).json({ erro: "Este atendimento já foi finalizado." });
  }

  const catalogoMap = await catalogoAtivoMap(agendamento.barbeiro_id);
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

  // Transação de verdade: pega um client dedicado do pool (uma query()
  // solta no pool poderia pegar uma conexão diferente a cada chamada e
  // nunca formar uma transação única).
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");

    const {
      rows: [venda],
    } = await client.query(
      `INSERT INTO vendas (agendamento_id, barbeiro_id, cliente_nome, cliente_telefone, forma_pagamento, valor_total)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        agendamento.id,
        agendamento.barbeiro_id,
        agendamento.nome,
        agendamento.telefone,
        data.formaPagamento,
        data.valorTotal,
      ]
    );

    for (const item of data.itens) {
      await client.query(
        "INSERT INTO venda_itens (venda_id, descricao, tipo, preco, quantidade) VALUES ($1, $2, $3, $4, $5)",
        [venda.id, item.descricao, item.tipo, item.preco, item.quantidade]
      );
      if (item.tipo === "produto") {
        // Valor explícito (não `estoque = estoque - $1`) — mais previsível
        // entre motores (o cálculo em cima da própria coluna já se mostrou
        // inconsistente no pg-mem usado pelos testes).
        const estoqueAtual = catalogoMap.get(item.descricao).estoque;
        await client.query("UPDATE catalogo_itens SET estoque = $1 WHERE id = $2", [
          estoqueAtual - item.quantidade,
          item.id,
        ]);
      }
    }

    await client.query("UPDATE agendamentos SET status = 'concluido', atualizado_em = NOW() WHERE id = $1", [
      agendamento.id,
    ]);

    await client.query("COMMIT");

    const { rows: itens } = await client.query("SELECT * FROM venda_itens WHERE venda_id = $1", [venda.id]);
    res.status(201).json({ ...venda, itens });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
});

// ---------- Relatórios ----------

app.get("/relatorios/mensal", async (req, res) => {
  const mes = req.query.mes || new Date().toISOString().slice(0, 7); // 'YYYY-MM'

  const totais = await db.one(
    `SELECT COUNT(*) AS "totalAtendimentos", COALESCE(SUM(valor_total), 0) AS "faturamentoTotal"
     FROM vendas WHERE to_char(criado_em, 'YYYY-MM') = $1`,
    [mes]
  );

  const porBarbeiro = await db.many(
    `SELECT b.id AS "barbeiroId", b.nome AS barbeiro,
            COUNT(*) AS atendimentos, COALESCE(SUM(v.valor_total), 0) AS faturamento
     FROM vendas v
     JOIN barbeiros b ON b.id = v.barbeiro_id
     WHERE to_char(v.criado_em, 'YYYY-MM') = $1
     GROUP BY b.id
     ORDER BY faturamento DESC`,
    [mes]
  );

  const porFormaPagamento = await db.many(
    `SELECT forma_pagamento AS "formaPagamento", COUNT(*) AS quantidade,
            COALESCE(SUM(valor_total), 0) AS faturamento
     FROM vendas
     WHERE to_char(criado_em, 'YYYY-MM') = $1
     GROUP BY forma_pagamento
     ORDER BY quantidade DESC`,
    [mes]
  );

  res.json({
    mes,
    totalAtendimentos: Number(totais.totalAtendimentos),
    faturamentoTotal: Number(totais.faturamentoTotal),
    porBarbeiro: porBarbeiro.map((b) => ({
      ...b,
      atendimentos: Number(b.atendimentos),
      faturamento: Number(b.faturamento),
    })),
    porFormaPagamento: porFormaPagamento.map((f) => ({
      ...f,
      quantidade: Number(f.quantidade),
      faturamento: Number(f.faturamento),
    })),
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
async function start() {
  await db.ready;
  app.listen(PORT, () => {
    console.log(`Servidor BarberPro rodando na porta ${PORT}`);
  });
}

if (require.main === module) {
  start();
}

module.exports = app;
