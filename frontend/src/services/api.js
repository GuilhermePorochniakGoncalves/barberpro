import axios from "axios";

// VITE_API_URL vem de .env (ver .env.example) — sem ele, cai no default de
// desenvolvimento local, mantendo o comportamento de sempre.
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:3001",
});

export default api;
