import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../services/api";
import { useBarbeiros } from "../context/useBarbeiros";
import { useDisponibilidade } from "../hooks/useDisponibilidade";
import { HORARIOS, formatarTelefone } from "../constants/schedule";
import { adicionarDias, ehHoje, formatarDataExibicao, hojeISO } from "../utils/date";
import { extrairMensagemErro } from "../utils/erro";
import { iniciais, corAvatar } from "../utils/avatar";

// Rota pública (sem login): /agendar ou /agendar/:barbeiroId — pensada pra
// ser o link que a barbearia divulga pro cliente marcar sozinho (futuro:
// algo como barberpro.com/nome-da-barbearia/agendar; por ora essa rota já
// funciona sozinha, só falta o domínio/slug por barbearia).
//
// Reaproveita useDisponibilidade — a mesma lógica de "esse horário está
// livre?" usada na agenda interna do barbeiro (BarbeiroAgenda.jsx).
function AgendarPublico() {
  const { barbeiroId: barbeiroIdParam } = useParams();
  const navigate = useNavigate();
  const { barbeiros, carregando: carregandoBarbeiros } = useBarbeiros();

  const [etapa, setEtapa] = useState(barbeiroIdParam ? "servico" : "barbeiro");
  const [barbeiroId, setBarbeiroId] = useState(barbeiroIdParam ? Number(barbeiroIdParam) : null);
  const [servicoSelecionado, setServicoSelecionado] = useState(null);
  const [dataSelecionada, setDataSelecionada] = useState(hojeISO());
  const [horarioSelecionado, setHorarioSelecionado] = useState("");
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [agendamentoConfirmado, setAgendamentoConfirmado] = useState(null);

  const [servicos, setServicos] = useState([]);
  const [carregandoServicos, setCarregandoServicos] = useState(false);

  const barbeiro = barbeiros.find((b) => b.id === barbeiroId);
  const { carregando: carregandoDisponibilidade, horarioLivre } = useDisponibilidade(
    barbeiroId,
    etapa === "horario" ? dataSelecionada : null
  );

  useEffect(() => {
    if (etapa !== "servico" || !barbeiroId) return;
    // eslint-disable-next-line react-hooks/immutability
    carregarServicos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etapa, barbeiroId]);

  async function carregarServicos() {
    setCarregandoServicos(true);
    setErro("");
    try {
      const response = await api.get("/catalogo", { params: { barbeiroId } });
      setServicos(response.data.filter((i) => i.tipo === "servico"));
    } catch (error) {
      setErro(extrairMensagemErro(error, "Não foi possível carregar os serviços."));
    } finally {
      setCarregandoServicos(false);
    }
  }

  function escolherBarbeiro(id) {
    setBarbeiroId(id);
    setEtapa("servico");
  }

  function escolherServico(nomeServico) {
    setServicoSelecionado(nomeServico);
    setEtapa("horario");
  }

  function escolherHorario(horario) {
    setHorarioSelecionado(horario);
    setEtapa("dados");
  }

  async function confirmar(e) {
    e.preventDefault();

    if (!nome.trim()) {
      setErro("Informe seu nome.");
      return;
    }
    const digitos = telefone.replace(/\D/g, "");
    if (digitos.length < 10 || digitos.length > 11) {
      setErro("Informe um telefone válido com DDD.");
      return;
    }

    setErro("");
    setEnviando(true);
    try {
      const response = await api.post("/agendamentos", {
        barbeiroId,
        nome: nome.trim(),
        telefone: digitos,
        servico: servicoSelecionado,
        data: dataSelecionada,
        horario: horarioSelecionado,
      });
      setAgendamentoConfirmado(response.data);
      setEtapa("sucesso");
    } catch (error) {
      // Horário pode ter sido preenchido por outra pessoa entre a escolha
      // e a confirmação — manda de volta pra escolha de horário.
      setErro(extrairMensagemErro(error, "Não foi possível confirmar o agendamento."));
      setEtapa("horario");
    } finally {
      setEnviando(false);
    }
  }

  function recomecar() {
    setEtapa(barbeiroIdParam ? "servico" : "barbeiro");
    setBarbeiroId(barbeiroIdParam ? Number(barbeiroIdParam) : null);
    setServicoSelecionado(null);
    setDataSelecionada(hojeISO());
    setHorarioSelecionado("");
    setNome("");
    setTelefone("");
    setErro("");
    setAgendamentoConfirmado(null);
  }

  const etapas = ["barbeiro", "servico", "horario", "dados"];
  const indiceEtapaAtual = etapas.indexOf(etapa);

  return (
    <div className="min-h-screen bg-black flex flex-col items-center px-4 py-10">
      <h1 className="text-3xl font-bold text-amber-500 mb-1">BarberPro</h1>
      <p className="text-zinc-400 mb-8">Agende seu horário</p>

      <div className="w-full max-w-lg">
        {etapa !== "sucesso" && (
          <div className="flex items-center justify-center gap-2 mb-8">
            {["Barbeiro", "Serviço", "Horário", "Seus dados"].map((rotulo, i) => (
              <div key={rotulo} className="flex items-center gap-2">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold ${
                    i <= indiceEtapaAtual ? "bg-amber-600 text-black" : "bg-zinc-800 text-zinc-500"
                  }`}
                >
                  {i + 1}
                </div>
                {i < 3 && <div className={`w-6 h-px ${i < indiceEtapaAtual ? "bg-amber-600" : "bg-zinc-800"}`} />}
              </div>
            ))}
          </div>
        )}

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
          {erro && (
            <p className="text-red-400 text-sm mb-4" role="alert">
              {erro}
            </p>
          )}

          {etapa === "barbeiro" && (
            <>
              <h2 className="text-xl font-bold text-white mb-4">Escolha o barbeiro</h2>
              {carregandoBarbeiros ? (
                <p className="text-zinc-500 text-center py-6">Carregando...</p>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {barbeiros
                    .filter((b) => b.ativo)
                    .map((b) => (
                      <button
                        key={b.id}
                        onClick={() => escolherBarbeiro(b.id)}
                        className="bg-zinc-800 border border-zinc-700 rounded-xl p-4 flex flex-col items-center gap-2 hover:border-amber-700/50 transition"
                      >
                        <div
                          className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold ${corAvatar(
                            b.nome
                          )}`}
                        >
                          {iniciais(b.nome)}
                        </div>
                        <span className="font-medium text-zinc-100">{b.nome}</span>
                      </button>
                    ))}
                </div>
              )}
            </>
          )}

          {etapa === "servico" && (
            <>
              <button onClick={() => setEtapa("barbeiro")} className="text-sm text-zinc-500 hover:text-zinc-300 mb-3">
                ← Trocar barbeiro
              </button>
              <h2 className="text-xl font-bold text-white mb-1">Escolha o serviço</h2>
              <p className="text-zinc-400 text-sm mb-4">com {barbeiro?.nome}</p>

              {carregandoServicos ? (
                <p className="text-zinc-500 text-center py-6">Carregando...</p>
              ) : servicos.length === 0 ? (
                <p className="text-zinc-500 text-center py-6">
                  Esse barbeiro ainda não tem serviços cadastrados.
                </p>
              ) : (
                <div className="space-y-2">
                  {servicos.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => escolherServico(s.nome)}
                      className="w-full flex justify-between items-center bg-zinc-800 border border-zinc-700 rounded-xl p-4 hover:border-amber-700/50 transition"
                    >
                      <span className="font-medium text-zinc-100">{s.nome}</span>
                      <span className="text-amber-500 font-semibold">
                        {s.preco.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {etapa === "horario" && (
            <>
              <button onClick={() => setEtapa("servico")} className="text-sm text-zinc-500 hover:text-zinc-300 mb-3">
                ← Trocar serviço
              </button>
              <h2 className="text-xl font-bold text-white mb-1">Escolha data e horário</h2>
              <p className="text-zinc-400 text-sm mb-4">
                {barbeiro?.nome} • {servicoSelecionado}
              </p>

              <div className="flex items-center gap-3 mb-4">
                <button
                  onClick={() => setDataSelecionada((d) => adicionarDias(d, -1))}
                  disabled={ehHoje(dataSelecionada)}
                  className="px-3 py-2 border border-zinc-700 text-zinc-300 rounded-lg hover:bg-zinc-800 disabled:opacity-30"
                  aria-label="Dia anterior"
                >
                  ←
                </button>
                <div className="text-center flex-1">
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
              </div>

              {carregandoDisponibilidade ? (
                <p className="text-zinc-500 text-center py-6">Carregando horários...</p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {HORARIOS.map((h) => {
                    const livre = horarioLivre(h);
                    return (
                      <button
                        key={h}
                        onClick={() => livre && escolherHorario(h)}
                        disabled={!livre}
                        className={`py-3 rounded-lg text-sm font-medium ${
                          livre
                            ? "bg-zinc-800 border border-zinc-700 text-zinc-100 hover:border-amber-600 hover:text-amber-500"
                            : "bg-zinc-950 border border-zinc-900 text-zinc-700 cursor-not-allowed line-through"
                        }`}
                      >
                        {h}
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {etapa === "dados" && (
            <form onSubmit={confirmar}>
              <button
                type="button"
                onClick={() => setEtapa("horario")}
                className="text-sm text-zinc-500 hover:text-zinc-300 mb-3"
              >
                ← Trocar horário
              </button>
              <h2 className="text-xl font-bold text-white mb-1">Seus dados</h2>
              <p className="text-zinc-400 text-sm mb-4">
                {barbeiro?.nome} • {servicoSelecionado} • {formatarDataExibicao(dataSelecionada)} às {horarioSelecionado}
              </p>

              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="Seu nome"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-zinc-100 placeholder:text-zinc-500"
                  disabled={enviando}
                  autoFocus
                />
                <input
                  type="tel"
                  placeholder="Seu telefone"
                  value={telefone}
                  onChange={(e) => setTelefone(formatarTelefone(e.target.value))}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-zinc-100 placeholder:text-zinc-500"
                  disabled={enviando}
                />
              </div>

              <button
                type="submit"
                disabled={enviando}
                className="w-full mt-5 bg-amber-600 text-black font-semibold py-3 rounded-lg hover:bg-amber-700 disabled:opacity-50"
              >
                {enviando ? "Confirmando..." : "Confirmar agendamento"}
              </button>
            </form>
          )}

          {etapa === "sucesso" && agendamentoConfirmado && (
            <div className="text-center py-4">
              <div className="w-16 h-16 rounded-full bg-amber-600 text-black flex items-center justify-center text-3xl mx-auto mb-4">
                ✓
              </div>
              <h2 className="text-xl font-bold text-white mb-1">Agendamento confirmado!</h2>
              <p className="text-zinc-400 mb-6">Te esperamos no horário marcado.</p>

              <div className="bg-zinc-800 rounded-xl p-4 text-left space-y-2 mb-6">
                <p className="text-zinc-300">
                  <span className="text-zinc-500">Barbeiro:</span> {barbeiro?.nome}
                </p>
                <p className="text-zinc-300">
                  <span className="text-zinc-500">Serviço:</span> {agendamentoConfirmado.servico}
                </p>
                <p className="text-zinc-300">
                  <span className="text-zinc-500">Quando:</span> {formatarDataExibicao(agendamentoConfirmado.data)} às{" "}
                  {agendamentoConfirmado.horario}
                </p>
                <p className="text-zinc-300">
                  <span className="text-zinc-500">Nome:</span> {agendamentoConfirmado.nome}
                </p>
              </div>

              <button
                onClick={recomecar}
                className="text-amber-500 hover:text-amber-400 font-medium"
              >
                Fazer outro agendamento
              </button>
            </div>
          )}
        </div>

        <button
          onClick={() => navigate("/")}
          className="text-zinc-600 hover:text-zinc-400 text-sm mt-6 block mx-auto"
        >
          Sou barbeiro/atendente — ir pro painel
        </button>
      </div>
    </div>
  );
}

export default AgendarPublico;
