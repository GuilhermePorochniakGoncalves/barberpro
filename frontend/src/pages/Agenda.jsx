import { Fragment, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Layout from "../components/Layout";
import AppointmentModal from "../components/AppointmentModal";
import FinalizarAtendimentoModal from "../components/FinalizarAtendimentoModal";
import { SkeletonList } from "../components/Skeleton";
import api from "../services/api";
import { useBarbeiros } from "../context/useBarbeiros";
import { useToast } from "../context/useToast";
import { useDisponibilidade } from "../hooks/useDisponibilidade";
import { HORARIOS } from "../constants/schedule";
import { adicionarDias, ehHoje, formatarDataExibicao, hojeISO } from "../utils/date";
import { extrairMensagemErro } from "../utils/erro";
import { iniciais, corAvatar } from "../utils/avatar";

// Sem login: qualquer um (recepção, outro barbeiro cobrindo) gerencia a
// agenda de qualquer barbeiro — reflete como a barbearia funciona na
// prática (um barbeiro livre atende o cliente de outro que está ocupado).
//
// Rota única /agenda (em vez de /barbeiros/:id) — o barbeiro selecionado
// vira uma aba clicável no topo, trocada no cliente sem navegar de
// verdade. Guardamos a escolha em ?barbeiro= na querystring (não só em
// estado local) pra manter o link compartilhável/atualizável.
function Agenda() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const { barbeiros, carregando: carregandoBarbeiros } = useBarbeiros();
  const ativos = barbeiros.filter((b) => b.ativo);

  const barbeiroIdParam = Number(searchParams.get("barbeiro"));
  const barbeiro = ativos.find((b) => b.id === barbeiroIdParam) ?? ativos[0] ?? null;
  const barbeiroId = barbeiro?.id ?? null;

  // Sem barbeiro nenhum ainda selecionado na URL (primeira visita) mas já
  // temos a lista carregada: fixa o primeiro ativo na querystring.
  useEffect(() => {
    if (!carregandoBarbeiros && barbeiroId && barbeiroIdParam !== barbeiroId) {
      setSearchParams({ barbeiro: String(barbeiroId) }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carregandoBarbeiros, barbeiroId]);

  function selecionarBarbeiro(id) {
    setSearchParams({ barbeiro: String(id) });
  }

  const { mostrarToast } = useToast();

  const [dataSelecionada, setDataSelecionada] = useState(hojeISO());
  const [catalogo, setCatalogo] = useState([]);
  const [carregandoCatalogo, setCarregandoCatalogo] = useState(true);
  const [listaEspera, setListaEspera] = useState([]);
  const [horarioExpandido, setHorarioExpandido] = useState(null);
  const [erroAcao, setErroAcao] = useState(null);

  const {
    carregando: carregandoDisponibilidade,
    erro: erroDisponibilidade,
    recarregar: recarregarDisponibilidade,
    buscarAgendamento,
    diaInteiroBloqueado,
    bloqueioDoHorario,
  } = useDisponibilidade(barbeiroId, dataSelecionada);

  const carregando = carregandoDisponibilidade || carregandoCatalogo;
  const erro = erroAcao || erroDisponibilidade;

  const [modalOpen, setModalOpen] = useState(false);
  const [modalKey, setModalKey] = useState(0);
  const [horarioSelecionado, setHorarioSelecionado] = useState("");
  const [agendamentoSelecionado, setAgendamentoSelecionado] = useState(null);

  const [pagamentoOpen, setPagamentoOpen] = useState(false);
  const [agendamentoParaFinalizar, setAgendamentoParaFinalizar] = useState(null);

  async function carregarCatalogo() {
    setCarregandoCatalogo(true);
    try {
      const response = await api.get("/catalogo", { params: { barbeiroId } });
      setCatalogo(response.data);
    } catch (error) {
      setErroAcao(extrairMensagemErro(error, "Não foi possível carregar o catálogo."));
    } finally {
      setCarregandoCatalogo(false);
    }
  }

  async function carregarListaEspera() {
    try {
      const response = await api.get(`/barbeiros/${barbeiroId}/lista-espera`, {
        params: { data: dataSelecionada },
      });
      setListaEspera(response.data.filter((e) => e.status !== "cancelado"));
    } catch {
      // Não é crítico pra agenda funcionar — falha silenciosa aqui, o erro
      // de disponibilidade já aparece pra quem está usando a tela.
    }
  }

  useEffect(() => {
    if (!barbeiroId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carrega dados externos ao trocar de barbeiro, não deriva estado local
    carregarCatalogo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barbeiroId]);

  useEffect(() => {
    if (!barbeiroId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carrega dados externos ao trocar de barbeiro/dia, não deriva estado local
    carregarListaEspera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barbeiroId, dataSelecionada]);

  function listaEsperaDoHorario(horario) {
    return listaEspera.filter((e) => e.horario === horario);
  }

  async function removerDaListaEspera(entradaId) {
    try {
      await api.delete(`/barbeiros/${barbeiroId}/lista-espera/${entradaId}`);
      await carregarListaEspera();
    } catch (error) {
      setErroAcao(extrairMensagemErro(error, "Não foi possível remover da lista de espera."));
    }
  }

  function abrirModalSlot(horario) {
    const existente = buscarAgendamento(horario);
    setHorarioSelecionado(horario);
    setAgendamentoSelecionado(existente ?? null);
    setModalKey((k) => k + 1);
    setModalOpen(true);
  }

  function abrirModalNovo() {
    setHorarioSelecionado("");
    setAgendamentoSelecionado(null);
    setModalKey((k) => k + 1);
    setModalOpen(true);
  }

  function abrirFinalizar(agendamento) {
    setAgendamentoParaFinalizar(agendamento);
    setPagamentoOpen(true);
  }

  async function salvarAgendamento(dados) {
    try {
      const response = agendamentoSelecionado
        ? await api.put(`/agendamentos/${agendamentoSelecionado.id}`, dados)
        : await api.post("/agendamentos", dados);

      await recarregarDisponibilidade();
      return { sucesso: true, agendamento: response.data };
    } catch (error) {
      return {
        sucesso: false,
        mensagem: extrairMensagemErro(error, "Não foi possível salvar o agendamento."),
      };
    }
  }

  async function cancelarAgendamento(agendamentoId) {
    try {
      const response = await api.delete(`/agendamentos/${agendamentoId}`);
      await Promise.all([recarregarDisponibilidade(), carregarListaEspera()]);

      const notificados = response.data?.notificadosListaEspera ?? 0;
      if (notificados > 0) {
        mostrarToast(
          notificados === 1
            ? "1 pessoa da lista de espera foi notificada que esse horário abriu."
            : `${notificados} pessoas da lista de espera foram notificadas que esse horário abriu.`,
          "aviso"
        );
      }

      return { sucesso: true };
    } catch (error) {
      return {
        sucesso: false,
        mensagem: extrairMensagemErro(error, "Não foi possível cancelar o agendamento."),
      };
    }
  }

  async function alternarBloqueioDia() {
    setErroAcao(null);
    try {
      if (diaInteiroBloqueado) {
        await api.delete(`/barbeiros/${barbeiroId}/bloqueios/${diaInteiroBloqueado.id}`);
      } else {
        await api.post(`/barbeiros/${barbeiroId}/bloqueios`, { data: dataSelecionada });
      }
      await recarregarDisponibilidade();
    } catch (error) {
      setErroAcao(extrairMensagemErro(error, "Não foi possível atualizar a folga do dia."));
    }
  }

  async function bloquearHorario(horario) {
    setErroAcao(null);
    try {
      await api.post(`/barbeiros/${barbeiroId}/bloqueios`, { data: dataSelecionada, horario });
      await recarregarDisponibilidade();
    } catch (error) {
      setErroAcao(extrairMensagemErro(error, "Não foi possível bloquear o horário."));
    }
  }

  async function desbloquearHorario(bloqueioId) {
    setErroAcao(null);
    try {
      await api.delete(`/barbeiros/${barbeiroId}/bloqueios/${bloqueioId}`);
      await recarregarDisponibilidade();
    } catch (error) {
      setErroAcao(extrairMensagemErro(error, "Não foi possível desbloquear o horário."));
    }
  }

  async function aoFinalizarAtendimento() {
    await recarregarDisponibilidade();
  }

  if (!carregandoBarbeiros && ativos.length === 0) {
    return (
      <Layout>
        <p className="text-zinc-400">
          Nenhum barbeiro ativo cadastrado ainda.{" "}
          <button className="text-amber-500 hover:text-amber-400 underline" onClick={() => navigate("/barbeiros")}>
            Cadastrar barbeiro
          </button>
        </p>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-3xl font-bold text-white">Agenda</h1>

        {barbeiro && (
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate(`/agendar/${barbeiroId}`)}
              className="text-sm text-zinc-400 hover:text-zinc-200"
            >
              Link público de agendamento
            </button>
            <button
              onClick={() => navigate(`/barbeiros/${barbeiroId}/servicos`)}
              className="text-sm text-amber-500 hover:text-amber-400"
            >
              Gerenciar serviços
            </button>
          </div>
        )}
      </div>

      {/* Abas de barbeiro — troca a agenda exibida sem navegar de página.
          flex-wrap em vez de scroll horizontal: em mobile as pills quebram
          linha em vez de cortar. */}
      <div className="flex flex-wrap gap-2 mb-6">
        {ativos.map((b) => {
          const ativa = b.id === barbeiroId;
          return (
            <button
              key={b.id}
              onClick={() => selecionarBarbeiro(b.id)}
              className={`flex items-center gap-2 pl-2 pr-4 py-2 rounded-full border text-sm font-semibold transition ${
                ativa
                  ? "bg-amber-600/15 border-amber-600 text-white"
                  : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
              }`}
            >
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold ${corAvatar(
                  b.nome
                )}`}
              >
                {iniciais(b.nome)}
              </span>
              {b.nome}
            </button>
          );
        })}
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div className="flex items-center flex-wrap gap-3">
            <button
              onClick={() => setDataSelecionada((d) => adicionarDias(d, -1))}
              className="px-3 py-2 border border-zinc-700 text-zinc-300 rounded-lg hover:bg-zinc-800"
              aria-label="Dia anterior"
            >
              ←
            </button>

            <div className="text-center">
              <p className="font-semibold text-zinc-100 whitespace-nowrap">{formatarDataExibicao(dataSelecionada)}</p>
              {ehHoje(dataSelecionada) && <p className="text-xs text-amber-500">Hoje</p>}
            </div>

            <button
              onClick={() => setDataSelecionada((d) => adicionarDias(d, 1))}
              className="px-3 py-2 border border-zinc-700 text-zinc-300 rounded-lg hover:bg-zinc-800"
              aria-label="Próximo dia"
            >
              →
            </button>

            <input
              type="date"
              value={dataSelecionada}
              onChange={(e) => setDataSelecionada(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-sm text-zinc-100"
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={alternarBloqueioDia}
              className={`px-4 py-2 rounded-lg border text-sm ${
                diaInteiroBloqueado
                  ? "border-red-900/50 text-red-400 hover:bg-red-950/30"
                  : "border-zinc-700 text-zinc-300 hover:bg-zinc-800"
              }`}
            >
              {diaInteiroBloqueado ? "Remover folga do dia" : "Marcar folga (dia inteiro)"}
            </button>

            <button
              onClick={abrirModalNovo}
              className="bg-amber-600 text-black font-semibold px-4 py-2 rounded-lg hover:bg-amber-700"
            >
              Novo agendamento
            </button>
          </div>
        </div>

        {erro && <p className="text-red-400 text-sm mb-4">{erro}</p>}

        {diaInteiroBloqueado && (
          <p className="text-sm text-red-400 bg-red-950/20 border border-red-900/40 rounded-lg p-3 mb-4">
            {barbeiro?.nome} está de folga neste dia.
          </p>
        )}

        {carregando ? (
          <SkeletonList linhas={HORARIOS.length} />
        ) : (
          <div className="space-y-2">
            {HORARIOS.map((horario) => {
              const agendamento = buscarAgendamento(horario);
              const concluido = agendamento?.status === "concluido";
              const bloqueioEspecifico = bloqueioDoHorario(horario);
              const bloqueado = Boolean(diaInteiroBloqueado || bloqueioEspecifico);
              const espera = listaEsperaDoHorario(horario);

              return (
                <Fragment key={horario}>
                <div
                  className={`flex flex-wrap items-center gap-3 rounded-xl border p-3 ${
                    agendamento
                      ? concluido
                        ? "bg-zinc-900/40 border-zinc-800"
                        : "bg-zinc-800/60 border-zinc-700"
                      : bloqueado
                        ? "bg-red-950/20 border-red-900/30"
                        : "border-zinc-800"
                  }`}
                >
                  <span className="w-14 font-medium text-zinc-500">{horario}</span>

                  {agendamento ? (
                    <>
                      <div className="flex-1 min-w-[140px]">
                        <p className={`font-semibold ${concluido ? "text-zinc-600 line-through" : "text-zinc-100"}`}>
                          {agendamento.nome}
                        </p>
                        <p className="text-sm text-zinc-500">{agendamento.servico}</p>
                      </div>

                      {concluido ? (
                        <span className="text-sm text-zinc-500 px-3 py-2">Concluído ✓</span>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => abrirModalSlot(horario)}
                            className="px-3 py-2 border border-zinc-700 text-zinc-300 rounded-lg hover:bg-zinc-800 text-sm"
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => abrirFinalizar(agendamento)}
                            className="px-3 py-2 bg-amber-600 text-black font-semibold rounded-lg hover:bg-amber-700 text-sm"
                          >
                            Finalizar atendimento
                          </button>
                        </div>
                      )}
                    </>
                  ) : bloqueado ? (
                    <div className="flex-1 min-w-[160px] flex items-center justify-between">
                      <span className="text-red-400 text-sm">
                        {diaInteiroBloqueado ? "Folga do dia" : "Bloqueado"}
                      </span>
                      {bloqueioEspecifico && (
                        <button
                          onClick={() => desbloquearHorario(bloqueioEspecifico.id)}
                          className="text-sm text-zinc-500 hover:text-zinc-300"
                        >
                          Desbloquear
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="flex-1 min-w-[160px] flex items-center justify-between">
                      <button
                        onClick={() => abrirModalSlot(horario)}
                        className="text-left text-zinc-500 hover:text-amber-500 py-2"
                      >
                        Livre — clique para agendar
                      </button>
                      <button
                        onClick={() => bloquearHorario(horario)}
                        className="text-sm text-zinc-600 hover:text-red-400"
                      >
                        Bloquear
                      </button>
                    </div>
                  )}

                  {espera.length > 0 && (
                    <button
                      onClick={() => setHorarioExpandido(horarioExpandido === horario ? null : horario)}
                      className="text-xs text-amber-500 hover:text-amber-400 bg-amber-950/20 border border-amber-900/30 rounded-full px-2 py-1 whitespace-nowrap"
                    >
                      🔔 {espera.length} na espera
                    </button>
                  )}
                </div>

                {horarioExpandido === horario && espera.length > 0 && (
                  <div className="ml-14 -mt-1 mb-1 bg-zinc-950/60 border border-zinc-800 rounded-lg p-3 space-y-2">
                    {espera.map((entrada) => (
                      <div key={entrada.id} className="flex items-center justify-between text-sm">
                        <span className="text-zinc-300">
                          {entrada.nome} • {entrada.telefone}
                          {entrada.status === "notificado" && (
                            <span className="text-amber-500 ml-2">notificado</span>
                          )}
                        </span>
                        <button
                          onClick={() => removerDaListaEspera(entrada.id)}
                          className="text-zinc-600 hover:text-red-400 text-xs"
                        >
                          remover
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                </Fragment>
              );
            })}
          </div>
        )}
      </div>

      <AppointmentModal
        key={modalKey}
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        barbeiroId={barbeiroId}
        data={dataSelecionada}
        horario={horarioSelecionado}
        agendamento={agendamentoSelecionado}
        catalogo={catalogo}
        onSave={salvarAgendamento}
        onCancelar={cancelarAgendamento}
      />

      <FinalizarAtendimentoModal
        key={`pagamento-${agendamentoParaFinalizar?.id ?? "novo"}`}
        isOpen={pagamentoOpen}
        onClose={() => setPagamentoOpen(false)}
        agendamento={agendamentoParaFinalizar}
        catalogo={catalogo}
        onFinalizado={aoFinalizarAtendimento}
      />
    </Layout>
  );
}

export default Agenda;
