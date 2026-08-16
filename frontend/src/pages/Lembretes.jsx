import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import EmptyState from "../components/EmptyState";
import { SkeletonList } from "../components/Skeleton";
import api from "../services/api";
import { useBarbeiros } from "../context/useBarbeiros";
import { adicionarDias, formatarDataExibicao, hojeISO } from "../utils/date";
import { linkWhatsApp } from "../utils/whatsapp";
import { extrairMensagemErro } from "../utils/erro";

// Lembrete de horário pro cliente — sem WhatsApp Business API (paga), o
// jeito de mandar isso de graça é um link wa.me com a mensagem pronta: o
// barbeiro/recepção só clica "Enviar" no WhatsApp que abre. Não dispara
// sozinho, mas tira o trabalho de digitar a mensagem um por um.
function Lembretes() {
  const { barbeiros } = useBarbeiros();
  const [data, setData] = useState(() => adicionarDias(hojeISO(), 1));
  const [agendamentos, setAgendamentos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);

  async function carregar() {
    setCarregando(true);
    setErro(null);
    try {
      const response = await api.get("/agendamentos", { params: { data } });
      setAgendamentos(response.data.filter((a) => a.status === "agendado"));
    } catch (error) {
      setErro(extrairMensagemErro(error, "Não foi possível carregar os agendamentos."));
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carrega dados externos ao trocar de dia, não deriva estado local
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  function nomeBarbeiro(barbeiroId) {
    return barbeiros.find((b) => b.id === barbeiroId)?.nome ?? "—";
  }

  function mensagemLembrete(agendamento) {
    return `Oi ${agendamento.nome}! Passando pra lembrar do seu horário amanhã (${formatarDataExibicao(
      agendamento.data
    )}) às ${agendamento.horario}, com ${nomeBarbeiro(agendamento.barbeiro_id)}. Até lá!`;
  }

  return (
    <Layout>
      <div className="flex justify-between items-center mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold text-white">Lembretes</h1>
          <p className="text-zinc-400 mt-1">
            Agendamentos do dia escolhido — um clique manda o lembrete pelo WhatsApp.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setData((d) => adicionarDias(d, -1))}
            className="px-3 py-2 border border-zinc-700 text-zinc-300 rounded-lg hover:bg-zinc-800"
            aria-label="Dia anterior"
          >
            ←
          </button>
          <div className="text-center">
            <p className="font-semibold text-zinc-100 whitespace-nowrap">{formatarDataExibicao(data)}</p>
          </div>
          <button
            onClick={() => setData((d) => adicionarDias(d, 1))}
            className="px-3 py-2 border border-zinc-700 text-zinc-300 rounded-lg hover:bg-zinc-800"
            aria-label="Próximo dia"
          >
            →
          </button>
          <input
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-sm text-zinc-100"
          />
        </div>
      </div>

      {erro && <p className="text-red-400 mb-4">{erro}</p>}

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        {carregando ? (
          <div className="p-6">
            <SkeletonList linhas={4} />
          </div>
        ) : agendamentos.length === 0 ? (
          <EmptyState
            icon="🔔"
            title="Nenhum agendamento nesse dia"
            description="Escolha outra data pra ver quem tem horário marcado e mandar um lembrete."
          />
        ) : (
          <div className="divide-y divide-zinc-800">
            {agendamentos.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center gap-3 p-4">
                <span className="w-14 font-medium text-zinc-500">{a.horario}</span>
                <div className="flex-1 min-w-[160px]">
                  <p className="font-semibold text-zinc-100">{a.nome}</p>
                  <p className="text-sm text-zinc-500">
                    {a.servico} • {nomeBarbeiro(a.barbeiro_id)}
                  </p>
                </div>
                <a
                  href={linkWhatsApp(a.telefone, mensagemLembrete(a))}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-2 bg-emerald-600 text-black font-semibold rounded-lg hover:bg-emerald-700 text-sm whitespace-nowrap"
                >
                  Lembrar no WhatsApp
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}

export default Lembretes;
