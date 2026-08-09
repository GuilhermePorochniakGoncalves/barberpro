import { useState } from "react";
import { HORARIOS, formatarTelefone } from "../constants/schedule";
import { formatarDataExibicao } from "../utils/date";

// `barbeiroId`/`data`: sempre fixos, vêm da agenda do dia que abriu o modal.
// `horario`: pré-selecionado ao clicar num slot; vazio no fluxo "Novo
// agendamento" (usuário escolhe o horário livre).
// `agendamento`: quando presente, o modal abre em modo edição.
// `catalogo`: itens disponíveis pra ESSE barbeiro (os próprios serviços +
// produtos compartilhados) — vem de GET /catalogo?barbeiroId=, buscado
// pelo componente pai (o catálogo é por-barbeiro, não dá pra vir de um
// contexto global).
//
// O componente pai troca a prop `key` a cada abertura do modal, o que
// remonta este componente e reidrata o formulário automaticamente — evita
// usar useEffect só para sincronizar estado a partir de props.
function AppointmentModal({
  isOpen,
  onClose,
  barbeiroId,
  data,
  horario = "",
  agendamento = null,
  catalogo = [],
  onSave,
  onCancelar,
}) {
  const servicos = catalogo.filter((i) => i.tipo === "servico");

  const modoEdicao = Boolean(agendamento);

  const [nome, setNome] = useState(agendamento?.nome ?? "");
  const [telefone, setTelefone] = useState(
    formatarTelefone(agendamento?.telefone ?? "")
  );
  const [servico, setServico] = useState(agendamento?.servico ?? servicos[0]?.nome ?? "");
  const [horarioSelecionado, setHorarioSelecionado] = useState(
    agendamento?.horario ?? horario
  );
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [cancelando, setCancelando] = useState(false);

  if (!isOpen) return null;

  function validar() {
    if (!nome.trim()) return "Informe o nome do cliente.";
    const digitos = telefone.replace(/\D/g, "");
    if (digitos.length < 10 || digitos.length > 11) {
      return "Informe um telefone válido com DDD.";
    }
    if (!servico) return "Selecione o serviço.";
    if (!horarioSelecionado) return "Selecione o horário.";
    return "";
  }

  async function salvar() {
    const mensagemValidacao = validar();
    if (mensagemValidacao) {
      setErro(mensagemValidacao);
      return;
    }

    setErro("");
    setSalvando(true);

    const resultado = await onSave({
      barbeiroId,
      nome: nome.trim(),
      telefone: telefone.replace(/\D/g, ""),
      servico,
      data,
      horario: horarioSelecionado,
    });

    setSalvando(false);

    if (!resultado?.sucesso) {
      setErro(resultado?.mensagem || "Não foi possível salvar o agendamento.");
      return;
    }

    onClose();
  }

  async function cancelar() {
    if (!agendamento) return;

    const confirmado = window.confirm(
      `Cancelar o agendamento de ${agendamento.nome} às ${agendamento.horario}?`
    );
    if (!confirmado) return;

    setCancelando(true);
    setErro("");

    const resultado = await onCancelar(agendamento.id);

    setCancelando(false);

    if (!resultado?.sucesso) {
      setErro(resultado?.mensagem || "Não foi possível cancelar o agendamento.");
      return;
    }

    onClose();
  }

  const bloqueado = salvando || cancelando;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-md">
        <h2 className="text-2xl font-bold mb-2 text-white">
          {modoEdicao ? "Editar agendamento" : "Novo agendamento"}
        </h2>

        <p className="text-zinc-400 mb-6">
          {formatarDataExibicao(data)}
          {horarioSelecionado ? ` às ${horarioSelecionado}` : ""}
        </p>

        <div className="space-y-4">
          <input
            type="text"
            placeholder="Nome do cliente"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-zinc-100 placeholder:text-zinc-500"
            disabled={bloqueado}
          />

          <input
            type="tel"
            placeholder="Telefone"
            value={telefone}
            onChange={(e) => setTelefone(formatarTelefone(e.target.value))}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-zinc-100 placeholder:text-zinc-500"
            disabled={bloqueado}
          />

          <select
            value={servico}
            onChange={(e) => setServico(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-zinc-100"
            disabled={bloqueado}
          >
            {servicos.length === 0 && <option value="">Nenhum serviço cadastrado</option>}
            {servicos.map((s) => (
              <option key={s.nome} value={s.nome}>
                {s.nome} — R$ {s.preco.toFixed(2)}
              </option>
            ))}
          </select>

          {/* Horário só fica editável quando não veio pré-selecionado de um
              clique na grade (fluxo "Novo agendamento" no topo). */}
          {!horario && !modoEdicao && (
            <select
              value={horarioSelecionado}
              onChange={(e) => setHorarioSelecionado(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-zinc-100"
              disabled={bloqueado}
            >
              <option value="">Horário</option>
              {HORARIOS.map((h) => (
                <option key={h}>{h}</option>
              ))}
            </select>
          )}
        </div>

        {erro && (
          <p className="text-red-400 text-sm mt-4" role="alert">
            {erro}
          </p>
        )}

        <div className="flex justify-between items-center gap-3 mt-6">
          {modoEdicao ? (
            <button
              onClick={cancelar}
              disabled={bloqueado}
              className="px-4 py-2 border border-red-900/50 text-red-400 rounded-lg hover:bg-red-950/30 disabled:opacity-50"
            >
              {cancelando ? "Cancelando..." : "Cancelar agendamento"}
            </button>
          ) : (
            <span />
          )}

          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={bloqueado}
              className="px-4 py-2 border border-zinc-700 text-zinc-300 rounded-lg hover:bg-zinc-800 disabled:opacity-50"
            >
              Fechar
            </button>

            <button
              onClick={salvar}
              disabled={bloqueado}
              className="px-4 py-2 bg-amber-600 text-black font-semibold rounded-lg hover:bg-amber-700 disabled:opacity-50"
            >
              {salvando ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AppointmentModal;
