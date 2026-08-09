import { BrowserRouter, Routes, Route } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Clients from "./pages/Clients";
import Barbeiros from "./pages/Barbeiros";
import BarbeiroAgenda from "./pages/BarbeiroAgenda";
import Relatorios from "./pages/Relatorios";
import Login from "./pages/Login";
import MeusServicos from "./pages/MeusServicos";
import Produtos from "./pages/Produtos";
import RotaProtegida from "./components/RotaProtegida";

function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/clientes" element={<Clients />} />
        <Route path="/barbeiros" element={<Barbeiros />} />
        <Route path="/barbeiros/:id" element={<BarbeiroAgenda />} />
        <Route path="/relatorios" element={<Relatorios />} />
        <Route path="/login" element={<Login />} />
        <Route
          path="/meus-servicos"
          element={
            <RotaProtegida>
              <MeusServicos />
            </RotaProtegida>
          }
        />
        <Route
          path="/produtos"
          element={
            <RotaProtegida>
              <Produtos />
            </RotaProtegida>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default AppRoutes;
