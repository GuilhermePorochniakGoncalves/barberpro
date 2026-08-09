import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import EmptyState from "../components/EmptyState";
import { SkeletonTableRows } from "../components/Skeleton";
import api from "../services/api";
import { useAuth } from "../context/useAuth";
import { extrairMensagemErro } from "../utils/erro";

function formatarReais(valor) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Cada barbeiro cadastra/edita os próprios serviços (nome + preço) — usados
// tanto no agendamento quanto na tela de finalizar atendimento.
function MeusServicos() {
  const { barbeiroLogado } = useAuth();

  const [servicos, setServicos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);

  const [criando, setCriando] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [nome, setNome] = useState("");
  const [preco, setPreco] = useState("");
  const [erroForm, setErroForm] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    carregarServicos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function carregarServicos() {
    setCarregando(true);
    setErro(null);
    try {
      const response = await api.get("/catalogo", { params: { barbeiroId: barbeiroLogado.id } });
      setServicos(response.data.filter((i) => i.tipo === "servico"));
    } catch (error) {
      setErro(extrairMensagemErro(error, "Não foi possível carregar seus serviços."));
    } finally {
      setCarregando(false);
    }
  }

  function abrirNovo() {
    setEditandoId(null);
    setNome("");
    setPreco("");
    setErroForm("");
    setCriando(true);
  }

  function abrirEdicao(servico) {
    setEditandoId(servico.id);
    setNome(servico.nome);
    setPreco(String(servico.preco));
    setErroForm("");
    setCriando(true);
  }

  function fecharForm() {
    setCriando(false);
    setEditandoId(null);
  }

  async function salvar(e) {
    e.preventDefault();
    const precoNumero = Number(preco);

    if (!nome.trim()) {
      setErroForm("Informe o nome do serviço.");
      return;
    }
    if (!Number.isFinite(precoNumero) || precoNumero <= 0) {
      setErroForm("Informe um preço válido.");
      return;
    }

    setErroForm("");
    setSalvando(true);
    try {
      if (editandoId) {
        await api.put(`/barbeiros/${barbeiroLogado.id}/servicos/${editandoId}`, {
          nome: nome.trim(),
          preco: precoNumero,
        });
      } else {
        await api.post(`/barbeiros/${barbeiroLogado.id}/servicos`, {
          nome: nome.trim(),
          preco: precoNumero,
        });
      }
      await carregarServicos();
      fecharForm();
    } catch (error) {
      setErroForm(extrairMensagemErro(error, "Não foi possível salvar o serviço."));
    } finally {
      setSalvando(false);
    }
  }

  async function remover(servico) {
    const confirmado = window.confirm(`Remover o serviço "${servico.nome}"?`);
    if (!confirmado) return;

    setErro(null);
    try {
      await api.delete(`/barbeiros/${barbeiroLogado.id}/servicos/${servico.id}`);
      await carregarServicos();
    } catch (error) {
      setErro(extrairMensagemErro(error, "Não foi possível remover o serviço."));
    }
  }

  return (
    <Layout>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white">Meus serviços</h1>
          <p className="text-zinc-400 mt-1">Serviços que você oferece, com seus preços.</p>
        </div>

        <button
          onClick={abrirNovo}
          className="bg-amber-600 text-black font-semibold px-4 py-2 rounded-lg hover:bg-amber-700"
        >
          Novo serviço
        </button>
      </div>

      {erro && <p className="text-red-400 mb-4">{erro}</p>}

      {criando && (
        <form onSubmit={salvar} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 mb-6">
          <h2 className="font-bold text-lg mb-3 text-zinc-100">{editandoId ? "Editar serviço" : "Novo serviço"}</h2>
          <div className="flex flex-wrap gap-3">
            <input
              type="text"
              placeholder="Nome (ex.: Corte Simples)"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="flex-1 min-w-[200px] bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-zinc-100 placeholder:text-zinc-500"
              disabled={salvando}
              autoFocus
            />
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="Preço"
              value={preco}
              onChange={(e) => setPreco(e.target.value)}
              className="w-40 bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-zinc-100 placeholder:text-zinc-500"
              disabled={salvando}
            />
            <button
              type="submit"
              disabled={salvando}
              className="px-4 py-2 bg-amber-600 text-black font-semibold rounded-lg hover:bg-amber-700 disabled:opacity-50"
            >
              {salvando ? "Salvando..." : "Salvar"}
            </button>
            <button
              type="button"
              onClick={fecharForm}
              disabled={salvando}
              className="px-4 py-2 border border-zinc-700 text-zinc-300 rounded-lg hover:bg-zinc-800"
            >
              Cancelar
            </button>
          </div>
          {erroForm && <p className="text-red-400 text-sm mt-2">{erroForm}</p>}
        </form>
      )}

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-zinc-950">
            <tr>
              <th className="text-left p-4 text-zinc-400 font-medium">Serviço</th>
              <th className="text-left p-4 text-zinc-400 font-medium">Preço</th>
              <th className="text-left p-4"></th>
            </tr>
          </thead>
          <tbody>
            {carregando ? (
              <SkeletonTableRows colunas={3} />
            ) : servicos.length === 0 ? (
              <tr>
                <td colSpan="3">
                  <EmptyState
                    icon="📋"
                    title="Nenhum serviço cadastrado"
                    description="Cadastre os serviços que você oferece, com preço, pra poder usá-los nos agendamentos."
                    actionLabel="Novo serviço"
                    onAction={abrirNovo}
                  />
                </td>
              </tr>
            ) : (
              servicos.map((s) => (
                <tr key={s.id} className="border-t border-zinc-800">
                  <td className="p-4 font-medium text-zinc-100">{s.nome}</td>
                  <td className="p-4 text-amber-500 font-medium">{formatarReais(s.preco)}</td>
                  <td className="p-4 text-right space-x-4">
                    <button onClick={() => abrirEdicao(s)} className="text-amber-500 hover:text-amber-400 text-sm">
                      Editar
                    </button>
                    <button onClick={() => remover(s)} className="text-red-400 hover:text-red-300 text-sm">
                      Remover
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Layout>
  );
}

export default MeusServicos;
