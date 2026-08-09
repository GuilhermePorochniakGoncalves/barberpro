import { describe, expect, it } from "vitest";
import { corAvatar, iniciais } from "./avatar";

describe("iniciais", () => {
  it("usa a 1ª e a última palavra do nome", () => {
    expect(iniciais("Joao Silva")).toBe("JS");
    expect(iniciais("Maria Clara Souza")).toBe("MS");
  });

  it("usa as 2 primeiras letras quando há só uma palavra", () => {
    expect(iniciais("Zaqueu")).toBe("ZA");
  });

  it("devolve '?' pra nome vazio", () => {
    expect(iniciais("")).toBe("?");
    expect(iniciais("   ")).toBe("?");
  });

  it("sempre em maiúsculas", () => {
    expect(iniciais("ana beatriz")).toBe("AB");
  });
});

describe("corAvatar", () => {
  it("é determinística — mesmo nome sempre gera a mesma cor", () => {
    expect(corAvatar("Zaqueu")).toBe(corAvatar("Zaqueu"));
  });

  it("devolve uma classe Tailwind bg-*-*", () => {
    expect(corAvatar("Zaqueu")).toMatch(/^bg-[a-z]+-\d+$/);
  });
});
