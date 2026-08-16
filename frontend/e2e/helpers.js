// Helpers compartilhados entre os specs de e2e/ — a senha aqui precisa
// bater com PANEL_PASSWORD definida em playwright.config.js.
export const SENHA_PAINEL = "e2e-senha-teste";

export async function entrarNoPainel(page) {
  await page.goto("/painel");
  const senhaInput = page.locator('input[type="password"]');
  if (await senhaInput.isVisible().catch(() => false)) {
    await senhaInput.fill(SENHA_PAINEL);
    await page.getByRole("button", { name: "Entrar" }).click();
  }
  await page.getByText("Dashboard da Barbearia").waitFor();
}
