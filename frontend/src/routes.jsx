import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Clients from "./pages/Clients";
import Barbeiros from "./pages/Barbeiros";
import Agenda from "./pages/Agenda";
import ServicosBarbeiro from "./pages/ServicosBarbeiro";
import Produtos from "./pages/Produtos";
import Despesas from "./pages/Despesas";
import Relatorios from "./pages/Relatorios";
import AgendarPublico from "./pages/AgendarPublico";

// Redireciona a rota antiga /barbeiros/:id (era o ponto de entrada da
// agenda de um barbeiro) pra /agenda?barbeiro=:id — mantém links antigos
// funcionando depois que a agenda virou uma rota única com abas.
function RedirecionarParaAgenda() {
  const id = window.location.pathname.split("/").pop();
  return <Navigate to={`/agenda?barbeiro=${id}`} replace />;
}

function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/clientes" element={<Clients />} />
        <Route path="/barbeiros" element={<Barbeiros />} />
        <Route path="/barbeiros/:id" element={<RedirecionarParaAgenda />} />
        <Route path="/barbeiros/:id/servicos" element={<ServicosBarbeiro />} />
        <Route path="/agenda" element={<Agenda />} />
        <Route path="/produtos" element={<Produtos />} />
        <Route path="/despesas" element={<Despesas />} />
        <Route path="/relatorios" element={<Relatorios />} />
        {/* Rota pública, sem login — pensada pra virar o link que a
            barbearia divulga pro cliente marcar sozinho. */}
        <Route path="/agendar" element={<AgendarPublico />} />
        <Route path="/agendar/:barbeiroId" element={<AgendarPublico />} />
      </Routes>
    </BrowserRouter>
  );
}

export default AppRoutes;
