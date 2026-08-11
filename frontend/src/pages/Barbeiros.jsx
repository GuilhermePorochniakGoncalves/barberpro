import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import EmptyState from "../components/EmptyState";
import { SkeletonCards } from "../components/Skeleton";
import { useConfirm } from "../hooks/useConfirm";
import { useBarbeiros } from "../context/useBarbeiros";
import { useToast } from "../context/useToast";
import { iniciais, corAvatar } from "../utils/avatar";

// Cadastro/gestão de barbeiros. Pra ver a agenda de cada um, use a tela
// Agenda — lá os nomes aparecem como abas no topo (ver src/pages/Agenda.jsx).
function Barbeiros() {
  const { barbeiros, carregando, erro, criarBarbeiro, atualizarBarbeiro, removerBarbeiro } = useBarbeiros();
  const navigate = useNavigate();
  const { confirmar, modal } = useConfirm();
  const { mostrarToast } = useToast();

  const [criando, setCriando] = useState(false);
  const [nomeNovo, setNomeNovo] = useState("");
  const [erroForm, setErroForm] = useState("");
  const [salvando, setSalvando] = useState(false);

  const [editandoId, setEditandoId] = useState(null);
  const [nomeEdicao, setNomeEdicao] = useState("");
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);

  const ativos = barbeiros.filter((b) => b.ativo);
  const inativos = barbeiros.filter((b) => !b.ativo);

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

  function iniciarEdicao(barbeiro) {
    setEditandoId(barbeiro.id);
    setNomeEdicao(barbeiro.nome);
  }

  async function salvarEdicao(barbeiro) {
    if (!nomeEdicao.trim()) return;

    setSalvandoEdicao(true);
    const resultado = await atualizarBarbeiro(barbeiro.id, { nome: nomeEdicao.trim() });
    setSalvandoEdicao(false);

    if (!resultado.sucesso) {
      mostrarToast(resultado.mensagem, "erro");
      return;
    }
    setEditandoId(null);
  }

  async function alternarAtivo(barbeiro) {
    const resultado = await atualizarBarbeiro(barbeiro.id, { ativo: !barbeiro.ativo });
    if (!resultado.sucesso) {
      mostrarToast(resultado.mensagem, "erro");
    }
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

  function Card({ barbeiro }) {
    const editando = editandoId === barbeiro.id;

    return (
      <div className="relative bg-zinc-900 border border-zinc-800 rounded-2xl hover:border-amber-700/50 transition">
        {!editando && (
          <button
            onClick={() => remover(barbeiro)}
            className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-full text-zinc-600 hover:text-red-400 hover:bg-red-950/30 text-sm"
            aria-label={`Remover ${barbeiro.nome}`}
            title="Remover barbeiro"
          >
            ✕
          </button>
        )}

        <div className="w-full p-6 flex flex-col items-center gap-3">
          <div
            className={`w-16 h-16 rounded-full flex items-center justify-center text-white text-xl font-bold ${corAvatar(
              barbeiro.nome
            )} ${!barbeiro.ativo ? "opacity-50" : ""}`}
          >
            {iniciais(barbeiro.nome)}
          </div>

          {editando ? (
            <div className="w-full flex flex-col gap-2">
              <input
                type="text"
                autoFocus
                value={nomeEdicao}
                onChange={(e) => setNomeEdicao(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && salvarEdicao(barbeiro)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-sm text-zinc-100 text-center"
                disabled={salvandoEdicao}
              />
              <div className="flex gap-2 justify-center">
                <button
                  onClick={() => salvarEdicao(barbeiro)}
                  disabled={salvandoEdicao}
                  className="px-3 py-1 bg-amber-600 text-black text-xs font-semibold rounded-lg hover:bg-amber-700 disabled:opacity-50"
                >
                  Salvar
                </button>
                <button
                  onClick={() => setEditandoId(null)}
                  disabled={salvandoEdicao}
                  className="px-3 py-1 border border-zinc-700 text-zinc-300 text-xs rounded-lg hover:bg-zinc-800"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <>
              <span className={`font-semibold ${barbeiro.ativo ? "text-zinc-100" : "text-zinc-500"}`}>
                {barbeiro.nome}
              </span>

              <div className="flex flex-wrap gap-2 justify-center text-xs">
                {barbeiro.ativo && (
                  <button
                    onClick={() => navigate(`/agenda?barbeiro=${barbeiro.id}`)}
                    className="text-amber-500 hover:text-amber-400"
                  >
                    Ver agenda
                  </button>
                )}
                <button onClick={() => iniciarEdicao(barbeiro)} className="text-zinc-500 hover:text-zinc-300">
                  editar
                </button>
                <button
                  onClick={() => alternarAtivo(barbeiro)}
                  className={barbeiro.ativo ? "text-zinc-500 hover:text-red-400" : "text-zinc-500 hover:text-green-400"}
                >
                  {barbeiro.ativo ? "desativar" : "reativar"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
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
      ) : ativos.length === 0 && inativos.length === 0 ? (
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
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {ativos.map((barbeiro) => (
              <Card key={barbeiro.id} barbeiro={barbeiro} />
            ))}
          </div>

          {inativos.length > 0 && (
            <div className="mt-10">
              <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide mb-4">
                Inativos
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                {inativos.map((barbeiro) => (
                  <Card key={barbeiro.id} barbeiro={barbeiro} />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {modal}
    </Layout>
  );
}

export default Barbeiros;
