import { useState } from "react";
import Sidebar from "./Sidebar";
import ShortcutsPanel from "./ShortcutsPanel";

function Layout({ children }) {
  const [menuAberto, setMenuAberto] = useState(false);
  const [atalhosAbertos, setAtalhosAbertos] = useState(false);

  return (
    <div className="flex bg-black min-h-screen">
      <Sidebar
        aberta={menuAberto}
        onFechar={() => setMenuAberto(false)}
        atalhosAbertos={atalhosAbertos}
        onAlternarAtalhos={() => setAtalhosAbertos((a) => !a)}
      />

      <div className="flex-1 min-w-0 relative">
        {/* Barra superior só aparece em telas pequenas (celular/tablet
            estreito) — no desktop a sidebar já fica sempre visível. */}
        <div className="md:hidden flex items-center gap-3 px-4 py-4 border-b border-zinc-900">
          <button
            onClick={() => setMenuAberto(true)}
            className="text-zinc-300 hover:text-white p-1 -ml-1"
            aria-label="Abrir menu"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <span className="text-amber-500 font-bold text-lg">AgendaRápido</span>
        </div>

        {/* Painel de atalhos coloridos — abre por cima só desta área de
            conteúdo (a sidebar continua visível/clicável ao lado). */}
        <ShortcutsPanel aberto={atalhosAbertos} onFechar={() => setAtalhosAbertos(false)} />

        <div className="p-4 sm:p-6 md:p-8">
          {children}
        </div>
      </div>
    </div>
  );
}

export default Layout;
