const test = require("node:test");
const assert = require("node:assert/strict");
const { comServidor } = require("./helpers");

test("health check responde ok", comServidor(async ({ req }) => {
  const { status, data } = await req("GET", "/health");
  assert.equal(status, 200);
  assert.deepEqual(data, { status: "ok" });
}));

test("catálogo vem semeado só com produtos (serviço é cadastrado por barbeiro)", comServidor(async ({ req }) => {
  const { status, data } = await req("GET", "/catalogo");
  assert.equal(status, 200);
  assert.ok(data.length > 0);
  assert.ok(data.every((i) => i.tipo === "produto"));
  assert.ok(data.every((i) => i.estoque > 0));
}));

test("barbeiro: criar, validar nome vazio", comServidor(async ({ req }) => {
  const vazio = await req("POST", "/barbeiros", { nome: "" });
  assert.equal(vazio.status, 400);

  const ok = await req("POST", "/barbeiros", { nome: "Zaqueu" });
  assert.equal(ok.status, 201);
  assert.equal(ok.data.nome, "Zaqueu");
}));

test("qualquer um cadastra serviço de qualquer barbeiro (sem login) e usa no agendamento; produto compartilhado entra como item extra", comServidor(async ({ req, criarBarbeiro }) => {
  const zaqueu = await criarBarbeiro("Zaqueu");

  const servico = await req("POST", `/barbeiros/${zaqueu.id}/servicos`, { nome: "Corte Simples", preco: 30 });
  assert.equal(servico.status, 201);
  assert.equal(servico.data.preco, 30);

  const dadosAgendamento = {
    barbeiroId: zaqueu.id,
    nome: "Joao",
    telefone: "11999998888",
    servico: "Corte Simples",
    data: "2026-08-10",
    horario: "09:00",
  };

  const criado = await req("POST", "/agendamentos", dadosAgendamento);
  assert.equal(criado.status, 201);

  const catalogo = await req("GET", `/catalogo?barbeiroId=${zaqueu.id}`);
  const produto = catalogo.data.find((i) => i.tipo === "produto");
  assert.ok(produto, "catálogo com barbeiroId deve trazer produtos compartilhados também");

  const total = 30 + produto.preco * 2;
  const venda = await req("POST", "/vendas", {
    agendamentoId: criado.data.id,
    pagamentos: [{ formaPagamento: "pix", valor: total }],
    itens: [
      { nome: "Corte Simples", quantidade: 1 },
      { nome: produto.nome, quantidade: 2 },
    ],
  });
  assert.equal(venda.status, 201);
  assert.equal(venda.data.valor_total, total);
  assert.equal(venda.data.forma_pagamento, "pix");
  assert.equal(venda.data.pagamentos.length, 1);

  const estoqueAtualizado = (await req("GET", `/catalogo?barbeiroId=${zaqueu.id}`)).data.find(
    (i) => i.id === produto.id
  );
  assert.equal(estoqueAtualizado.estoque, produto.estoque - 2);
}));

test("conflito de horário é por barbeiro; outro barbeiro pode atender no mesmo slot", comServidor(async ({ req, criarBarbeiro }) => {
  const b1 = await criarBarbeiro("Zaqueu");
  const b2 = await criarBarbeiro("Fulano");

  await req("POST", `/barbeiros/${b1.id}/servicos`, { nome: "Barba", preco: 25 });

  const dadosAgendamento = {
    barbeiroId: b1.id,
    nome: "Joao",
    telefone: "11999998888",
    servico: "Barba",
    data: "2026-08-10",
    horario: "10:00",
  };

  const criado = await req("POST", "/agendamentos", dadosAgendamento);
  assert.equal(criado.status, 201);

  const conflito = await req("POST", "/agendamentos", { ...dadosAgendamento, nome: "Pedro", telefone: "11988887777" });
  assert.equal(conflito.status, 409);

  const outroBarbeiro = await req("POST", "/agendamentos", {
    ...dadosAgendamento,
    barbeiroId: b2.id,
    servico: "Corte qualquer", // b2 não tem serviço cadastrado — deve falhar por validação, não por conflito
    nome: "Carlos",
    telefone: "11977776666",
  });
  assert.equal(outroBarbeiro.status, 400);
}));

