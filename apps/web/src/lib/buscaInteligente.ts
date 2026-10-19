// Motor de busca por similaridade das páginas do Portal Previdenciário — porta do motor do modelo do
// gerador de transparência (transparencia-gerador/modelo/assets/app.js, "SearchEngine"): ignora acento
// e caixa, entende plural/radical da palavra, tolera erro de digitação (distância de edição + fonética),
// aceita prefixo, entende sinônimos e siglas do mundo previdenciário, ordena por relevância e sugere
// itens do mesmo assunto. Roda 100% no navegador, em cima dos registros já carregados.

export interface DocBusca {
  id: number;
  titulo: string; // peso maior
  grupo: string; // colegiado, tipo de documento…
  desc: string; // detalhe (período, aprovador…)
  extra: string; // demais textos (ano, datas, CNPJ…)
}

export interface ResultadoBusca {
  ids: number[]; // do mais ao menos relevante
  relacionados: number[]; // fora do resultado, mas do mesmo assunto
  corrigido: string | null; // "mostrando resultados para …" quando houve erro de digitação
  parecidos: boolean; // nenhum resultado exato: estes são os mais parecidos
  termos: string[]; // o que destacar nos textos (sem acento, minúsculo)
}

export interface MotorBusca {
  buscar(consulta: string): ResultadoBusca;
  sugestoes(max: number): string[];
}

const STOP = new Set(["de", "da", "do", "e", "a", "o", "as", "os", "em", "para", "por", "com", "no", "na", "um", "uma", "ao", "que", "sou", "dos", "das"]);

// termo digitado -> termos que também devem ser procurados (siglas e jargão da previdência)
const SINONIMOS_PADRAO: Record<string, string> = {
  crp: "certificado de regularidade previdenciaria",
  draa: "demonstrativo de resultado da avaliacao atuarial avaliacao atuarial",
  dair: "demonstrativo de aplicacoes e investimentos dos recursos",
  dipr: "demonstrativo de informacoes previdenciarias e repasses",
  alm: "estudo de alm ativos e passivos",
  apr: "autorizacao de aplicacao e resgate",
  pca: "plano anual de contratacoes",
  ppa: "plano plurianual",
  ldo: "lei de diretrizes orcamentarias",
  loa: "lei orcamentaria anual",
  rgf: "relatorio de gestao fiscal",
  rreo: "relatorio resumido da execucao orcamentaria",
  tce: "tribunal de contas acordao",
  "tribunal de contas": "tce acordao",
  "tribunal contas": "tce acordao",
  "conselho de administracao": "consad",
  "conselho fiscal": "confis",
  "diretoria executiva": "direx",
  "comite de investimentos": "cominv",
  acordao: "tribunal de contas tce",
  ata: "reuniao atas",
  reuniao: "ata atas calendario",
  direx: "diretoria executiva",
  consad: "conselho de administracao",
  confis: "conselho fiscal",
  cominv: "comite de investimentos",
  conselho: "conselho de administracao conselho fiscal",
  comite: "comite de investimentos",
  balancete: "balanco demonstracao demonstrativo",
  balanco: "balancete demonstracao",
  receita: "balancete de receitas",
  despesa: "balancete de despesas",
  patrimonio: "balancete patrimonial",
  orcamento: "balancete orcamentario orcamentaria",
  investimento: "investimentos carteira relatorio mensal anual",
  rentabilidade: "relatorio mensal anual de investimentos carteira",
  diligencia: "relatorio semestral de diligencias",
  risco: "gestao de riscos estrategias",
  gestor: "administrador gestor",
  administrador: "administrador gestor",
  custodia: "custodiante",
  banco: "banco instituicao custodiante administrador",
  trimestre: "trimestral",
  controle: "controle interno",
  atuarial: "avaliacao atuarial",
  parecer: "parecer mensal comite conselho fiscal",
  edital: "licitacoes",
  contrato: "contratos aditivos licitacoes",
};

