// Helpers de data real (formato 'YYYY-MM-DD', o mesmo usado pelo backend)
// para a agenda do dia por barbeiro e pros relatórios mensais.

function paraISO(d) {
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

export function hojeISO() {
  return paraISO(new Date());
}

export function adicionarDias(dataISO, quantidade) {
  const [ano, mes, dia] = dataISO.split("-").map(Number);
  const d = new Date(ano, mes - 1, dia);
  d.setDate(d.getDate() + quantidade);
  return paraISO(d);
}

export function ehHoje(dataISO) {
  return dataISO === hojeISO();
}

// "Ter, 12 de agosto"
export function formatarDataExibicao(dataISO) {
  const [ano, mes, dia] = dataISO.split("-").map(Number);
  const d = new Date(ano, mes - 1, dia);
  const formatado = new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "long",
  }).format(d);
  return formatado.charAt(0).toUpperCase() + formatado.slice(1);
}

// "Terça-feira" — usado como rótulo de dia da semana onde fizer sentido.
export function nomeDiaSemana(dataISO) {
  const [ano, mes, dia] = dataISO.split("-").map(Number);
  const d = new Date(ano, mes - 1, dia);
  const nome = new Intl.DateTimeFormat("pt-BR", { weekday: "long" }).format(d);
  return nome.charAt(0).toUpperCase() + nome.slice(1);
}

export function mesAtualISO() {
  return hojeISO().slice(0, 7); // 'YYYY-MM'
}

// Formata um timestamp ISO8601 (vindo do Postgres, ex.: cancelado_em) como
// "12/08/2026 14:30" — usado em listas de histórico, não na agenda por dia.
export function formatarDataHoraExibicao(isoString) {
  if (!isoString) return "—";
  return new Date(isoString).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}
