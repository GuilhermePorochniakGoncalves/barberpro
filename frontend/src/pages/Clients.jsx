import { Fragment, useEffect, useState } from "react";
import Layout from "../components/Layout";
import EmptyState from "../components/EmptyState";
import { SkeletonTableRows } from "../components/Skeleton";
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
  // Postgres/pg já devolve ISO8601 (ex.: '2026-08-10T14:30:00.000Z').
  return new Date(valor).toLocaleString("pt-BR", {
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
        <h1 className="text-3xl font-bold text-white">
          Clientes
        </h1>
      </div>

      {erro && <p className="text-red-400 mb-4">{erro}</p>}

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        {!carregando && clientes.length === 0 ? (
          <EmptyState
            icon="👤"
            title="Nenhum cliente cadastrado"
            description="Os clientes aparecem aqui automaticamente assim que alguém agendar um horário."
          />
        ) : (
        <div className="overflow-x-auto">
        <table className="w-full min-w-[600px]">
          <thead className="bg-zinc-950">
            <tr>
              <th className="text-left p-4 text-zinc-400 font-medium">Nome</th>
              <th className="text-left p-4 text-zinc-400 font-medium">Telefone</th>
              <th className="text-left p-4 text-zinc-400 font-medium">Último atendimento</th>
              <th className="text-left p-4"></th>
            </tr>
          </thead>

          <tbody>
            {carregando ? (
              <SkeletonTableRows colunas={4} />
            ) : (
              clientes.map((cliente) => (
                <Fragment key={cliente.id}>
                  <tr className="border-t border-zinc-800">
                    <td className="p-4 font-medium text-zinc-100">{cliente.nome}</td>
                    <td className="p-4 text-zinc-300">{cliente.telefone}</td>
                    <td className="p-4 text-zinc-300">{formatarDataHora(cliente.ultimo_atendimento)}</td>
                    <td className="p-4 text-right">
                      <button
                        onClick={() => alternarHistorico(cliente)}
                        className="text-amber-500 text-sm font-medium hover:text-amber-400"
                      >
                        {expandido === cliente.id ? "Ocultar histórico" : "Ver histórico"}
                      </button>
                    </td>
                  </tr>

                  {expandido === cliente.id && (
                    <tr className="border-t border-zinc-800 bg-zinc-950/50">
                      <td colSpan="4" className="p-4">
                        {carregandoHistorico === cliente.id ? (
                          <p className="text-zinc-500">Carregando histórico...</p>
                        ) : historicos[cliente.id]?.erro ? (
                          <p className="text-red-400">{historicos[cliente.id].erro}</p>
                        ) : historicos[cliente.id]?.length === 0 ? (
                          <p className="text-zinc-500">Nenhum atendimento concluído ainda.</p>
                        ) : (
                          <ul className="space-y-2">
                            {historicos[cliente.id]?.map((venda) => (
                              <li
                                key={venda.id}
                                className="flex justify-between items-center bg-zinc-900 border border-zinc-800 rounded-lg p-3"
                              >
                                <span className="text-zinc-300">
                                  {formatarDataHora(venda.criado_em)} • {venda.barbeiro_nome} •{" "}
                                  {ROTULOS_PAGAMENTO[venda.forma_pagamento] ?? venda.forma_pagamento}
                                </span>
                                <span className="font-semibold text-amber-500">
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
        )}
      </div>
    </Layout>
  );
}

export default Clients;
