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
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-6">
      <form onSubmit={entrar} className="bg-white rounded-2xl shadow p-8 w-full max-w-sm">
        <h1 className="text-2xl font-bold text-green-600 mb-1">BarberPro</h1>
        <p className="text-gray-500 mb-6">Login do barbeiro</p>

        <div className="space-y-4">
          <input
            type="text"
            placeholder="Usuário"
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            className="w-full border rounded-lg p-3"
            disabled={entrando}
            autoFocus
          />
          <input
            type="password"
            placeholder="Senha"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            className="w-full border rounded-lg p-3"
            disabled={entrando}
          />
        </div>

        {erro && (
          <p className="text-red-600 text-sm mt-4" role="alert">
            {erro}
          </p>
        )}

        <button
          type="submit"
          disabled={entrando}
          className="w-full mt-6 bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50"
        >
          {entrando ? "Entrando..." : "Entrar"}
        </button>

        <p className="text-xs text-gray-400 mt-4">
          Ainda não tem login? Peça pra outro barbeiro te cadastrar, ou defina
          usuário/senha na sua própria agenda na primeira vez.
        </p>
      </form>
    </div>
  );
}

export default Login;
