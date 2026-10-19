import { prisma } from "../../db/prisma";
import { HttpError } from "../../middleware/errorHandler";
import { baixarArquivosPendentes } from "./arquivos";
import { CATALOGO_TRANSPARENCIA_API, NEXA_BASE_URL, type EndpointTransparenciaApi } from "./catalogo";
import { urlPortalBase } from "./fontes";
import { coletarPortal } from "./portal-dados-abertos";
import { sincronizarRegistros, type ResultadoColeta } from "./sincronizar";

export type { ResultadoColeta } from "./sincronizar";

// Duas fontes de dados por cliente, e o cliente pode ter uma ou as duas:
//  1) API Nexa de Transparência (manual, com chave por órgão) — Tenant.transparenciaApiChave;
//  2) dados abertos do portal de transparência do órgão (sem chave) — derivado de Tenant.portalMenuApiUrl.

async function buscarLista(chave: string, ep: EndpointTransparenciaApi): Promise<Record<string, unknown>[]> {
  const url = `${NEXA_BASE_URL}/${ep.caminho}?chave=${encodeURIComponent(chave)}`;
  const resp = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  // nunca coloca a URL (que leva a chave) na mensagem de erro
  if (!resp.ok) throw new Error(`a API respondeu HTTP ${resp.status}`);
  const corpo = (await resp.json()) as unknown;
  if (!Array.isArray(corpo)) throw new Error("resposta fora do formato esperado (não é uma lista)");
  return corpo.filter((i): i is Record<string, unknown> => Boolean(i) && typeof i === "object");
}

export async function coletarEndpoint(tenantId: string, chave: string, ep: EndpointTransparenciaApi): Promise<ResultadoColeta> {
  try {
    const itens = await buscarLista(chave, ep);
    // a Nexa devolve sempre a lista inteira: pode marcar o que sumiu (a função ignora lista vazia)
    const r = await sincronizarRegistros(tenantId, ep.codigo, itens, true);
    return { codigo: ep.codigo, ok: true, ...r };
  } catch (err) {
    return { codigo: ep.codigo, ok: false, erro: err instanceof Error ? err.message : "erro desconhecido" };
  }
}

const INTERVALO_COLETA_MS = 10 * 60_000;
let coletaEmAndamento = false;

// Coleta automática: a cada 10 min, para todo RPPS que tem alguma fonte (chave da Nexa ou portal de
// transparência). Roda dentro do próprio processo da API (um container só), por isso o trava-repetição: se
// uma rodada demorar mais que o intervalo, a seguinte espera em vez de empilhar.
export function iniciarColetaAgendada(): void {
  const rodar = async () => {
    if (coletaEmAndamento) return;
    coletaEmAndamento = true;
    try {
      const tenants = await prisma.tenant.findMany({
        where: { OR: [{ transparenciaApiChave: { not: null } }, { portalMenuApiUrl: { contains: "dadosabertosexportar" } }] },
        select: { id: true, slug: true },
      });
      // FASE 1 — dados de todos os clientes (rápido). Os PDFs vêm só depois, para que um cliente com milhares de
      // arquivos para baixar nunca atrase a coleta dos dados dos outros.
      for (const t of tenants) {
        try {
          const resultados = await coletarTudo(t.id);
          const falhas = resultados.filter((r) => !r.ok);
          const novos = resultados.reduce((s, r) => s + (r.novos ?? 0), 0);
          console.log(`[transparencia-api] ${t.slug}: ${resultados.length - falhas.length}/${resultados.length} conjuntos, ${novos} novos`);
          for (const f of falhas.slice(0, 10)) console.log(`[transparencia-api]   ${f.codigo}: ${f.erro}`);
        } catch (err) {
          // um cliente com problema não pode impedir a coleta dos outros
          console.error(`[transparencia-api] ${t.slug}: coleta falhou:`, err instanceof Error ? err.message : err);
        }
      }
      // FASE 2 — PDFs/anexos: baixa o que falta, aos poucos (a primeira carga leva várias rodadas), dividindo o
      // tempo entre os clientes.
      for (const t of tenants) {
        try {
          const arq = await baixarArquivosPendentes(t.id, 3 * 60_000);
          console.log(`[transparencia-api] ${t.slug}: ${arq.baixados} arquivos baixados, ${arq.falhas.length} com problema`);
          for (const f of arq.falhas.slice(0, 15)) console.log(`[transparencia-api]   ${f}`);
        } catch (err) {
          console.error(`[transparencia-api] ${t.slug}: download de arquivos falhou:`, err instanceof Error ? err.message : err);
        }
      }
    } catch (err) {
      console.error("[transparencia-api] coleta agendada falhou:", err instanceof Error ? err.message : err);
    } finally {
      coletaEmAndamento = false;
    }
  };
  // primeira rodada 1 min depois de subir (deixa a API estabilizar e não atrasa o start)
  setTimeout(rodar, 60_000).unref();
  setInterval(rodar, INTERVALO_COLETA_MS).unref();
}

// Um conjunto por vez (mesma lição do pool de conexões em portal-previdenciario.routes.ts).
export async function coletarTudo(tenantId: string): Promise<ResultadoColeta[]> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { transparenciaApiChave: true, portalMenuApiUrl: true } });
  if (!tenant) throw new HttpError(404, "RPPS não encontrado.");
  const base = urlPortalBase(tenant.portalMenuApiUrl);
  if (!tenant.transparenciaApiChave && !base) {
    throw new HttpError(400, "Este RPPS não tem fonte de dados: cadastre a chave da API Nexa ou a URL da API do menu do portal de transparência.");
  }

  const resultados: ResultadoColeta[] = [];
  if (tenant.transparenciaApiChave) {
    for (const ep of CATALOGO_TRANSPARENCIA_API) {
      resultados.push(await coletarEndpoint(tenantId, tenant.transparenciaApiChave, ep));
    }
  }
  if (base) resultados.push(...(await coletarPortal(tenantId, base)));
  return resultados;
}
