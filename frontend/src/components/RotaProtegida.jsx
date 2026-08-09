import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/useAuth";

// Envolve uma rota que exige login de barbeiro. Sem sessão, redireciona
// pra /login guardando de onde veio (state.from) pra voltar depois.
function RotaProtegida({ children }) {
  const { barbeiroLogado } = useAuth();
  const location = useLocation();

  if (!barbeiroLogado) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  return children;
}

export default RotaProtegida;
