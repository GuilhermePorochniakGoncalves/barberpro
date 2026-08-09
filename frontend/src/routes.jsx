import { BrowserRouter, Routes, Route } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Clients from "./pages/Clients";
import Barbeiros from "./pages/Barbeiros";
import BarbeiroAgenda from "./pages/BarbeiroAgenda";
import Relatorios from "./pages/Relatorios";

function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/clientes" element={<Clients />} />
        <Route path="/barbeiros" element={<Barbeiros />} />
        <Route path="/barbeiros/:id" element={<BarbeiroAgenda />} />
        <Route path="/relatorios" element={<Relatorios />} />
      </Routes>
    </BrowserRouter>
  );
}

export default AppRoutes;
