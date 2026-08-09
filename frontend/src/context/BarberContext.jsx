import { useEffect, useState } from "react";
import api from "../services/api";
import { BarberContext } from "./barber-context";
import { extrairMensagemErro } from "../utils/erro";

// Contexto de clientes — cadastro + histórico (o "último atendimento" já
// vem calculado pelo backend a partir da tabela `vendas`).
export function BarberProvider({ children }) {
  const [clientes, setClientes] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    carregarClientes();
  }, []);

  async function carregarClientes() {
    setCarregando(true);
    setErro(null);

    try {
      const response = await api.get("/clientes");
      setClientes(response.data);
    } catch (error) {
      console.error(error);
      setErro(extrairMensagemErro(error, "Não foi possível carregar os clientes."));
    } finally {
      setCarregando(false);
    }
  }

  return (
    <BarberContext.Provider
      value={{
        clientes,
        carregando,
        erro,
        recarregar: carregarClientes,
      }}
    >
      {children}
    </BarberContext.Provider>
  );
}
