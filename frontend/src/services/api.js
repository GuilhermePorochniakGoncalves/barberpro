import axios from "axios";

// VITE_API_URL vem de .env (ver .env.example) — sem ele, cai no default de
// desenvolvimento local, mantendo o comportamento de sempre.
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:3001",
});

// Senha única do painel (não por pessoa — ver comentário em server.js).
// Guardada no localStorage depois que o usuário digita ela uma vez em
// PainelProtegido; a tela pública /agendar nunca chama nada que precise
// dela, então o header vai em toda chamada sem prejudicar a rota pública
// (o backend simplesmente ignora esse header nas rotas que não exigem).
const CHAVE_SENHA_PAINEL = "agendarapido_painel_senha";

api.interceptors.request.use((config) => {
  const senha = localStorage.getItem(CHAVE_SENHA_PAINEL);
  if (senha) {
    config.headers["X-Panel-Password"] = senha;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Só avisa "sessão expirou" se realmente HAVIA uma senha salva antes
      // (ex.: trocaram a senha no Render enquanto alguém estava logado) —
      // na primeira visita, sem senha nenhuma salva ainda, o 401 é
      // esperado e PainelProtegido já mostra a tela de senha limpa sozinho.
      const tinhaSenha = Boolean(localStorage.getItem(CHAVE_SENHA_PAINEL));
      localStorage.removeItem(CHAVE_SENHA_PAINEL);
      if (tinhaSenha) {
        window.dispatchEvent(new CustomEvent("painel:senha-invalida"));
      }
    }
    return Promise.reject(error);
  }
);

export default api;
export { CHAVE_SENHA_PAINEL };
