import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireTenant, type AuthenticatedRequest } from "../../middleware/auth";
import { requireFeature } from "../../middleware/features";
import { HttpError } from "../../middleware/errorHandler";
import { proGestaoRepository } from "./pro-gestao.repository";
import { aprovarRascunho, calcularProntidaoDeFontes, gerarRascunho, registrarValorDeCampo } from "./pro-gestao.service";

export const proGestaoRouter = Router();
proGestaoRouter.use(requireAuth, requireTenant, requireFeature("pro_gestao"));

// O motor de dependências (rascunho/prontidão de documento composto) é uma feature à parte,
// só incluída em planos mais completos — ver knowledge-base/pro-gestao-acoes.json e
// /admin/parametrizacoes para a matriz atual.
const requireDependencias = requireFeature("pro_gestao_dependencias");

proGestaoRouter.get("/", async (req: AuthenticatedRequest, res, next) => {
  try {
    const tenantId = req.auth!.tenantId!;
    const [acoes, statuses] = await Promise.all([
      proGestaoRepository.listAcoes(),
      proGestaoRepository.tenantAcaoStatuses(tenantId),
    ]);
    const statusByAcao = new Map(statuses.map((s) => [s.acaoCodigo, s]));

    const acoesComValores = await Promise.all(
      acoes.map(async (acao) => {
        const valores = await proGestaoRepository.currentValues(
          tenantId,
          acao.campos.map((c) => c.id),
        );
        const valorPorCampo = new Map(valores.map((v) => [v.campoId, v]));

        return {
          ...acao,
          nivelAtual: statusByAcao.get(acao.codigo)?.nivelAtual ?? null,
          campos: acao.campos.map((campo) => ({
            ...campo,
            valorAtual: valorPorCampo.get(campo.id) ?? null,
          })),
          dependeDe: acao.dependeDe.map((d) => ({
            fonteCodigo: d.fonteCodigo,
            fonteNome: d.fonte.nome,
            tipoRelacao: d.tipoRelacao,
          })),
        };
      }),
    );

    res.json({ acoes: acoesComValores });
  } catch (err) {
    next(err);
  }
});

proGestaoRouter.get("/resumo", async (req: AuthenticatedRequest, res, next) => {
  try {
    const tenantId = req.auth!.tenantId!;
    const [acoes, statuses] = await Promise.all([
      proGestaoRepository.listAcoes(),
      proGestaoRepository.tenantAcaoStatuses(tenantId),
    ]);
    const statusByAcao = new Map(statuses.map((s) => [s.acaoCodigo, s]));
    const NIVEL_VALOR: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4 };

    const dimensoes = ["Controles Internos", "Governança Corporativa", "Educação Previdenciária"] as const;
    const porDimensao = dimensoes.map((dimensao) => {
      const dasDimensao = acoes.filter((a) => a.dimensao === dimensao);
      const comNivel = dasDimensao.filter((a) => statusByAcao.get(a.codigo)?.nivelAtual);
      return {
        dimensao,
        totalAcoes: dasDimensao.length,
        acoesComNivelAlcancado: comNivel.length,
      };
    });

    // Nível de certificação geral = nível mais simples entre os já alcançados (regra do Manual,
    // ver _meta.regras_de_certificacao em pro-gestao-acoes.json) — aqui, versão simplificada:
    // conta quantas ações têm nível >= cada patamar, para mostrar "quantas faltam para o próximo nível".
    const contagemPorNivel = { I: 0, II: 0, III: 0, IV: 0 };
    for (const acao of acoes) {
      const nivel = statusByAcao.get(acao.codigo)?.nivelAtual;
      if (!nivel) continue;
      for (const n of Object.keys(contagemPorNivel) as (keyof typeof contagemPorNivel)[]) {
        if (NIVEL_VALOR[nivel] >= NIVEL_VALOR[n]) contagemPorNivel[n]++;
      }
    }

    const METAS = { I: 18, II: 20, III: 22, IV: 24 };
    const faltamPorNivel = Object.fromEntries(
      Object.entries(METAS).map(([nivel, meta]) => [nivel, Math.max(0, meta - contagemPorNivel[nivel as keyof typeof contagemPorNivel])]),
    );

    res.json({ porDimensao, contagemPorNivel, metas: METAS, faltamPorNivel });
  } catch (err) {
    next(err);
  }
});

const nivelSchema = z.object({ nivel: z.enum(["I", "II", "III", "IV"]).nullable() });

proGestaoRouter.patch("/:acaoCodigo/nivel", async (req: AuthenticatedRequest, res, next) => {
  try {
    const parsed = nivelSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, "Payload inválido.");

    const updated = await proGestaoRepository.setNivelAtual(req.auth!.tenantId!, req.params.acaoCodigo, parsed.data.nivel);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

const campoValorSchema = z.object({ valor: z.string().min(1, "Valor não pode ser vazio.") });

proGestaoRouter.put("/campos/:campoDbId/valor", async (req: AuthenticatedRequest, res, next) => {
  try {
    const parsed = campoValorSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, "Payload inválido.");

    const created = await registrarValorDeCampo({
      tenantId: req.auth!.tenantId!,
      campoDbId: req.params.campoDbId,
      valor: parsed.data.valor,
      origem: "MANUAL",
      userId: req.auth!.userId,
    });
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

proGestaoRouter.get("/campos/:campoDbId/historico", async (req: AuthenticatedRequest, res, next) => {
  try {
    const historico = await proGestaoRepository.history(req.auth!.tenantId!, req.params.campoDbId);
    res.json({ historico });
  } catch (err) {
    next(err);
  }
});

proGestaoRouter.get("/:acaoCodigo/prontidao", requireDependencias, async (req: AuthenticatedRequest, res, next) => {
  try {
    const prontidao = await calcularProntidaoDeFontes(req.auth!.tenantId!, req.params.acaoCodigo);
    res.json({ prontidao });
  } catch (err) {
    next(err);
  }
});

proGestaoRouter.get("/:acaoCodigo/composto", requireDependencias, async (req: AuthenticatedRequest, res, next) => {
  try {
    const composto = await proGestaoRepository.getDocumentoComposto(req.auth!.tenantId!, req.params.acaoCodigo);
    res.json({ composto: composto ? { ...composto, conteudo: JSON.parse(composto.conteudo) } : null });
  } catch (err) {
    next(err);
  }
});

proGestaoRouter.post("/:acaoCodigo/rascunho", requireDependencias, async (req: AuthenticatedRequest, res, next) => {
  try {
    const resultado = await gerarRascunho(req.auth!.tenantId!, req.params.acaoCodigo, req.auth!.userId);
    res.status(201).json(resultado);
  } catch (err) {
    next(err);
  }
});

proGestaoRouter.post("/:acaoCodigo/rascunho/aprovar", requireDependencias, async (req: AuthenticatedRequest, res, next) => {
  try {
    const aprovado = await aprovarRascunho(req.auth!.tenantId!, req.params.acaoCodigo, req.auth!.userId);
    res.json(aprovado);
  } catch (err) {
    next(err);
  }
});

proGestaoRouter.get("/auditoria", requireFeature("auditoria"), async (req: AuthenticatedRequest, res, next) => {
  try {
    const auditoria = await proGestaoRepository.listAuditoria(req.auth!.tenantId!);
    res.json(auditoria);
  } catch (err) {
    next(err);
  }
});
