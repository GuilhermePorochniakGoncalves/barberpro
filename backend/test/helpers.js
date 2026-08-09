// Banco em memória, isolado do banco de desenvolvimento — precisa ser
// setado ANTES de importar o server/db (module-load lê DB_PATH uma vez).
process.env.DB_PATH = process.env.DB_PATH || ":memory:";

const app = require("../server");

// Sobe o app numa porta aleatória do SO por suite e devolve helpers de
// request. Compartilhado entre os arquivos de teste pra não duplicar.
function comServidor(fn) {
  return async () => {
    const server = app.listen(0);
    const { port } = server.address();
    const base = `http://localhost:${port}`;

    async function req(method, path, body, token) {
      const headers = {};
      if (body) headers["Content-Type"] = "application/json";
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const response = await fetch(base + path, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = response.status === 204 ? null : await response.json();
      return { status: response.status, data };
    }

    // Cria um barbeiro, dá login nele (usuário+senha) e devolve token +
    // dados — atalho usado por quase todo teste que precisa agir "como"
    // um barbeiro autenticado.
    async function criarBarbeiroLogado(nome, usuario, senha = "senha123") {
      const barbeiro = (await req("POST", "/barbeiros", { nome })).data;
      await req("PUT", `/barbeiros/${barbeiro.id}/login`, { usuario, senha });
      const login = await req("POST", "/barbeiros/login", { usuario, senha });
      return { ...barbeiro, usuario, token: login.data.token };
    }

    try {
      await fn({ req, criarBarbeiroLogado });
    } finally {
      server.close();
    }
  };
}

module.exports = { app, comServidor };
