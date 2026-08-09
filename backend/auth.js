const crypto = require("node:crypto");
const db = require("./db");

const SESSAO_DURACAO_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias

// Hash de senha com scrypt (nativo do Node, sem dependência tipo bcrypt).
// Formato armazenado: "salt:hash", ambos em hex.
function hashSenha(senha) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(senha, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verificarSenha(senha, senhaHash) {
  if (!senhaHash) return false;
  const [salt, hashArmazenado] = senhaHash.split(":");
  if (!salt || !hashArmazenado) return false;

  const hashCalculado = crypto.scryptSync(senha, salt, 64);
  const bufferArmazenado = Buffer.from(hashArmazenado, "hex");

  // Tamanhos diferentes quebrariam timingSafeEqual — trata como não bate.
  if (hashCalculado.length !== bufferArmazenado.length) return false;
  return crypto.timingSafeEqual(hashCalculado, bufferArmazenado);
}

function criarSessao(barbeiroId) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiraEm = new Date(Date.now() + SESSAO_DURACAO_MS).toISOString();

  db.prepare("INSERT INTO sessoes (token, barbeiro_id, expira_em) VALUES (?, ?, ?)").run(
    token,
    barbeiroId,
    expiraEm
  );

  return { token, expiraEm };
}

function removerSessao(token) {
  db.prepare("DELETE FROM sessoes WHERE token = ?").run(token);
}

// Resolve um token pra um barbeiro ativo, ou null se inválido/expirado.
function resolverToken(token) {
  if (!token) return null;

  const sessao = db.prepare("SELECT * FROM sessoes WHERE token = ?").get(token);
  if (!sessao) return null;

  if (new Date(sessao.expira_em).getTime() < Date.now()) {
    db.prepare("DELETE FROM sessoes WHERE token = ?").run(token);
    return null;
  }

  return db.prepare("SELECT * FROM barbeiros WHERE id = ?").get(sessao.barbeiro_id) || null;
}

// Middleware: exige um token válido no header Authorization: Bearer <token>.
// Em caso de sucesso, anexa o barbeiro autenticado em `req.barbeiro`.
function autenticar(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  const barbeiro = resolverToken(token);
  if (!barbeiro) {
    return res.status(401).json({ erro: "Não autenticado. Faça login novamente." });
  }

  req.barbeiro = barbeiro;
  next();
}

// Helper: barra o acesso se o barbeiro autenticado não for o dono do
// recurso (`barbeiroIdDoRecurso`). Retorna true (e já respondeu 403) se
// barrou — quem chama deve dar `return` em seguida.
function barrarSeNaoForDono(req, res, barbeiroIdDoRecurso) {
  if (req.barbeiro.id !== barbeiroIdDoRecurso) {
    res.status(403).json({ erro: "Você só pode gerenciar seus próprios dados." });
    return true;
  }
  return false;
}

module.exports = {
  hashSenha,
  verificarSenha,
  criarSessao,
  removerSessao,
  resolverToken,
  autenticar,
  barrarSeNaoForDono,
};
