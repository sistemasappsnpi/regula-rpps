import { Router } from "express";
import { prisma } from "../../db/prisma";
import { HttpError } from "../../middleware/errorHandler";
import { isFeatureEnabledForTenant } from "../../middleware/features";
import { montarMenuPublico } from "./menu";

// Rota pública (sem requireAuth): a transparência ativa é, por definição, pública.
// Nunca expõe rascunho — só o documento composto com status APROVADO. Mesmo sendo pública,
// ainda respeita o permissionamento deste RPPS (plano + eventual override individual — ver
// isFeatureEnabledForTenant): só existe se "transparencia_publica" estiver habilitada pra ele.
export const transparenciaPublicRouter = Router();

transparenciaPublicRouter.get("/:slug", async (req, res, next) => {
  try {
    const tenant = await prisma.tenant.findUnique({ where: { slug: req.params.slug } });
    if (!tenant) throw new HttpError(404, "RPPS não encontrado.");

    const featureHabilitada = await isFeatureEnabledForTenant(tenant.id, "transparencia_publica");
    if (!featureHabilitada) {
      res.status(404).json({ error: "Página de transparência ainda não publicada para este RPPS." });
      return;
    }

    const composto = await prisma.tenantDocumentoComposto.findUnique({
      where: { tenantId_acaoCodigo: { tenantId: tenant.id, acaoCodigo: "transparencia" } },
    });

    if (!composto || composto.status !== "APROVADO") {
      res.status(404).json({ error: "Página de transparência ainda não publicada para este RPPS." });
      return;
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
      publicadoEm: composto.aprovadoEm,
      itens: JSON.parse(composto.conteudo),
      menu: await montarMenuPublico(tenant.id, tenant.slug),
    });
  } catch (err) {
    next(err);
  }
});
