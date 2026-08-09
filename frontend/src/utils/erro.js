// Extrai uma mensagem de erro legível da resposta da API (que usa
// { erro: "..." } para erros pontuais e { erros: ["...", "..."] } para
// falhas de validação). Compartilhado por todos os contextos que chamam a API.
export function extrairMensagemErro(error, fallback) {
  const data = error?.response?.data;

  if (data?.erro) return data.erro;
  if (Array.isArray(data?.erros)) return data.erros.join(" ");
  if (error?.message === "Network Error") {
    return "Não foi possível conectar ao servidor. Verifique se o backend está rodando.";
  }

  return fallback;
}
