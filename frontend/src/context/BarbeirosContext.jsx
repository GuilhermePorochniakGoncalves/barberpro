import { useEffect, useState } from "react";
import api from "../services/api";
import { BarbeirosContext } from "./barbeiros-context";
import { extrairMensagemErro } from "../utils/erro";

// Contexto de barbeiros + catálogo de serviços/produtos (usados tanto pelo
// agendamento quanto pela tela de finalizar atendimento) + criação de vendas.
export function BarbeirosProvider({ children }) {
  const [barbeiros, setBarbeiros] = useState([]);
  const [catalogo, setCatalogo] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    carregarDados();
  }, []);

  async function carregarDados() {
    setCarregando(true);
    setErro(null);

    try {
      const [barbeirosRes, catalogoRes] = await Promise.all([
        api.get("/barbeiros"),
        api.get("/catalogo"),
      ]);
      setBarbeiros(barbeirosRes.data);
      setCatalogo(catalogoRes.data);
    } catch (error) {
      console.error(error);
      setErro(extrairMensagemErro(error, "Não foi possível carregar barbeiros/catálogo."));
    } finally {
      setCarregando(false);
    }
  }

  async function criarBarbeiro(nome) {
    try {
      const response = await api.post("/barbeiros", { nome });
      setBarbeiros((prev) =>
        [...prev, response.data].sort((a, b) => a.nome.localeCompare(b.nome))
      );
      return { sucesso: true, barbeiro: response.data };
    } catch (error) {
      return { sucesso: false, mensagem: extrairMensagemErro(error, "Não foi possível cadastrar o barbeiro.") };
    }
  }

  async function atualizarBarbeiro(id, dados) {
    try {
      const response = await api.put(`/barbeiros/${id}`, dados);
      setBarbeiros((prev) => prev.map((b) => (b.id === id ? response.data : b)));
      return { sucesso: true, barbeiro: response.data };
    } catch (error) {
      return { sucesso: false, mensagem: extrairMensagemErro(error, "Não foi possível atualizar o barbeiro.") };
    }
  }

  async function removerBarbeiro(id) {
    try {
      const response = await api.delete(`/barbeiros/${id}`);
      if (response.status === 200 && response.data?.barbeiro) {
        // Backend desativou em vez de excluir (tem histórico).
        setBarbeiros((prev) => prev.map((b) => (b.id === id ? response.data.barbeiro : b)));
        return { sucesso: true, aviso: response.data.aviso };
      }
      setBarbeiros((prev) => prev.filter((b) => b.id !== id));
      return { sucesso: true };
    } catch (error) {
      return { sucesso: false, mensagem: extrairMensagemErro(error, "Não foi possível remover o barbeiro.") };
    }
  }

  async function finalizarAtendimento(dados) {
    try {
      const response = await api.post("/vendas", dados);
      return { sucesso: true, venda: response.data };
    } catch (error) {
      return { sucesso: false, mensagem: extrairMensagemErro(error, "Não foi possível finalizar o atendimento.") };
    }
  }

  return (
    <BarbeirosContext.Provider
      value={{
        barbeiros,
        catalogo,
        carregando,
        erro,
        recarregar: carregarDados,
        criarBarbeiro,
        atualizarBarbeiro,
        removerBarbeiro,
        finalizarAtendimento,
      }}
    >
      {children}
    </BarbeirosContext.Provider>
  );
}
