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
    pagamentos: [{ formaPagamento: "pix", valor: 30 + 20 * 3 }],
    itens: [{ nome: "Corte", quantidade: 1 }, { nome: "Cera modeladora", quantidade: 3 }],
  });
  assert.equal(pedidoDemais.status, 409);

  const pedidoOk = await req("POST", "/vendas", {
    agendamentoId: agendamento.data.id,
    pagamentos: [{ formaPagamento: "pix", valor: 30 + 20 * 2 }],
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
    pagamentos: [{ formaPagamento: "pix", valor: 50 + 30 * 2 }],
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

test("cliente: observações são salvas, editáveis via PUT, e aparecem junto do agendamento na agenda", comServidor(async ({ req, criarBarbeiro }) => {
  const barbeiro = await criarBarbeiro("Zaqueu");
  await req("POST", `/barbeiros/${barbeiro.id}/servicos`, { nome: "Corte", preco: 30 });

  const criado = await req("POST", "/clientes", {
    nome: "Rafael Costa",
    telefone: "11977776666",
    observacoes: "Alérgico a produto X",
  });
  assert.equal(criado.status, 201);
  assert.equal(criado.data.observacoes, "Alérgico a produto X");

  const editado = await req("PUT", `/clientes/${criado.data.id}`, {
    nome: "Rafael Costa",
    telefone: "11977776666",
    observacoes: "Gosta de degradê baixo",
  });
  assert.equal(editado.status, 200);
  assert.equal(editado.data.observacoes, "Gosta de degradê baixo");

  // Observação vazia limpa o campo (vira null, não string vazia).
  const limpo = await req("PUT", `/clientes/${criado.data.id}`, {
    nome: "Rafael Costa",
    telefone: "11977776666",
    observacoes: "",
  });
  assert.equal(limpo.data.observacoes, null);

  await req("PUT", `/clientes/${criado.data.id}`, {
    nome: "Rafael Costa",
    telefone: "11977776666",
    observacoes: "Prefere máquina 2",
  });

  const agendamento = await req("POST", "/agendamentos", {
    barbeiroId: barbeiro.id,
    nome: "Rafael Costa",
    telefone: "11977776666",
    servico: "Corte",
    data: "2026-08-19",
    horario: "09:00",
  });
  assert.equal(agendamento.status, 201);

  const lista = await req("GET", `/agendamentos?barbeiroId=${barbeiro.id}&data=2026-08-19`);
  assert.equal(lista.data[0].cliente_observacoes, "Prefere máquina 2");
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

test("duração do serviço: corte+barba de 60min ocupa dois slots de 30min e bloqueia o seguinte", comServidor(async ({ req, criarBarbeiro }) => {
  const barbeiro = await criarBarbeiro("Zaqueu");
  const servico = await req("POST", `/barbeiros/${barbeiro.id}/servicos`, {
    nome: "Corte + Barba",
    preco: 60,
    duracaoMinutos: 60,
  });
  assert.equal(servico.status, 201);
  assert.equal(servico.data.duracao_minutos, 60);

  const criado = await req("POST", "/agendamentos", {
    barbeiroId: barbeiro.id,
    nome: "Cliente",
    telefone: "11999998888",
    servico: "Corte + Barba",
    data: "2026-08-20",
    horario: "09:00",
  });
  assert.equal(criado.status, 201);
  assert.equal(criado.data.duracao_minutos, 60);

  // 09:30 está "dentro" do atendimento das 09:00 (que só termina 10:00) —
  // mesmo sem coincidir o horário exato, precisa recusar por sobreposição.
  const conflitoMeio = await req("POST", "/agendamentos", {
    barbeiroId: barbeiro.id,
    nome: "Outro",
    telefone: "11988887777",
    servico: "Corte + Barba",
    data: "2026-08-20",
    horario: "09:30",
  });
  assert.equal(conflitoMeio.status, 409);

  // 10:00 já é depois do fim (09:00 + 60min) — livre.
  const livre = await req("POST", "/agendamentos", {
    barbeiroId: barbeiro.id,
    nome: "Terceiro",
    telefone: "11977776666",
    servico: "Corte + Barba",
    data: "2026-08-20",
    horario: "10:00",
  });
  assert.equal(livre.status, 201);
}));

test("pagamento dividido: soma dos pagamentos precisa bater com o total, e cada forma é contabilizada certa no relatório", comServidor(async ({ req, criarBarbeiro }) => {
  const barbeiro = await criarBarbeiro("Zaqueu");
  await req("POST", `/barbeiros/${barbeiro.id}/servicos`, { nome: "Corte", preco: 100 });

  const agendamento = await req("POST", "/agendamentos", {
    barbeiroId: barbeiro.id,
    nome: "Cliente",
    telefone: "11999998888",
    servico: "Corte",
    data: "2026-08-21",
    horario: "09:00",
  });

  const somaErrada = await req("POST", "/vendas", {
    agendamentoId: agendamento.data.id,
    pagamentos: [
      { formaPagamento: "pix", valor: 40 },
      { formaPagamento: "credito", valor: 40 },
    ],
    itens: [{ nome: "Corte", quantidade: 1 }],
  });
  assert.equal(somaErrada.status, 400);

  const venda = await req("POST", "/vendas", {
    agendamentoId: agendamento.data.id,
    pagamentos: [
      { formaPagamento: "pix", valor: 40 },
      { formaPagamento: "credito", valor: 60 },
    ],
    itens: [{ nome: "Corte", quantidade: 1 }],
  });
  assert.equal(venda.status, 201);
  assert.equal(venda.data.forma_pagamento, "misto");
  assert.equal(venda.data.pagamentos.length, 2);

  const hoje = new Date().toISOString().slice(0, 10);
  const relatorio = await req("GET", `/relatorios/diario?data=${hoje}`);
  const pix = relatorio.data.porFormaPagamento.find((f) => f.formaPagamento === "pix");
  const credito = relatorio.data.porFormaPagamento.find((f) => f.formaPagamento === "credito");
  assert.ok(pix.total >= 40);
  assert.ok(credito.total >= 60);
}));

test("despesas: cadastra, some do lucro do dia/mês, e dá pra remover", comServidor(async ({ req }) => {
  const hoje = new Date().toISOString().slice(0, 10);

  const invalida = await req("POST", "/despesas", { descricao: "", valor: -10, data: hoje });
  assert.equal(invalida.status, 400);

  const despesa = await req("POST", "/despesas", {
    descricao: "Aluguel do mês",
    categoria: "aluguel",
    valor: 500,
    data: hoje,
  });
  assert.equal(despesa.status, 201);
  assert.equal(despesa.data.categoria, "aluguel");

  const lista = await req("GET", `/despesas?de=${hoje}&ate=${hoje}`);
  assert.ok(lista.data.some((d) => d.id === despesa.data.id));

  const relatorioDia = await req("GET", `/relatorios/diario?data=${hoje}`);
  assert.ok(relatorioDia.data.totalDespesas >= 500);

  const mesAtual = hoje.slice(0, 7);
  const relatorioMes = await req("GET", `/relatorios/mensal?mes=${mesAtual}`);
  assert.ok(relatorioMes.data.totalDespesas >= 500);

  const removida = await req("DELETE", `/despesas/${despesa.data.id}`);
  assert.equal(removida.status, 204);
}));

test("histórico de cancelamento: agendamento cancelado aparece no relatório de cancelamentos com timestamp", comServidor(async ({ req, criarBarbeiro }) => {
  const barbeiro = await criarBarbeiro("Zaqueu");
  await req("POST", `/barbeiros/${barbeiro.id}/servicos`, { nome: "Corte", preco: 30 });

  const agendamento = await req("POST", "/agendamentos", {
    barbeiroId: barbeiro.id,
    nome: "Cliente Faltante",
    telefone: "11999997777",
    servico: "Corte",
    data: "2026-08-22",
    horario: "09:00",
  });
  assert.equal(agendamento.status, 201);

  await req("DELETE", `/agendamentos/${agendamento.data.id}`);

  // Cancelar de novo (já cancelado) é rejeitado, não notifica de novo.
  const duploCancelamento = await req("DELETE", `/agendamentos/${agendamento.data.id}`);
  assert.equal(duploCancelamento.status, 409);

  const relatorio = await req(
    "GET",
    `/relatorios/cancelamentos?de=2026-08-22&ate=2026-08-22&barbeiroId=${barbeiro.id}`
  );
  assert.equal(relatorio.status, 200);
  assert.equal(relatorio.data.total, 1);
  assert.equal(relatorio.data.cancelamentos[0].nome, "Cliente Faltante");
  assert.ok(relatorio.data.cancelamentos[0].cancelado_em);
}));
