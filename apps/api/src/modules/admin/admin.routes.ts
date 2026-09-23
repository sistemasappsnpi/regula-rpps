import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { requireAuth, requireSuperAdmin } from "../../middleware/auth";
import { requireAdminFeature } from "../../middleware/features";
import { HttpError } from "../../middleware/errorHandler";
import { adminRepository } from "./admin.repository";
import { extrairTextoPorPagina } from "../uploads/pdf-extraction";
import { isAiConfigured, sugerirChecklistDePdf } from "../ai/anthropic.client";

// PDF de exemplo pro checklist (ver rota /campos/sugerir-de-pdf abaixo): nunca precisa ficar
// salvo em disco nem virar um DocumentoUpload — é só texto extraído na hora e descartado depois,
// então memória basta (evita o problema de escopo por tenant que o multer de /uploads tem, já
// que rotas do Admin Global não têm tenantId nenhum).
const uploadChecklistPdf = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// Todo o módulo é restrito ao Super Admin da plataforma — nunca escopado a um tenantId
// (ver /docs/modelo-de-dados.md e ROADMAP #7). Dentro disso, cada seção (RPPS clientes,
// Parametrizações...) ainda passa por requireAdminFeature — por padrão todo Super Admin vê
// tudo, a menos que o APP CENTRAL restrinja essa permissão específica pra essa conta.
export const adminRouter = Router();
adminRouter.use(requireAuth, requireSuperAdmin);
adminRouter.use("/tenants", requireAdminFeature("admin_rpps_clientes"));
adminRouter.use("/entidades-certificadoras", requireAdminFeature("admin_parametrizacoes"));
adminRouter.use("/construtor-tipos", requireAdminFeature("admin_parametrizacoes"));
adminRouter.use("/construtor-catalogo", requireAdminFeature("admin_parametrizacoes"));
adminRouter.use("/documentos-personalizados", requireAdminFeature("admin_parametrizacoes"));
adminRouter.use("/portal-documentos", requireAdminFeature("admin_parametrizacoes"));
adminRouter.use("/auditoria", requireAdminFeature("admin_auditoria"));
adminRouter.use("/relatorios", requireAdminFeature("admin_relatorios"));

// Limite de itens por consulta — protege o banco de uma busca pesada sem paginação; o Super
// Admin pode subir o valor na tela (até o teto abaixo), nunca ilimitado.
const LIMITE_PADRAO = 50;
const LIMITE_MAXIMO = 500;
function parseLimit(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return LIMITE_PADRAO;
  return Math.min(Math.trunc(n), LIMITE_MAXIMO);
}

// --- Tenants ---------------------------------------------------------------------------

adminRouter.get("/tenants", async (_req, res, next) => {
  try {
    res.json({ tenants: await adminRepository.listTenants() });
  } catch (err) {
    next(err);
  }
});

const createTenantSchema = z.object({
  tenantName: z.string().min(3),
  federatedEntity: z.string().min(2),
  seguradosCount: z.number().int().nonnegative().default(0),
  plan: z.enum(["ESSENCIAL", "GESTAO", "PERFORMANCE"]).default("ESSENCIAL"),
});

adminRouter.post("/tenants", async (req, res, next) => {
  try {
    const parsed = createTenantSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Payload inválido.");
    const tenant = await adminRepository.createTenant(parsed.data);
    res.status(201).json(tenant);
  } catch (err) {
    next(err);
  }
});

const updateTenantSchema = z.object({
  name: z.string().min(3).optional(),
  federatedEntity: z.string().min(2).optional(),
  cnpj: z.string().min(11).nullable().optional(),
  site: z.string().max(200).nullable().optional(),
  logoUrl: z.string().max(500).nullable().optional(),
  enderecoPublico: z.string().max(300).nullable().optional(),
  telefonePublico: z.string().max(50).nullable().optional(),
  emailPublico: z.string().email().nullable().optional(),
  portalMenuApiUrl: z.string().url().max(500).nullable().optional(),
  portalRodapeApiUrl: z.string().url().max(500).nullable().optional(),
  portalCorPrimaria: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida — use o formato #rrggbb.")
    .nullable()
    .optional(),
  observacao: z.string().nullable().optional(),
  seguradosCount: z.number().int().nonnegative().optional(),
  plan: z.enum(["ESSENCIAL", "GESTAO", "PERFORMANCE"]).optional(),
  nivelProGestaoAlvo: z.enum(["I", "II", "III", "IV"]).nullable().optional(),
});

