import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout";

function Dashboard() {
  const navigate = useNavigate();

  return (
    <Layout>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white">
            Dashboard da Barbearia
          </h1>
          <p className="text-zinc-400 mt-1">
            Bem-vindo de volta, Guilherme
          </p>
        </div>

        <div className="w-12 h-12 bg-amber-600 rounded-full flex items-center justify-center text-black font-bold">
          G
        </div>
      </div>

      {/* Os cards abaixo ainda são estáticos — o próximo passo natural é
          puxar esses números de GET /relatorios/mensal (ver Relatórios). */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl">
          <p className="text-zinc-400">Faturamento hoje</p>
          <h2 className="text-3xl font-bold text-amber-500 mt-2">
            R$ 420
          </h2>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl">
          <p className="text-zinc-400">Atendimentos</p>
          <h2 className="text-3xl font-bold text-amber-500 mt-2">
            8
          </h2>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl">
          <p className="text-zinc-400">Ticket médio</p>
          <h2 className="text-3xl font-bold text-amber-500 mt-2">
            R$ 52
          </h2>
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white mb-1">Agenda do dia</h2>
          <p className="text-zinc-400">
            Escolha um barbeiro para ver os horários e clientes marcados.
          </p>
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
