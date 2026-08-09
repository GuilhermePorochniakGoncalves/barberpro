// Regras de negócio que não são sobre autenticação (o sistema não tem
// login — ver server.js) mas merecem teste dedicado por serem lógica de
// domínio: bloqueio de agenda (folga/horário indisponível) e controle de
// estoque de produto na finalização de atendimento.
const test = require("node:test");
const assert = require("node:assert/strict");
const { comServidor } = require("./helpers");

test("bloqueio de agenda: bloquear um horário recusa agendamento nele, mas libera outros horários do dia", comServidor(async ({ req, criarBarbeiro }) => {
  const barbeiro = await criarBarbeiro("Zaqueu");
  await req("POST", `/barbeiros/${barbeiro.id}/servicos`, { nome: "Corte", preco: 30 });

  const bloqueio = await req("POST", `/barbeiros/${barbeiro.id}/bloqueios`, { data: "2026-08-13", horario: "09:00" });
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

test("bloqueio de dia inteiro (horario null) recusa qualquer horário daquele dia", comServidor(async ({ req, criarBarbeiro }) => {
  const barbeiro = await criarBarbeiro("Zaqueu");
  await req("POST", `/barbeiros/${barbeiro.id}/servicos`, { nome: "Corte", preco: 30 });

  await req("POST", `/barbeiros/${barbeiro.id}/bloqueios`, { data: "2026-08-14" });

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

test("produto: estoque insuficiente bloqueia a venda; venda ok decrementa o estoque exatamente", comServidor(async ({ req, criarBarbeiro }) => {
  const barbeiro = await criarBarbeiro("Zaqueu");
  await req("POST", `/barbeiros/${barbeiro.id}/servicos`, { nome: "Corte", preco: 30 });

  const produto = await req("POST", "/produtos", { nome: "Cera modeladora", preco: 20, estoque: 2 });
  assert.equal(produto.status, 201);

  const agendamento = await req("POST", "/agendamentos", {
    barbeiroId: barbeiro.id,
    nome: "Cliente",
    telefone: "11999998888",
    servico: "Corte",
    data: "2026-08-15",
    horario: "09:00",
  });

  const pedidoDemais = await req("POST", "/vendas", {
    agendamentoId: agendamento.data.id,
    formaPagamento: "pix",
    itens: [{ nome: "Corte", quantidade: 1 }, { nome: "Cera modeladora", quantidade: 3 }],
  });
  assert.equal(pedidoDemais.status, 409);

  const pedidoOk = await req("POST", "/vendas", {
    agendamentoId: agendamento.data.id,
    formaPagamento: "pix",
    itens: [{ nome: "Corte", quantidade: 1 }, { nome: "Cera modeladora", quantidade: 2 }],
  });
  assert.equal(pedidoOk.status, 201);

  const catalogo = await req("GET", "/catalogo");
  const atualizado = catalogo.data.find((i) => i.nome === "Cera modeladora");
  assert.equal(atualizado.estoque, 0);
}));
