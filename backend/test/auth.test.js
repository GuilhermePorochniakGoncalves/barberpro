const test = require("node:test");
const assert = require("node:assert/strict");
const { comServidor } = require("./helpers");

test("login: usuário/senha corretos dão token; senha errada dá 401 com mensagem genérica", comServidor(async ({ req }) => {
  const barbeiro = (await req("POST", "/barbeiros", { nome: "Zaqueu" })).data;
  await req("PUT", `/barbeiros/${barbeiro.id}/login`, { usuario: "zaqueu", senha: "senha123" });

  const senhaErrada = await req("POST", "/barbeiros/login", { usuario: "zaqueu", senha: "errada" });
  assert.equal(senhaErrada.status, 401);
  assert.equal(senhaErrada.data.erro, "Usuário ou senha inválidos.");

  const usuarioInexistente = await req("POST", "/barbeiros/login", { usuario: "ninguem", senha: "x" });
  assert.equal(usuarioInexistente.status, 401);
  assert.equal(usuarioInexistente.data.erro, senhaErrada.data.erro); // mesma mensagem — não vaza qual campo errou

  const ok = await req("POST", "/barbeiros/login", { usuario: "zaqueu", senha: "senha123" });
  assert.equal(ok.status, 200);
  assert.ok(ok.data.token);
  assert.equal(ok.data.barbeiro.nome, "Zaqueu");
}));

test("login: nome de usuário duplicado é rejeitado", comServidor(async ({ req }) => {
  const b1 = (await req("POST", "/barbeiros", { nome: "Zaqueu" })).data;
  const b2 = (await req("POST", "/barbeiros", { nome: "Fulano" })).data;

  await req("PUT", `/barbeiros/${b1.id}/login`, { usuario: "barbeiro1", senha: "senha123" });
  const duplicado = await req("PUT", `/barbeiros/${b2.id}/login`, { usuario: "barbeiro1", senha: "outrasenha" });
  assert.equal(duplicado.status, 409);
}));

test("login: depois de configurado, só o próprio dono (autenticado) pode trocar a senha", comServidor(async ({ req, criarBarbeiroLogado }) => {
  const dono = await criarBarbeiroLogado("Zaqueu", "dono1");

  const semToken = await req("PUT", `/barbeiros/${dono.id}/login`, { usuario: "dono1", senha: "novaSenha1" });
  assert.equal(semToken.status, 403);

  const comToken = await req(
    "PUT",
    `/barbeiros/${dono.id}/login`,
    { usuario: "dono1", senha: "novaSenha1" },
    dono.token
  );
  assert.equal(comToken.status, 200);
}));

test("rotas protegidas exigem token (401 sem token)", comServidor(async ({ req, criarBarbeiroLogado }) => {
  const barbeiro = await criarBarbeiroLogado("Zaqueu", "zaqueuprot");

  const semToken = await req("POST", `/barbeiros/${barbeiro.id}/servicos`, { nome: "Corte", preco: 30 });
  assert.equal(semToken.status, 401);

  const comToken = await req(
    "POST",
    `/barbeiros/${barbeiro.id}/servicos`,
    { nome: "Corte", preco: 30 },
    barbeiro.token
  );
  assert.equal(comToken.status, 201);
}));

test("barbeiro não pode gerenciar recursos de outro barbeiro (403)", comServidor(async ({ req, criarBarbeiroLogado }) => {
  const zaqueu = await criarBarbeiroLogado("Zaqueu", "zaqueu403");
  const fulano = await criarBarbeiroLogado("Fulano", "fulano403");

  // Fulano tenta cadastrar serviço na conta do Zaqueu.
  const criarServicoAlheio = await req(
    "POST",
    `/barbeiros/${zaqueu.id}/servicos`,
    { nome: "Corte", preco: 30 },
    fulano.token
  );
  assert.equal(criarServicoAlheio.status, 403);

  // Fulano tenta editar/cancelar um agendamento do Zaqueu.
  await req("POST", `/barbeiros/${zaqueu.id}/servicos`, { nome: "Corte", preco: 30 }, zaqueu.token);
  const agendamento = await req("POST", "/agendamentos", {
    barbeiroId: zaqueu.id,
    nome: "Cliente",
    telefone: "11999998888",
    servico: "Corte",
    data: "2026-08-12",
    horario: "09:00",
  });

  const editarAlheio = await req(
    "PUT",
    `/agendamentos/${agendamento.data.id}`,
    { barbeiroId: zaqueu.id, nome: "Cliente", telefone: "11999998888", servico: "Corte", data: "2026-08-12", horario: "10:00" },
    fulano.token
  );
  assert.equal(editarAlheio.status, 403);

  const cancelarAlheio = await req("DELETE", `/agendamentos/${agendamento.data.id}`, null, fulano.token);
  assert.equal(cancelarAlheio.status, 403);

  const finalizarAlheio = await req(
    "POST",
    "/vendas",
    { agendamentoId: agendamento.data.id, formaPagamento: "pix", itens: [{ nome: "Corte", quantidade: 1 }] },
    fulano.token
  );
  assert.equal(finalizarAlheio.status, 403);
}));

