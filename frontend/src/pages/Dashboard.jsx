import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import { SkeletonStatCards } from "../components/Skeleton";
import api from "../services/api";
import { hojeISO } from "../utils/date";
import { extrairMensagemErro } from "../utils/erro";

function formatarReais(valor) {
  return (valor ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function Dashboard() {
  const navigate = useNavigate();

  const [relatorio, setRelatorio] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    (async () => {
      setCarregando(true);
      setErro(null);
      try {
        const response = await api.get("/relatorios/diario", { params: { data: hojeISO() } });
        setRelatorio(response.data);
      } catch (error) {
        setErro(extrairMensagemErro(error, "Não foi possível carregar o resumo do dia."));
      } finally {
        setCarregando(false);
      }
    })();
  }, []);

  const ticketMedio =
    relatorio && relatorio.atendimentos > 0 ? relatorio.totalArrecadado / relatorio.atendimentos : 0;

  return (
    <Layout>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white">Dashboard da Barbearia</h1>
          <p className="text-zinc-400 mt-1">Resumo de hoje</p>
        </div>
      </div>

      {erro && <p className="text-red-400 mb-4">{erro}</p>}

      {carregando ? (
        <SkeletonStatCards />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl">
            <p className="text-zinc-400">Faturamento hoje</p>
            <h2 className="text-3xl font-bold text-amber-500 mt-2">
              {formatarReais(relatorio?.totalArrecadado)}
            </h2>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl">
            <p className="text-zinc-400">Atendimentos</p>
            <h2 className="text-3xl font-bold text-amber-500 mt-2">{relatorio?.atendimentos ?? 0}</h2>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl">
            <p className="text-zinc-400">Ticket médio</p>
            <h2 className="text-3xl font-bold text-amber-500 mt-2">{formatarReais(ticketMedio)}</h2>
          </div>
        </div>
      )}

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-bold text-white mb-1">Agenda do dia</h2>
          <p className="text-zinc-400">Escolha um barbeiro para ver os horários e clientes marcados.</p>
        </div>
        <button
          onClick={() => navigate("/agenda")}
          className="bg-amber-600 text-black font-semibold px-5 py-3 rounded-xl hover:bg-amber-700"
        >
          Ver agenda
        </button>
      </div>
    </Layout>
  );
}

export default Dashboard;
