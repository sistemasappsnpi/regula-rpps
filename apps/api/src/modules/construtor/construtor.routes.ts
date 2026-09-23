import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireTenant, type AuthenticatedRequest } from "../../middleware/auth";
import { requireFeature } from "../../middleware/features";
import { requireFreshPermissions } from "../../middleware/requireFreshPermissions";
import { HttpError } from "../../middleware/errorHandler";
import { prisma } from "../../db/prisma";
import { construtorRepository } from "./construtor.repository";
import {
  normalizarCompetencia,
  registrarInstanciaDeIndicadorGrupo,
  registrarValorDeIndicador,
} from "../portal-indicadores/portal-indicadores.service";

// Construtor de Documentos: o usuário escolhe um tipo de documento (configurado pelo Admin
// Global) e quantos documentos-fonte já enviados quiser (ver /uploads/construtor) e pede pra IA
// montar o documento final. Exclusivo do plano que inclui "construtor_documentos".
export const construtorRouter = Router();

// `citacoes` é guardado como JSON bruto no banco (TenantConstrutorExecucao.citacoes); a rota
// é quem decide o formato exposto ao cliente, mesmo padrão de getDocumentoComposto no módulo
// Pró-Gestão (ver pro-gestao.routes.ts).
function serializarExecucao<T extends { citacoes: string }>(execucao: T) {
  return { ...execucao, citacoes: JSON.parse(execucao.citacoes) };
}

// Publica uma sugestão aprovada/corrigida no Portal Previdenciário — ramifica pra
// registrarInstanciaDeIndicadorGrupo quando o indicador tem subcampos (valorFinal é um JSON
// {subcampoId: valor} nesse caso) ou pro fluxo escalar de sempre quando não tem.
async function publicarSugestao(
  sugestao: {
    indicadorId: string;
    documentoNomeOrigem: string;
    paginaOrigem: number | null;
    trechoOrigem: string | null;
    uploadId: string | null;
    indicador: { subcampos: { id: string }[] };
  },
  valorFinal: string,
  competenciaFinal: Date,
  tenantId: string,
  userId: string,
) {
  const origemDetalhe = `PDF "${sugestao.documentoNomeOrigem}"${
    sugestao.paginaOrigem ? `, pág. ${sugestao.paginaOrigem}` : ""
  }${sugestao.trechoOrigem ? `: "${sugestao.trechoOrigem}"` : ""}`;

  if (sugestao.indicador.subcampos.length > 0) {
    let subcampoValores: Record<string, string>;
    try {
      const parsed = JSON.parse(valorFinal);
      if (!parsed || typeof parsed !== "object") throw new Error("formato inválido");
      subcampoValores = parsed;
    } catch {
      throw new HttpError(400, "Valor inválido pra um campo com subcampos.");
    }
    await registrarInstanciaDeIndicadorGrupo({
      tenantId,
      indicadorDbId: sugestao.indicadorId,
      competencia: competenciaFinal,
      subcampoValores: Object.entries(subcampoValores).map(([subcampoId, valor]) => ({
        subcampoId,
        valor: String(valor),
        origemDetalhe,
      })),
      origem: "PDF_EXTRACTION",
      documentoUploadId: sugestao.uploadId,
      userId,
    });
    return;
  }

  await registrarValorDeIndicador({
    tenantId,
    indicadorDbId: sugestao.indicadorId,
    competencia: competenciaFinal,
    valor: valorFinal,
    origem: "PDF_EXTRACTION",
    origemDetalhe,
    documentoUploadId: sugestao.uploadId,
    userId,
  });
}

construtorRouter.use(requireAuth, requireTenant, requireFeature("construtor_documentos"));

construtorRouter.get("/tipos", async (req: AuthenticatedRequest, res, next) => {
  try {
    res.json({ tipos: await construtorRepository.listTiposAtivos(req.auth!.tenantId!, req.auth!.userId) });
  } catch (err) {
    next(err);
  }
});

const gerarSchema = z.object({
  tipoDocumentoId: z.string().min(1),
  documentoUploadIds: z.array(z.string().min(1)).min(1),
});

construtorRouter.post("/gerar", async (req: AuthenticatedRequest, res, next) => {
  try {
    const parsed = gerarSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Payload inválido.");

    const execucao = await construtorRepository.gerarExecucao({
      tenantId: req.auth!.tenantId!,
      userId: req.auth!.userId,
      tipoDocumentoId: parsed.data.tipoDocumentoId,
      documentoUploadIds: parsed.data.documentoUploadIds,
    });
    res.status(201).json(serializarExecucao(execucao));
  } catch (err) {
    next(err);
  }
});

construtorRouter.get("/execucoes", async (req: AuthenticatedRequest, res, next) => {
  try {
    const execucoes = await construtorRepository.listExecucoes(req.auth!.tenantId!);
    res.json({ execucoes: execucoes.map(serializarExecucao) });
  } catch (err) {
    next(err);
  }
});

construtorRouter.get("/execucoes/:id", async (req: AuthenticatedRequest, res, next) => {
  try {
    const execucao = await construtorRepository.getExecucao(req.auth!.tenantId!, req.params.id);
    res.json(serializarExecucao(execucao));
  } catch (err) {
    next(err);
  }
});

