import { useState } from "react";
import { useBarbeiros } from "../context/useBarbeiros";

// `catalogo`: itens disponíveis pra ESSE barbeiro (os próprios serviços +
// produtos compartilhados), buscado pelo componente pai — ver mesma nota
// em AppointmentModal.jsx.

const FORMAS_PAGAMENTO = [
  { valor: "debito", rotulo: "Débito" },
  { valor: "credito", rotulo: "Crédito" },
  { valor: "dinheiro", rotulo: "Dinheiro" },
  { valor: "pix", rotulo: "Pix" },
];

function formatarReais(valor) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Abre a partir do botão "Finalizar atendimento" de um agendamento.
// Mostra o serviço já agendado (preço do catálogo), permite adicionar itens
// extra (produtos/serviços consumidos além do corte) e escolher a forma de
// pagamento antes de confirmar a venda.
function FinalizarAtendimentoModal({ isOpen, onClose, agendamento, catalogo = [], onFinalizado }) {
  const { finalizarAtendimento } = useBarbeiros();

  const [itensExtras, setItensExtras] = useState([]);
  const [itemParaAdicionar, setItemParaAdicionar] = useState("");
  const [formaPagamento, setFormaPagamento] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  if (!isOpen || !agendamento) return null;

  const catalogoMap = new Map(catalogo.map((i) => [i.nome, i]));
  const servicoBase = catalogoMap.get(agendamento.servico);

  const itensDisponiveis = catalogo.filter((i) => i.nome !== agendamento.servico);

  const itensVenda = [
    ...(servicoBase ? [{ nome: servicoBase.nome, preco: servicoBase.preco, quantidade: 1 }] : []),
    ...itensExtras,
  ];

  const total = itensVenda.reduce((soma, i) => soma + i.preco * i.quantidade, 0);

  function adicionarItem() {
    if (!itemParaAdicionar) return;
    const item = catalogoMap.get(itemParaAdicionar);
    if (!item) return;

    setItensExtras((prev) => {
      const existente = prev.find((i) => i.nome === item.nome);
      if (existente) {
        return prev.map((i) =>
          i.nome === item.nome ? { ...i, quantidade: i.quantidade + 1 } : i
        );
      }
      return [...prev, { nome: item.nome, preco: item.preco, quantidade: 1 }];
    });
    setItemParaAdicionar("");
  }

  function removerItem(nome) {
    setItensExtras((prev) => prev.filter((i) => i.nome !== nome));
  }

  function fecharEResetar() {
    setItensExtras([]);
    setItemParaAdicionar("");
    setFormaPagamento("");
    setErro("");
    setSalvando(false);
    onClose();
  }

  async function confirmar() {
    if (!formaPagamento) {
      setErro("Selecione a forma de pagamento.");
      return;
    }

    setErro("");
    setSalvando(true);

    const resultado = await finalizarAtendimento({
      agendamentoId: agendamento.id,
      formaPagamento,
      itens: itensVenda.map((i) => ({ nome: i.nome, quantidade: i.quantidade })),
    });

    setSalvando(false);

    if (!resultado.sucesso) {
      setErro(resultado.mensagem);
      return;
    }

    await onFinalizado?.();
    fecharEResetar();
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <h2 className="text-2xl font-bold mb-1 text-white">Finalizar atendimento</h2>
        <p className="text-zinc-400 mb-6">
          {agendamento.nome} • {agendamento.horario}
        </p>

        <div className="bg-zinc-950/50 rounded-xl border border-zinc-800 p-4 mb-4">
          <h3 className="font-semibold mb-3 text-zinc-100">Itens</h3>

          <div className="space-y-2">
            {itensVenda.map((item) => (
              <div key={item.nome} className="flex justify-between items-center border-b border-zinc-800 pb-2">
                <span className="text-zinc-300">
                  {item.nome}
                  {item.quantidade > 1 ? ` × ${item.quantidade}` : ""}
                </span>
                <div className="flex items-center gap-3">
                  <span className="text-zinc-100">{formatarReais(item.preco * item.quantidade)}</span>
                  {item.nome !== agendamento.servico && (
                    <button
                      onClick={() => removerItem(item.nome)}
                      className="text-red-400 text-sm hover:text-red-300"
                      disabled={salvando}
                    >
                      remover
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-2 mt-4">
            <select
              value={itemParaAdicionar}
              onChange={(e) => setItemParaAdicionar(e.target.value)}
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-zinc-100"
              disabled={salvando}
            >
              <option value="">Adicionar produto/serviço extra...</option>
              {itensDisponiveis.map((i) => (
                <option key={i.nome} value={i.nome}>
                  {i.nome} — {formatarReais(i.preco)}
                </option>
              ))}
            </select>
            <button
              onClick={adicionarItem}
              disabled={!itemParaAdicionar || salvando}
              className="px-4 py-2 border border-zinc-700 text-zinc-300 rounded-lg hover:bg-zinc-800 disabled:opacity-50"
            >
              Adicionar
            </button>
          </div>
        </div>

        <div className="bg-zinc-950/50 rounded-xl border border-zinc-800 p-4 mb-4">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold text-lg text-zinc-100">Total</h3>
            <span className="text-2xl font-bold text-amber-500">{formatarReais(total)}</span>
          </div>

          <p className="font-medium mb-2 text-sm text-zinc-400">Forma de pagamento</p>
          <div className="grid grid-cols-2 gap-3">
            {FORMAS_PAGAMENTO.map((f) => (
              <button
                key={f.valor}
                onClick={() => setFormaPagamento(f.valor)}
                disabled={salvando}
                className={`border rounded-lg py-3 transition ${
                  formaPagamento === f.valor
                    ? "border-amber-600 bg-amber-950/30 text-amber-500 font-semibold"
                    : "border-zinc-700 text-zinc-300 hover:border-amber-700/50"
                }`}
              >
                {f.rotulo}
              </button>
            ))}
          </div>
        </div>

        {erro && (
          <p className="text-red-400 text-sm mb-4" role="alert">
            {erro}
          </p>
        )}

        <div className="flex justify-end gap-3">
          <button
            onClick={fecharEResetar}
            disabled={salvando}
            className="px-4 py-2 border border-zinc-700 text-zinc-300 rounded-lg hover:bg-zinc-800 disabled:opacity-50"
          >
            Fechar
          </button>
          <button
            onClick={confirmar}
            disabled={salvando}
            className="px-6 py-2 bg-amber-600 text-black font-semibold rounded-lg hover:bg-amber-700 disabled:opacity-50"
          >
            {salvando ? "Confirmando..." : "Confirmar pagamento"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default FinalizarAtendimentoModal;
