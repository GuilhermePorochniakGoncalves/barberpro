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

test("lista de espera: entrar na fila, cancelar o agendamento notifica automaticamente, e dá pra sair da fila", comServidor(async ({ req, criarBarbeiro }) => {
  const barbeiro = await criarBarbeiro("Zaqueu");
  await req("POST", `/barbeiros/${barbeiro.id}/servicos`, { nome: "Corte", preco: 30 });

  const agendamento = await req("POST", "/agendamentos", {
    barbeiroId: barbeiro.id,
    nome: "Joao",
    telefone: "11999998888",
    servico: "Corte",
    data: "2026-08-16",
    horario: "09:00",
  });
  assert.equal(agendamento.status, 201);

  // Horário validação: telefone inválido é rejeitado.
  const invalida = await req("POST", `/barbeiros/${barbeiro.id}/lista-espera`, {
    nome: "Pedro",
    telefone: "123",
    servico: "Corte",
    data: "2026-08-16",
    horario: "09:00",
  });
  assert.equal(invalida.status, 400);

  const entrada = await req("POST", `/barbeiros/${barbeiro.id}/lista-espera`, {
    nome: "Pedro",
    telefone: "11988887777",
    servico: "Corte",
    data: "2026-08-16",
    horario: "09:00",
  });
  assert.equal(entrada.status, 201);
  assert.equal(entrada.data.status, "aguardando");

  const lista = await req("GET", `/barbeiros/${barbeiro.id}/lista-espera?data=2026-08-16`);
  assert.equal(lista.data.length, 1);
  assert.equal(lista.data[0].nome, "Pedro");

  // Cancelar o agendamento original libera o slot e notifica quem espera.
  const cancelado = await req("DELETE", `/agendamentos/${agendamento.data.id}`);
  assert.equal(cancelado.status, 200);
  assert.equal(cancelado.data.notificadosListaEspera, 1);

  const listaAtualizada = await req("GET", `/barbeiros/${barbeiro.id}/lista-espera?data=2026-08-16`);
  assert.equal(listaAtualizada.data[0].status, "notificado");
  assert.ok(listaAtualizada.data[0].notificado_em);

  // Sair da lista de espera (ex.: já foi atendido, ou desistiu).
  const removido = await req("DELETE", `/barbeiros/${barbeiro.id}/lista-espera/${entrada.data.id}`);
  assert.equal(removido.status, 204);

  const listaVazia = await req("GET", `/barbeiros/${barbeiro.id}/lista-espera?data=2026-08-16`);
  assert.equal(listaVazia.data.length, 0);
}));

test("fechamento do dia: agrega total por tipo de item e por forma de pagamento", comServidor(async ({ req, criarBarbeiro }) => {
  const barbeiro = await criarBarbeiro("Zaqueu");
  await req("POST", `/barbeiros/${barbeiro.id}/servicos`, { nome: "Corte", preco: 50 });
  await req("POST", "/produtos", { nome: "Pomada", preco: 30, estoque: 10 });

  const agendamento = await req("POST", "/agendamentos", {
    barbeiroId: barbeiro.id,
    nome: "Cliente",
    telefone: "11999998888",
    servico: "Corte",
    data: "2026-08-18",
    horario: "09:00",
  });

  const venda = await req("POST", "/vendas", {
    agendamentoId: agendamento.data.id,
    formaPagamento: "pix",
    itens: [{ nome: "Corte", quantidade: 1 }, { nome: "Pomada", quantidade: 2 }],
  });
  assert.equal(venda.status, 201);
  assert.equal(venda.data.valor_total, 50 + 30 * 2);

  // O banco em memória é compartilhado por todos os testes deste arquivo
  // (cada um sobe seu próprio servidor, mas na mesma instância de pg-mem),
  // e `criado_em` da venda é sempre "agora" — então outros testes que
  // também vendem algo "hoje" contribuem pro mesmo dia. Por isso os
  // asserts abaixo checam "pelo menos essa venda está contabilizada", não
  // o total exato do dia.
  const hoje = new Date().toISOString().slice(0, 10);
  const relatorio = await req("GET", `/relatorios/diario?data=${hoje}`);
  assert.equal(relatorio.status, 200);
  assert.ok(relatorio.data.atendimentos >= 1);
  assert.ok(relatorio.data.totalArrecadado >= 50 + 30 * 2);
  assert.ok(relatorio.data.porTipo.servico >= 50);
  assert.ok(relatorio.data.porTipo.produto >= 60);
  const pix = relatorio.data.porFormaPagamento.find((f) => f.formaPagamento === "pix");
  assert.ok(pix, "deve ter um grupo de pagamento 'pix'");
  assert.ok(pix.total >= 110);
}));

test("fechamento do dia: dia sem nenhuma venda vem zerado, não dá erro", comServidor(async ({ req }) => {
  const relatorio = await req("GET", "/relatorios/diario?data=2020-01-01");
  assert.equal(relatorio.status, 200);
  assert.equal(relatorio.data.atendimentos, 0);
  assert.equal(relatorio.data.totalArrecadado, 0);
  assert.equal(relatorio.data.porTipo.servico, 0);
  assert.equal(relatorio.data.porTipo.produto, 0);
  assert.equal(relatorio.data.porFormaPagamento.length, 0);
}));

test("lista de espera: cancelar horário sem ninguém esperando notifica zero", comServidor(async ({ req, criarBarbeiro }) => {
  const barbeiro = await criarBarbeiro("Zaqueu");
  await req("POST", `/barbeiros/${barbeiro.id}/servicos`, { nome: "Corte", preco: 30 });

  const agendamento = await req("POST", "/agendamentos", {
    barbeiroId: barbeiro.id,
    nome: "Joao",
    telefone: "11999998888",
    servico: "Corte",
    data: "2026-08-17",
    horario: "09:00",
  });

  const cancelado = await req("DELETE", `/agendamentos/${agendamento.data.id}`);
  assert.equal(cancelado.status, 200);
  assert.equal(cancelado.data.notificadosListaEspera, 0);
}));
