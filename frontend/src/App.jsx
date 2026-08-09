import AppRoutes from "./routes";
import { BarberProvider } from "./context/BarberContext";
import { BarbeirosProvider } from "./context/BarbeirosContext";
import { AuthProvider } from "./context/AuthContext";

function App() {
  return (
    <AuthProvider>
      <BarbeirosProvider>
        <BarberProvider>
          <AppRoutes />
        </BarberProvider>
      </BarbeirosProvider>
    </AuthProvider>
  );
}

export default App;
