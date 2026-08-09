import { BrowserRouter, Routes, Route } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Clients from "./pages/Clients";
import Barbeiros from "./pages/Barbeiros";
import BarbeiroAgenda from "./pages/BarbeiroAgenda";
import ServicosBarbeiro from "./pages/ServicosBarbeiro";
import Produtos from "./pages/Produtos";
import Relatorios from "./pages/Relatorios";
import AgendarPublico from "./pages/AgendarPublico";

function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/clientes" element={<Clients />} />
        <Route path="/barbeiros" element={<Barbeiros />} />
        <Route path="/barbeiros/:id" element={<BarbeiroAgenda />} />
        <Route path="/barbeiros/:id/servicos" element={<ServicosBarbeiro />} />
        <Route path="/produtos" element={<Produtos />} />
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
