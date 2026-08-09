import AppRoutes from "./routes";
import { BarberProvider } from "./context/BarberContext";
import { BarbeirosProvider } from "./context/BarbeirosContext";

function App() {
  return (
    <BarbeirosProvider>
      <BarberProvider>
        <AppRoutes />
      </BarberProvider>
    </BarbeirosProvider>
  );
}

export default App;
