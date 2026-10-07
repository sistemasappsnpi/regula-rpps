// A API de dados abertos não manda ordem de exibição: nem das categorias, nem dos itens dentro delas.
// A ordem oficial está na página de acesso à informação do próprio cliente, que é lida e interpretada aqui.
// Resultado: [ { nome: "Atendimento ao Cidadão", itens: ["E-sic", "Ouvidoria Municipal"] }, ... ]
// (porte de modelo/ordem.php do gerador original)

import { fetchTexto } from "./http";

export interface OrdemGrupo {
  nome: string;
  itens: string[];
}

export function ordemUrl(base: string): string {
  return base.replace(/\/+$/, "") + "/acessoainformacao";
}

const ENTIDADES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  aacute: "á", agrave: "à", atilde: "ã", acirc: "â", eacute: "é", egrave: "è", ecirc: "ê",
  iacute: "í", oacute: "ó", otilde: "õ", ocirc: "ô", uacute: "ú", uuml: "ü", ccedil: "ç",
  Aacute: "Á", Agrave: "À", Atilde: "Ã", Acirc: "Â", Eacute: "É", Ecirc: "Ê",
  Iacute: "Í", Oacute: "Ó", Otilde: "Õ", Ocirc: "Ô", Uacute: "Ú", Uuml: "Ü", Ccedil: "Ç",
  ordm: "º", ordf: "ª", ndash: "–", mdash: "—", hellip: "…", laquo: "«", raquo: "»",
};

function decodificarEntidades(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (todo, ent: string) => {
    if (ent[0] === "#") {
      const n = ent[1].toLowerCase() === "x" ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : todo;
    }
    return ENTIDADES[ent] ?? todo;
  });
}

function limparTexto(s: string): string {
  return decodificarEntidades(s.replace(/<[^>]*>/g, ""))
    .replace(/ /g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseOrdemHtml(htmlBruto: string): OrdemGrupo[] {
  const html = htmlBruto.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, "");
  const cabecalhos = [...html.matchAll(/<h([2-5])\b[^>]*>([\s\S]*?)<\/h\1>/gi)];
  const grupos: OrdemGrupo[] = [];

  cabecalhos.forEach((m, i) => {
    const nome = limparTexto(m[2]);
    if (nome === "" || [...nome].length > 90) return;
    const ini = (m.index ?? 0) + m[0].length;
    const fim = i + 1 < cabecalhos.length ? (cabecalhos[i + 1].index ?? html.length) : html.length;
    const corpo = html.slice(ini, fim);

    let itens: string[] = [];
    // cartão padrão desses portais: <div class="cat-desc"> ... <h6>Título do item</h6>
    for (const mi of corpo.matchAll(/cat-desc[\s\S]*?<h6[^>]*>([\s\S]*?)<\/h6>/gi)) {
      const t = limparTexto(mi[1]);
      if (t !== "") itens.push(t);
    }
    if (itens.length === 0) {
      [...corpo.matchAll(/<h6[^>]*>([\s\S]*?)<\/h6>/gi)].forEach((mi, k) => {
        const t = limparTexto(mi[1]);
        // o primeiro h6 costuma ser o amparo legal do grupo, não um item
        if (t !== "" && !(k === 0 && /^(lei|decreto|portaria|pró-gestão|pro-gestao|órgãos|orgaos)/i.test(t))) itens.push(t);
      });
    }
    if (itens.length > 0) grupos.push({ nome, itens: [...new Set(itens)] });
  });
  return grupos;
}

export async function buscarOrdem(url: string): Promise<OrdemGrupo[]> {
  const html = await fetchTexto(url, 12000);
  return html === null ? [] : parseOrdemHtml(html);
}
