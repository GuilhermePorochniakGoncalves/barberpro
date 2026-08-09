import { useEffect, useState } from "react";
import Layout from "../components/Layout";
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
          <h1 className="text-3xl font-bold text-gray-800">Relatórios</h1>
          <p className="text-gray-500 mt-1">{formatarMes(mes)}</p>
        </div>

        <input
          type="month"
          value={mes}
          onChange={(e) => setMes(e.target.value)}
          className="border rounded-lg p-3"
        />
      </div>

      {erro && <p className="text-red-600 mb-4">{erro}</p>}

      {carregando ? (
        <p className="text-gray-500 py-8 text-center">Carregando relatório...</p>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div className="bg-white p-6 rounded-2xl shadow">
              <p className="text-gray-500">Total de atendimentos</p>
              <h2 className="text-3xl font-bold text-blue-600 mt-2">
                {relatorio.totalAtendimentos}
              </h2>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow">
              <p className="text-gray-500">Faturamento total</p>
              <h2 className="text-3xl font-bold text-green-600 mt-2">
                {formatarReais(relatorio.faturamentoTotal)}
              </h2>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl shadow overflow-hidden">
              <h2 className="text-lg font-bold p-6 pb-4">Faturamento por barbeiro</h2>
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left p-4">Barbeiro</th>
                    <th className="text-left p-4">Atendimentos</th>
                    <th className="text-left p-4">Faturamento</th>
                  </tr>
                </thead>
                <tbody>
                  {relatorio.porBarbeiro.length === 0 ? (
                    <tr>
                      <td colSpan="3" className="p-6 text-center text-gray-500">
                        Nenhum atendimento neste mês.
                      </td>
                    </tr>
                  ) : (
                    relatorio.porBarbeiro.map((b) => (
                      <tr key={b.barbeiroId} className="border-t">
                        <td className="p-4 font-medium">{b.barbeiro}</td>
                        <td className="p-4">{b.atendimentos}</td>
                        <td className="p-4">{formatarReais(b.faturamento)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="bg-white rounded-2xl shadow overflow-hidden">
              <h2 className="text-lg font-bold p-6 pb-4">Formas de pagamento mais usadas</h2>
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left p-4">Forma</th>
                    <th className="text-left p-4">Quantidade</th>
                    <th className="text-left p-4">Faturamento</th>
                  </tr>
                </thead>
                <tbody>
                  {relatorio.porFormaPagamento.length === 0 ? (
                    <tr>
                      <td colSpan="3" className="p-6 text-center text-gray-500">
                        Nenhum pagamento neste mês.
                      </td>
                    </tr>
                  ) : (
                    relatorio.porFormaPagamento.map((f) => (
                      <tr key={f.formaPagamento} className="border-t">
                        <td className="p-4 font-medium">
                          {ROTULOS_PAGAMENTO[f.formaPagamento] ?? f.formaPagamento}
                        </td>
                        <td className="p-4">{f.quantidade}</td>
                        <td className="p-4">{formatarReais(f.faturamento)}</td>
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