construtorRouter.post("/execucoes/:id/aprovar", async (req: AuthenticatedRequest, res, next) => {
  try {
    const execucao = await construtorRepository.aprovarExecucao(req.auth!.tenantId!, req.params.id, req.auth!.userId);
    res.json(serializarExecucao(execucao));
  } catch (err) {
    next(err);
  }
});

// Aprova em lote todas as sugestões PENDENTES de uma execução, sem edição individual — a pedido
// explícito do usuário, apesar do requisito padrão de revisão item a item (ver comentário acima
// de /indicador-sugestoes/:id). Cada uma publica no Portal Previdenciário exatamente como o
// aprovar individual faria, só que em sequência pra todas de uma vez.
construtorRouter.post("/execucoes/:id/aprovar-todos-indicadores", async (req: AuthenticatedRequest, res, next) => {
  try {
    const execucao = await prisma.tenantConstrutorExecucao.findUnique({
      where: { id: req.params.id },
      include: { indicadorSugestoes: { include: { indicador: { include: { subcampos: true } } } } },
    });
    if (!execucao || execucao.tenantId !== req.auth!.tenantId!) {
      throw new HttpError(404, "Execução não encontrada.");
    }

    // Sugestões "não encontrado" (encontrado=false, checklist) nascem com valorSugerido vazio —
    // aprovar em lote nunca publica um campo vazio; só quando alguém preencheu manualmente antes.
    const pendentes = execucao.indicadorSugestoes.filter((s) => s.status === "PENDENTE" && s.valorSugerido.trim() !== "");
    for (const sugestao of pendentes) {
      await prisma.construtorIndicadorSugestao.update({
        where: { id: sugestao.id },
        data: { status: "APROVADA", valorFinal: sugestao.valorSugerido },
      });
      await publicarSugestao(sugestao, sugestao.valorSugerido, sugestao.competencia, req.auth!.tenantId!, req.auth!.userId);
    }

    res.json(serializarExecucao(await construtorRepository.getExecucao(req.auth!.tenantId!, execucao.id)));
  } catch (err) {
    next(err);
  }
});

// Exclui uma execução (ex.: rascunho de teste, ou uma extração que deu errado e foi aprovada
// mesmo incompleta) — apaga a execução, suas sugestões, E desfaz o que ela publicou no Portal
// Previdenciário (ver construtorRepository.excluirExecucao).
construtorRouter.delete("/execucoes/:id", requireFreshPermissions(), async (req: AuthenticatedRequest, res, next) => {
  try {
    await construtorRepository.excluirExecucao(req.auth!.tenantId!, req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

const novaSugestaoSchema = z.object({
  indicadorId: z.string().min(1),
  competencia: z.string().min(1),
});

// Cria manualmente uma sugestão em branco pra um indicador com subcampos — usado quando a IA
// achou menos ocorrências do que realmente existem no documento (ex.: faltou um membro de comitê).
construtorRouter.post("/execucoes/:id/indicador-sugestoes", async (req: AuthenticatedRequest, res, next) => {
  try {
    const parsed = novaSugestaoSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, "Payload inválido.");
    const competencia = normalizarCompetencia(parsed.data.competencia);
    const sugestao = await construtorRepository.criarSugestaoVazia(
      req.auth!.tenantId!,
      req.params.id,
      parsed.data.indicadorId,
      competencia,
    );
    res.status(201).json(sugestao);
  } catch (err) {
    next(err);
  }
});

const indicadorSugestaoSchema = z.object({
  status: z.enum(["APROVADA", "REJEITADA", "CORRIGIDA"]),
  valorFinal: z.string().optional(),
  competenciaFinal: z.string().optional(),
});

// Cada sugestão de indicador é aprovada/corrigida/rejeitada individualmente — mesmo requisito de
// "nunca um botão único de aprovar tudo" já aplicado em /uploads/sugestoes/:sugestaoId.
construtorRouter.patch("/indicador-sugestoes/:id", async (req: AuthenticatedRequest, res, next) => {
  try {
    const parsed = indicadorSugestaoSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, "Payload inválido.");

    const sugestao = await prisma.construtorIndicadorSugestao.findUnique({
      where: { id: req.params.id },
      include: { execucao: true, indicador: { include: { subcampos: true } } },
    });
    if (!sugestao || sugestao.execucao.tenantId !== req.auth!.tenantId!) {
      throw new HttpError(404, "Sugestão não encontrada.");
    }

    const valorFinal = parsed.data.valorFinal ?? sugestao.valorSugerido;
    const competenciaFinal = parsed.data.competenciaFinal
      ? normalizarCompetencia(parsed.data.competenciaFinal)
      : sugestao.competencia;

    if ((parsed.data.status === "APROVADA" || parsed.data.status === "CORRIGIDA") && !valorFinal.trim()) {
      throw new HttpError(400, "Preencha um valor antes de aprovar este campo.");
    }

    const atualizada = await prisma.construtorIndicadorSugestao.update({
      where: { id: sugestao.id },
      data: { status: parsed.data.status, valorFinal, competencia: competenciaFinal },
    });

    if (parsed.data.status === "APROVADA" || parsed.data.status === "CORRIGIDA") {
      await publicarSugestao(sugestao, valorFinal, competenciaFinal, req.auth!.tenantId!, req.auth!.userId);
    }

    res.json(atualizada);
  } catch (err) {
    next(err);
  }
});
