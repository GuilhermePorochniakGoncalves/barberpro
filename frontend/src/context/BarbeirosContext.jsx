import { useEffect, useState } from "react";
import api from "../services/api";
import { BarbeirosContext } from "./barbeiros-context";
import { extrairMensagemErro } from "../utils/erro";

// Contexto de barbeiros + produtos compartilhados (usados pela tela de
// finalizar atendimento e pela gestão de estoque) + criação de vendas.
//
// Serviço NÃO fica aqui: cada barbeiro tem os próprios (nome+preço), então
// a lista certa depende de qual barbeiro está sendo atendido — quem
// precisa disso (agenda do dia) busca via GET /catalogo?barbeiroId=.
export function BarbeirosProvider({ children }) {
  const [barbeiros, setBarbeiros] = useState([]);
  const [produtos, setProdutos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    carregarDados();
  }, []);

  async function carregarDados() {
    setCarregando(true);
    setErro(null);

    try {
      const [barbeirosRes, produtosRes] = await Promise.all([
        api.get("/barbeiros"),
        api.get("/catalogo"), // sem barbeiroId -> só produtos compartilhados
      ]);
      setBarbeiros(barbeirosRes.data);
      setProdutos(produtosRes.data);
    } catch (error) {
      console.error(error);
      setErro(extrairMensagemErro(error, "Não foi possível carregar barbeiros/produtos."));
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

  async function criarProduto(dados) {
    try {
      const response = await api.post("/produtos", dados);
      setProdutos((prev) => [...prev, response.data].sort((a, b) => a.nome.localeCompare(b.nome)));
      return { sucesso: true, produto: response.data };
    } catch (error) {
      return { sucesso: false, mensagem: extrairMensagemErro(error, "Não foi possível cadastrar o produto.") };
    }
  }

  async function atualizarProduto(id, dados) {
    try {
      const response = await api.put(`/produtos/${id}`, dados);
      setProdutos((prev) => prev.map((p) => (p.id === id ? response.data : p)));
      return { sucesso: true, produto: response.data };
    } catch (error) {
      return { sucesso: false, mensagem: extrairMensagemErro(error, "Não foi possível atualizar o produto.") };
    }
  }

  async function removerProduto(id) {
    try {
      await api.delete(`/produtos/${id}`);
      setProdutos((prev) => prev.filter((p) => p.id !== id));
      return { sucesso: true };
    } catch (error) {
      return { sucesso: false, mensagem: extrairMensagemErro(error, "Não foi possível remover o produto.") };
    }
  }

  return (
    <BarbeirosContext.Provider
      value={{
        barbeiros,
        produtos,
        carregando,
        erro,
        recarregar: carregarDados,
        criarBarbeiro,
        atualizarBarbeiro,
        removerBarbeiro,
        finalizarAtendimento,
        criarProduto,
        atualizarProduto,
        removerProduto,
      }}
    >
      {children}
    </BarbeirosContext.Provider>
  );
}
