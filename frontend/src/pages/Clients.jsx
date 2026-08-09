import { Fragment, useEffect, useState } from "react";
import Layout from "../components/Layout";
import { useBarber } from "../context/useBarber";
import api from "../services/api";
import { extrairMensagemErro } from "../utils/erro";

const ROTULOS_PAGAMENTO = {
  debito: "Débito",
  credito: "Crédito",
  dinheiro: "Dinheiro",
  pix: "Pix",
};

function formatarReais(valor) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarDataHora(valor) {
  if (!valor) return "Nunca";
  // vem como 'YYYY-MM-DD HH:MM:SS' (UTC do SQLite)
  return new Date(valor.replace(" ", "T") + "Z").toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function Clients() {
  const { clientes, carregando, erro, recarregar } = useBarber();

  // O contexto carrega clientes uma vez no mount do App; como clientes
  // também são criados/atualizados indiretamente (ao agendar, ao finalizar
  // um atendimento), recarrega toda vez que esta página é visitada.
  useEffect(() => {
    recarregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [expandido, setExpandido] = useState(null);
  const [historicos, setHistoricos] = useState({});
  const [carregandoHistorico, setCarregandoHistorico] = useState(null);

  async function alternarHistorico(cliente) {
    if (expandido === cliente.id) {
      setExpandido(null);
      return;
    }

    setExpandido(cliente.id);

    if (historicos[cliente.id]) return;

    setCarregandoHistorico(cliente.id);
    try {
      const response = await api.get(`/clientes/${cliente.id}/historico`);
      setHistoricos((prev) => ({ ...prev, [cliente.id]: response.data.vendas }));
    } catch (error) {
      setHistoricos((prev) => ({
        ...prev,
        [cliente.id]: { erro: extrairMensagemErro(error, "Não foi possível carregar o histórico.") },
      }));
    } finally {
      setCarregandoHistorico(null);
    }
  }

  return (
    <Layout>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-800">
          Clientes
        </h1>
      </div>

      {erro && <p className="text-red-600 mb-4">{erro}</p>}

      <div className="bg-white rounded-2xl shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left p-4">Nome</th>
              <th className="text-left p-4">Telefone</th>
              <th className="text-left p-4">Último atendimento</th>
              <th className="text-left p-4"></th>
            </tr>
          </thead>

          <tbody>
            {carregando ? (
              <tr>
                <td colSpan="4" className="p-8 text-center text-gray-500">
                  Carregando...
                </td>
              </tr>
            ) : clientes.length === 0 ? (
              <tr>
                <td colSpan="4" className="p-8 text-center text-gray-500">
                  Nenhum cliente cadastrado
                </td>
              </tr>
            ) : (
              clientes.map((cliente) => (
                <Fragment key={cliente.id}>
                  <tr className="border-t">
                    <td className="p-4 font-medium">{cliente.nome}</td>
                    <td className="p-4">{cliente.telefone}</td>
                    <td className="p-4">{formatarDataHora(cliente.ultimo_atendimento)}</td>
                    <td className="p-4 text-right">
                      <button
                        onClick={() => alternarHistorico(cliente)}
                        className="text-green-700 text-sm font-medium hover:underline"
                      >
                        {expandido === cliente.id ? "Ocultar histórico" : "Ver histórico"}
                      </button>
                    </td>
                  </tr>

                  {expandido === cliente.id && (
                    <tr className="border-t bg-gray-50">
                      <td colSpan="4" className="p-4">
                        {carregandoHistorico === cliente.id ? (
                          <p className="text-gray-500">Carregando histórico...</p>
                        ) : historicos[cliente.id]?.erro ? (
                          <p className="text-red-600">{historicos[cliente.id].erro}</p>
                        ) : historicos[cliente.id]?.length === 0 ? (
                          <p className="text-gray-500">Nenhum atendimento concluído ainda.</p>
                        ) : (
                          <ul className="space-y-2">
                            {historicos[cliente.id]?.map((venda) => (
                              <li
                                key={venda.id}
                                className="flex justify-between items-center bg-white rounded-lg border p-3"
                              >
                                <span>
                                  {formatarDataHora(venda.criado_em)} • {venda.barbeiro_nome} •{" "}
                                  {ROTULOS_PAGAMENTO[venda.forma_pagamento] ?? venda.forma_pagamento}
                                </span>
                                <span className="font-semibold text-green-700">
                                  {formatarReais(venda.valor_total)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Layout>
  );
}

export default Clients;
