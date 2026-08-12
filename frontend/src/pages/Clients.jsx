import { Fragment, useEffect, useState } from "react";
import Layout from "../components/Layout";
import EmptyState from "../components/EmptyState";
import { SkeletonTableRows } from "../components/Skeleton";
import { useConfirm } from "../hooks/useConfirm";
import { useBarber } from "../context/useBarber";
import { useToast } from "../context/useToast";
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
  const { clientes, carregando, erro, recarregar, criarCliente, atualizarCliente, removerCliente } = useBarber();
  const { confirmar, modal } = useConfirm();
  const { mostrarToast } = useToast();

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

  const [criando, setCriando] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [erroForm, setErroForm] = useState("");
  const [salvando, setSalvando] = useState(false);

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

  function abrirNovo() {
    setEditandoId(null);
    setNome("");
    setTelefone("");
    setObservacoes("");
    setErroForm("");
    setCriando(true);
  }

  function abrirEdicao(cliente) {
    setEditandoId(cliente.id);
    setNome(cliente.nome);
    setTelefone(cliente.telefone);
    setObservacoes(cliente.observacoes ?? "");
    setErroForm("");
    setCriando(true);
  }

  function fecharForm() {
    setCriando(false);
    setEditandoId(null);
  }

  async function salvar(e) {
    e.preventDefault();

    if (!nome.trim()) {
      setErroForm("Informe o nome do cliente.");
      return;
    }

    setErroForm("");
    setSalvando(true);

    const dados = { nome: nome.trim(), telefone, observacoes: observacoes.trim() };
    const resultado = editandoId ? await atualizarCliente(editandoId, dados) : await criarCliente(dados);

    setSalvando(false);

    if (!resultado.sucesso) {
      setErroForm(resultado.mensagem);
      return;
    }

    fecharForm();
  }

  async function remover(cliente) {
    const ok = await confirmar({
      titulo: "Remover cliente",
      mensagem: `Remover "${cliente.nome}"? O histórico de atendimentos já feitos não é apagado, só o cadastro.`,
      confirmarLabel: "Remover",
    });
    if (!ok) return;

    const resultado = await removerCliente(cliente.id);
    if (!resultado.sucesso) {
      mostrarToast(resultado.mensagem, "erro");
    }
  }

  return (
    <Layout>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-white">Clientes</h1>

        <button
          onClick={abrirNovo}
          className="bg-amber-600 text-black font-semibold px-4 py-2 rounded-lg hover:bg-amber-700"
        >
          Novo cliente
        </button>
      </div>

      {erro && <p className="text-red-400 mb-4">{erro}</p>}

      {criando && (
        <form onSubmit={salvar} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 mb-6">
          <h2 className="font-bold text-lg mb-3 text-zinc-100">{editandoId ? "Editar cliente" : "Novo cliente"}</h2>
          <div className="flex flex-wrap gap-3 mb-3">
            <input
              type="text"
              placeholder="Nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="flex-1 min-w-[200px] bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-zinc-100 placeholder:text-zinc-500"
              disabled={salvando}
              autoFocus
            />
            <input
              type="tel"
              placeholder="Telefone (DDD + número)"
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              className="w-56 bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-zinc-100 placeholder:text-zinc-500"
              disabled={salvando}
            />
          </div>
          <textarea
            placeholder="Observações/preferências (ex.: gosta de degradê baixo, alérgico a produto X)"
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
            rows={2}
            maxLength={500}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-zinc-100 placeholder:text-zinc-500 mb-3"
            disabled={salvando}
          />
          <div className="flex gap-3">
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
        {!carregando && clientes.length === 0 ? (
          <EmptyState
            icon="👤"
            title="Nenhum cliente cadastrado"
            description="Cadastre um cliente aqui, ou deixe que ele apareça sozinho assim que alguém agendar um horário."
            actionLabel="Novo cliente"
            onAction={abrirNovo}
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
                    <td className="p-4">
                      <p className="font-medium text-zinc-100">{cliente.nome}</p>
                      {cliente.observacoes && (
                        <p className="text-xs text-amber-500 mt-1">📝 {cliente.observacoes}</p>
                      )}
                    </td>
                    <td className="p-4 text-zinc-300">{cliente.telefone}</td>
                    <td className="p-4 text-zinc-300">{formatarDataHora(cliente.ultimo_atendimento)}</td>
                    <td className="p-4 text-right space-x-3 whitespace-nowrap">
                      <button
                        onClick={() => alternarHistorico(cliente)}
                        className="text-amber-500 text-sm font-medium hover:text-amber-400"
                      >
                        {expandido === cliente.id ? "Ocultar histórico" : "Ver histórico"}
                      </button>
                      <button onClick={() => abrirEdicao(cliente)} className="text-zinc-400 text-sm hover:text-zinc-200">
                        Editar
                      </button>
                      <button onClick={() => remover(cliente)} className="text-red-400 text-sm hover:text-red-300">
                        Remover
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

      {modal}
    </Layout>
  );
}

export default Clients;
