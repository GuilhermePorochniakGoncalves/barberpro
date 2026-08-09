// Avatar simples: iniciais do nome sobre um círculo colorido, gerado a
// partir do próprio nome (mesmo padrão do círculo "G" que já existia no
// Dashboard). Evita precisar de upload/armazenamento de foto.

// Classes completas e literais (não construídas por template string) pra
// o Tailwind conseguir detectá-las na varredura estática do build.
const CORES = [
  "bg-green-600",
  "bg-blue-600",
  "bg-purple-600",
  "bg-orange-500",
  "bg-pink-600",
  "bg-teal-600",
  "bg-indigo-600",
  "bg-red-500",
];

export function iniciais(nome = "") {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

export function corAvatar(nome = "") {
  let hash = 0;
  for (let i = 0; i < nome.length; i++) {
    hash = (hash * 31 + nome.charCodeAt(i)) >>> 0;
  }
  return CORES[hash % CORES.length];
}
