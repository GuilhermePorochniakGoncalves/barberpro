import { useCallback, useEffect, useState } from "react";
import { ToastContext } from "./toast-context";

let proximoId = 1;
const DURACAO_MS = 6000;

const BORDA_POR_TIPO = {
  erro: "border-l-red-500",
  aviso: "border-l-amber-500",
  info: "border-l-zinc-500",
  sucesso: "border-l-emerald-500",
};

// Notificações temporárias no canto da tela — usadas pra avisos que não
// bloqueiam a interação (ex.: sessão expirada), diferente de um erro
// inline de formulário. Escuta o evento "barberpro:toast" (ver
// utils/toast.js) além de expor mostrarToast() via contexto, então
// funciona tanto de dentro de componentes quanto de fora da árvore React
// (ex.: o interceptor do axios).
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const fechar = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const mostrarToast = useCallback(
    (mensagem, tipo = "info") => {
      const id = proximoId++;
      setToasts((prev) => [...prev, { id, mensagem, tipo }]);
      setTimeout(() => fechar(id), DURACAO_MS);
    },
    [fechar]
  );

  useEffect(() => {
    function aoReceberEvento(e) {
      mostrarToast(e.detail.mensagem, e.detail.tipo);
    }
    window.addEventListener("barberpro:toast", aoReceberEvento);
    return () => window.removeEventListener("barberpro:toast", aoReceberEvento);
  }, [mostrarToast]);

  return (
    <ToastContext.Provider value={{ mostrarToast }}>
      {children}

      <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-3 w-full max-w-sm pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto bg-zinc-900 border border-zinc-800 border-l-4 ${
              BORDA_POR_TIPO[t.tipo] ?? BORDA_POR_TIPO.info
            } rounded-lg p-4 shadow-xl shadow-black/50 flex items-start justify-between gap-3 animate-scale-in`}
          >
            <p className="text-sm text-zinc-100">{t.mensagem}</p>
            <button
              onClick={() => fechar(t.id)}
              className="text-zinc-500 hover:text-zinc-300 leading-none"
              aria-label="Fechar aviso"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
