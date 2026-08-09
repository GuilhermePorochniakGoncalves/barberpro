import { useState } from "react";
import api from "../services/api";
import { BarberContext } from "./barber-context";
import { extrairMensagemErro } from "../utils/erro";

// Contexto de clientes — cadastro + histórico (o "último atendimento" já
// vem calculado pelo backend a partir da tabela `vendas`).
//
// Sem fetch automático no mount: só a página de Clientes consome esse
// contexto (useBarber), e ela mesma dispara `recarregar()` ao montar — um
// fetch aqui também rodaria em toda navegação do app, mesmo quando
// ninguém visita a tela de Clientes, e ainda duplicaria a busca quando
// visita.
export function BarberProvider({ children }) {
  const [clientes, setClientes] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState(null);

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
