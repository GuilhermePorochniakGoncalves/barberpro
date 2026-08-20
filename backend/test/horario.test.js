// Testa os limites de dia/mês em Brasília isoladamente (sem servidor/banco)
// — é a lógica que corrige o bug de "venda da noite sumia do fechamento
// do dia" (ver comentário em horario.js e server.js).
const test = require("node:test");
const assert = require("node:assert/strict");
const { limitesDoDiaBrasilia, limitesDoMesBrasilia } = require("../horario");

test("limitesDoDiaBrasilia: 00:00 de Brasília é 03:00 UTC do mesmo dia", () => {
  const [inicio, fim] = limitesDoDiaBrasilia("2026-08-19");
  assert.equal(inicio, "2026-08-19T03:00:00.000Z");
  assert.equal(fim, "2026-08-20T03:00:00.000Z");
});

test("limitesDoDiaBrasilia: uma venda às 22h de Brasília cai dentro do dia certo", () => {
  // 2026-08-19 22:00 em Brasília (UTC-3) = 2026-08-20 01:00 UTC — é
  // exatamente esse horário que sumia do fechamento "de hoje" antes da
  // correção (criado_em::date, com o servidor em UTC, já achava que era
  // dia 20).
  const vendaUTC = new Date("2026-08-20T01:00:00.000Z").getTime();
  const [inicio, fim] = limitesDoDiaBrasilia("2026-08-19");
  assert.ok(vendaUTC >= new Date(inicio).getTime());
  assert.ok(vendaUTC < new Date(fim).getTime());

  // E não deve cair no "dia 20" (fuso errado antigo).
  const [inicio20, fim20] = limitesDoDiaBrasilia("2026-08-20");
  assert.ok(!(vendaUTC >= new Date(inicio20).getTime() && vendaUTC < new Date(fim20).getTime()));
});

test("limitesDoMesBrasilia: cobre o mês inteiro e vira o mês certo em dezembro", () => {
  const [inicio, fim] = limitesDoMesBrasilia("2026-08");
  assert.equal(inicio, "2026-08-01T03:00:00.000Z");
  assert.equal(fim, "2026-09-01T03:00:00.000Z");

  const [inicioDez, fimDez] = limitesDoMesBrasilia("2026-12");
  assert.equal(inicioDez, "2026-12-01T03:00:00.000Z");
  assert.equal(fimDez, "2027-01-01T03:00:00.000Z"); // ano vira também
});
