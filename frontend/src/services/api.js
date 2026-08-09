import axios from "axios";

// VITE_API_URL vem de .env (ver .env.example) — sem ele, cai no default de
// desenvolvimento local, mantendo o comportamento de sempre.
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:3001",
});

// Chave única do token no localStorage — usada aqui e pelo AuthContext.
export const TOKEN_KEY = "barberpro_token";

// Injeta o token de sessão (se houver) em toda requisição.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Sessão expirada/token inválido: limpa o storage e avisa o resto do app
// (o AuthContext escuta esse evento pra atualizar o estado de login) sem
// acoplar este módulo diretamente ao contexto — evita import circular.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      window.dispatchEvent(new Event("barberpro:unauthorized"));
    }
    return Promise.reject(error);
  }
);

export default api;
