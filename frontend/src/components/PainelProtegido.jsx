import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import api, { CHAVE_SENHA_PAINEL } from "../services/api";

// Porta de entrada do painel interno (tudo exceto /agendar) — pede a senha
// única da barbearia antes de deixar passar. Não é login por pessoa (ver
// decisão do projeto: qualquer barbeiro/recepção usa a agenda de
// qualquer um), é só uma barreira contra visitante casual/acidental
// achando a URL do painel.
function PainelProtegido() {
  const [status, setStatus] = useState("verificando"); // verificando | ok | bloqueado
  const [senhaInput, setSenhaInput] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function verificar() {
    try {
      await api.get("/painel/verificar");
      setStatus("ok");
    } catch {
      setStatus("bloqueado");
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- checa a senha salva contra o servidor ao montar, não deriva estado local
    verificar();

    function aoInvalidar() {
      setStatus("bloqueado");
      setErro("Sessão expirou ou a senha mudou — digite de novo.");
    }
    window.addEventListener("painel:senha-invalida", aoInvalidar);
    return () => window.removeEventListener("painel:senha-invalida", aoInvalidar);
  }, []);

  async function entrar(e) {
    e.preventDefault();
    setErro("");
    setEnviando(true);
    localStorage.setItem(CHAVE_SENHA_PAINEL, senhaInput);
    try {
      await api.get("/painel/verificar");
      setStatus("ok");
    } catch {
      localStorage.removeItem(CHAVE_SENHA_PAINEL);
      setErro("Senha incorreta.");
    } finally {
      setEnviando(false);
    }
  }

  if (status === "verificando") {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <p className="text-zinc-600">Carregando...</p>
      </div>
    );
  }

  if (status === "bloqueado") {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center px-4">
        <form onSubmit={entrar} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 w-full max-w-sm">
          <div className="flex items-center gap-3 mb-1">
            <span className="w-9 h-9 rounded-full bg-amber-600 text-black flex items-center justify-center text-base flex-shrink-0">
              ✂
            </span>
            <h1 className="text-xl font-bold text-white">
              Agenda<span className="text-amber-500">Rápido</span>
            </h1>
          </div>
          <p className="text-zinc-400 text-sm mb-6">Senha da barbearia pra acessar o painel de gestão.</p>

          <input
            type="password"
            autoFocus
            placeholder="Senha"
            value={senhaInput}
            onChange={(e) => setSenhaInput(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-zinc-100 placeholder:text-zinc-500 mb-3"
            disabled={enviando}
          />

          <button
            type="submit"
            disabled={enviando || !senhaInput}
            className="w-full bg-amber-600 text-black font-semibold py-3 rounded-lg hover:bg-amber-700 disabled:opacity-50"
          >
            {enviando ? "Entrando..." : "Entrar"}
          </button>

          {erro && (
            <p className="text-red-400 text-sm mt-3" role="alert">
              {erro}
            </p>
          )}
        </form>
      </div>
    );
  }

  return <Outlet />;
}

export default PainelProtegido;
