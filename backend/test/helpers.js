// Banco em memória (pg-mem), isolado do banco de desenvolvimento — precisa
// ser setado ANTES de importar o server/db (module-load decide qual banco
// usar uma vez só, olhando NODE_ENV).
process.env.NODE_ENV = "test";
// Senha fixa de teste — o middleware de proteção do painel (ver server.js)
// bloqueia tudo se PANEL_PASSWORD não estiver definida.
process.env.PANEL_PASSWORD = process.env.PANEL_PASSWORD || "teste-senha-painel";

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

    // Manda a senha do painel por padrão (a maioria das rotas testadas é
    // interna) — inofensivo nas rotas públicas, que ignoram esse header.
    async function req(method, path, body, { semSenha = false } = {}) {
      const response = await fetch(base + path, {
        method,
        headers: {
          ...(body ? { "Content-Type": "application/json" } : {}),
          ...(semSenha ? {} : { "X-Panel-Password": process.env.PANEL_PASSWORD }),
        },
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

// 'YYYY-MM-DD'/'YYYY-MM' de hoje no fuso de Brasília, não UTC — os
// relatórios agora bucketam por dia civil de Brasília (ver
// limitesDoDiaBrasilia em server.js); um teste calculando "hoje" em UTC
// pode cair num dia diferente do que o servidor considera "hoje" entre
// 21h e meia-noite (horário de Brasília), quando UTC já virou o dia
// seguinte.
function hojeBrasilia() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

function mesAtualBrasilia() {
  return hojeBrasilia().slice(0, 7);
}

module.exports = { app, comServidor, hojeBrasilia, mesAtualBrasilia };
