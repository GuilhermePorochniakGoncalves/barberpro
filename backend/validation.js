const HORARIOS_VALIDOS = [
  "08:00",
  "09:00",
  "10:00",
  "11:00",
  "13:00",
  "14:00",
  "15:00",
  "16:00",
  "17:00",
  "18:00",
];

const FORMAS_PAGAMENTO_VALIDAS = ["debito", "credito", "dinheiro", "pix"];

const DATA_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function dataValida(data) {
  if (!DATA_REGEX.test(data)) return false;
  const d = new Date(`${data}T00:00:00`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === data;
}

// `servicosValidos`: nomes ativos do catálogo (busca fica a cargo de quem
// chama, em server.js, pra manter este módulo sem dependência do banco).
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
  } else if (servicosValidos.length > 0 && !servicosValidos.includes(servico)) {
    errors.push(`Serviço inválido. Opções válidas: ${servicosValidos.join(", ")}.`);
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

function validarCliente(body = {}) {
  const errors = [];

  const nome = String(body.nome ?? "").trim();
  const telefone = String(body.telefone ?? "").replace(/\D/g, "");

  if (!nome) errors.push("Nome é obrigatório.");
  if (!telefone || telefone.length < 10 || telefone.length > 11) {
    errors.push("Telefone inválido. Informe DDD + número (10 ou 11 dígitos).");
  }

  return {
    errors,
    valido: errors.length === 0,
    data: { nome, telefone },
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
function validarVenda(body = {}, itensValidos = new Map()) {
  const errors = [];

  const agendamentoId = Number(body.agendamentoId);
  const formaPagamento = String(body.formaPagamento ?? "").trim();
  const itensBrutos = Array.isArray(body.itens) ? body.itens : [];

  if (!Number.isInteger(agendamentoId) || agendamentoId <= 0) {
    errors.push("Agendamento é obrigatório.");
  }

  if (!FORMAS_PAGAMENTO_VALIDAS.includes(formaPagamento)) {
    errors.push(
      `Forma de pagamento inválida. Opções válidas: ${FORMAS_PAGAMENTO_VALIDAS.join(", ")}.`
    );
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
      descricao: nome,
      tipo: catalogado.tipo,
      preco: catalogado.preco,
      quantidade,
    });
  }

  const valorTotal = itens.reduce((soma, i) => soma + i.preco * i.quantidade, 0);

  return {
    errors,
    valido: errors.length === 0,
    data: { agendamentoId, formaPagamento, itens, valorTotal },
  };
}

module.exports = {
  HORARIOS_VALIDOS,
  FORMAS_PAGAMENTO_VALIDAS,
  dataValida,
  validarAgendamento,
  validarCliente,
  validarBarbeiro,
  validarVenda,
};
