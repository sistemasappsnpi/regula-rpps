import { prisma } from "../../db/prisma";
import { fetchPagina } from "./http";

// Configuração visual que a página oficial do órgão embute no próprio JS (ordem dos grupos, textos de cada grupo e
// item, perfis, sinônimos, glossário, ícones). O importador por link só copiava botões e menu — por isso o portal
// gerado abria com outra ordem, textos e perfis. Aqui essas constantes são lidas e entram no `config` do portal.

type Cfg = Record<string, any>;

// Literal JS (objeto/lista) -> valor. Aceita chaves sem aspas, vírgula sobrando e comentários; nunca executa nada.
function literalParaValor(literal: string): unknown {
  let saida = "";
  let ultimo = ""; // último caractere significativo fora de texto
  for (let i = 0; i < literal.length; i++) {
    const c = literal[i];
    if (c === '"') {
      // texto inteiro, copiado como está
      let j = i + 1;
      while (j < literal.length && literal[j] !== '"') j += literal[j] === "\\" ? 2 : 1;
      saida += literal.slice(i, j + 1);
      i = j;
      ultimo = '"';
    } else if (c === "/" && literal[i + 1] === "*") {
      const fim = literal.indexOf("*/", i + 2);
      i = fim < 0 ? literal.length : fim + 1;
    } else if (c === "/" && literal[i + 1] === "/") {
      while (i < literal.length && literal[i] !== "\n") i++;
    } else if (/[A-Za-z_$]/.test(c) && (ultimo === "{" || ultimo === ",")) {
      // chave sem aspas
      let j = i;
      while (j < literal.length && /[\w$]/.test(literal[j])) j++;
      const nome = literal.slice(i, j);
      const resto = literal.slice(j).match(/^\s*:/);
      saida += resto ? `"${nome}"` : nome;
      i = j - 1;
      ultimo = "a";
    } else if (c === "}" || c === "]") {
      saida = saida.replace(/,\s*$/, "") + c; // vírgula sobrando antes do fechamento
      ultimo = c;
    } else {
      saida += c;
      if (!/\s/.test(c)) ultimo = c;
    }
  }
  return JSON.parse(saida);
}

// "NOME = { ... }" / "NOME = [ ... ]": devolve o trecho com colchetes/chaves balanceados (respeitando textos).
function trechoDe(html: string, nome: string): string | null {
  const m = new RegExp(`\\b(?:var|let|const)\\s+${nome}\\s*=\\s*([\\[{])`).exec(html);
  if (!m) return null;
  const abre = m.index + m[0].length - 1;
  const abreC = html[abre];
  const fechaC = abreC === "[" ? "]" : "}";
  let nivel = 0;
  let emTexto = false;
  for (let i = abre; i < html.length; i++) {
    const c = html[i];
    if (emTexto) {
      if (c === "\\") i++;
      else if (c === '"') emTexto = false;
    } else if (c === '"') emTexto = true;
    else if (c === abreC) nivel++;
    else if (c === fechaC && --nivel === 0) return html.slice(abre, i + 1);
  }
  return null;
}

function ler(html: string, nome: string): unknown {
  const t = trechoDe(html, nome);
  if (!t) return undefined;
  try {
    return literalParaValor(t);
  } catch {
    return undefined;
  }
}

const ehDicionario = (v: unknown): v is Record<string, string> =>
  !!v && typeof v === "object" && !Array.isArray(v) && Object.values(v).every((x) => typeof x === "string");

export interface ConfigOficial {
  grupos?: { ordem?: string[]; icones?: Record<string, string>; descricoes?: Record<string, string> };
  icones?: Record<string, string>;
  descricoesItens?: Record<string, string>;
  perfis?: unknown[];
  sinonimos?: Record<string, string>;
  glossario?: Record<string, string>;
  amparos?: Record<string, string>;
}

export function configDaPaginaOficial(html: string): ConfigOficial {
  const c: ConfigOficial = {};
  const grupos: NonNullable<ConfigOficial["grupos"]> = {};

  // a lista de ordem tem nome próprio em cada portal (ORDER_IPRES, GROUP_ORDER…): vale a 1ª lista só de textos
  for (const m of html.matchAll(/\b(?:var|let|const)\s+([A-Z_]*ORDER[A-Z_]*)\s*=\s*\[/g)) {
    const v = ler(html, m[1]);
    if (Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === "string")) {
      grupos.ordem = v as string[];
      break;
    }
  }
  const icones = ler(html, "GROUP_META");
  if (ehDicionario(icones)) grupos.icones = icones;
  const desc = ler(html, "GROUP_DESC");
  if (ehDicionario(desc)) grupos.descricoes = desc;
  if (Object.keys(grupos).length) c.grupos = grupos;

  const iconMap = ler(html, "ICON_MAP");
  if (ehDicionario(iconMap)) c.icones = iconMap;
  const itens = ler(html, "ITEM_DESC");
  if (ehDicionario(itens)) c.descricoesItens = itens;
  const perfis = ler(html, "PROFILES");
  if (Array.isArray(perfis) && perfis.length > 0 && perfis.every((p) => p && typeof p === "object" && "id" in p && "label" in p)) c.perfis = perfis;
  const sin = ler(html, "SYNONYMS");
  if (ehDicionario(sin)) c.sinonimos = sin;
  const glo = ler(html, "GLOSSARY");
  if (ehDicionario(glo)) c.glossario = glo;
  const amp = ler(html, "AMPARO_LABELS");
  if (ehDicionario(amp)) c.amparos = amp;
  return c;
}

/** Junta o que a página oficial trouxe ao config do portal (o que ela não trouxe fica como está). */
export function aplicarConfigOficial(config: Cfg, oficial: ConfigOficial): Cfg {
  const novo: Cfg = { ...config };
  if (oficial.grupos) novo.grupos = { ...(config.grupos ?? {}), ...oficial.grupos };
  for (const k of ["icones", "descricoesItens", "perfis", "sinonimos", "glossario", "amparos"] as const) {
    if (oficial[k] !== undefined) novo[k] = oficial[k];
  }
  return novo;
}

/**
 * Na subida da API: para cada portal importado de um link (config.externo.url), lê de novo a página oficial e deixa o
 * portal igual a ela. Um portal sem página legível, ou sem nada a aplicar, não é tocado; um com problema não impede os outros.
 */
export async function sincronizarConfigOficial(): Promise<string[]> {
  const feito: string[] = [];
  try {
    const portais = await prisma.transparenciaPortal.findMany({ select: { pasta: true, config: true } });
    for (const p of portais) {
      try {
        const config = (p.config ?? {}) as Cfg;
        const url = config.externo?.url;
        if (typeof url !== "string" || url === "") continue;
        const pagina = await fetchPagina(url);
        if (!pagina) continue;
        const oficial = configDaPaginaOficial(pagina.html);
        if (Object.keys(oficial).length === 0) continue;
        const novo = aplicarConfigOficial(config, oficial);
        if (JSON.stringify(novo) === JSON.stringify(config)) continue;
        await prisma.transparenciaPortal.update({ where: { pasta: p.pasta }, data: { config: novo } });
        feito.push(`${p.pasta}: configuração visual igualada à página oficial (${Object.keys(oficial).join(", ")})`);
      } catch (err) {
        console.error(`[config-oficial] ${p.pasta}:`, err instanceof Error ? err.message : err);
      }
    }
  } catch (err) {
    console.error("[config-oficial]", err instanceof Error ? err.message : err);
  }
  for (const linha of feito) console.log(`[config-oficial] ${linha}`);
  return feito;
}
