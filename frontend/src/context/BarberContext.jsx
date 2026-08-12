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

  async function criarCliente(dados) {
    try {
      const response = await api.post("/clientes", dados);
      setClientes((prev) => [...prev, response.data].sort((a, b) => a.nome.localeCompare(b.nome)));
      return { sucesso: true, cliente: response.data };
    } catch (error) {
      return { sucesso: false, mensagem: extrairMensagemErro(error, "Não foi possível cadastrar o cliente.") };
    }
  }

  async function atualizarCliente(id, dados) {
    try {
      const response = await api.put(`/clientes/${id}`, dados);
      setClientes((prev) => prev.map((c) => (c.id === id ? { ...c, ...response.data } : c)));
      return { sucesso: true, cliente: response.data };
    } catch (error) {
      return { sucesso: false, mensagem: extrairMensagemErro(error, "Não foi possível atualizar o cliente.") };
    }
  }

  async function removerCliente(id) {
    try {
      await api.delete(`/clientes/${id}`);
      setClientes((prev) => prev.filter((c) => c.id !== id));
      return { sucesso: true };
    } catch (error) {
      return { sucesso: false, mensagem: extrairMensagemErro(error, "Não foi possível remover o cliente.") };
    }
  }

  return (
    <BarberContext.Provider
      value={{
        clientes,
        carregando,
        erro,
        recarregar: carregarClientes,
        criarCliente,
        atualizarCliente,
        removerCliente,
      }}
    >
      {children}
    </BarberContext.Provider>
  );
}