export function norm(s: string): string {
  return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function stemWord(w: string): string {
  if (w.length > 4) {
    if (/coes$/.test(w)) return w.slice(0, -4) + "cao";
    if (/soes$/.test(w)) return w.slice(0, -4) + "sao";
    if (/oes$/.test(w)) return w.slice(0, -3) + "ao";
    if (/ais$/.test(w)) return w.slice(0, -3) + "al";
    if (/eis$/.test(w)) return w.slice(0, -3) + "el";
  }
  if (w.length > 5 && /ns$/.test(w)) return w.slice(0, -2) + "m";
  if (w.length > 3 && /s$/.test(w)) return w.slice(0, -1);
  return w;
}

function canon(s: string): string {
  return norm(s)
    .split(/([^a-z0-9]+)/)
    .map((part) => (/[a-z0-9]/.test(part) ? stemWord(part) : part))
    .join("");
}

function palavras(s: string): { raw: string; tok: string }[] {
  return (s || "")
    .toLowerCase()
    .split(/[^a-z0-9à-ÿ]+/)
    .filter(Boolean)
    .map((w) => ({ raw: w, tok: canon(w) }))
    .filter((w) => w.tok && !STOP.has(w.tok));
}

// aproximação fonética do português: "ph"→f, "ch"→x, "ss"→s, "qu"→k, "ce/ci"→s…
function fonetica(t: string): string {
  return t
    .replace(/ph/g, "f").replace(/ch/g, "x").replace(/h/g, "").replace(/qu/g, "k")
    .replace(/c(?=[ei])/g, "s").replace(/c/g, "k").replace(/ss/g, "s").replace(/[zx]/g, "s")
    .replace(/y/g, "i").replace(/w/g, "v").replace(/g(?=[ei])/g, "j").replace(/(.)\1+/g, "$1");
}

// distância de Damerau-Levenshtein com corte em "max"
function dist(a: string, b: string, max: number): number {
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > max) return max + 1;
  let prev2: number[] | null = null;
  let prev: number[] = [];
  for (let j = 0; j <= lb; j++) prev[j] = j;
  for (let i = 1; i <= la; i++) {
    const cur: number[] = [i];
    let rowMin = i;
    for (let j = 1; j <= lb; j++) {
      const c = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + c);
      if (prev2 && i > 1 && j > 1 && a.charCodeAt(i - 1) === b.charCodeAt(j - 2) && a.charCodeAt(i - 2) === b.charCodeAt(j - 1)) {
        v = Math.min(v, prev2[j - 2] + 1);
      }
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[lb];
}

function trigramas(s: string): { set: Set<string>; n: number } {
  const t = `  ${s.replace(/[^a-z0-9]/g, "")} `;
  const set = new Set<string>();
  for (let i = 0; i < t.length - 2; i++) set.add(t.substr(i, 3));
  return { set, n: set.size };
}

const CAMPOS = ["title", "group", "desc", "extra"] as const;
type Campo = (typeof CAMPOS)[number];
// "extra" guarda o exercício (ano): pesquisar "2022" tem que achar o que foi publicado em 2022 mesmo sem o ano no título
const PESO: Record<Campo, number> = { title: 6, group: 2.5, desc: 2, extra: 4 };

interface DocIndexado {
  id: number;
  sets: Record<Campo, Set<string>>;
  titleFlat: string;
  grams: { set: Set<string>; n: number };
  grupo: string;
}

interface Candidato {
  t: string;
  qual: number;
}

export function criarMotorBusca(docs: DocBusca[], sinonimosExtras: Record<string, string> = {}): MotorBusca {
  const indexados: DocIndexado[] = [];
  const vocab = new Map<string, { df: number; p: string }>();
  const exibicao = new Map<string, string>(); // radical -> palavra como aparece nos textos
  const relacionadosPorTermo = new Map<string, Map<string, number>>();
  const dfGrupo = new Map<string, number>();

  for (const doc of docs) {
    const sets = {} as Record<Campo, Set<string>>;
    const tokens = {} as Record<Campo, string[]>;
    const entradas: [Campo, string][] = [
      ["title", doc.titulo],
      ["group", doc.grupo],
      ["desc", doc.desc],
      ["extra", doc.extra],
    ];
    for (const [campo, texto] of entradas) {
      const ps = palavras(texto);
      tokens[campo] = ps.map((p) => p.tok);
      sets[campo] = new Set(tokens[campo]);
      for (const p of ps) if (campo !== "extra" && !exibicao.has(p.tok)) exibicao.set(p.tok, p.raw);
    }
    const titulares = [...sets.title];
    for (const t of titulares) {
      const mapa = relacionadosPorTermo.get(t) ?? new Map<string, number>();
      for (const u of titulares) if (u !== t) mapa.set(u, (mapa.get(u) ?? 0) + 1);
      relacionadosPorTermo.set(t, mapa);
    }
    const todos = new Set<string>();
    for (const c of CAMPOS) sets[c].forEach((t) => todos.add(t));
    todos.forEach((t) => {
      const v = vocab.get(t);
      if (v) v.df++;
      else vocab.set(t, { df: 1, p: fonetica(t) });
    });
    if (doc.grupo.trim()) dfGrupo.set(doc.grupo.trim(), (dfGrupo.get(doc.grupo.trim()) ?? 0) + 1);
    indexados.push({ id: doc.id, sets, titleFlat: tokens.title.join(" "), grams: trigramas(tokens.title.join(" ")), grupo: doc.grupo.trim() });
  }

  const vocabLista = [...vocab.keys()];
  const idf = new Map<string, number>();
  vocabLista.forEach((t) => idf.set(t, Math.log(1 + indexados.length / (vocab.get(t)?.df ?? 1))));

  const sinonimos = { ...SINONIMOS_PADRAO, ...sinonimosExtras };
  // a chave passa pelo mesmo caminho da consulta (sem palavras de ligação), senão "tribunal de contas" nunca casa
  const chavesSin = Object.entries(sinonimos).map(([k, v]) => ({ key: palavras(k).map((w) => w.tok).join(" "), termos: palavras(v).map((w) => w.tok) }));

  // variações possíveis de uma palavra digitada: exata, prefixo, parte da palavra, erro de digitação, fonética
  function candidatos(q: string): { lista: Candidato[]; corr: string | null } {
    const vistos = new Map<string, number>();
    const L = q.length;
    const pq = fonetica(q);
    // número (ano, nº do documento) só casa exato ou por prefixo: "2026" nunca vira "2021"
    const max = /\d/.test(q) ? 0 : L <= 3 ? 0 : L <= 5 ? 1 : 2;
    const exata = vocab.has(q);
    let melhor: string | null = null;
    let melhorQual = 0;
    if (exata) vistos.set(q, 1);
    for (const t of vocabLista) {
      if (t === q) continue;
      const v = vocab.get(t)!;
      let qual = 0;
      let fuzzy = false;
      if (L >= 2 && t.indexOf(q) === 0) qual = L >= 3 ? 0.85 : 0.5;
      else if (L >= 4 && t.indexOf(q) > 0) qual = 0.55;
      if (!qual && L >= 3 && !/\d/.test(q) && pq === v.p) {
        qual = 0.8;
        fuzzy = true;
      }
      if (!qual && max) {
        const d = dist(q, t, max);
        if (d <= max) {
          qual = d === 1 ? 0.75 : 0.6;
          fuzzy = true;
        } else if (L >= 6 && dist(pq, v.p, 1) <= 1) {
          qual = 0.65;
          fuzzy = true;
        } else if (L >= 4 && t.length > L && dist(q, t.slice(0, L), 1) <= 1) {
          qual = 0.6;
          fuzzy = true;
        }
      }
      if (qual) {
        if ((vistos.get(t) ?? 0) < qual) vistos.set(t, qual);
        if (fuzzy && (qual > melhorQual || (qual === melhorQual && melhor !== null && v.df > (vocab.get(melhor)?.df ?? 0)))) {
          melhorQual = qual;
          melhor = t;
        }
      }
    }
    return {
      lista: [...vistos.entries()].map(([t, qual]) => ({ t, qual })),
      corr: !exata && melhor ? exibicao.get(melhor) ?? melhor : null,
    };
  }

  function termosSinonimos(qw: { tok: string }[], completo: string): string[] {
    const saida = new Set<string>();
    for (const s of chavesSin) {
      const k = s.key;
      const tol = k.length >= 7 ? 2 : 1;
      let acerto = false;
      if (completo === k) acerto = true;
      else if (k.length >= 4 && dist(completo, k, tol) <= tol) acerto = true;
      else if (!k.includes(" ") && qw.some((w) => w.tok === k || (k.length >= 4 && dist(w.tok, k, 1) <= 1))) acerto = true;
      if (acerto) s.termos.forEach((t) => saida.add(t));
    }
    return [...saida];
  }

  function pontuarToken(doc: DocIndexado, cands: Candidato[]): number {
    let soma = 0;
    let melhor = 0;
    for (const campo of CAMPOS) {
      let s = 0;
      for (const c of cands) if (doc.sets[campo].has(c.t)) s = Math.max(s, PESO[campo] * c.qual * (idf.get(c.t) ?? 1));
      soma += s;
      if (s > melhor) melhor = s;
    }
    return melhor + 0.25 * (soma - melhor);
  }

  // itens fora do resultado, mas do mesmo assunto (palavras raras do título dos primeiros resultados)
  function relacionadosDe(hits: { idx: number }[]): number[] {
    if (!hits.length) return [];
    const dentro = new Set(hits.map((h) => h.idx));
    const sementes = hits.slice(0, 3);
    const tTok = new Map<string, number>();
    for (const s of sementes) {
      indexados[s.idx].sets.title.forEach((t) => {
        if ((vocab.get(t)?.df ?? 0) <= indexados.length / 8) tTok.set(t, (tTok.get(t) ?? 0) + 1);
      });
    }
    const grupos = new Set(sementes.map((s) => indexados[s.idx].grupo));
    const saida: { id: number; score: number; idx: number }[] = [];
    indexados.forEach((doc, idx) => {
      if (dentro.has(idx)) return;
      let s = 0;
      tTok.forEach((_, t) => {
        if (doc.sets.title.has(t)) s += (0.6 * (idf.get(t) ?? 1)) / 2;
      });
      if (grupos.has(doc.grupo)) s += 0.8;
      if (s >= 1.8) saida.push({ id: doc.id, score: s, idx });
    });
    saida.sort((a, b) => b.score - a.score || a.idx - b.idx);
    return saida.slice(0, 6).map((o) => o.id);
  }

  function buscar(consulta: string): ResultadoBusca {
    const vazio: ResultadoBusca = { ids: [], relacionados: [], corrigido: null, parecidos: false, termos: [] };
    const qw = palavras(consulta);
    if (!qw.length || !indexados.length) return vazio;
    const completo = qw.map((w) => w.tok).join(" ");
    const corrigidas: string[] = [];
    let houveCorrecao = false;
    const qc = qw.map((w) => {
      const c = candidatos(w.tok);
      if (c.corr) {
        houveCorrecao = true;
        corrigidas.push(c.corr);
      } else corrigidas.push(w.raw);
      return c.lista;
    });
    const extras: Candidato[] = termosSinonimos(qw, completo).map((t) => ({ t, qual: 0.8 }));
    const rel = new Set<string>();
    for (const w of qw) {
      const r = relacionadosPorTermo.get(w.tok);
      if (!r) continue;
      [...r.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).forEach(([u]) => {
        if ((vocab.get(u)?.df ?? 0) <= indexados.length / 3) rel.add(u);
      });
    }
    const relCands: Candidato[] = [...rel].map((t) => ({ t, qual: 0.2 }));
    const qg = trigramas(completo);

    const pontuados = indexados.map((doc, idx) => {
      let main = 0;
      let hit = 0;
      for (const c of qc) {
        const s = pontuarToken(doc, c);
        if (s > 0) {
          main += s;
          hit++;
        }
      }
      const cov = hit / qw.length;
      let extra = 0;
      for (const c of extras) extra += pontuarToken(doc, [c]) * 0.8;
      for (const c of relCands) extra += pontuarToken(doc, [c]);
      let frase = 0;
      if (completo.length >= 3 && doc.titleFlat.includes(completo)) frase = doc.titleFlat.indexOf(completo) === 0 ? 6 : 4;
      let inter = 0;
      if (qg.n >= 3) qg.set.forEach((k) => { if (doc.grams.set.has(k)) inter++; });
      const triCov = qg.n >= 3 ? inter / qg.n : 0;
      const tri = triCov >= 0.5 ? 5 * triCov * triCov : 0;
      const total = main * (0.4 + 0.6 * cov) + extra + frase + tri;
      return { id: doc.id, score: total, triCov, idx };
    });
    pontuados.sort((a, b) => b.score - a.score || a.idx - b.idx);

    const topo = pontuados[0].score;
    let itens: typeof pontuados;
    let parecidos = false;
    if (topo > 0) {
      // pergunta com várias palavras exige mais do resultado (não basta casar só a palavra comum)
      const corte = Math.max(0.8, topo * (qw.length > 1 ? 0.3 : 0.18));
      itens = pontuados.filter((s) => s.score >= corte);
    } else {
      itens = pontuados
        .filter((s) => s.triCov >= 0.4 && qg.n >= 4)
        .sort((a, b) => b.triCov - a.triCov || a.idx - b.idx)
        .slice(0, 5);
      parecidos = itens.length > 0;
    }
    const termos = [...new Set([...qw.map((w) => norm(w.raw)), ...corrigidas.map(norm)])].filter((t) => t.length >= 2);
    return {
      ids: itens.map((s) => s.id),
      relacionados: parecidos ? [] : relacionadosDe(itens),
      corrigido: houveCorrecao && !(extras.length && qw.length > 1) ? corrigidas.join(" ") : null,
      parecidos,
      termos,
    };
  }

  // chips de busca sugerida: os grupos (colegiados, tipos…) e as palavras que mais separam os itens
  function sugestoes(max: number): string[] {
    const saida: string[] = [];
    const grupos = [...dfGrupo.entries()].sort((a, b) => b[1] - a[1]).map(([g]) => g);
    if (grupos.length > 1) for (const g of grupos.slice(0, 3)) saida.push(g.toLocaleLowerCase("pt-BR"));
    const total = indexados.length;
    const palavrasComuns = [...vocab.entries()]
      .filter(([t, v]) => v.df >= 2 && v.df < total && t.length >= 4 && !/\d/.test(t) && exibicao.has(t))
      .sort((a, b) => b[1].df - a[1].df)
      .map(([t]) => exibicao.get(t)!);
    for (const p of palavrasComuns) {
      if (saida.length >= max) break;
      if (!saida.some((s) => norm(s).includes(norm(p)))) saida.push(p);
    }
    return saida.slice(0, max);
  }

  return { buscar, sugestoes };
}
