// Backup manual do banco: roda `pg_dump` contra o DATABASE_URL configurado e
// salva em backend/backups/ com timestamp no nome. Mantém só os últimos 7
// arquivos (mais antigos são apagados).
//
// Uso: node scripts/backup.js   (ou `npm run backup`, dentro de backend/)
//
// Requer o cliente `pg_dump` instalado na máquina que roda o script (não é
// dependência do projeto — vem com qualquer instalação do Postgres, ou
// `apt install postgresql-client` / `brew install libpq`).
//
// Neon também guarda histórico próprio (restauração por ponto no tempo,
// configurável no dashboard do projeto) — esse script aqui é um backup
// adicional, independente, pra rodar manualmente ou agendar localmente
// (ex.: Agendador de Tarefas do Windows / cron) sem depender do painel do Neon.

try {
  process.loadEnvFile();
} catch {
  // sem .env local — ok se DATABASE_URL já vier de outro lugar (env var do SO).
}

const { execFile } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const MAX_BACKUPS = 7;
const PASTA_BACKUPS = path.join(__dirname, "..", "backups");

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function rodarPgDump(destino) {
  return new Promise((resolve, reject) => {
    execFile(
      "pg_dump",
      [process.env.DATABASE_URL, "--format=custom", "--file", destino],
      (err, _stdout, stderr) => {
        if (err) {
          reject(new Error(stderr || err.message));
        } else {
          resolve();
        }
      }
    );
  });
}

function limparBackupsAntigos() {
  const arquivos = fs
    .readdirSync(PASTA_BACKUPS)
    .filter((f) => f.startsWith("barberpro-") && f.endsWith(".dump"))
    .sort(); // nome tem timestamp ISO — ordem alfabética == ordem cronológica

  const excedentes = arquivos.slice(0, Math.max(0, arquivos.length - MAX_BACKUPS));
  for (const nome of excedentes) {
    fs.unlinkSync(path.join(PASTA_BACKUPS, nome));
    console.log(`Backup antigo removido: ${nome}`);
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL não configurada. Copie backend/.env.example pra backend/.env.");
    process.exit(1);
  }

  fs.mkdirSync(PASTA_BACKUPS, { recursive: true });

  const arquivo = `barberpro-${timestamp()}.dump`;
  const destino = path.join(PASTA_BACKUPS, arquivo);

  console.log(`Rodando pg_dump para ${destino}...`);
  await rodarPgDump(destino);
  console.log("Backup concluído.");

  limparBackupsAntigos();
}

main().catch((err) => {
  console.error("Falha ao gerar backup:", err.message);
  process.exit(1);
});
