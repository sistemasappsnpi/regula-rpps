// Paleta dos gráficos das páginas do Portal Previdenciário: cores vivas e bem distintas entre si, de
// propósito (a ideia é chamar atenção, não seguir a cor institucional). O portal é sempre no tema claro
// (.portal-publico-claro), então são cores fixas. Cada barra/fatia pega a cor pela posição, em ordem.
export const PALETA_GRAFICOS = [
  "#0891b2", // ciano
  "#7c3aed", // violeta
  "#16a34a", // verde
  "#f59e0b", // âmbar
  "#e11d48", // vermelho-rosado
  "#2563eb", // azul
  "#db2777", // rosa
  "#0d9488", // verde-água
  "#ea580c", // laranja
  "#65a30d", // lima
];

export function corDoGrafico(indice: number): string {
  return PALETA_GRAFICOS[indice % PALETA_GRAFICOS.length];
}
