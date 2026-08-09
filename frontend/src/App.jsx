import AppRoutes from "./routes";
import { BarberProvider } from "./context/BarberContext";
import { BarbeirosProvider } from "./context/BarbeirosContext";
import { ToastProvider } from "./context/ToastContext";

function App() {
  return (
    <ToastProvider>
      <BarbeirosProvider>
        <BarberProvider>
          <AppRoutes />
        </BarberProvider>
      </BarbeirosProvider>
    </ToastProvider>
  );
}

export default App;
