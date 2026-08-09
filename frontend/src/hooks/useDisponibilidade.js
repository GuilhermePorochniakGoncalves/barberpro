import { useEffect, useState } from "react";
import api from "../services/api";
import { extrairMensagemErro } from "../utils/erro";

// Disponibilidade de um barbeiro num dia: agendamentos já marcados +
// horários/dia bloqueados (folga). Centraliza a lógica de "esse horário
// está livre?" pra ser reaproveitada tanto na agenda interna
// (BarbeiroAgenda) quanto no agendamento público (AgendarPublico) — as
// duas telas precisam exatamente da mesma noção de disponibilidade.
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

  function buscarAgendamento(horario) {
    return agendamentos.find((a) => a.horario === horario);
  }

  const diaInteiroBloqueado = bloqueios.find((b) => b.horario === null);

  function bloqueioDoHorario(horario) {
    return bloqueios.find((b) => b.horario === horario);
  }

  function horarioLivre(horario) {
    return !buscarAgendamento(horario) && !diaInteiroBloqueado && !bloqueioDoHorario(horario);
  }

  return {
    agendamentos,
    bloqueios,
    carregando,
    erro,
    recarregar: carregar,
    buscarAgendamento,
    diaInteiroBloqueado,
    bloqueioDoHorario,
    horarioLivre,
  };
}
