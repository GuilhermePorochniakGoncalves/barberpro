import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Clients from "./pages/Clients";
import Barbeiros from "./pages/Barbeiros";
import Agenda from "./pages/Agenda";
import ServicosBarbeiro from "./pages/ServicosBarbeiro";
import Produtos from "./pages/Produtos";
import Despesas from "./pages/Despesas";
import Lembretes from "./pages/Lembretes";
import Relatorios from "./pages/Relatorios";
import AgendarPublico from "./pages/AgendarPublico";
import PainelProtegido from "./components/PainelProtegido";

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
        {/* Raiz pública, sem senha — é o link que a barbearia divulga pro
            cliente final marcar sozinho. Fica na raiz de propósito: se
            alguém editar a URL e apagar o "/agendar", o pior caso é cair
            de novo aqui, nunca no painel de gestão (ver PainelProtegido). */}
        <Route path="/" element={<AgendarPublico />} />
        <Route path="/agendar" element={<AgendarPublico />} />
        <Route path="/agendar/:barbeiroId" element={<AgendarPublico />} />

        {/* Painel de gestão — atrás da senha única da barbearia. */}
        <Route element={<PainelProtegido />}>
          <Route path="/painel" element={<Dashboard />} />
          <Route path="/clientes" element={<Clients />} />
          <Route path="/barbeiros" element={<Barbeiros />} />
          <Route path="/barbeiros/:id" element={<RedirecionarParaAgenda />} />
          <Route path="/barbeiros/:id/servicos" element={<ServicosBarbeiro />} />
          <Route path="/agenda" element={<Agenda />} />
          <Route path="/produtos" element={<Produtos />} />
          <Route path="/despesas" element={<Despesas />} />
          <Route path="/lembretes" element={<Lembretes />} />
          <Route path="/relatorios" element={<Relatorios />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default AppRoutes;
