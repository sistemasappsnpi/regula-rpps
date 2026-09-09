import { Router } from "express";
import { prisma } from "../../db/prisma";
import { HttpError } from "../../middleware/errorHandler";

// Rota pública (sem requireAuth), mesmo padrão de /public/transparencia: o Portal
// Previdenciário deste RPPS é público por definição. Diferente da Transparência, aqui não há
// feature nem dado próprio do Regula RPPS — o menu e o rodapé vêm ao vivo das APIs externas que
// o Admin Global configurou para este cliente (Tenant.portalMenuApiUrl / portalRodapeApiUrl),
// no mesmo formato do endpoint "dadosabertosexportar" usado como referência (modelo IPRES).
export const portalPrevidenciarioPublicRouter = Router();

interface MenuBruto {
  Id: string;
  NMenu: string | null;
  Nome: string;
  Pagina: string | null;
  NovaPag: string | null;
  Ordem: string | null;
}

export interface PortalPrevidenciarioMenuItem {
  id: string;
  nome: string;
  pagina: string;
  novaPag: string;
  itens: PortalPrevidenciarioMenuItem[];
}

// Espelha buildMenuTree do modelo de referência: cada item aponta pro pai via NMenu (null = raiz),
// ordenado por Ordem em cada nível.
function montarArvoreMenu(bruto: MenuBruto[]): PortalPrevidenciarioMenuItem[] {
  const porId = new Map<string, PortalPrevidenciarioMenuItem>();
  const ordemPorId = new Map<string, number>();

  for (const item of bruto) {
    porId.set(item.Id, {
      id: item.Id,
      nome: item.Nome,
      pagina: item.Pagina || "#",
      novaPag: item.NovaPag || "",
      itens: [],
    });
    ordemPorId.set(item.Id, Number(item.Ordem) || 0);
  }

  const raizes: PortalPrevidenciarioMenuItem[] = [];
  for (const bruto0 of bruto) {
    const item = porId.get(bruto0.Id)!;
    if (bruto0.NMenu && porId.has(bruto0.NMenu)) {
      porId.get(bruto0.NMenu)!.itens.push(item);
    } else if (!bruto0.NMenu) {
      raizes.push(item);
    }
  }

  const porOrdem = (a: PortalPrevidenciarioMenuItem, b: PortalPrevidenciarioMenuItem) =>
    (ordemPorId.get(a.id) ?? 0) - (ordemPorId.get(b.id) ?? 0);
  raizes.sort(porOrdem);
  raizes.forEach((r) => r.itens.sort(porOrdem));

  return raizes;
}

async function buscarJson(url: string): Promise<unknown | null> {
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

export interface PortalPrevidenciarioRodape {
  cnpj: string | null;
  telefone: string | null;
  email: string | null;
  rua: string | null;
  numero: string | null;
  bairro: string | null;
  cep: string | null;
  horario: string | null;
  facebook: string | null;
  twitter: string | null;
  instagram: string | null;
  youtube: string | null;
  whatsapp: string | null;
  prefeito: string | null;
}

function mapearRodape(bruto: unknown): PortalPrevidenciarioRodape | null {
  const item = Array.isArray(bruto) ? bruto[0] : null;
  if (!item || typeof item !== "object") return null;
  const r = item as Record<string, unknown>;
  const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
  return {
    cnpj: texto(r.CNPJ),
    telefone: texto(r.Telefone),
    email: texto(r.Email),
    rua: texto(r.Rua),
    numero: texto(r.Numero),
    bairro: texto(r.Bairro),
    cep: texto(r.Cep),
    horario: texto(r.Horario),
    facebook: texto(r.Facebook),
    twitter: texto(r.Twitter),
    instagram: texto(r.Instagram),
    youtube: texto(r.Youtube),
    whatsapp: texto(r.Whatsapp),
    prefeito: texto(r.Prefeito),
  };
}

portalPrevidenciarioPublicRouter.get("/:slug", async (req, res, next) => {
  try {
    const tenant = await prisma.tenant.findUnique({ where: { slug: req.params.slug } });
    if (!tenant) throw new HttpError(404, "RPPS não encontrado.");

    if (!tenant.portalMenuApiUrl && !tenant.portalRodapeApiUrl) {
      res.status(404).json({ error: "Portal Previdenciário ainda não configurado para este RPPS." });
      return;
    }

    const [menuBruto, rodapeBruto] = await Promise.all([
      tenant.portalMenuApiUrl ? buscarJson(tenant.portalMenuApiUrl) : Promise.resolve(null),
      tenant.portalRodapeApiUrl ? buscarJson(tenant.portalRodapeApiUrl) : Promise.resolve(null),
    ]);

    const menu = Array.isArray(menuBruto) ? montarArvoreMenu(menuBruto as MenuBruto[]) : null;
    const rodape = mapearRodape(rodapeBruto);

    res.json({
      tenant: {
        name: tenant.name,
        federatedEntity: tenant.federatedEntity,
        slug: tenant.slug,
        logoUrl: tenant.logoUrl,
        corPrimaria: tenant.portalCorPrimaria,
      },
      menu,
      menuConfigurado: Boolean(tenant.portalMenuApiUrl),
      rodape,
      rodapeConfigurado: Boolean(tenant.portalRodapeApiUrl),
      sincronizadoEm: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

// Conteúdo central (relatório/filtro/gráfico): valores já lançados (manual ou aprovados via
// Construtor de Documentos) dos indicadores do catálogo — ver PortalDocumento/PortalIndicador/
// TenantPortalIndicadorValor. Público, sem feature flag, mesmo padrão do endpoint de menu/rodapé
// acima (decisão deliberada de manter simples).
portalPrevidenciarioPublicRouter.get("/:slug/indicadores", async (req, res, next) => {
  try {
    const tenant = await prisma.tenant.findUnique({ where: { slug: req.params.slug } });
    if (!tenant) throw new HttpError(404, "RPPS não encontrado.");

    const documentos = await prisma.portalDocumento.findMany({
      where: { ativo: true },
      orderBy: { sortOrder: "asc" },
      include: { indicadores: { orderBy: { sortOrder: "asc" } } },
    });

    const todosIndicadorIds = documentos.flatMap((d) => d.indicadores.map((i) => i.id));
    const valores = todosIndicadorIds.length
      ? await prisma.tenantPortalIndicadorValor.findMany({
          where: { tenantId: tenant.id, indicadorId: { in: todosIndicadorIds } },
          orderBy: { createdAt: "desc" },
        })
      : [];

    // Vigente por (indicadorId, competência) = linha mais recente — mesmo dedup do módulo de
    // lançamento manual (ver portal-indicadores.repository.ts).
    const seen = new Set<string>();
    const vigentes: typeof valores = [];
    for (const v of valores) {
      const key = `${v.indicadorId}|${v.competencia.toISOString()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      vigentes.push(v);
    }

    const documentosComValores = documentos
      .map((doc) => ({
        id: doc.id,
        nome: doc.nome,
        indicadores: doc.indicadores.map((indicador) => ({
          id: indicador.id,
          nome: indicador.nome,
          tipo: indicador.tipo,
          unidade: indicador.unidade,
          valores: vigentes
            .filter((v) => v.indicadorId === indicador.id)
            .sort((a, b) => a.competencia.getTime() - b.competencia.getTime())
            .map((v) => ({ competencia: v.competencia, valor: v.valor, origem: v.origem })),
        })),
      }))
      .filter((doc) => doc.indicadores.some((i) => i.valores.length > 0));

    res.json({ documentos: documentosComValores });
  } catch (err) {
    next(err);
  }
});
