// Estado vazio elaborado (ícone + texto + call-to-action opcional) — usado
// no lugar de uma frase solta tipo "Nenhum item cadastrado".
function EmptyState({ icon, title, description, actionLabel, onAction }) {
  return (
    <div className="p-12 flex flex-col items-center text-center gap-3">
      <div className="w-14 h-14 rounded-full bg-zinc-800 flex items-center justify-center text-2xl">
        {icon}
      </div>
      <h3 className="text-zinc-100 font-semibold text-lg">{title}</h3>
      {description && <p className="text-zinc-500 max-w-sm">{description}</p>}
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="mt-2 bg-amber-600 text-black font-semibold px-4 py-2 rounded-lg hover:bg-amber-700"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export default EmptyState;
