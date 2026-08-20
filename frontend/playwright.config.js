import { defineConfig } from "@playwright/test";

// E2E roda contra um backend com banco em memória (mesmo pg-mem dos testes
// do backend, NODE_ENV=test) — cada execução começa com um banco limpo e
// previsível, sem tocar no Postgres real (Neon). Portas diferentes das de
// dev (3001/5173) pra não colidir se `npm run dev` já estiver rodando.
const PORTA_BACKEND = 3011;
const PORTA_FRONTEND = 5183;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // banco em memória compartilhado entre os testes de um worker
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORTA_FRONTEND}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // O backend bucketa dia/mês em horário de Brasília, fixo, não importa
    // onde o servidor rode (ver backend/horario.js). Sem isso, o navegador
    // do teste herda o fuso da máquina que roda o Playwright — em CI
    // (GitHub Actions) isso é UTC, que descasa da data que o backend
    // considera "hoje" bem à noite/começo da madrugada. Fixando aqui, o
    // teste sempre simula o que um usuário de verdade (no Brasil) veria.
    timezoneId: "America/Sao_Paulo",
  },
  webServer: [
    {
      command: "node server.js",
      cwd: "../backend",
      env: {
        NODE_ENV: "test",
        PORT: String(PORTA_BACKEND),
        PANEL_PASSWORD: "e2e-senha-teste",
        CORS_ORIGIN: "*",
      },
      port: PORTA_BACKEND,
      reuseExistingServer: false,
      stdout: "pipe",
    },
    {
      command: `npx vite --port ${PORTA_FRONTEND} --strictPort`,
      cwd: ".",
      env: {
        VITE_API_URL: `http://localhost:${PORTA_BACKEND}`,
      },
      port: PORTA_FRONTEND,
      reuseExistingServer: false,
      stdout: "pipe",
    },
  ],
});
