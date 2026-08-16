// Gera um link wa.me com mensagem pré-preenchida — abre o WhatsApp (web ou
// app) já com o texto pronto, só falta clicar "Enviar". Não é envio
// automático de verdade (precisaria de WhatsApp Business API, que é paga);
// isso aqui é o "quase automático" que funciona sem custo nenhum: o
// barbeiro/recepção clica uma vez em vez de digitar a mensagem inteira.
export function linkWhatsApp(telefone, mensagem) {
  const digitos = String(telefone ?? "").replace(/\D/g, "");
  if (!digitos) return null;
  // wa.me exige código do país — assume Brasil (55) se não vier com ele.
  const numero = digitos.startsWith("55") ? digitos : `55${digitos}`;
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`;
}
