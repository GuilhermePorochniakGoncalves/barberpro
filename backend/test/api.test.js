// Banco em memória, isolado do banco de desenvolvimento — precisa ser
// setado ANTES de importar o server/db (module-load lê DB_PATH uma vez).
process.env.DB_PATH = ":memory:";

const test = require("node:test");
const assert = require("node:assert/strict");
const app = require("../server");

// Sobe o app numa porta aleatória do SO por suite (evita conflito se os
// testes rodarem em paralelo) e devolve helpers de request.
function comServidor(fn) {
  return async () => {
    const server = app.listen(0);
    const { port } = server.address();
    const base = `http://localhost:${port}`;

    async function req(method, path, body) {
      const response = await fetch(base + path, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = response.status === 204 ? null : await response.json();
      return { status: response.status, data };
    }

    try {
      await fn({ req });
    } finally {
      server.close();
    }
  };
}

test("health check responde ok", comServidor(async ({ req }) => {
  const { status, data } = await req("GET", "/health");
  assert.equal(status, 200);
  assert.deepEqual(data, { status: "ok" });
}));

test("catálogo vem semeado (serviços e produtos com preço)", comServidor(async ({ req }) => {
  const { status, data } = await req("GET", "/catalogo");
  assert.equal(status, 200);
  assert.ok(data.length > 0);
  assert.ok(data.some((i) => i.tipo === "servico" && i.preco > 0));
  assert.ok(data.some((i) => i.tipo === "produto" && i.preco > 0));
}));

test("barbeiro: criar, validar nome vazio", comServidor(async ({ req }) => {
  const vazio = await req("POST", "/barbeiros", { nome: "" });
  assert.equal(vazio.status, 400);

  const ok = await req("POST", "/barbeiros", { nome: "Zaqueu" });
  assert.equal(ok.status, 201);
  assert.equal(ok.data.nome, "Zaqueu");
  assert.equal(ok.data.ativo, 1);
}));

test("fluxo completo: agendar, bloquear conflito no mesmo barbeiro, permitir em outro barbeiro, finalizar atendimento e ver no relatório", comServidor(async ({ req }) => {
  const b1 = (await req("POST", "/barbeiros", { nome: "Zaqueu" })).data;
  const b2 = (await req("POST", "/barbeiros", { nome: "Fulano" })).data;

  const dadosAgendamento = {
    barbeiroId: b1.id,
    nome: "Joao",
    telefone: "11999998888",
    servico: "Corte masculino",
    data: "2026-08-10",
    horario: "09:00",
  };

  const criado = await req("POST", "/agendamentos", dadosAgendamento);
  assert.equal(criado.status, 201);
  assert.equal(criado.data.status, "agendado");

  // Mesmo barbeiro, mesmo dia/horário -> conflito.
  const conflito = await req("POST", "/agendamentos", {
    ...dadosAgendamento,
    nome: "Pedro",
    telefone: "11988887777",
  });
  assert.equal(conflito.status, 409);

  // Outro barbeiro, mesmo dia/horário -> permitido.
  const outroBarbeiro = await req("POST", "/agendamentos", {
    ...dadosAgendamento,
    barbeiroId: b2.id,
    nome: "Carlos",
    telefone: "11977776666",
  });
  assert.equal(outroBarbeiro.status, 201);

  // Validação: telefone inválido.
  const invalido = await req("POST", "/agendamentos", {
    ...dadosAgendamento,
    horario: "10:00",
    telefone: "123",
  });
  assert.equal(invalido.status, 400);

  // Finalizar atendimento (venda).
  const venda = await req("POST", "/vendas", {
    agendamentoId: criado.data.id,
    formaPagamento: "pix",
    itens: [{ nome: "Corte masculino", quantidade: 1 }, { nome: "Bebida", quantidade: 2 }],
  });
  assert.equal(venda.status, 201);
  assert.equal(venda.data.valor_total, 40 + 8 * 2);

  // Não pode finalizar de novo.
  const vendaDuplicada = await req("POST", "/vendas", {
    agendamentoId: criado.data.id,
    formaPagamento: "pix",
    itens: [{ nome: "Corte masculino", quantidade: 1 }],
  });
  assert.equal(vendaDuplicada.status, 409);

  // Não pode cancelar um atendimento já concluído.
  const cancelarConcluido = await req("DELETE", `/agendamentos/${criado.data.id}`);
  assert.equal(cancelarConcluido.status, 409);

  // Aparece no relatório do mês.
  const relatorio = await req("GET", "/relatorios/mensal?mes=2026-08");
  assert.equal(relatorio.status, 200);
  assert.equal(relatorio.data.totalAtendimentos, 1);
  assert.equal(relatorio.data.faturamentoTotal, 56);
  assert.equal(relatorio.data.porBarbeiro[0].barbeiro, "Zaqueu");
  assert.equal(relatorio.data.porFormaPagamento[0].formaPagamento, "pix");

  // E no histórico do cliente.
  const clientes = await req("GET", "/clientes");
  const joao = clientes.data.find((c) => c.telefone === "11999998888");
  assert.ok(joao.ultimo_atendimento);
}));

test("agendamento: editar move de horário sem conflito, e cancelar remove", comServidor(async ({ req }) => {
  const barbeiro = (await req("POST", "/barbeiros", { nome: "Zaqueu" })).data;

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
  assert.equal(cancelado.status, 204);

  const listaVazia = await req("GET", `/agendamentos?barbeiroId=${barbeiro.id}&data=2026-08-11`);
  assert.equal(listaVazia.data.length, 0);
}));
