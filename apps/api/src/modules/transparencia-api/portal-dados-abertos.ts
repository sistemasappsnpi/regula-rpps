import { prisma } from "../../db/prisma";
import { sincronizarRegistros, type ResultadoColeta } from "./sincronizar";

// Coleta dos dados abertos do portal de transparência do órgão: <origem>/dadosabertosexportar?d=<conjunto>&a=<ano>&f=json
// Público, sem chave (a página /dadosabertos do próprio portal documenta os conjuntos e libera o uso).
//
// Limites observados na prática:
//  - uma chamada devolve no máximo ~200 registros (acima de ~250 volta vazio) e não existe parâmetro de página;
//  - o parâmetro `a` filtra pelo exercício (ano), e é assim que se alcança o que passa de 200.

export interface DatasetPortal {
  endpoint: string; // código gravado em TransparenciaApiRegistro.endpoint
  d: string; // nome do conjunto na API do portal
}

export const DATASETS_PORTAL: DatasetPortal[] = [
  { endpoint: "portal-publicacoes", d: "publicacoes" },
  { endpoint: "portal-licitacoes", d: "licitacoes" },
  { endpoint: "portal-contratos", d: "contratos" },
  { endpoint: "portal-leis", d: "leis" },
  { endpoint: "portal-portarias", d: "portarias" },
  { endpoint: "portal-lrf", d: "LRF" },
  { endpoint: "portal-noticias", d: "noticias" },
  { endpoint: "portal-conselhos", d: "conselhos" },
  { endpoint: "portal-secretarias", d: "secretarias" },
  { endpoint: "portal-concursos", d: "concursopublico" },
  { endpoint: "portal-processos-seletivos", d: "processoseletivo" },
  { endpoint: "portal-servicos-online", d: "servicosonline" },
  { endpoint: "portal-selos", d: "selos" },
];

const POR_CHAMADA = 200;
// perto do teto: pode haver mais registros do que a chamada devolveu
const LIMIAR_TETO = 190;
const ANO_INICIAL = 2000;
const VARREDURA_COMPLETA_A_CADA_MS = 24 * 60 * 60_000;

const ultimaVarredura = new Map<string, number>(); // `${tenantId}|${endpoint}` -> quando foi a última varredura por exercício

function esperar(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function buscarConjunto(base: string, d: string, ano: string): Promise<Record<string, unknown>[]> {
  const url = `${base}/dadosabertosexportar?d=${encodeURIComponent(d)}&a=${encodeURIComponent(ano)}&f=json&itens_por_pagina=${POR_CHAMADA}`;
  const resp = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!resp.ok) throw new Error(`o portal respondeu HTTP ${resp.status}`);
  const texto = (await resp.text()).trim();
  // conjunto sem dados (ou exercício sem registro) volta vazio ou com um aviso em HTML — não é erro
  if (!texto.startsWith("[")) return [];
  const corpo = JSON.parse(texto) as unknown;
  if (!Array.isArray(corpo)) return [];
  return corpo.filter((i): i is Record<string, unknown> => Boolean(i) && typeof i === "object" && !Array.isArray(i));
}

async function coletarConjunto(tenantId: string, base: string, ds: DatasetPortal): Promise<ResultadoColeta> {
  try {
    const recentes = await buscarConjunto(base, ds.d, "");
    let itens = recentes;
    let completo = recentes.length < LIMIAR_TETO; // veio tudo numa chamada só

    if (!completo) {
      const chave = `${tenantId}|${ds.endpoint}`;
      const jaTem = await prisma.transparenciaApiRegistro.count({ where: { tenantId, endpoint: ds.endpoint } });
      const vencida = Date.now() - (ultimaVarredura.get(chave) ?? 0) > VARREDURA_COMPLETA_A_CADA_MS;
      if (jaTem === 0 || vencida) {
        // varredura por exercício: junta tudo o que o conjunto tem
        const mapa = new Map<string, Record<string, unknown>>();
        let anoEstourou = false;
        const anoFinal = new Date().getFullYear() + 1;
        for (let ano = anoFinal; ano >= ANO_INICIAL; ano--) {
          const doAno = await buscarConjunto(base, ds.d, String(ano));
          if (doAno.length >= LIMIAR_TETO) anoEstourou = true;
          for (const r of doAno) mapa.set(JSON.stringify(r), r);
          await esperar(150);
        }
        for (const r of recentes) mapa.set(JSON.stringify(r), r);
        itens = [...mapa.values()];
        // só vale como "completa" se nenhum exercício bateu no teto (aí não dá pra saber se faltou algo)
        completo = !anoEstourou;
        ultimaVarredura.set(chave, Date.now());
        if (anoEstourou) console.warn(`[transparencia-api] ${ds.d}: algum exercício passou de ${LIMIAR_TETO} registros; lista pode estar incompleta`);
      }
    }

    const r = await sincronizarRegistros(tenantId, ds.endpoint, itens, completo);
    return { codigo: ds.endpoint, ok: true, ...r };
  } catch (err) {
    return { codigo: ds.endpoint, ok: false, erro: err instanceof Error ? err.message : "erro desconhecido" };
  }
}

// Um conjunto por vez, com um respiro entre eles (o portal é de um órgão pequeno, não de um provedor de nuvem).
export async function coletarPortal(tenantId: string, base: string): Promise<ResultadoColeta[]> {
  const resultados: ResultadoColeta[] = [];
  for (const ds of DATASETS_PORTAL) {
    resultados.push(await coletarConjunto(tenantId, base, ds));
    await esperar(200);
  }
  return resultados;
}
