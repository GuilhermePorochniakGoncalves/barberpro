import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import { Skeleton, SkeletonStatCards, SkeletonTableRows } from "../components/Skeleton";
import api from "../services/api";
import { mesAtualISO } from "../utils/date";
import { extrairMensagemErro } from "../utils/erro";

const ROTULOS_PAGAMENTO = {
  debito: "Débito",
  credito: "Crédito",
  dinheiro: "Dinheiro",
  pix: "Pix",
};

function formatarReais(valor) {
  return (valor ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarMes(mesISO) {
  const [ano, mes] = mesISO.split("-").map(Number);
  const nome = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(
    new Date(ano, mes - 1, 1)
  );
  return nome.charAt(0).toUpperCase() + nome.slice(1);
}

function Relatorios() {
  const [mes, setMes] = useState(mesAtualISO());
  const [relatorio, setRelatorio] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability
    carregarRelatorio();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mes]);

  async function carregarRelatorio() {
    setCarregando(true);
    setErro(null);
    try {
      const response = await api.get("/relatorios/mensal", { params: { mes } });
      setRelatorio(response.data);
    } catch (error) {
      setErro(extrairMensagemErro(error, "Não foi possível carregar o relatório."));
    } finally {
      setCarregando(false);
    }
  }

  return (
    <Layout>
      <div className="flex justify-between items-center mb-8 flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">Relatórios</h1>
          <p className="text-zinc-400 mt-1">{formatarMes(mes)}</p>
        </div>

        <input
          type="month"
          value={mes}
          onChange={(e) => setMes(e.target.value)}
          className="bg-zinc-900 border border-zinc-700 rounded-lg p-3 text-zinc-100"
        />
      </div>

      {erro && <p className="text-red-400 mb-4">{erro}</p>}

      {carregando ? (
        <>
          <SkeletonStatCards />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {[0, 1].map((i) => (
              <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
                <div className="p-6 pb-4">
                  <Skeleton className="h-5 w-48" />
                </div>
                <table className="w-full">
                  <tbody>
                    <SkeletonTableRows colunas={3} linhas={4} />
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl">
              <p className="text-zinc-400">Total de atendimentos</p>
              <h2 className="text-3xl font-bold text-amber-500 mt-2">
                {relatorio.totalAtendimentos}
              </h2>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl">
              <p className="text-zinc-400">Faturamento total</p>
              <h2 className="text-3xl font-bold text-amber-500 mt-2">
                {formatarReais(relatorio.faturamentoTotal)}
              </h2>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
              <h2 className="text-lg font-bold p-6 pb-4 text-zinc-100">Faturamento por barbeiro</h2>
              <table className="w-full">
                <thead className="bg-zinc-950">
                  <tr>
                    <th className="text-left p-4 text-zinc-400 font-medium">Barbeiro</th>
                    <th className="text-left p-4 text-zinc-400 font-medium">Atendimentos</th>
                    <th className="text-left p-4 text-zinc-400 font-medium">Faturamento</th>
                  </tr>
                </thead>
                <tbody>
                  {relatorio.porBarbeiro.length === 0 ? (
                    <tr>
                      <td colSpan="3" className="p-6 text-center text-zinc-500">
                        Nenhum atendimento neste mês.
                      </td>
                    </tr>
                  ) : (
                    relatorio.porBarbeiro.map((b) => (
                      <tr key={b.barbeiroId} className="border-t border-zinc-800">
                        <td className="p-4 font-medium text-zinc-100">{b.barbeiro}</td>
                        <td className="p-4 text-zinc-300">{b.atendimentos}</td>
                        <td className="p-4 text-amber-500 font-medium">{formatarReais(b.faturamento)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
              <h2 className="text-lg font-bold p-6 pb-4 text-zinc-100">Formas de pagamento mais usadas</h2>
              <table className="w-full">
                <thead className="bg-zinc-950">
                  <tr>
                    <th className="text-left p-4 text-zinc-400 font-medium">Forma</th>
                    <th className="text-left p-4 text-zinc-400 font-medium">Quantidade</th>
                    <th className="text-left p-4 text-zinc-400 font-medium">Faturamento</th>
                  </tr>
                </thead>
                <tbody>
                  {relatorio.porFormaPagamento.length === 0 ? (
                    <tr>
                      <td colSpan="3" className="p-6 text-center text-zinc-500">
                        Nenhum pagamento neste mês.
                      </td>
                    </tr>
                  ) : (
                    relatorio.porFormaPagamento.map((f) => (
                      <tr key={f.formaPagamento} className="border-t border-zinc-800">
                        <td className="p-4 font-medium text-zinc-100">
                          {ROTULOS_PAGAMENTO[f.formaPagamento] ?? f.formaPagamento}
                        </td>
                        <td className="p-4 text-zinc-300">{f.quantidade}</td>
                        <td className="p-4 text-amber-500 font-medium">{formatarReais(f.faturamento)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </Layout>
  );
}

export default Relatorios;
