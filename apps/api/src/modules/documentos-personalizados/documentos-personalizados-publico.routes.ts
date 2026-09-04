import { Router } from "express";
import { prisma } from "../../db/prisma";
import { HttpError } from "../../middleware/errorHandler";
import { montarMenuPublico } from "../transparencia/menu";

// Rota pública (sem requireAuth): página padrão com os dados estruturados que o tenant
// publicou pra um documento personalizado — nunca expõe rascunho, só a publicação vigente.
// Mesmo menu e rodapé do resto do portal (ver montarMenuPublico) pra dar sensação de um único
// portal, não uma página solta.
export const documentosPersonalizadosPublicoRouter = Router();

documentosPersonalizadosPublicoRouter.get("/:tenantSlug/:documentoCodigo", async (req, res, next) => {
  try {
    const tenant = await prisma.tenant.findUnique({ where: { slug: req.params.tenantSlug } });
    if (!tenant) throw new HttpError(404, "RPPS não encontrado.");

    const documento = await prisma.documentoPersonalizado.findUnique({ where: { codigo: req.params.documentoCodigo } });
    if (!documento) throw new HttpError(404, "Documento não encontrado.");

    const publicacao = await prisma.tenantDocumentoPersonalizadoPublicacao.findUnique({
      where: { tenantId_documentoId: { tenantId: tenant.id, documentoId: documento.id } },
    });
    if (!publicacao || publicacao.status !== "APROVADO") {
      throw new HttpError(404, "Este documento ainda não foi publicado por este RPPS.");
    }

    res.json({
      tenant: {
        name: tenant.name,
        federatedEntity: tenant.federatedEntity,
        cnpj: tenant.cnpj,
        site: tenant.site,
        enderecoPublico: tenant.enderecoPublico,
        telefonePublico: tenant.telefonePublico,
        emailPublico: tenant.emailPublico,
      },
      documento: { nome: documento.nome, descricao: documento.descricao },
      publicadoEm: publicacao.aprovadoEm,
      itens: JSON.parse(publicacao.conteudo) as { campoId: string; descricao: string; valor: string }[],
      menu: await montarMenuPublico(tenant.id, tenant.slug),
    });
  } catch (err) {
    next(err);
  }
});
