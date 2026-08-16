import { test, expect } from "@playwright/test";
import { SENHA_PAINEL } from "./helpers";

test("raiz é a página pública, /painel exige senha, senha errada barra e senha certa entra", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("Escolha o barbeiro")).toBeVisible();

  await page.goto("/painel");
  await expect(page.getByText("Senha da barbearia")).toBeVisible();

  await page.locator('input[type="password"]').fill("senha-errada-de-proposito");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("Senha incorreta.")).toBeVisible();

  await page.locator('input[type="password"]').fill(SENHA_PAINEL);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("Dashboard da Barbearia")).toBeVisible();
});