adminRouter.patch("/tenants/:id", async (req, res, next) => {
  try {
    const parsed = updateTenantSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Payload inválido.");
    const tenant = await adminRepository.updateTenant(req.params.id, parsed.data);
    res.json(tenant);
  } catch (err) {
    next(err);
  }
});

adminRouter.delete("/tenants/:id", async (req, res, next) => {
  try {
    await adminRepository.deleteTenant(req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

adminRouter.get("/tenants/:id/permissoes", async (req, res, next) => {
  try {
    res.json({ permissoes: await adminRepository.getTenantPermissoes(req.params.id) });
  } catch (err) {
    next(err);
  }
});

const tenantPermissaoSchema = z.object({ enabled: z.boolean().nullable() });

adminRouter.patch("/tenants/:id/permissoes/:featureKey", async (req, res, next) => {
  try {
    const parsed = tenantPermissaoSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, "Payload inválido.");
    const permissoes = await adminRepository.setTenantPermissao(req.params.id, req.params.featureKey, parsed.data.enabled);
    res.json({ permissoes });
  } catch (err) {
    next(err);
  }
});

// --- Vínculos (Membership) de um RPPS — só pra Microsoft/gov.br, que não auto-vinculam tenant
// como o login central faz (ver central-sso.routes.ts). Sem criação de usuário com senha: só
// vincula uma conta que já existe (criada por login SSO em algum momento). Ativar/desativar
// revoga/concede acesso sem apagar o vínculo (ver User.ativo). ------------------------------

const membershipSchema = z.object({
  tenantId: z.string().min(1),
  email: z.string().email(),
});

adminRouter.post("/tenants/:id/membros", async (req, res, next) => {
  try {
    const parsed = membershipSchema.safeParse({ ...req.body, tenantId: req.params.id });
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Payload inválido.");
    const membership = await adminRepository.createOrUpdateMembership(parsed.data);
    res.status(201).json(membership);
  } catch (err) {
    next(err);
  }
});

adminRouter.delete("/tenants/:id/membros/:membershipId", async (req, res, next) => {
  try {
    await adminRepository.removeMembership(req.params.membershipId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

const membershipUsuarioAtivoSchema = z.object({ ativo: z.boolean() });

adminRouter.patch("/tenants/:id/membros/:userId/ativo", async (req, res, next) => {
  try {
    const parsed = membershipUsuarioAtivoSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, "Payload inválido.");
    const usuario = await adminRepository.setUsuarioAtivo(req.params.userId, parsed.data.ativo);
    res.json(usuario);
  } catch (err) {
    next(err);
  }
});

// --- Parametrização: Entidades Certificadoras ---------------------------------------------

adminRouter.get("/entidades-certificadoras", async (_req, res, next) => {
  try {
    res.json({ entidades: await adminRepository.listEntidadesCertificadoras() });
  } catch (err) {
    next(err);
  }
});

const entidadeSchema = z.object({
  nome: z.string().min(2),
  cnpj: z.string().min(11),
  email: z.string().email().nullable().optional(),
  telefone: z.string().nullable().optional(),
  status: z.enum(["ATIVA", "SUSPENSA", "CANCELADA"]).default("ATIVA"),
  dataCredenciamento: z.string().datetime(),
  dataValidade: z.string().datetime().nullable().optional(),
  observacoes: z.string().nullable().optional(),
});

adminRouter.post("/entidades-certificadoras", async (req, res, next) => {
  try {
    const parsed = entidadeSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Payload inválido.");
    const entidade = await adminRepository.createEntidadeCertificadora({
      nome: parsed.data.nome,
      cnpj: parsed.data.cnpj,
      email: parsed.data.email ?? null,
      telefone: parsed.data.telefone ?? null,
      status: parsed.data.status,
      dataCredenciamento: new Date(parsed.data.dataCredenciamento),
      dataValidade: parsed.data.dataValidade ? new Date(parsed.data.dataValidade) : null,
      observacoes: parsed.data.observacoes ?? null,
    });
    res.status(201).json(entidade);
  } catch (err) {
    next(err);
  }
});

const entidadeUpdateSchema = entidadeSchema.partial();

adminRouter.patch("/entidades-certificadoras/:id", async (req, res, next) => {
  try {
    const parsed = entidadeUpdateSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, "Payload inválido.");
    const { dataCredenciamento, dataValidade, ...rest } = parsed.data;
    const entidade = await adminRepository.updateEntidadeCertificadora(req.params.id, {
      ...rest,
      dataCredenciamento: dataCredenciamento ? new Date(dataCredenciamento) : undefined,
      dataValidade: dataValidade === undefined ? undefined : dataValidade === null ? null : new Date(dataValidade),
    });
    res.json(entidade);
  } catch (err) {
    next(err);
  }
});

adminRouter.delete("/entidades-certificadoras/:id", async (req, res, next) => {
  try {
    await adminRepository.deleteEntidadeCertificadora(req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// --- Construtor de Documentos: tipos de documento (prompts de IA por caso de uso) ---------

adminRouter.get("/construtor-catalogo/pro-gestao-acoes", async (_req, res, next) => {
  try {
    res.json({ acoes: await adminRepository.listCatalogoProGestaoAcoes() });
  } catch (err) {
    next(err);
  }
});

adminRouter.get("/construtor-catalogo/crp-criterios", async (_req, res, next) => {
  try {
    res.json({ criterios: await adminRepository.listCatalogoCrpCriterios() });
  } catch (err) {
    next(err);
  }
});

adminRouter.get("/construtor-tipos", async (_req, res, next) => {
  try {
    res.json({ tipos: await adminRepository.listConstrutorTipos() });
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/construtor-tipos/sincronizar-pro-gestao", async (_req, res, next) => {
  try {
    const criados = await adminRepository.sincronizarConstrutorTiposComProGestao();
    res.status(201).json({ criados: criados.length });
  } catch (err) {
    next(err);
  }
});

const construtorTipoSchema = z
  .object({
    nome: z.string().min(3),
    referenciaTipo: z.enum(["PRO_GESTAO", "CRP", "LIVRE"]),
    acaoCodigo: z.string().nullable().optional(),
    criterionCode: z.string().nullable().optional(),
    promptInstrucoes: z.string().min(10),
    ativo: z.boolean().default(true),
  })
  .refine((v) => v.referenciaTipo !== "PRO_GESTAO" || !!v.acaoCodigo, {
    message: "Selecione a ação do Pró-Gestão referenciada.",
    path: ["acaoCodigo"],
  })
  .refine((v) => v.referenciaTipo !== "CRP" || !!v.criterionCode, {
    message: "Selecione o critério do CRP referenciado.",
    path: ["criterionCode"],
  });

adminRouter.post("/construtor-tipos", async (req, res, next) => {
  try {
    const parsed = construtorTipoSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Payload inválido.");
    const tipo = await adminRepository.createConstrutorTipo({
      nome: parsed.data.nome,
      referenciaTipo: parsed.data.referenciaTipo,
      acaoCodigo: parsed.data.referenciaTipo === "PRO_GESTAO" ? (parsed.data.acaoCodigo ?? null) : null,
      criterionCode: parsed.data.referenciaTipo === "CRP" ? (parsed.data.criterionCode ?? null) : null,
      promptInstrucoes: parsed.data.promptInstrucoes,
      ativo: parsed.data.ativo,
    });
    res.status(201).json(tipo);
  } catch (err) {
    next(err);
  }
});

const construtorTipoUpdateSchema = z.object({
  nome: z.string().min(3).optional(),
  referenciaTipo: z.enum(["PRO_GESTAO", "CRP", "LIVRE"]).optional(),
  acaoCodigo: z.string().nullable().optional(),
  criterionCode: z.string().nullable().optional(),
  promptInstrucoes: z.string().min(10).optional(),
  ativo: z.boolean().optional(),
});

adminRouter.patch("/construtor-tipos/:id", async (req, res, next) => {
  try {
    const parsed = construtorTipoUpdateSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Payload inválido.");

    const patch = { ...parsed.data };
    if (patch.referenciaTipo === "PRO_GESTAO") patch.criterionCode = null;
    if (patch.referenciaTipo === "CRP") patch.acaoCodigo = null;
    if (patch.referenciaTipo === "LIVRE") {
      patch.acaoCodigo = null;
      patch.criterionCode = null;
    }

    const tipo = await adminRepository.updateConstrutorTipo(req.params.id, patch);
    res.json(tipo);
  } catch (err) {
    next(err);
  }
});

adminRouter.delete("/construtor-tipos/:id", async (req, res, next) => {
  try {
    await adminRepository.deleteConstrutorTipo(req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// --- Auditoria cross-tenant ----------------------------------------------------------------

adminRouter.get("/auditoria", async (req, res, next) => {
  try {
    const limit = parseLimit(req.query.limit);
    const eventos = await adminRepository.listAuditoriaGlobal(limit);
    res.json({ eventos, limit, limiteMaximo: LIMITE_MAXIMO });
  } catch (err) {
    next(err);
  }
});

// --- Relatórios ------------------------------------------------------------------------

adminRouter.get("/relatorios/rpps-clientes", async (req, res, next) => {
  try {
    const limit = parseLimit(req.query.limit);
    const linhas = await adminRepository.relatorioRppsClientes(limit);
    res.json({ linhas, limit, limiteMaximo: LIMITE_MAXIMO });
  } catch (err) {
    next(err);
  }
});

adminRouter.get("/relatorios/construtor-uso", async (req, res, next) => {
  try {
    const limit = parseLimit(req.query.limit);
    const linhas = await adminRepository.relatorioConstrutorUso(limit);
    res.json({ linhas, limit, limiteMaximo: LIMITE_MAXIMO });
  } catch (err) {
    next(err);
  }
});

// --- Documentos Personalizados (tipo documental do Construtor de Documentos + checklist de IA) --

adminRouter.get("/documentos-personalizados", async (_req, res, next) => {
  try {
    res.json({ documentos: await adminRepository.listDocumentosPersonalizados() });
  } catch (err) {
    next(err);
  }
});

const modoExtracaoIASchema = z.enum(["COMENTARIO_APENAS", "CHECKLIST_APENAS", "AMBOS"]);

const criarDocumentoPersonalizadoSchema = z.object({
  nome: z.string().min(3),
  descricao: z.string().nullable().optional(),
  promptInstrucoes: z.string().nullable().optional(),
  modoExtracaoIA: modoExtracaoIASchema.default("COMENTARIO_APENAS"),
});

adminRouter.post("/documentos-personalizados", async (req, res, next) => {
  try {
    const parsed = criarDocumentoPersonalizadoSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Payload inválido.");
    const documento = await adminRepository.createDocumentoPersonalizado({
      nome: parsed.data.nome,
      descricao: parsed.data.descricao ?? null,
      promptInstrucoes: parsed.data.promptInstrucoes ?? null,
      modoExtracaoIA: parsed.data.modoExtracaoIA,
    });
    res.status(201).json(documento);
  } catch (err) {
    next(err);
  }
});

const atualizarDocumentoPersonalizadoSchema = z.object({
  nome: z.string().min(3).optional(),
  descricao: z.string().nullable().optional(),
  promptInstrucoes: z.string().nullable().optional(),
  modoExtracaoIA: modoExtracaoIASchema.optional(),
  ativo: z.boolean().optional(),
});

adminRouter.patch("/documentos-personalizados/:id", async (req, res, next) => {
  try {
    const parsed = atualizarDocumentoPersonalizadoSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Payload inválido.");
    const documento = await adminRepository.updateDocumentoPersonalizado(req.params.id, parsed.data);
    res.json(documento);
  } catch (err) {
    next(err);
  }
});

adminRouter.delete("/documentos-personalizados/:id", async (req, res, next) => {
  try {
    await adminRepository.deleteDocumentoPersonalizado(req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// Checklist de campos pra IA (ver PortalIndicador/PortalIndicadorSubcampo) — campo sem subcampo
// é escalar; com 1+ subcampos vira um grupo repetível (ver comentário em admin.repository.ts).
const campoChecklistSchema = z.object({
  nome: z.string().min(2),
  tipo: z.enum(["NUMERICO", "MOEDA", "TEXTO", "DATA"]),
  unidade: z.string().nullable().optional(),
});

adminRouter.post("/documentos-personalizados/:id/campos", async (req, res, next) => {
  try {
    const parsed = campoChecklistSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Payload inválido.");
    const campo = await adminRepository.addCampoChecklist(req.params.id, { ...parsed.data, unidade: parsed.data.unidade ?? null });
    res.status(201).json(campo);
  } catch (err) {
    next(err);
  }
});

// A partir de um PDF de exemplo, a IA propõe os campos do checklist (com subcampos quando
// detectar um padrão que se repete no documento) e eles já entram criados no catálogo — o admin
// revisa/edita/apaga pela mesma lista de sempre depois. Nunca extrai valores deste PDF específico,
// só a ESTRUTURA de campos (ver sugerirChecklistDePdf).
adminRouter.post("/documentos-personalizados/:id/campos/sugerir-de-pdf", uploadChecklistPdf.single("file"), async (req, res, next) => {
  try {
    if (!isAiConfigured()) throw new HttpError(503, "IA não configurada neste servidor.");
    if (!req.file) throw new HttpError(400, "Nenhum arquivo enviado.");
    if (req.file.mimetype !== "application/pdf") throw new HttpError(400, "Apenas arquivos PDF são aceitos.");

    const documento = await adminRepository.getDocumentoPersonalizado(req.params.id);
    const paginas = await extrairTextoPorPagina(req.file.buffer);
    const sugeridos = await sugerirChecklistDePdf(documento.nome, documento.promptInstrucoes, paginas);
    if (sugeridos.length === 0) throw new HttpError(422, "A IA não conseguiu identificar nenhum campo neste PDF.");

    const atualizado = await adminRepository.aplicarChecklistSugerido(req.params.id, sugeridos);
    res.status(201).json(atualizado);
  } catch (err) {
    next(err);
  }
});

const atualizarCampoChecklistSchema = z.object({
  nome: z.string().min(2).optional(),
  tipo: z.enum(["NUMERICO", "MOEDA", "TEXTO", "DATA"]).optional(),
  unidade: z.string().nullable().optional(),
});

adminRouter.patch("/documentos-personalizados/:id/campos/:campoId", async (req, res, next) => {
  try {
    const parsed = atualizarCampoChecklistSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Payload inválido.");
    const campo = await adminRepository.updateCampoChecklist(req.params.campoId, parsed.data);
    res.json(campo);
  } catch (err) {
    next(err);
  }
});

adminRouter.delete("/documentos-personalizados/:id/campos/:campoId", async (req, res, next) => {
  try {
    await adminRepository.deleteCampoChecklist(req.params.campoId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/documentos-personalizados/:id/campos/:campoId/subcampos", async (req, res, next) => {
  try {
    const parsed = campoChecklistSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Payload inválido.");
    const subcampo = await adminRepository.addSubcampoChecklist(req.params.campoId, { ...parsed.data, unidade: parsed.data.unidade ?? null });
    res.status(201).json(subcampo);
  } catch (err) {
    next(err);
  }
});

adminRouter.patch("/documentos-personalizados/:id/campos/:campoId/subcampos/:subcampoId", async (req, res, next) => {
  try {
    const parsed = atualizarCampoChecklistSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Payload inválido.");
    const subcampo = await adminRepository.updateSubcampoChecklist(req.params.subcampoId, parsed.data);
    res.json(subcampo);
  } catch (err) {
    next(err);
  }
});

adminRouter.delete("/documentos-personalizados/:id/campos/:campoId/subcampos/:subcampoId", async (req, res, next) => {
  try {
    await adminRepository.deleteSubcampoChecklist(req.params.subcampoId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// --- Portal Previdenciário: catálogo de indicadores --------------------------------------

adminRouter.get("/portal-documentos", async (_req, res, next) => {
  try {
    res.json({ documentos: await adminRepository.listPortalDocumentos() });
  } catch (err) {
    next(err);
  }
});

const indicadorPortalSchema = z.object({
  nome: z.string().min(2),
  tipo: z.enum(["NUMERICO", "MOEDA", "TEXTO", "DATA"]),
  unidade: z.string().nullable().optional(),
});

const criarPortalDocumentoSchema = z.object({
  nome: z.string().min(3),
  descricao: z.string().nullable().optional(),
  indicadores: z.array(indicadorPortalSchema).default([]),
});

adminRouter.post("/portal-documentos", async (req, res, next) => {
  try {
    const parsed = criarPortalDocumentoSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Payload inválido.");
    const documento = await adminRepository.createPortalDocumento({
      nome: parsed.data.nome,
      descricao: parsed.data.descricao ?? null,
      indicadores: parsed.data.indicadores.map((i) => ({ nome: i.nome, tipo: i.tipo, unidade: i.unidade ?? null })),
    });
    res.status(201).json(documento);
  } catch (err) {
    next(err);
  }
});

const atualizarPortalDocumentoSchema = z.object({
  nome: z.string().min(3).optional(),
  descricao: z.string().nullable().optional(),
  ativo: z.boolean().optional(),
});

adminRouter.patch("/portal-documentos/:id", async (req, res, next) => {
  try {
    const parsed = atualizarPortalDocumentoSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Payload inválido.");
    const documento = await adminRepository.updatePortalDocumento(req.params.id, parsed.data);
    res.json(documento);
  } catch (err) {
    next(err);
  }
});

adminRouter.delete("/portal-documentos/:id", async (req, res, next) => {
  try {
    await adminRepository.deletePortalDocumento(req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/portal-documentos/:id/indicadores", async (req, res, next) => {
  try {
    const parsed = indicadorPortalSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Payload inválido.");
    const indicador = await adminRepository.addIndicadorPortalDocumento(req.params.id, {
      nome: parsed.data.nome,
      tipo: parsed.data.tipo,
      unidade: parsed.data.unidade ?? null,
    });
    res.status(201).json(indicador);
  } catch (err) {
    next(err);
  }
});

const atualizarIndicadorPortalSchema = z.object({
  nome: z.string().min(2).optional(),
  tipo: z.enum(["NUMERICO", "MOEDA", "TEXTO", "DATA"]).optional(),
  unidade: z.string().nullable().optional(),
});

adminRouter.patch("/portal-documentos/:id/indicadores/:indicadorId", async (req, res, next) => {
  try {
    const parsed = atualizarIndicadorPortalSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Payload inválido.");
    const indicador = await adminRepository.updateIndicadorPortalDocumento(req.params.indicadorId, parsed.data);
    res.json(indicador);
  } catch (err) {
    next(err);
  }
});

adminRouter.delete("/portal-documentos/:id/indicadores/:indicadorId", async (req, res, next) => {
  try {
    await adminRepository.deleteIndicadorPortalDocumento(req.params.indicadorId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
