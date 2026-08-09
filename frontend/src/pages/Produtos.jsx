import { useState } from "react";
import Layout from "../components/Layout";
import EmptyState from "../components/EmptyState";
import { SkeletonTableRows } from "../components/Skeleton";
import { useConfirm } from "../hooks/useConfirm";
import { useBarbeiros } from "../context/useBarbeiros";

function formatarReais(valor) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Produtos são compartilhados pela barbearia inteira (pomada, óleo de
// barba etc.) — qualquer um gerencia preço e estoque. O estoque é baixado
// automaticamente quando o produto é vendido no fechamento de um
// atendimento (ver FinalizarAtendimentoModal).
function Produtos() {
  const { produtos, carregando, erro, criarProduto, atualizarProduto, removerProduto } = useBarbeiros();
  const { confirmar, modal } = useConfirm();

  const [criando, setCriando] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [nome, setNome] = useState("");
  const [preco, setPreco] = useState("");
  const [estoque, setEstoque] = useState("");
  const [erroForm, setErroForm] = useState("");
  const [salvando, setSalvando] = useState(false);

  function abrirNovo() {
    setEditandoId(null);
    setNome("");
    setPreco("");
    setEstoque("");
    setErroForm("");
    setCriando(true);
  }

  function abrirEdicao(produto) {
    setEditandoId(produto.id);
    setNome(produto.nome);
    setPreco(String(produto.preco));
    setEstoque(String(produto.estoque));
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
    const estoqueNumero = Number(estoque);

    if (!nome.trim()) {
      setErroForm("Informe o nome do produto.");
      return;
    }
    if (!Number.isFinite(precoNumero) || precoNumero <= 0) {
      setErroForm("Informe um preço válido.");
      return;
    }
    if (!Number.isInteger(estoqueNumero) || estoqueNumero < 0) {
      setErroForm("Informe um estoque válido (número inteiro, 0 ou mais).");
      return;
    }

    setErroForm("");
    setSalvando(true);

    const dados = { nome: nome.trim(), preco: precoNumero, estoque: estoqueNumero };
    const resultado = editandoId
      ? await atualizarProduto(editandoId, dados)
      : await criarProduto(dados);

    setSalvando(false);

    if (!resultado.sucesso) {
      setErroForm(resultado.mensagem);
      return;
    }

    fecharForm();
  }

  async function remover(produto) {
    const ok = await confirmar({
      titulo: "Remover produto",
      mensagem: `Remover o produto "${produto.nome}"? Essa ação não pode ser desfeita.`,
      confirmarLabel: "Remover",
    });
    if (!ok) return;
    await removerProduto(produto.id);
  }

  return (
    <Layout>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white">Produtos</h1>
          <p className="text-zinc-400 mt-1">Catálogo compartilhado, com estoque da barbearia.</p>
        </div>

        <button
          onClick={abrirNovo}
          className="bg-amber-600 text-black font-semibold px-4 py-2 rounded-lg hover:bg-amber-700"
        >
          Novo produto
        </button>
      </div>

      {erro && <p className="text-red-400 mb-4">{erro}</p>}

      {criando && (
        <form onSubmit={salvar} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 mb-6">
          <h2 className="font-bold text-lg mb-3 text-zinc-100">{editandoId ? "Editar produto" : "Novo produto"}</h2>
          <div className="flex flex-wrap gap-3">
            <input
              type="text"
              placeholder="Nome (ex.: Pomada modeladora)"
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
              className="w-32 bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-zinc-100 placeholder:text-zinc-500"
              disabled={salvando}
            />
            <input
              type="number"
              min="0"
              placeholder="Estoque"
              value={estoque}
              onChange={(e) => setEstoque(e.target.value)}
              className="w-32 bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-zinc-100 placeholder:text-zinc-500"
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
              <th className="text-left p-4 text-zinc-400 font-medium">Produto</th>
              <th className="text-left p-4 text-zinc-400 font-medium">Preço</th>
              <th className="text-left p-4 text-zinc-400 font-medium">Estoque</th>
              <th className="text-left p-4"></th>
            </tr>
          </thead>
          <tbody>
            {carregando ? (
              <SkeletonTableRows colunas={4} />
            ) : produtos.length === 0 ? (
              <tr>
                <td colSpan="4">
                  <EmptyState
                    icon="🧴"
                    title="Nenhum produto cadastrado"
                    description="Cadastre os produtos vendidos na barbearia, com preço e estoque."
                    actionLabel="Novo produto"
                    onAction={abrirNovo}
                  />
                </td>
              </tr>
            ) : (
              produtos.map((p) => (
                <tr key={p.id} className="border-t border-zinc-800">
                  <td className="p-4 font-medium text-zinc-100">{p.nome}</td>
                  <td className="p-4 text-amber-500 font-medium">{formatarReais(p.preco)}</td>
                  <td className={`p-4 ${p.estoque <= 3 ? "text-red-400 font-semibold" : "text-zinc-300"}`}>
                    {p.estoque}
                  </td>
                  <td className="p-4 text-right space-x-4">
                    <button onClick={() => abrirEdicao(p)} className="text-amber-500 hover:text-amber-400 text-sm">
                      Editar
                    </button>
                    <button onClick={() => remover(p)} className="text-red-400 hover:text-red-300 text-sm">
                      Remover
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {modal}
    </Layout>
  );
}

export default Produtos;
