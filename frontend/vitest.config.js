import { defineConfig } from "vitest/config";

// Só testamos funções puras (utils/) por enquanto — sem JSX/DOM envolvido,
// então o ambiente "node" basta (mais rápido, sem precisar de jsdom).
export default defineConfig({
  test: {
    environment: "node",
  },
});
