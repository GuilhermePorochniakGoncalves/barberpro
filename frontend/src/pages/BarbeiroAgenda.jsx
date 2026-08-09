import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import Layout from "../components/Layout";
import AppointmentModal from "../components/AppointmentModal";
import FinalizarAtendimentoModal from "../components/FinalizarAtendimentoModal";
import { SkeletonList } from "../components/Skeleton";
import api from "../services/api";
import { useBarbeiros } from "../context/useBarbeiros";
import { useAuth } from "../context/useAuth";
import { HORARIOS } from "../constants/schedule";
import { adicionarDias, ehHoje, formatarDataExibicao, hojeISO } from "../utils/date";
import { extrairMensagemErro } from "../utils/erro";
import { iniciais, corAvatar } from "../utils/avatar";

function BarbeiroAgenda() {
  const { id } = useParams();
  const barbeiroId = Number(id);
  const navigate = useNavigate();
  const location = useLocation();

  const { barbeiros, carregando: carregandoBarbeiros, recarregar: recarregarBarbeiros } = useBarbeiros();
  const { barbeiroLogado, login } = useAuth();
  const barbeiro = barbeiros.find((b) => b.id === barbeiroId);
  const souDono = barbeiroLogado?.id === barbeiroId;

  const [dataSelecionada, setDataSelecionada] = useState(hojeISO());
  const [agendamentos, setAgendamentos] = useState([]);
  const [catalogo, setCatalogo] = useState([]);
  const [bloqueios, setBloqueios] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalKey, setModalKey] = useState(0);
  const [horarioSelecionado, setHorarioSelecionado] = useState("");
  const [agendamentoSelecionado, setAgendamentoSelecionado] = useState(null);

  const [pagamentoOpen, setPagamentoOpen] = useState(false);
  const [agendamentoParaFinalizar, setAgendamentoParaFinalizar] = useState(null);

  // Formulário de "configurar meu login" (só aparece se o barbeiro ainda
  // não tem usuário/senha definidos).
  const [configurandoLogin, setConfigurandoLogin] = useState(false);
  const [novoUsuario, setNovoUsuario] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [erroLogin, setErroLogin] = useState("");
  const [salvandoLogin, setSalvandoLogin] = useState(false);

  useEffect(() => {
    carregarAgenda();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barbeiroId, dataSelecionada]);

  async function carregarAgenda() {
    setCarregando(true);
    setErro(null);
    try {
      const [agendamentosRes, catalogoRes, bloqueiosRes] = await Promise.all([
        api.get("/agendamentos", { params: { barbeiroId, data: dataSelecionada } }),
        api.get("/catalogo", { params: { barbeiroId } }),
        api.get(`/barbeiros/${barbeiroId}/bloqueios`, { params: { data: dataSelecionada } }),
      ]);
      setAgendamentos(agendamentosRes.data);
      setCatalogo(catalogoRes.data);
      setBloqueios(bloqueiosRes.data);
    } catch (error) {
      setErro(extrairMensagemErro(error, "Não foi possível carregar a agenda."));
    } finally {
      setCarregando(false);
    }
  }

  function buscarAgendamento(horario) {
    return agendamentos.find((a) => a.horario === horario);
  }

  const diaInteiroBloqueado = bloqueios.find((b) => b.horario === null);

  function bloqueioDoHorario(horario) {
    return bloqueios.find((b) => b.horario === horario);
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

      await carregarAgenda();
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
      await api.delete(`/agendamentos/${agendamentoId}`);
      await carregarAgenda();
      return { sucesso: true };
    } catch (error) {
      return {
        sucesso: false,
        mensagem: extrairMensagemErro(error, "Não foi possível cancelar o agendamento."),
      };
    }
  }

  async function alternarBloqueioDia() {
    setErro(null);
    try {
      if (diaInteiroBloqueado) {
        await api.delete(`/barbeiros/${barbeiroId}/bloqueios/${diaInteiroBloqueado.id}`);
      } else {
        await api.post(`/barbeiros/${barbeiroId}/bloqueios`, { data: dataSelecionada });
      }
      await carregarAgenda();
    } catch (error) {
      setErro(extrairMensagemErro(error, "Não foi possível atualizar a folga do dia."));
    }
  }

  async function bloquearHorario(horario) {
    setErro(null);
    try {
      await api.post(`/barbeiros/${barbeiroId}/bloqueios`, { data: dataSelecionada, horario });
      await carregarAgenda();
    } catch (error) {
      setErro(extrairMensagemErro(error, "Não foi possível bloquear o horário."));
    }
  }

  async function desbloquearHorario(bloqueioId) {
    setErro(null);
    try {
      await api.delete(`/barbeiros/${barbeiroId}/bloqueios/${bloqueioId}`);
      await carregarAgenda();
    } catch (error) {
      setErro(extrairMensagemErro(error, "Não foi possível desbloquear o horário."));
    }
  }

  async function configurarLogin(e) {
    e.preventDefault();
    if (novoUsuario.trim().length < 3 || novaSenha.length < 6) {
      setErroLogin("Usuário precisa ter 3+ caracteres e senha 6+ caracteres.");
      return;
    }

    setErroLogin("");
    setSalvandoLogin(true);
    try {
      await api.put(`/barbeiros/${barbeiroId}/login`, { usuario: novoUsuario.trim(), senha: novaSenha });
      const resultado = await login(novoUsuario.trim(), novaSenha);
      if (!resultado.sucesso) throw new Error(resultado.mensagem);

      await recarregarBarbeiros();
      setConfigurandoLogin(false);
      setNovoUsuario("");
      setNovaSenha("");
    } catch (error) {
      setErroLogin(error.message || extrairMensagemErro(error, "Não foi possível configurar o login."));
    } finally {
      setSalvandoLogin(false);
    }
  }

  if (!carregandoBarbeiros && !barbeiro) {
    return (
      <Layout>
        <p className="text-zinc-400">
          Barbeiro não encontrado.{" "}
          <button className="text-amber-500 hover:text-amber-400 underline" onClick={() => navigate("/barbeiros")}>
            Voltar
          </button>
        </p>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="flex items-center justify-between mb-8 flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate("/barbeiros")}
            className="text-zinc-500 hover:text-zinc-300"
            aria-label="Voltar"
          >
            ← Barbeiros
          </button>

          {barbeiro && (
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold ${corAvatar(
                  barbeiro.nome
                )}`}
              >
                {iniciais(barbeiro.nome)}
              </div>
              <h1 className="text-2xl font-bold text-white">{barbeiro.nome}</h1>
            </div>
          )}
        </div>

        {barbeiro && !souDono && barbeiro.tem_login ? (
          <button
            onClick={() => navigate("/login", { state: { from: location.pathname } })}
            className="text-sm text-amber-500 hover:text-amber-400"
          >
            Entrar como {barbeiro.nome}
          </button>
        ) : null}
      </div>

      {barbeiro && !barbeiro.tem_login && (
        <div className="bg-zinc-900 rounded-2xl p-6 mb-6 border-2 border-dashed border-amber-700/50">
          {!configurandoLogin ? (
            <div className="flex items-center justify-between">
              <p className="text-zinc-400">
                {barbeiro.nome} ainda não tem login configurado.
              </p>
              <button
                onClick={() => setConfigurandoLogin(true)}
                className="text-amber-500 font-medium hover:text-amber-400"
              >
                Configurar login
              </button>
            </div>
          ) : (
            <form onSubmit={configurarLogin}>
              <h2 className="font-bold text-lg mb-3 text-zinc-100">Configurar login de {barbeiro.nome}</h2>
              <div className="flex flex-wrap gap-3">
                <input
                  type="text"
                  placeholder="Usuário"
                  value={novoUsuario}
                  onChange={(e) => setNovoUsuario(e.target.value)}
                  className="flex-1 min-w-[160px] bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-zinc-100 placeholder:text-zinc-500"
                  disabled={salvandoLogin}
                />
                <input
                  type="password"
                  placeholder="Senha (6+ caracteres)"
                  value={novaSenha}
                  onChange={(e) => setNovaSenha(e.target.value)}
                  className="flex-1 min-w-[160px] bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-zinc-100 placeholder:text-zinc-500"
                  disabled={salvandoLogin}
                />
                <button
                  type="submit"
                  disabled={salvandoLogin}
                  className="px-4 py-2 bg-amber-600 text-black font-semibold rounded-lg hover:bg-amber-700 disabled:opacity-50"
                >
                  {salvandoLogin ? "Salvando..." : "Salvar e entrar"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfigurandoLogin(false)}
                  disabled={salvandoLogin}
                  className="px-4 py-2 border border-zinc-700 text-zinc-300 rounded-lg hover:bg-zinc-800"
                >
                  Cancelar
                </button>
              </div>
              {erroLogin && <p className="text-red-400 text-sm mt-2">{erroLogin}</p>}
            </form>
          )}
        </div>
      )}

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setDataSelecionada((d) => adicionarDias(d, -1))}
              className="px-3 py-2 border border-zinc-700 text-zinc-300 rounded-lg hover:bg-zinc-800"
              aria-label="Dia anterior"
            >
              ←
            </button>

            <div className="text-center">
              <p className="font-semibold text-zinc-100">{formatarDataExibicao(dataSelecionada)}</p>
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
            {souDono && (
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
            )}

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

              return (
                <div
                  key={horario}
                  className={`flex items-center gap-4 rounded-xl border p-3 ${
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
                      <div className="flex-1">
                        <p className={`font-semibold ${concluido ? "text-zinc-600 line-through" : "text-zinc-100"}`}>
                          {agendamento.nome}
                        </p>
                        <p className="text-sm text-zinc-500">{agendamento.servico}</p>
                      </div>

                      {concluido ? (
                        <span className="text-sm text-zinc-500 px-3 py-2">Concluído ✓</span>
                      ) : (
                        <div className="flex gap-2">
                          {souDono && (
                            <>
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
                            </>
                          )}
                        </div>
                      )}
                    </>
                  ) : bloqueado ? (
                    <div className="flex-1 flex items-center justify-between">
                      <span className="text-red-400 text-sm">
                        {diaInteiroBloqueado ? "Folga do dia" : "Bloqueado"}
                      </span>
                      {souDono && bloqueioEspecifico && (
                        <button
                          onClick={() => desbloquearHorario(bloqueioEspecifico.id)}
                          className="text-sm text-zinc-500 hover:text-zinc-300"
                        >
                          Desbloquear
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="flex-1 flex items-center justify-between">
                      <button
                        onClick={() => abrirModalSlot(horario)}
                        className="text-left text-zinc-500 hover:text-amber-500 py-2"
                      >
                        Livre — clique para agendar
                      </button>
                      {souDono && (
                        <button
                          onClick={() => bloquearHorario(horario)}
                          className="text-sm text-zinc-600 hover:text-red-400"
                        >
                          Bloquear
                        </button>
                      )}
                    </div>
                  )}
                </div>
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
        onFinalizado={carregarAgenda}
      />
    </Layout>
  );
}

export default BarbeiroAgenda;
