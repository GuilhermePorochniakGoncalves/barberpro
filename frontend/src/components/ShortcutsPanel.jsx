import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ATALHOS } from "../constants/shortcuts";

// Grade de atalhos coloridos, aberta pelo botão de tesoura na sidebar —
// um jeito rápido de pular pra qualquer tela sem escanear a lista de texto
// da sidebar. Some com Esc, clique fora, ou ao escolher um bloco.
function ShortcutsPanel({ aberto, onFechar }) {
  const navigate = useNavigate();
  const painelRef = useRef(null);

  useEffect(() => {
    if (!aberto) return;

    function aoTeclar(e) {
      if (e.key === "Escape") onFechar();
    }
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [aberto, onFechar]);

  if (!aberto) return null;

  function irPara(caminho) {
    navigate(caminho);
    onFechar();
  }

  return (
    <div
      className="absolute inset-0 z-20 bg-black/95 backdrop-blur-sm overflow-y-auto p-6 sm:p-8"
      onClick={(e) => {
        if (!painelRef.current?.contains(e.target)) onFechar();
      }}
    >
      <div ref={painelRef}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">Atalhos rápidos</h2>
          <button
            onClick={onFechar}
            aria-label="Fechar atalhos"
            className="text-zinc-500 hover:text-white text-xl w-9 h-9 flex items-center justify-center rounded-lg hover:bg-zinc-900"
          >
            ✕
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-w-3xl">
          {ATALHOS.map((atalho) => (
            <button
              key={atalho.caminho}
              onClick={() => irPara(atalho.caminho)}
              className={`${atalho.cor} text-zinc-900 rounded-2xl p-5 flex flex-col items-center justify-center gap-2 text-center font-bold text-sm hover:-translate-y-0.5 transition shadow-sm`}
            >
              <span className="text-2xl">{atalho.icone}</span>
              {atalho.nome}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default ShortcutsPanel;
