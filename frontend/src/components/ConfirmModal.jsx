// Modal de confirmação genérico — substitui window.confirm() nativo do
// navegador antes de ações destrutivas (cancelar agendamento, remover
// produto/serviço/barbeiro). Ver hook useConfirm() pra uso ergonômico.
function ConfirmModal({
  isOpen,
  titulo = "Confirmar ação",
  mensagem,
  confirmarLabel = "Confirmar",
  cancelarLabel = "Cancelar",
  perigo = true,
  onConfirmar,
  onCancelar,
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4 animate-fade-in">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-sm animate-scale-in">
        <h2 className="text-lg font-bold text-white mb-2">{titulo}</h2>
        <p className="text-zinc-400">{mensagem}</p>

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onCancelar}
            className="px-4 py-2 border border-zinc-700 text-zinc-300 rounded-lg hover:bg-zinc-800"
          >
            {cancelarLabel}
          </button>
          <button
            onClick={onConfirmar}
            className={`px-4 py-2 rounded-lg font-semibold ${
              perigo
                ? "bg-red-600 text-white hover:bg-red-700"
                : "bg-amber-600 text-black hover:bg-amber-700"
            }`}
          >
            {confirmarLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmModal;
