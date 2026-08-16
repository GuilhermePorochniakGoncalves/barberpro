import { test, expect } from "@playwright/test";

// Reaproveita o barbeiro/serviço criados em 02-fluxo-completo.spec.js
// (mesmo banco em memória, ver playwright.config.js) — testa o link que a
// barbearia divulga pro cliente final marcar sozinho, sem senha nenhuma.
test("cliente agenda sozinho pelo link público (raiz do site)", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("Escolha o barbeiro")).toBeVisible();
  await page.getByText("Zaqueu E2E").click();

  await expect(page.getByText("Escolha o serviço")).toBeVisible();
  await page.getByText("Corte E2E").click();

  await expect(page.getByText("Escolha data e horário")).toBeVisible();
  // Pega um horário livre (não o das 09:00 já usado no fluxo interno).
  const livre = page.getByRole("button", { name: /^\d{2}:\d{2}$/ }).first();
  await livre.click();

  await page.getByPlaceholder("Seu nome").fill("Cliente Público E2E");
  await page.getByPlaceholder("Seu telefone").fill("11988887777");
  await page.getByRole("button", { name: "Confirmar agendamento" }).click();

  await expect(page.getByText("Agendamento confirmado!")).toBeVisible();
  await expect(page.getByText("Cliente Público E2E")).toBeVisible();
});
