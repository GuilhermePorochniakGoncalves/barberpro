// Carrega backend/.env se existir (PORT, CORS_ORIGIN, DATABASE_URL). Opcional —
// sem o arquivo, os defaults abaixo mantêm o comportamento de sempre.
try {
  process.loadEnvFile();
} catch {
  // .env não existe (ex.: ambiente de teste, ou ninguém criou um ainda) — ok.
}

const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const db = require("./db");
const { limitesDoDiaBrasilia, limitesDoMesBrasilia, hojeBrasilia, mesAtualBrasilia } = require("./horario");
const {
  validarAgendamento,
  validarCliente,
  validarBarbeiro,
  validarVenda,
  validarServico,
  validarProduto,
  validarBloqueio,
  validarListaEspera,
  validarDespesa,
} = require("./validation");

const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
app.use(express.json());

// ---------- Proteção do painel interno ----------
//
// Sem login por pessoa (decisão do projeto — ver comentário abaixo), mas o
// painel de gestão não pode ficar aberto pra qualquer visitante que ache a
// URL: uma senha ÚNICA da barbearia (não por usuário) barra acesso casual.
// As rotas que a tela pública /agendar usa continuam sem senha — é o link
// que a barbearia divulga pro cliente final, tem que funcionar sem fricção.
const ROTAS_PUBLICAS = [
  { metodo: "GET", regex: /^\/health$/ },
  { metodo: "GET", regex: /^\/barbeiros$/ },
  { metodo: "GET", regex: /^\/catalogo$/ },
  { metodo: "GET", regex: /^\/agendamentos$/ },
  { metodo: "GET", regex: /^\/barbeiros\/\d+\/bloqueios$/ },
  { metodo: "POST", regex: /^\/agendamentos$/ },
  { metodo: "POST", regex: /^\/barbeiros\/\d+\/lista-espera$/ },
];

function rotaEhPublica(req) {
  return ROTAS_PUBLICAS.some((r) => r.metodo === req.method && r.regex.test(req.path));
}

app.use((req, res, next) => {
  if (rotaEhPublica(req)) return next();

  if (!process.env.PANEL_PASSWORD) {
    // Sem a variável configurada, bloqueia tudo (menos as rotas públicas
    // acima) em vez de abrir por omissão — força configurar de propósito
    // em vez de vazar o painel inteiro por alguém esquecer a variável.
    return res.status(503).json({
      erro: "Painel não configurado: defina PANEL_PASSWORD no ambiente do servidor.",
    });
  }

  if (req.get("X-Panel-Password") !== process.env.PANEL_PASSWORD) {
    return res.status(401).json({ erro: "Senha do painel inválida ou ausente." });
  }

  next();
});

// Usado pelo frontend só pra testar a senha digitada (ver
// PainelProtegido.jsx) — se chegou até aqui é porque passou pelo
// middleware acima, então a senha já está certa.
app.get("/painel/verificar", (req, res) => {
  res.json({ ok: true });
});

// Sem login: qualquer pessoa (recepção, qualquer barbeiro) gerencia a
// agenda de qualquer barbeiro — na prática do salão, um barbeiro cobre o
// outro o tempo todo, então uma conta por barbeiro atrapalhava mais do
// que ajudava. Ver histórico do projeto se precisar reintroduzir login.

// Rota pública /agendar não tem senha nem captcha (de propósito — tem que
// ser fácil pro cliente final) — limita quantas vezes o mesmo IP consegue
// criar agendamento/entrar na lista de espera num período curto, pra
// dificultar spam/bot sem atrapalhar uso normal (uma pessoa não marca 10
// horários em 15 minutos).
// Desativado em teste: a suíte cria dezenas de agendamentos em sequência
// a partir do mesmo IP (localhost), o que bateria no limite artificialmente.
const limitadorCriacaoPublica =
  process.env.NODE_ENV === "test"
    ? (req, res, next) => next()
    : rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 8,
        standardHeaders: true,
        legacyHeaders: false,
        message: { erro: "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente de novo." },
      });

// ---------- Helpers ----------

