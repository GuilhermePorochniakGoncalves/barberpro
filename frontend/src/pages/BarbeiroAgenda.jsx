import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Layout from "../components/Layout";
import AppointmentModal from "../components/AppointmentModal";
import FinalizarAtendimentoModal from "../components/FinalizarAtendimentoModal";
import api from "../services/api";
import { useBarbeiros } from "../context/useBarbeiros";
import { HORARIOS } from "../constants/schedule";
import { adicionarDias, ehHoje, formatarDataExibicao, hojeISO } from "../utils/date";
import { extrairMensagemErro } from "../utils/erro";
import { iniciais, corAvatar } from "../utils/avatar";

function BarbeiroAgenda() {
  const { id } = useParams();
  const barbeiroId = Number(id);
  const navigate = useNavigate();

  const { barbeiros, carregando: carregandoBarbeiros } = useBarbeiros();
  const barbeiro = barbeiros.find((b) => b.id === barbeiroId);

  const [dataSelecionada, setDataSelecionada] = useState(hojeISO());
  const [agendamentos, setAgendamentos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalKey, setModalKey] = useState(0);
  const [horarioSelecionado, setHorarioSelecionado] = useState("");
  const [agendamentoSelecionado, setAgendamentoSelecionado] = useState(null);

  const [pagamentoOpen, setPagamentoOpen] = useState(false);
  const [agendamentoParaFinalizar, setAgendamentoParaFinalizar] = useState(null);

  useEffect(() => {
    carregarAgendamentos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barbeiroId, dataSelecionada]);

  async function carregarAgendamentos() {
    setCarregando(true);
    setErro(null);
    try {
      const response = await api.get("/agendamentos", {
        params: { barbeiroId, data: dataSelecionada },
      });
      setAgendamentos(response.data);
    } catch (error) {
      setErro(extrairMensagemErro(error, "Não foi possível carregar a agenda."));
    } finally {
      setCarregando(false);
    }
  }

  function buscarAgendamento(horario) {
    return agendamentos.find((a) => a.horario === horario);
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

      await carregarAgendamentos();
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
      await carregarAgendamentos();
      return { sucesso: true };
    } catch (error) {
      return {
        sucesso: false,
        mensagem: extrairMensagemErro(error, "Não foi possível cancelar o agendamento."),
      };
    }
  }

  if (!carregandoBarbeiros && !barbeiro) {
    return (
      <Layout>
        <p className="text-gray-600">
          Barbeiro não encontrado.{" "}
          <button className="text-green-700 underline" onClick={() => navigate("/barbeiros")}>
            Voltar
          </button>
        </p>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="flex items-center gap-4 mb-8">
        <button
          onClick={() => navigate("/barbeiros")}
          className="text-gray-500 hover:text-gray-800"
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
            <h1 className="text-2xl font-bold text-gray-800">{barbeiro.nome}</h1>
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow p-6">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setDataSelecionada((d) => adicionarDias(d, -1))}
              className="px-3 py-2 border rounded-lg hover:bg-gray-100"
              aria-label="Dia anterior"
            >
              ←
            </button>

            <div className="text-center">
              <p className="font-semibold text-gray-800">{formatarDataExibicao(dataSelecionada)}</p>
              {ehHoje(dataSelecionada) && <p className="text-xs text-green-600">Hoje</p>}
            </div>

            <button
              onClick={() => setDataSelecionada((d) => adicionarDias(d, 1))}
              className="px-3 py-2 border rounded-lg hover:bg-gray-100"
              aria-label="Próximo dia"
            >
              →
            </button>

            <input
              type="date"
              value={dataSelecionada}
              onChange={(e) => setDataSelecionada(e.target.value)}
              className="border rounded-lg p-2 text-sm"
            />
          </div>

          <button
            onClick={abrirModalNovo}
            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
          >
            Novo agendamento
          </button>
        </div>

        {erro && <p className="text-red-600 text-sm mb-4">{erro}</p>}

        {carregando ? (
          <p className="text-gray-500 py-8 text-center">Carregando agenda...</p>
        ) : (
          <div className="space-y-2">
            {HORARIOS.map((horario) => {
              const agendamento = buscarAgendamento(horario);
              const concluido = agendamento?.status === "concluido";

              return (
                <div
                  key={horario}
                  className={`flex items-center gap-4 rounded-xl border p-3 ${
                    agendamento
                      ? concluido
                        ? "bg-gray-50 border-gray-200"
                        : "bg-green-50 border-green-300"
                      : "border-gray-200"
                  }`}
                >
                  <span className="w-14 font-medium text-gray-500">{horario}</span>

                  {agendamento ? (
                    <>
                      <div className="flex-1">
                        <p className={`font-semibold ${concluido ? "text-gray-500 line-through" : "text-gray-800"}`}>
                          {agendamento.nome}
                        </p>
                        <p className="text-sm text-gray-500">{agendamento.servico}</p>
                      </div>

                      {concluido ? (
                        <span className="text-sm text-gray-500 px-3 py-2">Concluído ✓</span>
                      ) : (
                        <div className="flex gap-2">
                          <button
                            onClick={() => abrirModalSlot(horario)}
                            className="px-3 py-2 border rounded-lg hover:bg-gray-100 text-sm"
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => abrirFinalizar(agendamento)}
                            className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
                          >
                            Finalizar atendimento
                          </button>
                        </div>
                      )}
                    </>
                  ) : (
                    <button
                      onClick={() => abrirModalSlot(horario)}
                      className="flex-1 text-left text-gray-400 hover:text-green-700 py-2"
                    >
                      Livre — clique para agendar
                    </button>
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
        onSave={salvarAgendamento}
        onCancelar={cancelarAgendamento}
      />

      <FinalizarAtendimentoModal
        key={`pagamento-${agendamentoParaFinalizar?.id ?? "novo"}`}
        isOpen={pagamentoOpen}
        onClose={() => setPagamentoOpen(false)}
        agendamento={agendamentoParaFinalizar}
        onFinalizado={carregarAgendamentos}
      />
    </Layout>
  );
}

export default BarbeiroAgenda;
