import { describe, expect, it } from "vitest";
import { adicionarDias, ehHoje, formatarDataExibicao, hojeISO, mesAtualISO, nomeDiaSemana } from "./date";

describe("adicionarDias", () => {
  it("soma dias dentro do mesmo mês", () => {
    expect(adicionarDias("2026-08-10", 1)).toBe("2026-08-11");
  });

  it("subtrai dias", () => {
    expect(adicionarDias("2026-08-10", -1)).toBe("2026-08-09");
  });

  it("atravessa a virada do mês", () => {
    expect(adicionarDias("2026-08-31", 1)).toBe("2026-09-01");
  });

  it("atravessa a virada do ano", () => {
    expect(adicionarDias("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("lida com ano bissexto (fevereiro de 2028 tem 29 dias)", () => {
    expect(adicionarDias("2028-02-28", 1)).toBe("2028-02-29");
    expect(adicionarDias("2028-02-29", 1)).toBe("2028-03-01");
  });
});

describe("hojeISO / ehHoje", () => {
  it("hojeISO devolve uma data no formato YYYY-MM-DD", () => {
    expect(hojeISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("ehHoje é verdadeiro só pra data de hoje", () => {
    expect(ehHoje(hojeISO())).toBe(true);
    expect(ehHoje("2000-01-01")).toBe(false);
  });
});

describe("formatarDataExibicao / nomeDiaSemana", () => {
  it("formata com dia da semana abreviado, dia e mês por extenso", () => {
    // 2026-08-10 é uma segunda-feira.
    expect(formatarDataExibicao("2026-08-10")).toMatch(/^Seg\.?, 10 de agosto$/i);
  });

  it("nomeDiaSemana devolve o nome completo capitalizado", () => {
    expect(nomeDiaSemana("2026-08-10")).toBe("Segunda-feira");
  });
});

describe("mesAtualISO", () => {
  it("devolve os 7 primeiros caracteres de hojeISO (YYYY-MM)", () => {
    expect(mesAtualISO()).toBe(hojeISO().slice(0, 7));
    expect(mesAtualISO()).toMatch(/^\d{4}-\d{2}$/);
  });
});