// Map<nomeDoServico, duracaoMinutos> — serve tanto pra validar o nome do
// serviço escolhido (validarAgendamento espera um array; usamos as chaves)
// quanto pra saber quanto tempo o agendamento vai ocupar na agenda.
async function servicosAtivosDoBarbeiro(barbeiroId) {
  // barbeiroId inválido (corpo malformado, ex.: {} sem barbeiroId) vira NaN
  // — mandar isso como parâmetro $1 pro Postgres estoura erro de driver
  // (500) em vez de simplesmente não achar nada. Curto-circuita pra Map
  // vazio, que cai certinho na validação normal de "serviço inválido".
  if (!Number.isInteger(barbeiroId)) return new Map();

  const rows = await db.many(
    "SELECT nome, duracao_minutos FROM catalogo_itens WHERE tipo = 'servico' AND ativo = TRUE AND barbeiro_id = $1",
    [barbeiroId]
  );
  return new Map(rows.map((r) => [r.nome, r.duracao_minutos]));
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

function horarioParaMinutos(horario) {
  const [h, m] = horario.split(":").map(Number);
  return h * 60 + m;
}

// Serviços têm duração variável agora (ex.: corte 30min, corte+barba
// 60min) — conflito de horário não é mais "mesmo slot exato", é
// sobreposição de intervalo: [horario, horario+duração). Cancelados não
// contam (o registro fica no banco pro histórico, mas não ocupa a agenda).
function encontrarConflito(agendamentosDoDia, horario, duracaoMinutos, ignorarId = null) {
  const inicio = horarioParaMinutos(horario);
  const fim = inicio + duracaoMinutos;

  return (
    agendamentosDoDia.find((a) => {
      if (ignorarId && a.id === ignorarId) return false;
      if (a.status === "cancelado") return false;
      const aInicio = horarioParaMinutos(a.horario);
      const aFim = aInicio + (a.duracao_minutos ?? 30);
      return inicio < aFim && aInicio < fim;
    }) ?? null
  );
}

async function buscarConflitoAgendamento({ barbeiroId, data, horario, duracaoMinutos }, ignorarId = null) {
  const doDia = await db.many("SELECT * FROM agendamentos WHERE barbeiro_id = $1 AND data = $2", [
    barbeiroId,
    data,
  ]);
  return encontrarConflito(doDia, horario, duracaoMinutos, ignorarId);
}

// Dia inteiro (horario NULL) ou qualquer horário específico bloqueado pelo
// barbeiro que caia dentro do intervalo [horario, horario+duração) pedido.
async function slotBloqueado(barbeiroId, data, horario, duracaoMinutos = 30) {
  const bloqueios = await db.many("SELECT * FROM barbeiro_bloqueios WHERE barbeiro_id = $1 AND data = $2", [
    barbeiroId,
    data,
  ]);

  const diaInteiro = bloqueios.find((b) => b.horario === null);
  if (diaInteiro) return diaInteiro;

  const inicio = horarioParaMinutos(horario);
  const fim = inicio + duracaoMinutos;
  return (
    bloqueios.find((b) => {
      if (b.horario === null) return false;
      const m = horarioParaMinutos(b.horario);
      return m >= inicio && m < fim;
    }) ?? null
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
    `INSERT INTO catalogo_itens (nome, tipo, preco, barbeiro_id, duracao_minutos)
     VALUES ($1, 'servico', $2, $3, $4) RETURNING *`,
    [data.nome, data.preco, barbeiroId, data.duracaoMinutos]
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
  // Preserva a duração atual se não veio no corpo (mesmo padrão do `ativo`
  // acima) — sem isso, um PUT que só muda o preço resetaria a duração pro
  // default de 30min de validarServico.
  const duracaoMinutos = req.body.duracaoMinutos !== undefined ? data.duracaoMinutos : item.duracao_minutos;

  const atualizado = await db.one(
    "UPDATE catalogo_itens SET nome = $1, preco = $2, ativo = $3, duracao_minutos = $4 WHERE id = $5 RETURNING *",
    [data.nome, data.preco, ativo, duracaoMinutos, item.id]
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

  const jaBloqueado = await slotBloqueado(barbeiroId, data.data, data.horario ?? "00:00", 1);
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

app.post("/barbeiros/:id/lista-espera", limitadorCriacaoPublica, async (req, res) => {
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
    SELECT c.id, c.nome, c.telefone, c.observacoes, MAX(v.criado_em) AS ultimo_atendimento
    FROM clientes c
    LEFT JOIN vendas v ON v.cliente_telefone = c.telefone
    GROUP BY c.id, c.nome, c.telefone, c.observacoes
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

  const cliente = await db.one(
    "INSERT INTO clientes (nome, telefone, observacoes) VALUES ($1, $2, $3) RETURNING *",
    [data.nome, data.telefone, data.observacoes]
  );

  res.status(201).json(cliente);
});

app.put("/clientes/:id", async (req, res) => {
  const id = Number(req.params.id);
  const existente = await db.one("SELECT * FROM clientes WHERE id = $1", [id]);
  if (!existente) return res.status(404).json({ erro: "Cliente não encontrado." });

  // Reaproveita validarCliente inteiro (nome+telefone obrigatórios) — na
  // prática esta rota hoje só é usada pra editar observações, mas manda
  // nome/telefone atuais junto pra não exigir um validador separado.
  const { errors, valido, data } = validarCliente(req.body);
  if (!valido) return res.status(400).json({ erros: errors });

  if (data.telefone !== existente.telefone) {
    const outroComEsseTelefone = await db.one("SELECT id FROM clientes WHERE telefone = $1 AND id != $2", [
      data.telefone,
      id,
    ]);
    if (outroComEsseTelefone) {
      return res.status(409).json({ erro: "Já existe outro cliente com esse telefone." });
    }
  }

  const atualizado = await db.one(
    "UPDATE clientes SET nome = $1, telefone = $2, observacoes = $3 WHERE id = $4 RETURNING *",
    [data.nome, data.telefone, data.observacoes, id]
  );

  res.json(atualizado);
});

app.delete("/clientes/:id", async (req, res) => {
  const id = Number(req.params.id);
  const existente = await db.one("SELECT * FROM clientes WHERE id = $1", [id]);
  if (!existente) return res.status(404).json({ erro: "Cliente não encontrado." });

  // Sem FK de vendas/agendamentos pra clientes (eles guardam nome/telefone
  // direto, não um cliente_id) — histórico antigo continua intacto mesmo
  // depois de remover o cadastro, só some da tela de Clientes.
  await db.query("DELETE FROM clientes WHERE id = $1", [id]);
  res.status(204).send();
});

// ---------- Agendamentos ----------

app.get("/agendamentos", async (req, res) => {
  const { barbeiroId, data, incluirCancelados } = req.query;

  const condicoes = [];
  const params = [];

  if (barbeiroId) {
    params.push(Number(barbeiroId));
    condicoes.push(`a.barbeiro_id = $${params.length}`);
  }
  if (data) {
    params.push(data);
    condicoes.push(`a.data = $${params.length}`);
  }
  // Por padrão a agenda não mostra cancelados (o horário fica livre pra
  // reagendar) — quem quer o histórico completo (relatório de
  // cancelamentos) pede explicitamente com ?incluirCancelados=true.
  if (incluirCancelados !== "true") {
    condicoes.push(`a.status != 'cancelado'`);
  }

  const where = condicoes.length ? `WHERE ${condicoes.join(" AND ")}` : "";
  // LEFT JOIN em clientes (por telefone, não tem FK — agendamento guarda
  // nome/telefone direto) só pra trazer junto as observações do cliente,
  // se existirem: a agenda mostra em destaque sem precisar de uma segunda
  // chamada por horário.
  const agendamentos = await db.many(
    `SELECT a.*, c.observacoes AS cliente_observacoes
     FROM agendamentos a
     LEFT JOIN clientes c ON c.telefone = a.telefone
     ${where}
     ORDER BY a.data, a.horario`,
    params
  );

  res.json(agendamentos);
});

app.post("/agendamentos", limitadorCriacaoPublica, async (req, res) => {
  const barbeiroIdBruto = Number(req.body?.barbeiroId);
  const servicosMap = await servicosAtivosDoBarbeiro(barbeiroIdBruto);
  const { errors, valido, data } = validarAgendamento(req.body, [...servicosMap.keys()]);
  if (!valido) return res.status(400).json({ erros: errors });

  const barbeiro = await db.one("SELECT * FROM barbeiros WHERE id = $1", [data.barbeiroId]);
  if (!barbeiro) return res.status(400).json({ erros: ["Barbeiro não encontrado."] });

  const duracaoMinutos = servicosMap.get(data.servico) ?? 30;

  if (await slotBloqueado(data.barbeiroId, data.data, data.horario, duracaoMinutos)) {
    return res.status(409).json({ erro: `${barbeiro.nome} não atende nesse dia/horário.` });
  }

  const conflito = await buscarConflitoAgendamento({ ...data, duracaoMinutos });
  if (conflito) {
    return res.status(409).json({
      erro: `${barbeiro.nome} já tem um agendamento em ${data.data} às ${data.horario} (${conflito.nome}).`,
    });
  }

  const agendamento = await db.one(
    `INSERT INTO agendamentos (barbeiro_id, nome, telefone, servico, data, horario, duracao_minutos)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [data.barbeiroId, data.nome, data.telefone, data.servico, data.data, data.horario, duracaoMinutos]
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
  if (existente.status === "cancelado") {
    return res.status(409).json({ erro: "Agendamento cancelado não pode ser alterado." });
  }

  const barbeiroIdBruto = Number(req.body?.barbeiroId);
  const servicosMap = await servicosAtivosDoBarbeiro(barbeiroIdBruto);
  const { errors, valido, data } = validarAgendamento(req.body, [...servicosMap.keys()]);
  if (!valido) return res.status(400).json({ erros: errors });

  const barbeiro = await db.one("SELECT * FROM barbeiros WHERE id = $1", [data.barbeiroId]);
  if (!barbeiro) return res.status(400).json({ erros: ["Barbeiro não encontrado."] });

  const duracaoMinutos = servicosMap.get(data.servico) ?? 30;

  if (await slotBloqueado(data.barbeiroId, data.data, data.horario, duracaoMinutos)) {
    return res.status(409).json({ erro: `${barbeiro.nome} não atende nesse dia/horário.` });
  }

  const conflito = await buscarConflitoAgendamento({ ...data, duracaoMinutos }, id);
  if (conflito) {
    return res.status(409).json({
      erro: `${barbeiro.nome} já tem um agendamento em ${data.data} às ${data.horario} (${conflito.nome}).`,
    });
  }

  const atualizado = await db.one(
    `UPDATE agendamentos
     SET barbeiro_id = $1, nome = $2, telefone = $3, servico = $4, data = $5, horario = $6,
         duracao_minutos = $7, atualizado_em = NOW()
     WHERE id = $8
     RETURNING *`,
    [data.barbeiroId, data.nome, data.telefone, data.servico, data.data, data.horario, duracaoMinutos, id]
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
  if (existente.status === "cancelado") {
    return res.status(409).json({ erro: "Esse agendamento já está cancelado." });
  }

  // Cancelar vira um status (com timestamp), não um DELETE — mantém
  // histórico pra número de cancelamentos/no-show (ver GET
  // /relatorios/cancelamentos). O horário libera na agenda mesmo assim:
  // GET /agendamentos já filtra status='cancelado' fora por padrão.
  await db.query(
    "UPDATE agendamentos SET status = 'cancelado', cancelado_em = NOW(), atualizado_em = NOW() WHERE id = $1",
    [id]
  );

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
    const [inicio] = limitesDoDiaBrasilia(de);
    params.push(inicio);
    condicoes.push(`v.criado_em >= $${params.length}`);
  }
  if (ate) {
    const [, fim] = limitesDoDiaBrasilia(ate);
    params.push(fim);
    condicoes.push(`v.criado_em < $${params.length}`);
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
      pagamentos: await db.many("SELECT * FROM venda_pagamentos WHERE venda_id = $1", [v.id]),
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
  if (agendamento.status === "cancelado") {
    return res.status(409).json({ erro: "Este agendamento foi cancelado." });
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
        data.formaPagamentoResumo,
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

    for (const pagamento of data.pagamentos) {
      await client.query("INSERT INTO venda_pagamentos (venda_id, forma_pagamento, valor) VALUES ($1, $2, $3)", [
        venda.id,
        pagamento.formaPagamento,
        pagamento.valor,
      ]);
    }

    await client.query("UPDATE agendamentos SET status = 'concluido', atualizado_em = NOW() WHERE id = $1", [
      agendamento.id,
    ]);

    await client.query("COMMIT");

    const { rows: itens } = await client.query("SELECT * FROM venda_itens WHERE venda_id = $1", [venda.id]);
    const { rows: pagamentos } = await client.query("SELECT * FROM venda_pagamentos WHERE venda_id = $1", [
      venda.id,
    ]);
    res.status(201).json({ ...venda, itens, pagamentos });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
});

// ---------- Despesas (saídas de caixa) ----------

app.get("/despesas", async (req, res) => {
  const { de, ate } = req.query;

  const condicoes = [];
  const params = [];

  if (de) {
    params.push(de);
    condicoes.push(`data >= $${params.length}`);
  }
  if (ate) {
    params.push(ate);
    condicoes.push(`data <= $${params.length}`);
  }

  const where = condicoes.length ? `WHERE ${condicoes.join(" AND ")}` : "";
  const despesas = await db.many(`SELECT * FROM despesas ${where} ORDER BY data DESC, criado_em DESC`, params);

  res.json(despesas);
});

app.post("/despesas", async (req, res) => {
  const { errors, valido, data } = validarDespesa(req.body);
  if (!valido) return res.status(400).json({ erros: errors });

  const despesa = await db.one(
    "INSERT INTO despesas (descricao, categoria, valor, data) VALUES ($1, $2, $3, $4) RETURNING *",
    [data.descricao, data.categoria, data.valor, data.data]
  );

  res.status(201).json(despesa);
});

app.delete("/despesas/:id", async (req, res) => {
  const id = Number(req.params.id);
  const existente = await db.one("SELECT * FROM despesas WHERE id = $1", [id]);
  if (!existente) return res.status(404).json({ erro: "Despesa não encontrada." });

  await db.query("DELETE FROM despesas WHERE id = $1", [id]);
  res.status(204).send();
});

// ---------- Relatórios ----------

app.get("/relatorios/diario", async (req, res) => {
  const data = req.query.data || hojeBrasilia(); // 'YYYY-MM-DD'
  const [inicioDia, fimDia] = limitesDoDiaBrasilia(data);

  const totais = await db.one(
    `SELECT COUNT(*) AS atendimentos, COALESCE(SUM(valor_total), 0) AS "totalArrecadado"
     FROM vendas WHERE criado_em >= $1 AND criado_em < $2`,
    [inicioDia, fimDia]
  );

  const porTipoRows = await db.many(
    `SELECT vi.tipo, COALESCE(SUM(vi.preco * vi.quantidade), 0) AS total
     FROM venda_itens vi
     JOIN vendas v ON v.id = vi.venda_id
     WHERE v.criado_em >= $1 AND v.criado_em < $2
     GROUP BY vi.tipo`,
    [inicioDia, fimDia]
  );
  const porTipo = { servico: 0, produto: 0 };
  for (const row of porTipoRows) {
    porTipo[row.tipo] = Number(row.total);
  }

  // Agrega por venda_pagamentos (não por vendas.forma_pagamento): uma
  // venda "misto" (parte pix, parte cartão) precisa contar o valor de
  // cada parte na forma certa, não tudo numa linha "misto".
  const porFormaPagamento = await db.many(
    `SELECT vp.forma_pagamento AS "formaPagamento", COUNT(*) AS quantidade, COALESCE(SUM(vp.valor), 0) AS total
     FROM venda_pagamentos vp
     JOIN vendas v ON v.id = vp.venda_id
     WHERE v.criado_em >= $1 AND v.criado_em < $2
     GROUP BY vp.forma_pagamento
     ORDER BY quantidade DESC`,
    [inicioDia, fimDia]
  );

  const { total: totalDespesasBruto } = await db.one(
    "SELECT COALESCE(SUM(valor), 0) AS total FROM despesas WHERE data = $1",
    [data]
  );
  const totalDespesas = Number(totalDespesasBruto);

  const { total: cancelamentosBruto } = await db.one(
    "SELECT COUNT(*) AS total FROM agendamentos WHERE data = $1 AND status = 'cancelado'",
    [data]
  );

  res.json({
    data,
    atendimentos: Number(totais.atendimentos),
    totalArrecadado: Number(totais.totalArrecadado),
    porTipo,
    porFormaPagamento: porFormaPagamento.map((f) => ({
      ...f,
      quantidade: Number(f.quantidade),
      total: Number(f.total),
    })),
    totalDespesas,
    lucro: Number(totais.totalArrecadado) - totalDespesas,
    cancelamentos: Number(cancelamentosBruto),
  });
});

app.get("/relatorios/mensal", async (req, res) => {
  const mes = req.query.mes || mesAtualBrasilia(); // 'YYYY-MM'
  const [inicioMes, fimMes] = limitesDoMesBrasilia(mes);

  const totais = await db.one(
    `SELECT COUNT(*) AS "totalAtendimentos", COALESCE(SUM(valor_total), 0) AS "faturamentoTotal"
     FROM vendas WHERE criado_em >= $1 AND criado_em < $2`,
    [inicioMes, fimMes]
  );

  const porBarbeiro = await db.many(
    `SELECT b.id AS "barbeiroId", b.nome AS barbeiro,
            COUNT(*) AS atendimentos, COALESCE(SUM(v.valor_total), 0) AS faturamento
     FROM vendas v
     JOIN barbeiros b ON b.id = v.barbeiro_id
     WHERE v.criado_em >= $1 AND v.criado_em < $2
     GROUP BY b.id
     ORDER BY faturamento DESC`,
    [inicioMes, fimMes]
  );

  const porFormaPagamento = await db.many(
    `SELECT vp.forma_pagamento AS "formaPagamento", COUNT(*) AS quantidade, COALESCE(SUM(vp.valor), 0) AS faturamento
     FROM venda_pagamentos vp
     JOIN vendas v ON v.id = vp.venda_id
     WHERE v.criado_em >= $1 AND v.criado_em < $2
     GROUP BY vp.forma_pagamento
     ORDER BY quantidade DESC`,
    [inicioMes, fimMes]
  );

  // `despesas.data` é texto 'YYYY-MM-DD' — LIKE 'YYYY-MM%' em vez de
  // to_char evita depender da função customizada registrada só pro pg-mem
  // de teste, e funciona igual nos dois motores.
  const { total: despesasBruto } = await db.one(
    "SELECT COALESCE(SUM(valor), 0) AS total FROM despesas WHERE data LIKE $1",
    [`${mes}%`]
  );
  const totalDespesas = Number(despesasBruto);

  const { total: cancelamentosBruto } = await db.one(
    "SELECT COUNT(*) AS total FROM agendamentos WHERE data LIKE $1 AND status = 'cancelado'",
    [`${mes}%`]
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
    totalDespesas,
    lucro: Number(totais.faturamentoTotal) - totalDespesas,
    cancelamentos: Number(cancelamentosBruto),
  });
});

app.get("/relatorios/cancelamentos", async (req, res) => {
  const { de, ate, barbeiroId } = req.query;

  const condicoes = ["a.status = 'cancelado'"];
  const params = [];

  if (de) {
    params.push(de);
    condicoes.push(`a.data >= $${params.length}`);
  }
  if (ate) {
    params.push(ate);
    condicoes.push(`a.data <= $${params.length}`);
  }
  if (barbeiroId) {
    params.push(Number(barbeiroId));
    condicoes.push(`a.barbeiro_id = $${params.length}`);
  }

  const cancelamentos = await db.many(
    `SELECT a.*, b.nome AS barbeiro_nome
     FROM agendamentos a
     JOIN barbeiros b ON b.id = a.barbeiro_id
     WHERE ${condicoes.join(" AND ")}
     ORDER BY a.cancelado_em DESC`,
    params
  );

  res.json({ total: cancelamentos.length, cancelamentos });
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
