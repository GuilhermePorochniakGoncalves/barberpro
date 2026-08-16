import { test, expect } from "@playwright/test";
import { entrarNoPainel } from "./helpers";

// Fluxo real de ponta a ponta: cadastra barbeiro, cadastra serviço, marca
// horário, finaliza o atendimento e confere que entrou no relatório do
// dia. Roda contra o backend com banco em memória (pg-mem) — estado
// persiste entre specs dentro da mesma execução (ver playwright.config.js:
// workers:1), então os specs seguintes reaproveitam o que é criado aqui.
test("cadastra barbeiro, serviço, agenda horário e finaliza atendimento", async ({ page }) => {
  await entrarNoPainel(page);

  // Barbeiro
  await page.getByRole("link", { name: "Barbeiros" }).click();
  await page.getByRole("button", { name: "Novo barbeiro" }).first().click();
  await page.getByPlaceholder("Nome do barbeiro").fill("Zaqueu E2E");
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Zaqueu E2E")).toBeVisible();

  // Agenda — abre a agenda do barbeiro recém-criado
  await page.getByRole("link", { name: "Agenda" }).click();
  await expect(page.getByRole("button", { name: /Zaqueu E2E/ })).toBeVisible();

  // Cadastra o serviço
  await page.getByText("Gerenciar serviços").click();
  await page.getByRole("button", { name: "Novo serviço" }).first().click();
  await page.getByPlaceholder("Nome (ex.: Corte Simples)").fill("Corte E2E");
  await page.getByPlaceholder("Preço").fill("50");
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Corte E2E")).toBeVisible();

  // Volta pra agenda e marca no primeiro horário livre
  await page.getByText("← Agenda").click();
  await page.getByText("Livre — clique para agendar").first().click();
  await page.getByPlaceholder("Nome do cliente").fill("Cliente E2E");
  await page.getByPlaceholder("Telefone").fill("11999998888");
  await page.locator("select").first().selectOption("Corte E2E");
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Cliente E2E")).toBeVisible();

  // Finaliza o atendimento (pagamento único, Pix)
  await page.getByRole("button", { name: "Finalizar atendimento" }).click();
  await page.getByRole("button", { name: "Pix", exact: true }).click();
  await expect(page.getByText("Pagamento completo")).toBeVisible();
  await page.getByRole("button", { name: "Confirmar pagamento" }).click();
  await expect(page.getByText("Concluído")).toBeVisible();

  // Aparece no fechamento do dia
  await page.getByRole("link", { name: "Relatórios" }).click();
  await expect(page.getByText("R$ 50,00").first()).toBeVisible();
});
