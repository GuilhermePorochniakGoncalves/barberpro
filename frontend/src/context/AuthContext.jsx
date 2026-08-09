import { useEffect, useState } from "react";
import api, { TOKEN_KEY } from "../services/api";
import { AuthContext } from "./auth-context";
import { extrairMensagemErro } from "../utils/erro";

const BARBEIRO_KEY = "barberpro_barbeiro";

function lerBarbeiroSalvo() {
  try {
    const bruto = localStorage.getItem(BARBEIRO_KEY);
    return bruto ? JSON.parse(bruto) : null;
  } catch {
    return null;
  }
}

// Sessão simples de barbeiro: token + dados básicos ficam no localStorage
// (sobrevive a refresh da página). Não há endpoint "quem sou eu" — os
// dados do barbeiro logado vêm direto da resposta do login e ficam
// guardados junto do token.
export function AuthProvider({ children }) {
  const [barbeiroLogado, setBarbeiroLogado] = useState(lerBarbeiroSalvo);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    // Token expirou/foi rejeitado em alguma chamada (ver interceptor em
    // services/api.js) — desloga localmente também.
    function aoFicarNaoAutenticado() {
      localStorage.removeItem(BARBEIRO_KEY);
      setBarbeiroLogado(null);
    }

    window.addEventListener("barberpro:unauthorized", aoFicarNaoAutenticado);
    return () => window.removeEventListener("barberpro:unauthorized", aoFicarNaoAutenticado);
  }, []);

  async function login(usuario, senha) {
    setCarregando(true);
    try {
      const response = await api.post("/barbeiros/login", { usuario, senha });
      const { token, barbeiro } = response.data;

      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(BARBEIRO_KEY, JSON.stringify(barbeiro));
      setBarbeiroLogado(barbeiro);

      return { sucesso: true };
    } catch (error) {
      return { sucesso: false, mensagem: extrairMensagemErro(error, "Não foi possível entrar.") };
    } finally {
      setCarregando(false);
    }
  }

  async function logout() {
    try {
      await api.post("/barbeiros/logout");
    } catch {
      // mesmo se a chamada falhar, desloga localmente.
    }
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(BARBEIRO_KEY);
    setBarbeiroLogado(null);
  }

  return (
    <AuthContext.Provider value={{ barbeiroLogado, carregando, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
