// Constantes compartilhadas do fluxo de agendamento.
// Mantidas em espelho com backend/validation.js — se mudar aqui, mude lá também.
//
// `DIAS` e `SERVICOS` fixos saíram daqui: dia agora é uma data real
// (frontend/src/utils/date.js) e os serviços vêm do catálogo do backend
// (com preço, por barbeiro) via GET /catalogo?barbeiroId=, buscado pela
// página que precisa (ver Agenda.jsx) — não é mais um contexto global, já
// que o catálogo de serviços é por-barbeiro.

// Slots de 30 em 30 minutos, 08:00–18:30, com almoço (12:00–13:00) fora —
// cada serviço tem sua própria duração (ver duracaoMinutos no catálogo),
// então um agendamento pode ocupar mais de um slot seguido.
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

export const HORARIOS = gerarHorarios();

export function horarioParaMinutos(horario) {
  const [h, m] = horario.split(":").map(Number);
  return h * 60 + m;
}

export function minutosParaHorario(minutos) {
  const h = String(Math.floor(minutos / 60)).padStart(2, "0");
  const m = String(minutos % 60).padStart(2, "0");
  return `${h}:${m}`;
}

export function formatarDuracao(minutos) {
  if (minutos < 60) return `${minutos}min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return resto === 0 ? `${horas}h` : `${horas}h${resto}min`;
}

export function formatarTelefone(valor) {
  const digitos = valor.replace(/\D/g, "").slice(0, 11);

  if (digitos.length <= 2) return digitos;
  if (digitos.length <= 6) return `(${digitos.slice(0, 2)}) ${digitos.slice(2)}`;
  if (digitos.length <= 10) {
    return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 6)}-${digitos.slice(6)}`;
  }
  return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 7)}-${digitos.slice(7)}`;
}
