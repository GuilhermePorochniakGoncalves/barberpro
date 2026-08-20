// [início, fim) em UTC de um dia/mês civil de Brasília, em ISO — usado pra
// filtrar `criado_em` (timestamptz) por dia sem depender do fuso da sessão
// do Postgres. Comparar com `criado_em::date` parecia mais simples, mas o
// cast usa o fuso do SERVIDOR (normalmente UTC): à noite no Brasil
// (UTC-3), já é "amanhã" em UTC, e uma venda das 22h sumia do fechamento
// "de hoje". `SET TIME ZONE` por conexão também não é confiável aqui — o
// Neon usa PgBouncer em modo transação na connection string "pooled", que
// não garante que um SET de uma conexão sobreviva pra próxima query. Um
// range de timestamp absoluto (calculado aqui, não no banco) funciona
// sempre, em qualquer motor — inclusive no pg-mem dos testes, que não
// suporta `AT TIME ZONE`. Brasil não tem mais horário de verão desde
// 2019, então o offset -03:00 é fixo o ano inteiro.
function limitesDoDiaBrasilia(dataISO) {
  const inicio = new Date(`${dataISO}T00:00:00-03:00`);
  const fim = new Date(inicio.getTime() + 24 * 60 * 60 * 1000);
  return [inicio.toISOString(), fim.toISOString()];
}

// Mesma ideia, pro mês inteiro (usado no relatório mensal).
function limitesDoMesBrasilia(mesISO) {
  const [ano, mes] = mesISO.split("-").map(Number);
  const inicio = new Date(`${mesISO}-01T00:00:00-03:00`);
  const proximoAno = mes === 12 ? ano + 1 : ano;
  const proximoMes = mes === 12 ? 1 : mes + 1;
  const fim = new Date(`${proximoAno}-${String(proximoMes).padStart(2, "0")}-01T00:00:00-03:00`);
  return [inicio.toISOString(), fim.toISOString()];
}

module.exports = { limitesDoDiaBrasilia, limitesDoMesBrasilia };
