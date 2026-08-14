import { useEffect, useState } from "react";
import api from "../services/api";
import { horarioParaMinutos } from "../constants/schedule";
import { extrairMensagemErro } from "../utils/erro";

// Disponibilidade de um barbeiro num dia: agendamentos já marcados +
// horários/dia bloqueados (folga). Centraliza a lógica de "esse horário
// está livre?" pra ser reaproveitada tanto na agenda interna (Agenda.jsx)
// quanto no agendamento público (AgendarPublico) — as duas telas precisam
// exatamente da mesma noção de disponibilidade.
export function useDisponibilidade(barbeiroId, data) {
  const [agendamentos, setAgendamentos] = useState([]);
  const [bloqueios, setBloqueios] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barbeiroId, data]);

  async function carregar() {
    if (!barbeiroId || !data) {
      setCarregando(false);
      return;
    }

    setCarregando(true);
    setErro(null);
    try {
      const [agendamentosRes, bloqueiosRes] = await Promise.all([
        api.get("/agendamentos", { params: { barbeiroId, data } }),
        api.get(`/barbeiros/${barbeiroId}/bloqueios`, { params: { data } }),
      ]);
      setAgendamentos(agendamentosRes.data);
      setBloqueios(bloqueiosRes.data);
    } catch (error) {
      setErro(extrairMensagemErro(error, "Não foi possível carregar a disponibilidade."));
    } finally {
      setCarregando(false);
    }
  }

  // Agendamento que começa exatamente nesse horário (pra abrir o modal de
  // edição ao clicar no slot inicial).
  function buscarAgendamento(horario) {
    return agendamentos.find((a) => a.horario === horario);
  }

  // Agendamento que OCUPA esse horário, mesmo tendo começado antes (ex.:
  // corte+barba de 60min iniciado às 09:00 cobre também o slot das 09:30).
  // Serve pra não desenhar um slot "livre" no meio de um atendimento em
  // andamento.
  function agendamentoQueCobre(horario) {
    const alvo = horarioParaMinutos(horario);
    return agendamentos.find((a) => {
      const inicio = horarioParaMinutos(a.horario);
      const fim = inicio + (a.duracao_minutos ?? 30);
      return alvo >= inicio && alvo < fim;
    });
  }

  const diaInteiroBloqueado = bloqueios.find((b) => b.horario === null);

  function bloqueioDoHorario(horario) {
    return bloqueios.find((b) => b.horario === horario);
  }

  // Livre pra um serviço de `duracaoMinutos` que começaria nesse horário —
  // checa sobreposição de intervalo completo (mesma lógica do backend em
  // server.js), não só se o instante exato está ocupado. Usado no
  // agendamento público, onde a duração do serviço escolhido importa pra
  // saber se cabe inteiro a partir desse horário.
  function horarioLivre(horario, duracaoMinutos = 30) {
    if (diaInteiroBloqueado) return false;

    const inicio = horarioParaMinutos(horario);
    const fim = inicio + duracaoMinutos;

    const semConflito = !agendamentos.some((a) => {
      if (a.status === "cancelado") return false;
      const aInicio = horarioParaMinutos(a.horario);
      const aFim = aInicio + (a.duracao_minutos ?? 30);
      return inicio < aFim && aInicio < fim;
    });

    const semBloqueio = !bloqueios.some((b) => {
      if (b.horario === null) return false; // dia inteiro já tratado acima
      const m = horarioParaMinutos(b.horario);
      return m >= inicio && m < fim;
    });

    return semConflito && semBloqueio;
  }

  return {
    agendamentos,
    bloqueios,
    carregando,
    erro,
    recarregar: carregar,
    buscarAgendamento,
    agendamentoQueCobre,
    diaInteiroBloqueado,
    bloqueioDoHorario,
    horarioLivre,
  };
}