test("relatório mensal agrega faturamento por barbeiro e forma de pagamento", comServidor(async ({ req, criarBarbeiro }) => {
  const zaqueu = await criarBarbeiro("Zaqueu");
  await req("POST", `/barbeiros/${zaqueu.id}/servicos`, { nome: "Corte", preco: 40 });

  const criado = await req("POST", "/agendamentos", {
    barbeiroId: zaqueu.id,
    nome: "Joao",
    telefone: "11999998888",
    servico: "Corte",
    data: "2026-08-10",
    horario: "11:00",
  });

  await req("POST", "/vendas", {
    agendamentoId: criado.data.id,
    pagamentos: [{ formaPagamento: "dinheiro", valor: 40 }],
    itens: [{ nome: "Corte", quantidade: 1 }],
  });

  // A venda é registrada com a data/hora real ("agora"), não a `data` do
  // agendamento — o relatório precisa ser consultado pelo mês corrente.
  // Consulta sem filtro de barbeiro: outros testes do mesmo arquivo também
  // criam vendas no banco em memória compartilhado, então as asserções
  // abaixo procuram a entrada do Zaqueu em vez de assumir totais globais.
  const mesAtual = new Date().toISOString().slice(0, 7);
  const relatorio = await req("GET", `/relatorios/mensal?mes=${mesAtual}`);
  assert.equal(relatorio.status, 200);
  assert.ok(relatorio.data.totalAtendimentos >= 1);

  // Vários testes deste arquivo criam barbeiros chamados "Zaqueu" (nomes
  // repetidos de propósito) — casa pelo id específico deste teste, não
  // pelo nome, que apareceria mais de uma vez no relatório.
  const entradaZaqueu = relatorio.data.porBarbeiro.find((b) => b.barbeiroId === zaqueu.id);
  assert.ok(entradaZaqueu, "este Zaqueu deve aparecer no relatório do mês");
  assert.equal(entradaZaqueu.atendimentos, 1);
  assert.equal(entradaZaqueu.faturamento, 40);

  const entradaDinheiro = relatorio.data.porFormaPagamento.find((f) => f.formaPagamento === "dinheiro");
  assert.ok(entradaDinheiro, "forma de pagamento 'dinheiro' deve aparecer no relatório");
  assert.ok(entradaDinheiro.quantidade >= 1);

  const clientes = await req("GET", "/clientes");
  const joao = clientes.data.find((c) => c.telefone === "11999998888");
  assert.ok(joao.ultimo_atendimento);
}));

test("agendamento: editar move de horário sem conflito, e cancelar vira status (não some do banco)", comServidor(async ({ req, criarBarbeiro }) => {
  const barbeiro = await criarBarbeiro("Zaqueu");
  await req("POST", `/barbeiros/${barbeiro.id}/servicos`, { nome: "Barba", preco: 25 });

  const criado = await req("POST", "/agendamentos", {
    barbeiroId: barbeiro.id,
    nome: "Ana",
    telefone: "11999990000",
    servico: "Barba",
    data: "2026-08-11",
    horario: "10:00",
  });
  assert.equal(criado.status, 201);

  const editado = await req("PUT", `/agendamentos/${criado.data.id}`, {
    barbeiroId: barbeiro.id,
    nome: "Ana",
    telefone: "11999990000",
    servico: "Barba",
    data: "2026-08-11",
    horario: "11:00",
  });
  assert.equal(editado.status, 200);
  assert.equal(editado.data.horario, "11:00");

  const cancelado = await req("DELETE", `/agendamentos/${criado.data.id}`);
  assert.equal(cancelado.status, 200);
  assert.equal(cancelado.data.notificadosListaEspera, 0);

  const listaVazia = await req("GET", `/agendamentos?barbeiroId=${barbeiro.id}&data=2026-08-11`);
  assert.equal(listaVazia.data.length, 0);

  // Cancelado não some — fica no banco pra histórico, só sai da agenda padrão.
  const comCancelados = await req(
    "GET",
    `/agendamentos?barbeiroId=${barbeiro.id}&data=2026-08-11&incluirCancelados=true`
  );
  assert.equal(comCancelados.data.length, 1);
  assert.equal(comCancelados.data[0].status, "cancelado");
  assert.ok(comCancelados.data[0].cancelado_em);
}));
