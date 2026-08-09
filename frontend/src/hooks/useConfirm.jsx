import { useCallback, useRef, useState } from "react";
import ConfirmModal from "../components/ConfirmModal";

// Hook que imita a ergonomia do window.confirm() (await-able), mas
// renderiza um modal de verdade em vez do dialog nativo do navegador.
//
// Uso:
//   const { confirmar, modal } = useConfirm();
//   async function remover(item) {
//     const ok = await confirmar({ titulo: "Remover produto", mensagem: `Remover "${item.nome}"?` });
//     if (!ok) return;
//     ...
//   }
//   return (<>...{modal}</>);
export function useConfirm() {
  const [opcoes, setOpcoes] = useState(null);
  const resolverRef = useRef(null);

  const confirmar = useCallback((novasOpcoes) => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setOpcoes(novasOpcoes);
    });
  }, []);

  function responder(valor) {
    resolverRef.current?.(valor);
    resolverRef.current = null;
    setOpcoes(null);
  }

  const modal = opcoes ? (
    <ConfirmModal
      {...opcoes}
      isOpen
      onConfirmar={() => responder(true)}
      onCancelar={() => responder(false)}
    />
  ) : null;

  return { confirmar, modal };
}
