// Blocos de carregamento (skeleton) reutilizáveis — usados no lugar de um
// texto solto "Carregando..." em toda tela que busca dado da API.

export function Skeleton({ className = "" }) {
  return <div className={`animate-pulse bg-zinc-800 rounded ${className}`} />;
}

// Linhas de tabela — mantém o <thead> real visível durante o carregamento
// (contexto imediato de quais colunas vêm a seguir).
export function SkeletonTableRows({ colunas = 3, linhas = 5 }) {
  return (
    <>
      {Array.from({ length: linhas }).map((_, i) => (
        <tr key={i} className="border-t border-zinc-800">
          {Array.from({ length: colunas }).map((_, j) => (
            <td key={j} className="p-4">
              <Skeleton className="h-4 w-full max-w-[160px]" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

// Grade de cards (ex.: lista de barbeiros).
export function SkeletonCards({ quantidade = 4 }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
      {Array.from({ length: quantidade }).map((_, i) => (
        <div
          key={i}
          className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 flex flex-col items-center gap-3"
        >
          <Skeleton className="w-16 h-16 rounded-full" />
          <Skeleton className="h-4 w-24" />
        </div>
      ))}
    </div>
  );
}

// Lista vertical de linhas (ex.: horários da agenda do dia).
export function SkeletonList({ linhas = 10 }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: linhas }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 rounded-xl border border-zinc-800 p-3">
          <Skeleton className="h-4 w-14" />
          <Skeleton className="h-4 flex-1 max-w-xs" />
        </div>
      ))}
    </div>
  );
}

// Par de cards de estatística (ex.: totais do relatório mensal).
export function SkeletonStatCards({ quantidade = 2 }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
      {Array.from({ length: quantidade }).map((_, i) => (
        <div key={i} className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl">
          <Skeleton className="h-4 w-32 mb-3" />
          <Skeleton className="h-8 w-24" />
        </div>
      ))}
    </div>
  );
}
