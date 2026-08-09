import { describe, expect, it } from "vitest";
import { formatarTelefone } from "./schedule";

describe("formatarTelefone", () => {
  it("formata progressivamente enquanto o usuário digita", () => {
    expect(formatarTelefone("1")).toBe("1");
    expect(formatarTelefone("11")).toBe("11");
    expect(formatarTelefone("119999")).toBe("(11) 9999");
    expect(formatarTelefone("11999998888")).toBe("(11) 99999-8888");
  });

  it("formata telefone fixo (10 dígitos)", () => {
    expect(formatarTelefone("1133334444")).toBe("(11) 3333-4444");
  });

  it("ignora caracteres não numéricos", () => {
    expect(formatarTelefone("(11) 99999-8888")).toBe("(11) 99999-8888");
  });

  it("trunca em 11 dígitos", () => {
    expect(formatarTelefone("119999988889999")).toBe("(11) 99999-8888");
  });
});
