import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import EmptyState from "../components/EmptyState";
import { SkeletonTableRows } from "../components/Skeleton";
import { useConfirm } from "../hooks/useConfirm";
import { useToast } from "../context/useToast";
import api from "../services/api";
import { hojeISO, formatarDataExibicao } from "../utils/date";
import { extrairMensagemErro } from "../utils/erro";

const CATEGORIAS = [
  { valor: "aluguel", rotulo: "Aluguel" },
  { valor: "produtos", rotulo: "Produtos/estoque" },
  { valor: "contas", rotulo: "Contas (água, luz...)" },
  { valor: "salario", rotulo: "Salário/comissão" },
  { valor: "manutencao", rotulo: "Manutenção" },
  { valor: "outros", rotulo: "Outros" },
];

function formatarReais(valor) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function rotuloCategoria(valor) {
  return CATEGORIAS.find((c) => c.valor === valor)?.rotulo ?? valor;
}

// Saídas de caixa (aluguel, compra de produto, contas...) — separadas das
// vendas pra dar o lucro real nos relatórios (ver Relatorios.jsx), não só
// o faturamento bruto.
function Despesas() {
  const { confirmar, modal } = useConfirm();
  const { mostrarToast } = useToast();

  const [despesas, setDespesas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);

  const [criando, setCriando] = useState(false);
  const [descricao, setDescricao] = useState("");
  const [categoria, setCategoria] = useState("outros");
  const [valor, setValor] = useState("");
  const [data, setData] = useState(hojeISO());
  const [erroForm, setErroForm] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function carregarDespesas() {
    setCarregando(true);
    setErro(null);
    try {
      const response = await api.get("/despesas");
      setDespesas(response.data);
    } catch (error) {
      setErro(extrairMensagemErro(error, "Não foi possível carregar as despesas."));
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carrega dados externos ao montar, não deriva estado local
    carregarDespesas();
  }, []);

  function abrirNovo() {
    setDescricao("");
    setCategoria("outros");
    setValor("");
    setData(hojeISO());
    setErroForm("");
    setCriando(true);
  }

  async function salvar(e) {
    e.preventDefault();
    const valorNumero = Number(valor);

    if (!descricao.trim()) {
      setErroForm("Informe a descrição da despesa.");
      return;
    }
    if (!Number.isFinite(valorNumero) || valorNumero <= 0) {
      setErroForm("Informe um valor válido (maior que zero).");
      return;
    }

    setErroForm("");
    setSalvando(true);
    try {
      const response = await api.post("/despesas", {
        descricao: descricao.trim(),
        categoria,
        valor: valorNumero,
        data,
      });
      setDespesas((prev) => [response.data, ...prev]);
      setCriando(false);
    } catch (error) {
      setErroForm(extrairMensagemErro(error, "Não foi possível salvar a despesa."));
    } finally {
      setSalvando(false);
    }
  }

  async function remover(despesa) {
    const ok = await confirmar({
      titulo: "Remover despesa",
      mensagem: `Remover "${despesa.descricao}" (${formatarReais(despesa.valor)})? Essa ação não pode ser desfeita.`,
      confirmarLabel: "Remover",
    });
    if (!ok) return;

    try {
      await api.delete(`/despesas/${despesa.id}`);
      setDespesas((prev) => prev.filter((d) => d.id !== despesa.id));
    } catch (error) {
      mostrarToast(extrairMensagemErro(error, "Não foi possível remover a despesa."), "erro");
    }
  }

  const totalListado = despesas.reduce((soma, d) => soma + d.valor, 0);

  return (
    <Layout>
      <div className="flex justify-between items-center mb-8 flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold text-white">Despesas</h1>
          <p className="text-zinc-400 mt-1">
            Saídas de caixa (aluguel, produtos, contas...) — usadas pra calcular o lucro real nos relatórios.
          </p>
        </div>

        <button
          onClick={abrirNovo}
          className="bg-amber-600 text-black font-semibold px-4 py-2 rounded-lg hover:bg-amber-700"
        >
          Nova despesa
        </button>
      </div>

      {erro && <p className="text-red-400 mb-4">{erro}</p>}

      {criando && (
        <form onSubmit={salvar} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 mb-6">
          <h2 className="font-bold text-lg mb-3 text-zinc-100">Nova despesa</h2>
          <div className="flex flex-wrap gap-3 mb-3">
            <input
              type="text"
              placeholder="Descrição (ex.: Aluguel de agosto)"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              className="flex-1 min-w-[200px] bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-zinc-100 placeholder:text-zinc-500"
              disabled={salvando}
              autoFocus
            />
            <select
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-zinc-100"
              disabled={salvando}
            >
              {CATEGORIAS.map((c) => (
                <option key={c.valor} value={c.valor}>
                  {c.rotulo}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap gap-3">
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="Valor"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              className="w-40 bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-zinc-100 placeholder:text-zinc-500"
              disabled={salvando}
            />
            <input
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-zinc-100"
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
              onClick={() => setCriando(false)}
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
        {!carregando && despesas.length === 0 ? (
          <EmptyState
            icon="🧾"
            title="Nenhuma despesa registrada"
            description="Registre aluguel, compras, contas e outras saídas de caixa pra acompanhar o lucro real, não só o faturamento."
            actionLabel="Nova despesa"
            onAction={abrirNovo}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px]">
              <thead className="bg-zinc-950">
                <tr>
                  <th className="text-left p-4 text-zinc-400 font-medium">Descrição</th>
                  <th className="text-left p-4 text-zinc-400 font-medium">Categoria</th>
                  <th className="text-left p-4 text-zinc-400 font-medium">Data</th>
                  <th className="text-left p-4 text-zinc-400 font-medium">Valor</th>
                  <th className="text-left p-4"></th>
                </tr>
              </thead>
              <tbody>
                {carregando ? (
                  <SkeletonTableRows colunas={5} />
                ) : (
                  <>
                    {despesas.map((d) => (
                      <tr key={d.id} className="border-t border-zinc-800">
                        <td className="p-4 font-medium text-zinc-100">{d.descricao}</td>
                        <td className="p-4 text-zinc-300">{rotuloCategoria(d.categoria)}</td>
                        <td className="p-4 text-zinc-300">{formatarDataExibicao(d.data)}</td>
                        <td className="p-4 text-red-400 font-medium">{formatarReais(d.valor)}</td>
                        <td className="p-4 text-right">
                          <button onClick={() => remover(d)} className="text-red-400 hover:text-red-300 text-sm">
                            Remover
                          </button>
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t border-zinc-800 bg-zinc-950/50">
                      <td className="p-4 font-semibold text-zinc-300" colSpan={3}>
                        Total listado
                      </td>
                      <td className="p-4 font-semibold text-red-400" colSpan={2}>
                        {formatarReais(totalListado)}
                      </td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal}
    </Layout>
  );
}

export default Despesas;