test("bloqueio de agenda: barbeiro bloqueia um horário e o agendamento nele é recusado", comServidor(async ({ req, criarBarbeiroLogado }) => {
  const barbeiro = await criarBarbeiroLogado("Zaqueu", "zaqueubloq");
  await req("POST", `/barbeiros/${barbeiro.id}/servicos`, { nome: "Corte", preco: 30 }, barbeiro.token);

  const bloqueio = await req(
    "POST",
    `/barbeiros/${barbeiro.id}/bloqueios`,
    { data: "2026-08-13", horario: "09:00" },
    barbeiro.token
  );
  assert.equal(bloqueio.status, 201);

  const tentativa = await req("POST", "/agendamentos", {
    barbeiroId: barbeiro.id,
    nome: "Cliente",
    telefone: "11999998888",
    servico: "Corte",
    data: "2026-08-13",
    horario: "09:00",
  });
  assert.equal(tentativa.status, 409);

  // Outro horário no mesmo dia continua livre.
  const outroHorario = await req("POST", "/agendamentos", {
    barbeiroId: barbeiro.id,
    nome: "Cliente",
    telefone: "11999998888",
    servico: "Corte",
    data: "2026-08-13",
    horario: "10:00",
  });
  assert.equal(outroHorario.status, 201);
}));

test("bloqueio de dia inteiro (horario null) recusa qualquer horário daquele dia", comServidor(async ({ req, criarBarbeiroLogado }) => {
  const barbeiro = await criarBarbeiroLogado("Zaqueu", "zaqueufolga");
  await req("POST", `/barbeiros/${barbeiro.id}/servicos`, { nome: "Corte", preco: 30 }, barbeiro.token);

  await req("POST", `/barbeiros/${barbeiro.id}/bloqueios`, { data: "2026-08-14" }, barbeiro.token);

  const tentativa = await req("POST", "/agendamentos", {
    barbeiroId: barbeiro.id,
    nome: "Cliente",
    telefone: "11999998888",
    servico: "Corte",
    data: "2026-08-14",
    horario: "15:00",
  });
  assert.equal(tentativa.status, 409);
}));

test("produto: estoque insuficiente bloqueia a venda; venda ok decrementa o estoque exatamente", comServidor(async ({ req, criarBarbeiroLogado }) => {
  const barbeiro = await criarBarbeiroLogado("Zaqueu", "zaqueuestoque");
  await req("POST", `/barbeiros/${barbeiro.id}/servicos`, { nome: "Corte", preco: 30 }, barbeiro.token);

  const produto = await req(
    "POST",
    "/produtos",
    { nome: "Cera modeladora", preco: 20, estoque: 2 },
    barbeiro.token
  );
  assert.equal(produto.status, 201);

  const agendamento = await req("POST", "/agendamentos", {
    barbeiroId: barbeiro.id,
    nome: "Cliente",
    telefone: "11999998888",
    servico: "Corte",
    data: "2026-08-15",
    horario: "09:00",
  });

  const pedidoDemais = await req(
    "POST",
    "/vendas",
    {
      agendamentoId: agendamento.data.id,
      formaPagamento: "pix",
      itens: [{ nome: "Corte", quantidade: 1 }, { nome: "Cera modeladora", quantidade: 3 }],
    },
    barbeiro.token
  );
  assert.equal(pedidoDemais.status, 409);

  const pedidoOk = await req(
    "POST",
    "/vendas",
    {
      agendamentoId: agendamento.data.id,
      formaPagamento: "pix",
      itens: [{ nome: "Corte", quantidade: 1 }, { nome: "Cera modeladora", quantidade: 2 }],
    },
    barbeiro.token
  );
  assert.equal(pedidoOk.status, 201);

  const catalogo = await req("GET", "/catalogo");
  const atualizado = catalogo.data.find((i) => i.nome === "Cera modeladora");
  assert.equal(atualizado.estoque, 0);
}));
