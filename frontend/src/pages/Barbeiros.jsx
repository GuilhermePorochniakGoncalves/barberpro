import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import { useBarbeiros } from "../context/useBarbeiros";
import { iniciais, corAvatar } from "../utils/avatar";

function Barbeiros() {
  const { barbeiros, carregando, erro, criarBarbeiro } = useBarbeiros();
  const navigate = useNavigate();

  const [criando, setCriando] = useState(false);
  const [nomeNovo, setNomeNovo] = useState("");
  const [erroForm, setErroForm] = useState("");
  const [salvando, setSalvando] = useState(false);

  const ativos = barbeiros.filter((b) => b.ativo);

  async function salvarNovoBarbeiro() {
    if (!nomeNovo.trim()) {
      setErroForm("Informe o nome do barbeiro.");
      return;
    }

    setSalvando(true);
    setErroForm("");

    const resultado = await criarBarbeiro(nomeNovo.trim());

    setSalvando(false);

    if (!resultado.sucesso) {
      setErroForm(resultado.mensagem);
      return;
    }

    setNomeNovo("");
    setCriando(false);
  }

  return (
    <Layout>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-800">Barbeiros</h1>

        <button
          onClick={() => setCriando(true)}
          className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
        >
          Novo barbeiro
        </button>
      </div>

      {erro && <p className="text-red-600 mb-4">{erro}</p>}

      {criando && (
        <div className="bg-white rounded-2xl shadow p-6 mb-6">
          <h2 className="font-bold text-lg mb-3">Novo barbeiro</h2>
          <div className="flex gap-3">
            <input
              type="text"
              autoFocus
              placeholder="Nome do barbeiro"
              value={nomeNovo}
              onChange={(e) => setNomeNovo(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && salvarNovoBarbeiro()}
              className="flex-1 border rounded-lg p-3"
              disabled={salvando}
            />
            <button
              onClick={salvarNovoBarbeiro}
              disabled={salvando}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              {salvando ? "Salvando..." : "Salvar"}
            </button>
            <button
              onClick={() => {
                setCriando(false);
                setNomeNovo("");
                setErroForm("");
              }}
              disabled={salvando}
              className="px-4 py-2 border rounded-lg hover:bg-gray-100"
            >
              Cancelar
            </button>
          </div>
          {erroForm && <p className="text-red-600 text-sm mt-2">{erroForm}</p>}
        </div>
      )}

      {carregando ? (
        <p className="text-gray-500 py-8 text-center">Carregando barbeiros...</p>
      ) : ativos.length === 0 ? (
        <div className="bg-white rounded-2xl shadow p-10 text-center text-gray-500">
          Nenhum barbeiro cadastrado ainda.
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {ativos.map((barbeiro) => (
            <button
              key={barbeiro.id}
              onClick={() => navigate(`/barbeiros/${barbeiro.id}`)}
              className="bg-white rounded-2xl shadow p-6 flex flex-col items-center gap-3 hover:shadow-lg hover:-translate-y-0.5 transition"
            >
              <div
                className={`w-16 h-16 rounded-full flex items-center justify-center text-white text-xl font-bold ${corAvatar(
                  barbeiro.nome
                )}`}
              >
                {iniciais(barbeiro.nome)}
              </div>
              <span className="font-semibold text-gray-800">{barbeiro.nome}</span>
            </button>
          ))}
        </div>
      )}
    </Layout>
  );
}

export default Barbeiros;
