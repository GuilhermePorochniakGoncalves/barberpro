import { defineConfig } from "vitest/config";

// Só testamos funções puras (utils/) por enquanto — sem JSX/DOM envolvido,
// então o ambiente "node" basta (mais rápido, sem precisar de jsdom).
export default defineConfig({
  test: {
    environment: "node",
    // e2e/ são specs do Playwright (rodam com `npm run test:e2e`), não do
    // Vitest — sem isso, o Vitest tenta importar `test()` do Playwright e
    // quebra (as duas libs têm uma função `test` com assinatura incompatível).
    exclude: ["**/node_modules/**", "**/e2e/**"],
  },
});
