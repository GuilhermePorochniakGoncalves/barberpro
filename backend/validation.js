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
      id: catalogado.id,
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

// Login (usuário + senha) pra entrar. Usado em POST /barbeiros/login.
function validarCredenciaisLogin(body = {}) {
  const errors = [];

  const usuario = String(body.usuario ?? "").trim();
  const senha = String(body.senha ?? "");

  if (!usuario) errors.push("Usuário é obrigatório.");
  if (!senha) errors.push("Senha é obrigatória.");

  return { errors, valido: errors.length === 0, data: { usuario, senha } };
}

// Definir/trocar usuário+senha de um barbeiro. Usado em PUT /barbeiros/:id/login.
function validarDefinicaoLogin(body = {}) {
  const errors = [];

  const usuario = String(body.usuario ?? "").trim();
  const senha = String(body.senha ?? "");

  if (usuario.length < 3) errors.push("Usuário precisa ter ao menos 3 caracteres.");
  else if (!/^[a-zA-Z0-9._-]+$/.test(usuario)) {
    errors.push("Usuário só pode ter letras, números, ponto, hífen e underscore.");
  }
  if (senha.length < 6) errors.push("Senha precisa ter ao menos 6 caracteres.");

  return { errors, valido: errors.length === 0, data: { usuario, senha } };
}

function validarServico(body = {}) {
  const errors = [];

  const nome = String(body.nome ?? "").trim();
  const preco = Number(body.preco);

  if (!nome) errors.push("Nome do serviço é obrigatório.");
  if (!Number.isFinite(preco) || preco <= 0) errors.push("Preço inválido.");

  return { errors, valido: errors.length === 0, data: { nome, preco } };
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

module.exports = {
  HORARIOS_VALIDOS,
  FORMAS_PAGAMENTO_VALIDAS,
  dataValida,
  validarAgendamento,
  validarCliente,
  validarBarbeiro,
  validarVenda,
  validarCredenciaisLogin,
  validarDefinicaoLogin,
  validarServico,
  validarProduto,
  validarBloqueio,
};
