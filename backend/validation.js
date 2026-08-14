// Slots de 30 em 30 minutos, 08:00–18:30, com almoço (12:00–13:00) fora.
// Espelhado em frontend/src/constants/schedule.js — se mudar aqui, mude lá também.
function gerarHorarios() {
  const horarios = [];
  for (let minutos = 8 * 60; minutos < 19 * 60; minutos += 30) {
    if (minutos >= 12 * 60 && minutos < 13 * 60) continue; // almoço
    const h = String(Math.floor(minutos / 60)).padStart(2, "0");
    const m = String(minutos % 60).padStart(2, "0");
    horarios.push(`${h}:${m}`);
  }
  return horarios;
}

const HORARIOS_VALIDOS = gerarHorarios();

const FORMAS_PAGAMENTO_VALIDAS = ["debito", "credito", "dinheiro", "pix"];
const CATEGORIAS_DESPESA_VALIDAS = ["aluguel", "produtos", "contas", "salario", "manutencao", "outros"];

const DATA_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function dataValida(data) {
  if (!DATA_REGEX.test(data)) return false;
  const d = new Date(`${data}T00:00:00`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === data;
}

// `servicosValidos`: nomes ativos do catálogo (busca fica a cargo de quem
// chama, em server.js, pra manter este módulo sem dependência do banco).
// A duração do serviço NÃO é validada aqui — quem chama busca a duração
// atual do serviço escolhido no catálogo e a grava no agendamento (ver
// server.js), então esse módulo só valida que o nome do serviço existe.
function validarAgendamento(body = {}, servicosValidos = []) {
  const errors = [];

  const barbeiroId = Number(body.barbeiroId);
  const nome = String(body.nome ?? "").trim();
  const telefone = String(body.telefone ?? "").replace(/\D/g, "");
  const servico = String(body.servico ?? "").trim();
  const data = String(body.data ?? "").trim();
  const horario = String(body.horario ?? "").trim();

  if (!Number.isInteger(barbeiroId) || barbeiroId <= 0) {
    errors.push("Barbeiro é obrigatório.");
  }

  if (!nome) {
    errors.push("Nome é obrigatório.");
  } else if (nome.length < 2) {
    errors.push("Nome muito curto.");
  }

  if (!telefone) {
    errors.push("Telefone é obrigatório.");
  } else if (telefone.length < 10 || telefone.length > 11) {
    errors.push("Telefone inválido. Informe DDD + número (10 ou 11 dígitos).");
  }

  if (!servico) {
    errors.push("Serviço é obrigatório.");
  } else if (!servicosValidos.includes(servico)) {
    // Lista vazia (barbeiro sem nenhum serviço cadastrado) também cai aqui —
    // corretamente rejeita, em vez de aceitar qualquer nome sem checar.
    errors.push(
      servicosValidos.length > 0
        ? `Serviço inválido. Opções válidas: ${servicosValidos.join(", ")}.`
        : "Esse barbeiro ainda não tem nenhum serviço cadastrado."
    );
  }

  if (!dataValida(data)) {
    errors.push("Data inválida. Use o formato AAAA-MM-DD.");
  }

  if (!HORARIOS_VALIDOS.includes(horario)) {
    errors.push(`Horário inválido. Opções válidas: ${HORARIOS_VALIDOS.join(", ")}.`);
  }

  return {
    errors,
    valido: errors.length === 0,
    data: { barbeiroId, nome, telefone, servico, data, horario },
  };
}

const OBSERVACOES_MAX = 500;

// `observacoes`: texto livre opcional (preferências/alergias/observações
// do cliente — ex.: "gosta de degradê baixo", "alérgico a produto X").
// String vazia vira `null` (sem observação), não fica salvando "".
function validarCliente(body = {}) {
  const errors = [];

  const nome = String(body.nome ?? "").trim();
  const telefone = String(body.telefone ?? "").replace(/\D/g, "");
  const observacoesBrutas = String(body.observacoes ?? "").trim();

  if (!nome) errors.push("Nome é obrigatório.");
  if (!telefone || telefone.length < 10 || telefone.length > 11) {
    errors.push("Telefone inválido. Informe DDD + número (10 ou 11 dígitos).");
  }
  if (observacoesBrutas.length > OBSERVACOES_MAX) {
    errors.push(`Observações muito longas (máximo ${OBSERVACOES_MAX} caracteres).`);
  }

  return {
    errors,
    valido: errors.length === 0,
    data: { nome, telefone, observacoes: observacoesBrutas || null },
  };
}

function validarBarbeiro(body = {}) {
  const errors = [];
  const nome = String(body.nome ?? "").trim();

  if (!nome) errors.push("Nome é obrigatório.");
  else if (nome.length < 2) errors.push("Nome muito curto.");

  return {
    errors,
    valido: errors.length === 0,
    data: { nome },
  };
}

// `itensValidos`: Map<nome, {tipo, preco}> do catálogo ativo, usado pra
// validar e precificar cada item da venda a partir do servidor (nunca
// confiar no preço mandado pelo cliente).
//
// `pagamentos`: array de { formaPagamento, valor } — permite dividir o
// pagamento entre formas diferentes (ex.: metade pix, metade cartão). A
// soma dos valores precisa bater com o total dos itens. Quando há mais de
// uma forma, o resumo gravado em `vendas.forma_pagamento` vira "misto";
// o detalhamento real fica em `venda_pagamentos` (ver server.js).
function validarVenda(body = {}, itensValidos = new Map()) {
  const errors = [];

  const agendamentoId = Number(body.agendamentoId);
  const itensBrutos = Array.isArray(body.itens) ? body.itens : [];
  const pagamentosBrutos = Array.isArray(body.pagamentos) ? body.pagamentos : [];

  if (!Number.isInteger(agendamentoId) || agendamentoId <= 0) {
    errors.push("Agendamento é obrigatório.");
  }

  if (itensBrutos.length === 0) {
    errors.push("Informe ao menos um item (o serviço agendado).");
  }

  const itens = [];
  for (const item of itensBrutos) {
    const nome = String(item?.nome ?? "").trim();
    const quantidade = Number(item?.quantidade ?? 1);
    const catalogado = itensValidos.get(nome);

    if (!catalogado) {
      errors.push(`Item "${nome}" não existe no catálogo.`);
      continue;
    }
    if (!Number.isInteger(quantidade) || quantidade <= 0) {
      errors.push(`Quantidade inválida para "${nome}".`);
      continue;
    }

    itens.push({
      id: catalogado.id,
      descricao: nome,
      tipo: catalogado.tipo,
      preco: catalogado.preco,
      quantidade,
    });
  }

  const valorTotal = Math.round(itens.reduce((soma, i) => soma + i.preco * i.quantidade, 0) * 100) / 100;

  if (pagamentosBrutos.length === 0) {
    errors.push("Informe ao menos uma forma de pagamento.");
  }

  const pagamentos = [];
  for (const pagamento of pagamentosBrutos) {
    const formaPagamento = String(pagamento?.formaPagamento ?? "").trim();
    const valor = Number(pagamento?.valor);

    if (!FORMAS_PAGAMENTO_VALIDAS.includes(formaPagamento)) {
      errors.push(`Forma de pagamento inválida. Opções válidas: ${FORMAS_PAGAMENTO_VALIDAS.join(", ")}.`);
      continue;
    }
    if (!Number.isFinite(valor) || valor <= 0) {
      errors.push("Valor de pagamento inválido.");
      continue;
    }
    pagamentos.push({ formaPagamento, valor: Math.round(valor * 100) / 100 });
  }

  const somaPagamentos = Math.round(pagamentos.reduce((soma, p) => soma + p.valor, 0) * 100) / 100;

  if (pagamentos.length > 0 && itens.length > 0 && somaPagamentos !== valorTotal) {
    errors.push(
      `A soma dos pagamentos (R$ ${somaPagamentos.toFixed(2)}) precisa bater com o total (R$ ${valorTotal.toFixed(2)}).`
    );
  }

  const formaPagamentoResumo = pagamentos.length > 1 ? "misto" : (pagamentos[0]?.formaPagamento ?? null);

  return {
    errors,
    valido: errors.length === 0,
    data: { agendamentoId, itens, valorTotal, pagamentos, formaPagamentoResumo },
  };
}

// `duracaoMinutos`: quanto tempo esse serviço ocupa na agenda — grava no
// agendamento no momento em que é marcado (snapshot), então mudar a
// duração de um serviço depois não altera agendamentos já feitos.
function validarServico(body = {}) {
  const errors = [];

  const nome = String(body.nome ?? "").trim();
  const preco = Number(body.preco);
  const duracaoMinutos = Number(body.duracaoMinutos ?? 30);

  if (!nome) errors.push("Nome do serviço é obrigatório.");
  if (!Number.isFinite(preco) || preco <= 0) errors.push("Preço inválido.");
  if (!Number.isInteger(duracaoMinutos) || duracaoMinutos < 5 || duracaoMinutos > 480) {
    errors.push("Duração inválida. Informe minutos entre 5 e 480.");
  }

  return { errors, valido: errors.length === 0, data: { nome, preco, duracaoMinutos } };
}

function validarProduto(body = {}) {
  const errors = [];

  const nome = String(body.nome ?? "").trim();
  const preco = Number(body.preco);
  const estoque = Number(body.estoque);

  if (!nome) errors.push("Nome do produto é obrigatório.");
  if (!Number.isFinite(preco) || preco <= 0) errors.push("Preço inválido.");
  if (!Number.isInteger(estoque) || estoque < 0) errors.push("Estoque inválido.");

  return { errors, valido: errors.length === 0, data: { nome, preco, estoque } };
}

// `horario` é opcional: ausente/null bloqueia o dia inteiro.
function validarBloqueio(body = {}) {
  const errors = [];

  const data = String(body.data ?? "").trim();
  const horarioBruto = body.horario;
  const horario = horarioBruto ? String(horarioBruto).trim() : null;

  if (!dataValida(data)) errors.push("Data inválida. Use o formato AAAA-MM-DD.");
  if (horario && !HORARIOS_VALIDOS.includes(horario)) {
    errors.push(`Horário inválido. Opções válidas: ${HORARIOS_VALIDOS.join(", ")}.`);
  }

  return { errors, valido: errors.length === 0, data: { data, horario } };
}

// Entrar na lista de espera de um horário/dia lotado. `servico` é só
// informativo (não trava contra o catálogo — o cliente pode nem ter
// escolhido um serviço específico ainda).
function validarListaEspera(body = {}) {
  const errors = [];

  const nome = String(body.nome ?? "").trim();
  const telefone = String(body.telefone ?? "").replace(/\D/g, "");
  const servico = body.servico ? String(body.servico).trim() : null;
  const data = String(body.data ?? "").trim();
  const horario = String(body.horario ?? "").trim();

  if (!nome) errors.push("Nome é obrigatório.");
  if (!telefone || telefone.length < 10 || telefone.length > 11) {
    errors.push("Telefone inválido. Informe DDD + número (10 ou 11 dígitos).");
  }
  if (!dataValida(data)) errors.push("Data inválida. Use o formato AAAA-MM-DD.");
  if (!HORARIOS_VALIDOS.includes(horario)) {
    errors.push(`Horário inválido. Opções válidas: ${HORARIOS_VALIDOS.join(", ")}.`);
  }

  return { errors, valido: errors.length === 0, data: { nome, telefone, servico, data, horario } };
}

// Saída de caixa (aluguel, compra de produto, conta, etc.) — pra separar
// faturamento bruto (vendas) de lucro real (vendas - despesas).
function validarDespesa(body = {}) {
  const errors = [];

  const descricao = String(body.descricao ?? "").trim();
  const categoria = String(body.categoria ?? "outros").trim();
  const valor = Number(body.valor);
  const data = String(body.data ?? "").trim();

  if (!descricao) errors.push("Descrição é obrigatória.");
  if (!Number.isFinite(valor) || valor <= 0) errors.push("Valor inválido.");
  if (!dataValida(data)) errors.push("Data inválida. Use o formato AAAA-MM-DD.");
  if (!CATEGORIAS_DESPESA_VALIDAS.includes(categoria)) {
    errors.push(`Categoria inválida. Opções válidas: ${CATEGORIAS_DESPESA_VALIDAS.join(", ")}.`);
  }

  return {
    errors,
    valido: errors.length === 0,
    data: { descricao, categoria, valor: Math.round(valor * 100) / 100, data },
  };
}

module.exports = {
  HORARIOS_VALIDOS,
  FORMAS_PAGAMENTO_VALIDAS,
  CATEGORIAS_DESPESA_VALIDAS,
  dataValida,
  validarAgendamento,
  validarCliente,
  validarBarbeiro,
  validarVenda,
  validarServico,
  validarProduto,
  validarBloqueio,
  validarListaEspera,
  validarDespesa,
};
