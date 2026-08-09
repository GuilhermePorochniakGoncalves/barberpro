// Constantes compartilhadas do fluxo de agendamento.
// Mantidas em espelho com backend/validation.js — se mudar aqui, mude lá também.
//
// `DIAS` e `SERVICOS` fixos saíram daqui: dia agora é uma data real
// (frontend/src/utils/date.js) e os serviços vêm do catálogo do backend
// (com preço), consumido via useBarbeiros().catalogo.

export const HORARIOS = [
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

export function formatarTelefone(valor) {
  const digitos = valor.replace(/\D/g, "").slice(0, 11);

  if (digitos.length <= 2) return digitos;
  if (digitos.length <= 6) return `(${digitos.slice(0, 2)}) ${digitos.slice(2)}`;
  if (digitos.length <= 10) {
    return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 6)}-${digitos.slice(6)}`;
  }
  return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 7)}-${digitos.slice(7)}`;
}
