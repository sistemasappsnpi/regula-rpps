import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireSuperAdmin, type AuthenticatedRequest } from "../../middleware/auth";
import { requireAdminFeature } from "../../middleware/features";
import { HttpError } from "../../middleware/errorHandler";
import { adminRepository } from "./admin.repository";

// Todo o módulo é restrito ao Super Admin da plataforma — nunca escopado a um tenantId
// (ver /docs/modelo-de-dados.md e ROADMAP #7). Dentro disso, cada seção (RPPS clientes,
// Usuários, Parametrizações) ainda passa por requireAdminFeature — por padrão todo Super Admin
// vê tudo, mas uma conta específica pode ser restrita em Admin → Usuários → Permissões.
export const adminRouter = Router();
adminRouter.use(requireAuth, requireSuperAdmin);
adminRouter.use("/tenants", requireAdminFeature("admin_rpps_clientes"));
adminRouter.use("/usuarios", requireAdminFeature("admin_usuarios"));
adminRouter.use("/entidades-certificadoras", requireAdminFeature("admin_parametrizacoes"));
adminRouter.use("/construtor-tipos", requireAdminFeature("admin_parametrizacoes"));
adminRouter.use("/construtor-catalogo", requireAdminFeature("admin_parametrizacoes"));
adminRouter.use("/documentos-personalizados", requireAdminFeature("admin_parametrizacoes"));
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
  adminName: z.string().min(2),
  adminEmail: z.string().email(),
  adminPassword: z.string().min(8),
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
  enderecoPublico: z.string().max(300).nullable().optional(),
  telefonePublico: z.string().max(50).nullable().optional(),
  emailPublico: z.string().email().nullable().optional(),
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

adminRouter.get("/tenants/:id/primeiro-acesso", async (req, res, next) => {
  try {
    const token = await adminRepository.getOrCreateFirstAccessLink(req.params.id);
    res.json({ token });
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/tenants/:id/primeiro-acesso/regenerar", async (req, res, next) => {
  try {
    const token = await adminRepository.regenerateFirstAccessLink(req.params.id);
    res.json({ token });
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

// --- Usuários ----------------------------------------------------------------------------

adminRouter.get("/usuarios", async (_req, res, next) => {
  try {
    res.json({ usuarios: await adminRepository.listUsuarios() });
  } catch (err) {
    next(err);
  }
});

const superAdminSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
});

adminRouter.post("/usuarios/super-admin", async (req, res, next) => {
  try {
    const parsed = superAdminSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Payload inválido.");
    const usuario = await adminRepository.createSuperAdmin(parsed.data);
    res.status(201).json(usuario);
  } catch (err) {
    next(err);
  }
});

const toggleSuperAdminSchema = z.object({ isSuperAdmin: z.boolean() });

adminRouter.patch("/usuarios/:userId/super-admin", async (req: AuthenticatedRequest, res, next) => {
  try {
    const parsed = toggleSuperAdminSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, "Payload inválido.");
    if (req.params.userId === req.auth!.userId && !parsed.data.isSuperAdmin) {
      throw new HttpError(400, "Você não pode remover seu próprio acesso de Super Admin.");
    }
    const usuario = await adminRepository.setSuperAdmin(req.params.userId, parsed.data.isSuperAdmin);
    res.json(usuario);
  } catch (err) {
    next(err);
  }
});

const updateUsuarioSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  password: z.string().min(8).optional(),
  telefone: z.string().nullable().optional(),
  cpf: z.string().nullable().optional(),
  ativo: z.boolean().optional(),
});

adminRouter.patch("/usuarios/:userId", async (req, res, next) => {
  try {
    const parsed = updateUsuarioSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Payload inválido.");
    const usuario = await adminRepository.updateUsuario(req.params.userId, parsed.data);
    res.json(usuario);
  } catch (err) {
    next(err);
  }
});

