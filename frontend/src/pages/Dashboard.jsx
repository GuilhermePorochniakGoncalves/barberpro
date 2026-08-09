import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout";

function Dashboard() {
  const navigate = useNavigate();

  return (
    <Layout>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">
            Dashboard da Barbearia
          </h1>
          <p className="text-gray-500 mt-1">
            Bem-vindo de volta, Guilherme
          </p>
        </div>

        <div className="w-12 h-12 bg-green-600 rounded-full flex items-center justify-center text-white font-bold">
          G
        </div>
      </div>

      {/* Os cards abaixo ainda são estáticos — o próximo passo natural é
          puxar esses números de GET /relatorios/mensal (ver Relatórios). */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-2xl shadow">
          <p className="text-gray-500">Faturamento hoje</p>
          <h2 className="text-3xl font-bold text-green-600 mt-2">
            R$ 420
          </h2>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow">
          <p className="text-gray-500">Atendimentos</p>
          <h2 className="text-3xl font-bold text-blue-600 mt-2">
            8
          </h2>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow">
          <p className="text-gray-500">Ticket médio</p>
          <h2 className="text-3xl font-bold text-purple-600 mt-2">
            R$ 52
          </h2>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow p-8 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-800 mb-1">Agenda do dia</h2>
          <p className="text-gray-500">
            Escolha um barbeiro para ver os horários e clientes marcados.
          </p>
        </div>
        <button
          onClick={() => navigate("/barbeiros")}
          className="bg-green-600 text-white px-5 py-3 rounded-xl hover:bg-green-700"
        >
          Ver barbeiros
        </button>
      </div>
    </Layout>
  );
}

export default Dashboard;
