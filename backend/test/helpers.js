// Banco em memória (pg-mem), isolado do banco de desenvolvimento — precisa
// ser setado ANTES de importar o server/db (module-load decide qual banco
// usar uma vez só, olhando NODE_ENV).
process.env.NODE_ENV = "test";

const db = require("../db");
const app = require("../server");

// Sobe o app numa porta aleatória do SO por suite e devolve helpers de
// request. Compartilhado entre os arquivos de teste pra não duplicar.
function comServidor(fn) {
  return async () => {
    await db.ready;
    const server = app.listen(0);
    const { port } = server.address();
    const base = `http://localhost:${port}`;

    async function req(method, path, body) {
      const response = await fetch(base + path, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = response.status === 204 ? null : await response.json();
      return { status: response.status, data };
    }

    async function criarBarbeiro(nome) {
      return (await req("POST", "/barbeiros", { nome })).data;
    }

    try {
      await fn({ req, criarBarbeiro });
    } finally {
      server.close();
    }
  };
}

module.exports = { app, comServidor };
