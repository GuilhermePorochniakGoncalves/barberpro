import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import EmptyState from "../components/EmptyState";
import { SkeletonCards } from "../components/Skeleton";
import { useConfirm } from "../hooks/useConfirm";
import { useBarbeiros } from "../context/useBarbeiros";
import { useToast } from "../context/useToast";
import { iniciais, corAvatar } from "../utils/avatar";

function Barbeiros() {
  const { barbeiros, carregando, erro, criarBarbeiro, removerBarbeiro } = useBarbeiros();
  const navigate = useNavigate();
  const { confirmar, modal } = useConfirm();
  const { mostrarToast } = useToast();

  const [criando, setCriando] = useState(false);
  const [nomeNovo, setNomeNovo] = useState("");
  const [erroForm, setErroForm] = useState("");
  const [salvando, setSalvando] = useState(false);

  const ativos = barbeiros.filter((b) => b.ativo);

  async function salvarNovoBarbeiro() {
    if (!nomeNovo.trim()) {
      setErroForm("Informe o nome do barbeiro.");
      return;
    }

    setSalvando(true);
    setErroForm("");

    const resultado = await criarBarbeiro(nomeNovo.trim());

    setSalvando(false);

    if (!resultado.sucesso) {
      setErroForm(resultado.mensagem);
      return;
    }

    setNomeNovo("");
    setCriando(false);
  }

  async function remover(barbeiro) {
    const ok = await confirmar({
      titulo: "Remover barbeiro",
      mensagem: `Remover "${barbeiro.nome}"? Essa ação não pode ser desfeita.`,
      confirmarLabel: "Remover",
    });
    if (!ok) return;

    const resultado = await removerBarbeiro(barbeiro.id);
    if (!resultado.sucesso) {
      mostrarToast(resultado.mensagem, "erro");
    } else if (resultado.aviso) {
      // Backend desativa em vez de excluir quando há histórico — avisa
      // por que o barbeiro ainda pode aparecer em relatórios antigos.
      mostrarToast(resultado.aviso, "aviso");
    }
  }

  return (
    <Layout>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-white">Barbeiros</h1>

        <button
          onClick={() => setCriando(true)}
          className="bg-amber-600 text-black font-semibold px-4 py-2 rounded-lg hover:bg-amber-700"
        >
          Novo barbeiro
        </button>
      </div>

      {erro && <p className="text-red-400 mb-4">{erro}</p>}

      {criando && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 mb-6">
          <h2 className="font-bold text-lg mb-3 text-zinc-100">Novo barbeiro</h2>
          <div className="flex flex-wrap gap-3">
            <input
              type="text"
              autoFocus
              placeholder="Nome do barbeiro"
              value={nomeNovo}
              onChange={(e) => setNomeNovo(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && salvarNovoBarbeiro()}
              className="flex-1 min-w-[200px] bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-zinc-100 placeholder:text-zinc-500"
              disabled={salvando}
            />
            <button
              onClick={salvarNovoBarbeiro}
              disabled={salvando}
              className="px-4 py-2 bg-amber-600 text-black font-semibold rounded-lg hover:bg-amber-700 disabled:opacity-50"
            >
              {salvando ? "Salvando..." : "Salvar"}
            </button>
            <button
              onClick={() => {
                setCriando(false);
                setNomeNovo("");
                setErroForm("");
              }}
              disabled={salvando}
              className="px-4 py-2 border border-zinc-700 text-zinc-300 rounded-lg hover:bg-zinc-800"
            >
              Cancelar
            </button>
          </div>
          {erroForm && <p className="text-red-400 text-sm mt-2">{erroForm}</p>}
        </div>
      )}

      {carregando ? (
        <SkeletonCards />
      ) : ativos.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl">
          <EmptyState
            icon="✂️"
            title="Nenhum barbeiro cadastrado"
            description="Cadastre o primeiro barbeiro pra começar a organizar a agenda da barbearia."
            actionLabel="Novo barbeiro"
            onAction={() => setCriando(true)}
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {ativos.map((barbeiro) => (
            <div
              key={barbeiro.id}
              className="relative bg-zinc-900 border border-zinc-800 rounded-2xl hover:border-amber-700/50 transition"
            >
              <button
                onClick={() => remover(barbeiro)}
                className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-full text-zinc-600 hover:text-red-400 hover:bg-red-950/30 text-sm"
                aria-label={`Remover ${barbeiro.nome}`}
                title="Remover barbeiro"
              >
                ✕
              </button>

              <button
                onClick={() => navigate(`/barbeiros/${barbeiro.id}`)}
                className="w-full p-6 flex flex-col items-center gap-3 hover:-translate-y-0.5 transition"
              >
                <div
                  className={`w-16 h-16 rounded-full flex items-center justify-center text-white text-xl font-bold ${corAvatar(
                    barbeiro.nome
                  )}`}
                >
                  {iniciais(barbeiro.nome)}
                </div>
                <span className="font-semibold text-zinc-100">{barbeiro.nome}</span>
              </button>
            </div>
          ))}
        </div>
      )}

      {modal}
    </Layout>
  );
}

export default Barbeiros;