adminRouter.delete("/usuarios/:userId", async (req: AuthenticatedRequest, res, next) => {
  try {
    if (req.params.userId === req.auth!.userId) {
      throw new HttpError(400, "Você não pode excluir seu próprio usuário.");
    }
    await adminRepository.deleteUsuario(req.params.userId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

const membershipSchema = z.object({
  tenantId: z.string().min(1),
  userId: z.string().optional(),
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  telefone: z.string().optional(),
  password: z.string().min(8).optional(),
});

adminRouter.post("/usuarios/membership", async (req, res, next) => {
  try {
    const parsed = membershipSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Payload inválido.");
    const membership = await adminRepository.createOrUpdateMembership(parsed.data);
    res.status(201).json(membership);
  } catch (err) {
    next(err);
  }
});

adminRouter.delete("/usuarios/membership/:membershipId", async (req, res, next) => {
  try {
    await adminRepository.removeMembership(req.params.membershipId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

adminRouter.get("/usuarios/:userId/permissoes", async (req, res, next) => {
  try {
    res.json({ permissoes: await adminRepository.getUserPermissoes(req.params.userId) });
  } catch (err) {
    next(err);
  }
});

const userPermissaoSchema = z.object({ enabled: z.boolean().nullable() });

adminRouter.patch("/usuarios/:userId/permissoes/:featureKey", async (req: AuthenticatedRequest, res, next) => {
  try {
    const parsed = userPermissaoSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, "Payload inválido.");

    // Sem isto, um Super Admin conseguiria se trancar pra fora da própria seção "Usuários" —
    // que é justamente a única capaz de desfazer esse bloqueio (nenhuma outra rota permite
    // editar permissão de usuário). Nunca deixamos essa combinação acontecer.
    if (req.params.userId === req.auth!.userId && req.params.featureKey === "admin_usuarios" && parsed.data.enabled === false) {
      throw new HttpError(400, "Você não pode bloquear seu próprio acesso à seção Usuários.");
    }

    const permissoes = await adminRepository.setUserPermissao(req.params.userId, req.params.featureKey, parsed.data.enabled);
    res.json({ permissoes });
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

// --- Documentos Personalizados (catálogo — preenchimento/publicação ficam do lado do tenant) --

adminRouter.get("/documentos-personalizados", async (_req, res, next) => {
  try {
    res.json({ documentos: await adminRepository.listDocumentosPersonalizados() });
  } catch (err) {
    next(err);
  }
});

const campoPersonalizadoSchema = z.object({
  descricao: z.string().min(2),
  obrigatorio: z.boolean().default(false),
});

const criarDocumentoPersonalizadoSchema = z.object({
  nome: z.string().min(3),
  descricao: z.string().nullable().optional(),
  campos: z.array(campoPersonalizadoSchema).default([]),
});

adminRouter.post("/documentos-personalizados", async (req, res, next) => {
  try {
    const parsed = criarDocumentoPersonalizadoSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Payload inválido.");
    const documento = await adminRepository.createDocumentoPersonalizado({
      nome: parsed.data.nome,
      descricao: parsed.data.descricao ?? null,
      campos: parsed.data.campos,
    });
    res.status(201).json(documento);
  } catch (err) {
    next(err);
  }
});

const atualizarDocumentoPersonalizadoSchema = z.object({
  nome: z.string().min(3).optional(),
  descricao: z.string().nullable().optional(),
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

adminRouter.post("/documentos-personalizados/:id/campos", async (req, res, next) => {
  try {
    const parsed = campoPersonalizadoSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Payload inválido.");
    const campo = await adminRepository.addCampoDocumentoPersonalizado(req.params.id, parsed.data);
    res.status(201).json(campo);
  } catch (err) {
    next(err);
  }
});

const atualizarCampoPersonalizadoSchema = z.object({
  descricao: z.string().min(2).optional(),
  obrigatorio: z.boolean().optional(),
});

adminRouter.patch("/documentos-personalizados/:id/campos/:campoId", async (req, res, next) => {
  try {
    const parsed = atualizarCampoPersonalizadoSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Payload inválido.");
    const campo = await adminRepository.updateCampoDocumentoPersonalizado(req.params.campoId, parsed.data);
    res.json(campo);
  } catch (err) {
    next(err);
  }
});

adminRouter.delete("/documentos-personalizados/:id/campos/:campoId", async (req, res, next) => {
  try {
    await adminRepository.deleteCampoDocumentoPersonalizado(req.params.campoId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
