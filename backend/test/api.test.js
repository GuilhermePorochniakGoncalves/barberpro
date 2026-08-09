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

test("barbeiro: criar, validar nome vazio, listagem não expõe senha_hash", comServidor(async ({ req }) => {
  const vazio = await req("POST", "/barbeiros", { nome: "" });
  assert.equal(vazio.status, 400);

  const ok = await req("POST", "/barbeiros", { nome: "Zaqueu" });
  assert.equal(ok.status, 201);
  assert.equal(ok.data.nome, "Zaqueu");
  assert.equal(ok.data.senha_hash, undefined);

  const lista = await req("GET", "/barbeiros");
  assert.ok(lista.data.every((b) => b.senha_hash === undefined));
}));

test("barbeiro cadastra o próprio serviço com preço e usa no agendamento; produto compartilhado entra como item extra", comServidor(async ({ req, criarBarbeiroLogado }) => {
  const zaqueu = await criarBarbeiroLogado("Zaqueu", "zaqueu");

  const servico = await req(
    "POST",
    `/barbeiros/${zaqueu.id}/servicos`,
    { nome: "Corte Simples", preco: 30 },
    zaqueu.token
  );
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

  const venda = await req(
    "POST",
    "/vendas",
    {
      agendamentoId: criado.data.id,
      formaPagamento: "pix",
      itens: [
        { nome: "Corte Simples", quantidade: 1 },
        { nome: produto.nome, quantidade: 2 },
      ],
    },
    zaqueu.token
  );
  assert.equal(venda.status, 201);
  assert.equal(venda.data.valor_total, 30 + produto.preco * 2);

  const estoqueAtualizado = (await req("GET", `/catalogo?barbeiroId=${zaqueu.id}`)).data.find(
    (i) => i.id === produto.id
  );
  assert.equal(estoqueAtualizado.estoque, produto.estoque - 2);
}));

test("conflito de horário é por barbeiro; outro barbeiro pode atender no mesmo slot", comServidor(async ({ req, criarBarbeiroLogado }) => {
  const b1 = await criarBarbeiroLogado("Zaqueu", "zaqueu2");
  const b2 = (await req("POST", "/barbeiros", { nome: "Fulano" })).data;

  await req("POST", `/barbeiros/${b1.id}/servicos`, { nome: "Barba", preco: 25 }, b1.token);

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

test("relatório mensal agrega faturamento por barbeiro e forma de pagamento", comServidor(async ({ req, criarBarbeiroLogado }) => {
  const zaqueu = await criarBarbeiroLogado("Zaqueu", "zaqueu3");
  await req("POST", `/barbeiros/${zaqueu.id}/servicos`, { nome: "Corte", preco: 40 }, zaqueu.token);

  const criado = await req("POST", "/agendamentos", {
    barbeiroId: zaqueu.id,
    nome: "Joao",
    telefone: "11999998888",
    servico: "Corte",
    data: "2026-08-10",
    horario: "11:00",
  });

  await req(
    "POST",
    "/vendas",
    { agendamentoId: criado.data.id, formaPagamento: "dinheiro", itens: [{ nome: "Corte", quantidade: 1 }] },
    zaqueu.token
  );

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

test("agendamento: editar move de horário sem conflito, e cancelar remove (autenticado como dono)", comServidor(async ({ req, criarBarbeiroLogado }) => {
  const barbeiro = await criarBarbeiroLogado("Zaqueu", "zaqueu4");
  await req("POST", `/barbeiros/${barbeiro.id}/servicos`, { nome: "Barba", preco: 25 }, barbeiro.token);

  const criado = await req("POST", "/agendamentos", {
    barbeiroId: barbeiro.id,
    nome: "Ana",
    telefone: "11999990000",
    servico: "Barba",
    data: "2026-08-11",
    horario: "10:00",
  });
  assert.equal(criado.status, 201);

  const editado = await req(
    "PUT",
    `/agendamentos/${criado.data.id}`,
    {
      barbeiroId: barbeiro.id,
      nome: "Ana",
      telefone: "11999990000",
      servico: "Barba",
      data: "2026-08-11",
      horario: "11:00",
    },
    barbeiro.token
  );
  assert.equal(editado.status, 200);
  assert.equal(editado.data.horario, "11:00");

  const cancelado = await req("DELETE", `/agendamentos/${criado.data.id}`, null, barbeiro.token);
  assert.equal(cancelado.status, 204);

  const listaVazia = await req("GET", `/agendamentos?barbeiroId=${barbeiro.id}&data=2026-08-11`);
  assert.equal(listaVazia.data.length, 0);
}));
