// Dispara um toast a partir de qualquer lugar, inclusive fora da árvore
// React (ex.: o interceptor do axios em services/api.js). O ToastProvider
// escuta esse evento e mostra a notificação.
export function emitToast(mensagem, tipo = "info") {
  window.dispatchEvent(new CustomEvent("barberpro:toast", { detail: { mensagem, tipo } }));
}
