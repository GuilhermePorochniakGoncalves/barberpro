import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/useAuth";

function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [entrando, setEntrando] = useState(false);

  const destino = location.state?.from || "/barbeiros";

  async function entrar(e) {
    e.preventDefault();
    if (!usuario.trim() || !senha) {
      setErro("Informe usuário e senha.");
      return;
    }

    setErro("");
    setEntrando(true);
    const resultado = await login(usuario.trim(), senha);
    setEntrando(false);

    if (!resultado.sucesso) {
      setErro(resultado.mensagem);
      return;
    }

    navigate(destino, { replace: true });
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-6">
      <form onSubmit={entrar} className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-xl shadow-black/50 p-8 w-full max-w-sm">
        <h1 className="text-2xl font-bold text-amber-500 mb-1">BarberPro</h1>
        <p className="text-zinc-400 mb-6">Login do barbeiro</p>

        <div className="space-y-4">
          <input
            type="text"
            placeholder="Usuário"
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-zinc-100 placeholder:text-zinc-500"
            disabled={entrando}
            autoFocus
          />
          <input
            type="password"
            placeholder="Senha"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-zinc-100 placeholder:text-zinc-500"
            disabled={entrando}
          />
        </div>

        {erro && (
          <p className="text-red-400 text-sm mt-4" role="alert">
            {erro}
          </p>
        )}

        <button
          type="submit"
          disabled={entrando}
          className="w-full mt-6 bg-amber-600 text-black font-semibold py-3 rounded-lg hover:bg-amber-700 disabled:opacity-50"
        >
          {entrando ? "Entrando..." : "Entrar"}
        </button>

        <p className="text-xs text-zinc-500 mt-4">
          Ainda não tem login? Peça pra outro barbeiro te cadastrar, ou defina
          usuário/senha na sua própria agenda na primeira vez.
        </p>
      </form>
    </div>
  );
}

export default Login;
