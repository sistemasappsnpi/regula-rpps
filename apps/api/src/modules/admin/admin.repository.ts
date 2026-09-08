import crypto from "node:crypto";
import {
  Prisma,
  type NivelAderencia,
  type Plan,
  type ReferenciaConstrutor,
  type StatusEntidadeCertificadora,
} from "@prisma/client";
import { prisma } from "../../db/prisma";
import { hashPassword } from "../../utils/password";
import { slugify } from "../../utils/slugify";
import { HttpError } from "../../middleware/errorHandler";
import { crpRepository } from "../crp/crp.repository";

export const adminRepository = {
  // ---------------------------------------------------------------------------------------
  // Tenants (RPPS clientes) — visão cross-tenant, nunca disponível fora do Admin Global.
  // ---------------------------------------------------------------------------------------
  async listTenants() {
    const tenants = await prisma.tenant.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        memberships: {
          include: {
            user: {
              select: { id: true, name: true, email: true, telefone: true, ativo: true, lastLoginAt: true },
            },
          },
        },
        crpStatuses: { select: { status: true } },
      },
    });

    return tenants.map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      federatedEntity: t.federatedEntity,
      cnpj: t.cnpj,
      site: t.site,
      logoUrl: t.logoUrl,
      enderecoPublico: t.enderecoPublico,
      telefonePublico: t.telefonePublico,
      emailPublico: t.emailPublico,
      observacao: t.observacao,
      plan: t.plan,
      nivelProGestaoAlvo: t.nivelProGestaoAlvo,
      seguradosCount: t.seguradosCount,
      createdAt: t.createdAt,
      membros: t.memberships.map((m) => ({
        membershipId: m.id,
        userId: m.user.id,
        name: m.user.name,
        email: m.user.email,
        telefone: m.user.telefone,
        ativo: m.user.ativo,
        lastLoginAt: m.user.lastLoginAt,
      })),
      crpRegular: t.crpStatuses.filter((s) => s.status === "REGULAR").length,
      crpTotal: t.crpStatuses.length,
    }));
  },

  async createTenant(input: {
    tenantName: string;
    federatedEntity: string;
    seguradosCount: number;
    plan: Plan;
    adminName: string;
    adminEmail: string;
    adminPassword: string;
  }) {
    const existing = await prisma.user.findUnique({ where: { email: input.adminEmail } });
    if (existing) throw new HttpError(409, "Já existe um usuário com este e-mail.");

    const baseSlug = slugify(input.tenantName);
    let slug = baseSlug;
    let attempt = 1;
    while (await prisma.tenant.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${++attempt}`;
    }

    const passwordHash = await hashPassword(input.adminPassword);

    const tenant = await prisma.tenant.create({
      data: {
        name: input.tenantName,
        slug,
        federatedEntity: input.federatedEntity,
        seguradosCount: input.seguradosCount,
        plan: input.plan,
        memberships: {
          create: {
            user: { create: { name: input.adminName, email: input.adminEmail, passwordHash } },
          },
        },
      },
      include: { memberships: { include: { user: true } } },
    });

    // Mesma rotina usada no auto-registro público — garante que o novo RPPS já nasce com
    // uma linha de status (PENDENTE) para cada um dos 22 critérios do CRP.
    await crpRepository.ensureTenantRows(tenant.id);

    return tenant;
  },

  async updateTenant(
    id: string,
    data: Partial<{
      name: string;
      federatedEntity: string;
      cnpj: string | null;
      site: string | null;
      logoUrl: string | null;
      enderecoPublico: string | null;
      telefonePublico: string | null;
      emailPublico: string | null;
      observacao: string | null;
      seguradosCount: number;
      plan: Plan;
      nivelProGestaoAlvo: NivelAderencia | null;
    }>,
  ) {
    const tenant = await prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw new HttpError(404, "RPPS não encontrado.");

    if (data.cnpj) {
      const outroComMesmoCnpj = await prisma.tenant.findUnique({ where: { cnpj: data.cnpj } });
      if (outroComMesmoCnpj && outroComMesmoCnpj.id !== id) {
        throw new HttpError(409, "Já existe outro RPPS cadastrado com este CNPJ.");
      }
    }

    return prisma.tenant.update({ where: { id }, data });
  },

  /**
   * Link único por tenant (ver schema.prisma, Tenant.firstAccessToken) que qualquer membro já
   * pré-cadastrado (por e-mail) consegue usar para completar o próprio cadastro sem o admin
   * precisar conhecer ou distribuir senhas individualmente. Gerado sob demanda: um tenant sem
   * link ainda (ex.: recém-criado) recebe um na primeira vez que a aba "Usuários" é aberta.
   */
  async getOrCreateFirstAccessLink(tenantId: string) {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new HttpError(404, "RPPS não encontrado.");
    if (tenant.firstAccessToken) return tenant.firstAccessToken;

    const token = crypto.randomBytes(18).toString("base64url");
    await prisma.tenant.update({ where: { id: tenantId }, data: { firstAccessToken: token } });
    return token;
  },

  async regenerateFirstAccessLink(tenantId: string) {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new HttpError(404, "RPPS não encontrado.");

    const token = crypto.randomBytes(18).toString("base64url");
    await prisma.tenant.update({ where: { id: tenantId }, data: { firstAccessToken: token } });
    return token;
  },

  /**
   * Cascata (ver schema.prisma, todas as tabelas tenant_* têm onDelete: Cascade para Tenant):
   * apaga junto todo o histórico de CRP, Pró-Gestão, uploads e documentos compostos deste RPPS.
   * Usuários que só tinham membership neste tenant permanecem cadastrados, só perdem o vínculo
   * — nunca apagamos uma conta de usuário como efeito colateral de apagar um tenant.
   */
  async deleteTenant(id: string) {
    const tenant = await prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw new HttpError(404, "RPPS não encontrado.");
    await prisma.tenant.delete({ where: { id } });
  },

  /**
   * Permissionamento deste RPPS: para cada feature do catálogo, mostra o padrão do plano
   * contratado e, se houver, o override específico deste tenant (ver schema.prisma,
   * TenantFeature) — o valor que de fato vale é `efetivo`. O plano nunca é um teto: o Admin
   * Global pode ligar algo fora do plano ou desligar algo que o plano incluiria, por RPPS.
   */
  async getTenantPermissoes(tenantId: string) {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { plan: true } });
    if (!tenant) throw new HttpError(404, "RPPS não encontrado.");

    const [features, planFeatures, overrides] = await Promise.all([
      prisma.feature.findMany({ where: { escopo: "TENANT" }, orderBy: { sortOrder: "asc" } }),
      prisma.planFeature.findMany({ where: { plan: tenant.plan } }),
      prisma.tenantFeature.findMany({ where: { tenantId } }),
    ]);

    const padraoPorChave = new Map(planFeatures.map((p) => [p.featureKey, p.enabled]));
    const overridePorChave = new Map(overrides.map((o) => [o.featureKey, o.enabled]));

    return features.map((f) => {
      const padraoDoPlano = padraoPorChave.get(f.key) ?? false;
      const override = overridePorChave.has(f.key) ? overridePorChave.get(f.key)! : null;
      return {
        key: f.key,
        nome: f.nome,
        descricao: f.descricao,
        grupo: f.grupo,
        padraoDoPlano,
        override,
        efetivo: override ?? padraoDoPlano,
      };
    });
  },

  /** `enabled: null` remove o override e volta a valer o padrão do plano para esta feature. */
  async setTenantPermissao(tenantId: string, featureKey: string, enabled: boolean | null) {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new HttpError(404, "RPPS não encontrado.");
    const feature = await prisma.feature.findUnique({ where: { key: featureKey } });
    if (!feature) throw new HttpError(404, "Feature não encontrada.");

    if (enabled === null) {
      await prisma.tenantFeature.deleteMany({ where: { tenantId, featureKey } });
    } else {
      await prisma.tenantFeature.upsert({
        where: { tenantId_featureKey: { tenantId, featureKey } },
        update: { enabled },
        create: { tenantId, featureKey, enabled },
      });
    }

    return adminRepository.getTenantPermissoes(tenantId);
  },

  /**
   * Permissionamento deste USUÁRIO — terceiro nível da cascata (ver middleware/features.ts):
   * mostra, pra cada feature, o que valeria pra ele via plano+tenant ("herdado") e o override
   * pessoal, se houver. Usado tanto pra usuários de RPPS (features TENANT, herdando do tenant
   * dele) quanto pra Super Admins (features ADMIN, herdando "liberado" por padrão).
   */
  async getUserPermissoes(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { memberships: { include: { tenant: { select: { id: true, plan: true } } } } },
    });
    if (!user) throw new HttpError(404, "Usuário não encontrado.");

    const overrides = await prisma.userFeature.findMany({ where: { userId } });
    const overridePorChave = new Map(overrides.map((o) => [o.featureKey, o.enabled]));

    if (user.isSuperAdmin) {
      const features = await prisma.feature.findMany({ where: { escopo: "ADMIN" }, orderBy: { sortOrder: "asc" } });
      return features.map((f) => {
        const override = overridePorChave.has(f.key) ? overridePorChave.get(f.key)! : null;
        return {
          key: f.key,
          nome: f.nome,
          descricao: f.descricao,
          grupo: f.grupo,
          herdado: true, // Super Admin vê tudo por padrão, a menos que alguém restrinja.
          override,
          efetivo: override ?? true,
        };
      });
    }

    const membership = user.memberships[0];
    if (!membership) return [];

    const [features, planFeatures, tenantOverrides] = await Promise.all([
      prisma.feature.findMany({ where: { escopo: "TENANT" }, orderBy: { sortOrder: "asc" } }),
      prisma.planFeature.findMany({ where: { plan: membership.tenant.plan } }),
      prisma.tenantFeature.findMany({ where: { tenantId: membership.tenantId } }),
    ]);

    const padraoPorChave = new Map(planFeatures.map((p) => [p.featureKey, p.enabled]));
    const tenantOverridePorChave = new Map(tenantOverrides.map((o) => [o.featureKey, o.enabled]));

    return features.map((f) => {
      const padraoDoPlano = padraoPorChave.get(f.key) ?? false;
      const herdado = tenantOverridePorChave.has(f.key) ? tenantOverridePorChave.get(f.key)! : padraoDoPlano;
      const override = overridePorChave.has(f.key) ? overridePorChave.get(f.key)! : null;
      return {
        key: f.key,
        nome: f.nome,
        descricao: f.descricao,
        grupo: f.grupo,
        herdado,
        override,
        efetivo: override ?? herdado,
      };
    });
  },

  /** `enabled: null` remove o override pessoal e volta a valer o que o usuário herdaria. */
  async setUserPermissao(userId: string, featureKey: string, enabled: boolean | null) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new HttpError(404, "Usuário não encontrado.");
    const feature = await prisma.feature.findUnique({ where: { key: featureKey } });
    if (!feature) throw new HttpError(404, "Feature não encontrada.");

    if (enabled === null) {
      await prisma.userFeature.deleteMany({ where: { userId, featureKey } });
    } else {
      await prisma.userFeature.upsert({
        where: { userId_featureKey: { userId, featureKey } },
        update: { enabled },
        create: { userId, featureKey, enabled },
      });
    }

    return adminRepository.getUserPermissoes(userId);
  },

  // ---------------------------------------------------------------------------------------
  // Usuários — cross-tenant. Um usuário pode ser Super Admin da plataforma (sem tenant) e/ou
  // ter memberships em um ou mais tenants.
  // ---------------------------------------------------------------------------------------
  async listUsuarios() {
    return prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        email: true,
        telefone: true,
        cpf: true,
        ativo: true,
        lastLoginAt: true,
        isSuperAdmin: true,
        createdAt: true,
        memberships: { include: { tenant: { select: { id: true, name: true, slug: true } } } },
      },
    });
  },

  async createSuperAdmin(input: { name: string; email: string; password: string }) {
    const existing = await prisma.user.findUnique({ where: { email: input.email } });
    if (existing) throw new HttpError(409, "Já existe um usuário com este e-mail.");
    const passwordHash = await hashPassword(input.password);
    return prisma.user.create({
      data: { name: input.name, email: input.email, passwordHash, isSuperAdmin: true },
    });
  },

  async setSuperAdmin(userId: string, isSuperAdmin: boolean) {
    return prisma.user.update({ where: { id: userId }, data: { isSuperAdmin } });
  },

  async updateUsuario(
    userId: string,
    data: {
      name?: string;
      email?: string;
      password?: string;
      telefone?: string | null;
      cpf?: string | null;
      ativo?: boolean;
    },
  ) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new HttpError(404, "Usuário não encontrado.");

    if (data.email && data.email !== user.email) {
      const existing = await prisma.user.findUnique({ where: { email: data.email } });
      if (existing) throw new HttpError(409, "Já existe um usuário com este e-mail.");
    }

    if (data.cpf) {
      const existente = await prisma.user.findUnique({ where: { cpf: data.cpf } });
      if (existente && existente.id !== userId) throw new HttpError(409, "Já existe um usuário com este CPF.");
    }

    // Inclui memberships (mesmo formato de listUsuarios) para o retorno bater com o tipo
    // AdminUsuario esperado pelo frontend, mesmo que a tela atual sempre recarregue a lista
    // inteira depois — evita a resposta desta rota mentir sobre seu próprio formato.
    return prisma.user.update({
      where: { id: userId },
      data: {
        name: data.name,
        email: data.email,
        telefone: data.telefone,
        cpf: data.cpf,
        ativo: data.ativo,
        passwordHash: data.password ? await hashPassword(data.password) : undefined,
      },
      select: {
        id: true,
        name: true,
        email: true,
        telefone: true,
        cpf: true,
        ativo: true,
        lastLoginAt: true,
        isSuperAdmin: true,
        createdAt: true,
        memberships: { include: { tenant: { select: { id: true, name: true, slug: true } } } },
      },
    });
  },

  /**
   * Memberships são apagadas em cascata (Membership.userId tem onDelete: Cascade). Registros
   * que o usuário criou noutras tabelas (uploads, valores do Pró-Gestão) não têm cascade —
   * a exclusão falha com FK constraint e vira um erro amigável em vez de um 500 genérico.
   */
  async deleteUsuario(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new HttpError(404, "Usuário não encontrado.");

    try {
      await prisma.user.delete({ where: { id: userId } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
        throw new HttpError(
          409,
          "Não é possível excluir: este usuário possui registros vinculados (uploads, valores do Pró-Gestão etc.).",
        );
      }
      throw err;
    }
  },

  /**
   * Vincula um usuário (existente por e-mail, ou recém-criado) a um tenant. Senha é opcional na
   * criação: sem ela, o usuário nasce com uma senha aleatória inutilizável e completa o próprio
   * cadastro depois pelo link de primeiro acesso do tenant (ver getOrCreateFirstAccessLink) —
   * mesmo fluxo do "Novo Usuário" com senha em branco.
   */
  async createOrUpdateMembership(input: {
    tenantId: string;
    userId?: string;
    name?: string;
    email?: string;
    telefone?: string;
    password?: string;
  }) {
    let userId = input.userId;

    if (!userId) {
      if (!input.email) throw new HttpError(400, "Informe o e-mail do usuário.");
      const existing = await prisma.user.findUnique({ where: { email: input.email } });
      if (existing) {
        userId = existing.id;
      } else {
        if (!input.name) throw new HttpError(400, "Para criar um novo usuário, informe o nome.");
        const passwordHash = await hashPassword(input.password || crypto.randomUUID());
        const created = await prisma.user.create({
          data: { name: input.name, email: input.email, telefone: input.telefone, passwordHash },
        });
        userId = created.id;
      }
    }

    return prisma.membership.upsert({
      where: { userId_tenantId: { userId, tenantId: input.tenantId } },
      update: {},
      create: { userId, tenantId: input.tenantId },
    });
  },

  async removeMembership(membershipId: string) {
    return prisma.membership.delete({ where: { id: membershipId } });
  },

  // ---------------------------------------------------------------------------------------
  // Parametrização global: Entidades Certificadoras do Pró-Gestão RPPS (Anexo 5/6 do Manual).
  // ---------------------------------------------------------------------------------------
  async listEntidadesCertificadoras() {
    return prisma.entidadeCertificadora.findMany({ orderBy: { nome: "asc" } });
  },

  async createEntidadeCertificadora(data: {
    nome: string;
    cnpj: string;
    email: string | null;
    telefone: string | null;
    status: StatusEntidadeCertificadora;
    dataCredenciamento: Date;
    dataValidade: Date | null;
    observacoes: string | null;
  }) {
    return prisma.entidadeCertificadora.create({ data });
  },

  async updateEntidadeCertificadora(
    id: string,
    data: Partial<{
      nome: string;
      cnpj: string;
      email: string | null;
      telefone: string | null;
      status: StatusEntidadeCertificadora;
      dataCredenciamento: Date;
      dataValidade: Date | null;
      observacoes: string | null;
    }>,
  ) {
    return prisma.entidadeCertificadora.update({ where: { id }, data });
  },

  async deleteEntidadeCertificadora(id: string) {
    return prisma.entidadeCertificadora.delete({ where: { id } });
  },

  // ---------------------------------------------------------------------------------------
  // Construtor de Documentos: cada "tipo de documento" é um prompt de IA configurado aqui pelo
  // Super Admin, opcionalmente ligado a uma ação do Pró-Gestão ou a um critério do CRP (dá à IA
  // o contexto normativo de que aquele documento significa — ver construtor.repository.ts,
  // montarContextoManual). Cross-tenant, igual ao resto deste módulo.
  // ---------------------------------------------------------------------------------------
  async listCatalogoProGestaoAcoes() {
    return prisma.proGestaoAcao.findMany({
      orderBy: { sortOrder: "asc" },
      select: { codigo: true, numero: true, nome: true },
    });
  },

  async listCatalogoCrpCriterios() {
    return prisma.crpCriterion.findMany({
      orderBy: { sortOrder: "asc" },
      select: { code: true, title: true },
    });
  },

  // Nunca lista os tipos referenciaTipo=PERSONALIZADO aqui: esses são espelhados automaticamente
  // a partir de DocumentoPersonalizado.promptInstrucoes (ver syncConstrutorTipoParaPersonalizado)
  // e só têm um lugar de edição — o próprio Documento Personalizado, em "Documentos
  // Personalizados" — pra não abrir uma segunda tela editando o mesmo prompt e os dois saírem
  // de sincronia.
  async listConstrutorTipos() {
    return prisma.construtorTipoDocumento.findMany({
      where: { referenciaTipo: { not: "PERSONALIZADO" } },
      orderBy: { sortOrder: "asc" },
      include: { acao: { select: { nome: true } }, criterion: { select: { title: true } } },
    });
  },

  /**
   * Cria um ConstrutorTipoDocumento com prompt genérico para cada ação do Pró-Gestão que ainda
   * não tem nenhum tipo ligado a ela — evita o Super Admin ter que cadastrar as 24 ações uma a
   * uma na mão. Idempotente: só preenche o que falta, nunca sobrescreve um tipo já customizado
   * (mesmo que o nome/prompt tenham sido editados depois). O que é visível para cada tenant
   * ainda passa pelo filtro de nível em construtorRepository.listTiposAtivos.
   */
  async sincronizarConstrutorTiposComProGestao() {
    const [acoes, existentes] = await Promise.all([
      prisma.proGestaoAcao.findMany({ orderBy: { sortOrder: "asc" } }),
      prisma.construtorTipoDocumento.findMany({
        where: { acaoCodigo: { not: null } },
        select: { acaoCodigo: true },
      }),
    ]);
    const jaTemTipo = new Set(existentes.map((e) => e.acaoCodigo));

    const criados = [];
    for (const acao of acoes) {
      if (jaTemTipo.has(acao.codigo)) continue;
      criados.push(
        await prisma.construtorTipoDocumento.create({
          data: {
            nome: acao.nome,
            referenciaTipo: "PRO_GESTAO",
            acaoCodigo: acao.codigo,
            promptInstrucoes:
              `Monte o documento "${acao.nome}" reunindo, de cada relatório-fonte enviado, as informações que ` +
              "atendem ao que este documento exige (ver contexto acima). Organize de forma clara e completa, " +
              "sem perder detalhes relevantes para auditoria. Ajuste este texto para instruções mais " +
              "específicas sempre que fizer sentido para este documento.",
            ativo: true,
            sortOrder: acao.sortOrder,
          },
        }),
      );
    }
    return criados;
  },

  async createConstrutorTipo(input: {
    nome: string;
    referenciaTipo: ReferenciaConstrutor;
    acaoCodigo: string | null;
    criterionCode: string | null;
    promptInstrucoes: string;
    ativo: boolean;
  }) {
    return prisma.construtorTipoDocumento.create({ data: input });
  },

  async updateConstrutorTipo(
    id: string,
    input: Partial<{
      nome: string;
      referenciaTipo: ReferenciaConstrutor;
      acaoCodigo: string | null;
      criterionCode: string | null;
      promptInstrucoes: string;
      ativo: boolean;
    }>,
  ) {
    const tipo = await prisma.construtorTipoDocumento.findUnique({ where: { id } });
    if (!tipo) throw new HttpError(404, "Tipo de documento não encontrado.");
    return prisma.construtorTipoDocumento.update({ where: { id }, data: input });
  },

  async deleteConstrutorTipo(id: string) {
    const tipo = await prisma.construtorTipoDocumento.findUnique({ where: { id } });
    if (!tipo) throw new HttpError(404, "Tipo de documento não encontrado.");
    await prisma.construtorTipoDocumento.delete({ where: { id } });
  },

  // ---------------------------------------------------------------------------------------
  // Auditoria cross-tenant — feed único de tudo que foi preenchido, enviado ou gerado em
  // qualquer RPPS, pro Super Admin acompanhar a plataforma inteira num só lugar (diferente da
  // auditoria por tenant que já existe em /pro-gestao/auditoria, escopada a 1 RPPS). `limit` é
  // aplicado na própria query de cada fonte (não só no corte final) — é o que de fato protege
  // o banco de uma busca pesada, não só o que a tela mostra.
  // ---------------------------------------------------------------------------------------
  async listAuditoriaGlobal(limit: number) {
    const [campoValores, uploads, compostos, construtorExecucoes] = await Promise.all([
      prisma.tenantProGestaoCampoValor.findMany({
        take: limit,
        orderBy: { createdAt: "desc" },
        include: { tenant: { select: { name: true } }, campo: { include: { acao: true } }, criadoPor: { select: { name: true } } },
      }),
      prisma.documentoUpload.findMany({
        take: limit,
        orderBy: { createdAt: "desc" },
        include: { tenant: { select: { name: true } }, uploadedBy: { select: { name: true } } },
      }),
      prisma.tenantDocumentoComposto.findMany({
        take: limit,
        orderBy: { geradoEm: "desc" },
        include: { tenant: { select: { name: true } }, acao: { select: { nome: true } } },
      }),
      prisma.tenantConstrutorExecucao.findMany({
        take: limit,
        orderBy: { geradoEm: "desc" },
        include: { tenant: { select: { name: true } }, tipoDocumento: { select: { nome: true } } },
      }),
    ]);

    const eventos = [
      ...campoValores.map((v) => ({
        quando: v.createdAt,
        tipo: "CAMPO_PREENCHIDO" as const,
        tenantId: v.tenantId,
        tenantNome: v.tenant.name,
        autor: v.criadoPor.name,
        descricao: `Preencheu "${v.campo.descricao}" (${v.campo.acao.nome}) — origem: ${v.origem.toLowerCase()}`,
      })),
      ...uploads.map((u) => ({
        quando: u.createdAt,
        tipo: "UPLOAD" as const,
        tenantId: u.tenantId,
        tenantNome: u.tenant.name,
        autor: u.uploadedBy.name,
        descricao: `Enviou o documento "${u.nomeArquivo}"`,
      })),
      ...compostos.map((c) => ({
        quando: c.geradoEm,
        tipo: "DOCUMENTO_COMPOSTO" as const,
        tenantId: c.tenantId,
        tenantNome: c.tenant.name,
        autor: null as string | null,
        descricao: `Documento composto "${c.acao.nome}" — status: ${c.status.toLowerCase()}`,
      })),
      ...construtorExecucoes.map((e) => ({
        quando: e.geradoEm,
        tipo: "CONSTRUTOR_EXECUCAO" as const,
        tenantId: e.tenantId,
        tenantNome: e.tenant.name,
        autor: null as string | null,
        descricao: `Construtor: "${e.tipoDocumento.nome}" — status: ${e.status.toLowerCase()}`,
      })),
    ];

    eventos.sort((a, b) => b.quando.getTime() - a.quando.getTime());
    return eventos.slice(0, limit);
  },

  // ---------------------------------------------------------------------------------------
  // Relatórios cross-tenant — tabelas consolidadas para exportação (CSV, no frontend). Mesmo
  // cuidado de `limit` aplicado direto na query.
  // ---------------------------------------------------------------------------------------
  async relatorioRppsClientes(limit: number) {
    const tenants = await prisma.tenant.findMany({
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        memberships: { select: { id: true } },
        crpStatuses: { select: { status: true } },
      },
    });

    return tenants.map((t) => ({
      id: t.id,
      name: t.name,
      federatedEntity: t.federatedEntity,
      plan: t.plan,
      nivelProGestaoAlvo: t.nivelProGestaoAlvo,
      seguradosCount: t.seguradosCount,
      totalUsuarios: t.memberships.length,
      crpRegular: t.crpStatuses.filter((s) => s.status === "REGULAR").length,
      crpTotal: t.crpStatuses.length,
      createdAt: t.createdAt,
    }));
  },

  async relatorioConstrutorUso(limit: number) {
    const execucoes = await prisma.tenantConstrutorExecucao.findMany({
      take: limit,
      orderBy: { geradoEm: "desc" },
      include: { tenant: { select: { name: true } }, tipoDocumento: { select: { nome: true } } },
    });

    return execucoes.map((e) => ({
      id: e.id,
      tenantNome: e.tenant.name,
      tipoDocumentoNome: e.tipoDocumento.nome,
      status: e.status,
      geradoEm: e.geradoEm,
      aprovadoEm: e.aprovadoEm,
    }));
  },

  // ---------------------------------------------------------------------------------------
  // Documentos Personalizados: tipo de documento fora do catálogo oficial do Pró-Gestão/CRP —
  // o Super Admin cria do zero (nome + campos livres) pra cobrir algo específico (ex.: DIPR)
  // que os dois programas oficiais não cobrem. Preenchimento e publicação ficam do lado do
  // tenant (ver documentos-personalizados.repository.ts).
  // ---------------------------------------------------------------------------------------
  async listDocumentosPersonalizados() {
    return prisma.documentoPersonalizado.findMany({
      orderBy: { sortOrder: "asc" },
      include: { campos: { orderBy: { sortOrder: "asc" } } },
    });
  },

  /**
   * Espelha DocumentoPersonalizado.promptInstrucoes num ConstrutorTipoDocumento
   * (referenciaTipo=PERSONALIZADO), pra ele aparecer pro tenant no Construtor de Documentos sem
   * o Super Admin ter que cadastrar um tipo separado à mão. Sem referência normativa própria —
   * mesmo comportamento de um tipo LIVRE (a IA segue só o prompt, ver construtor.repository.ts).
   * Idempotente: chamar de novo só atualiza nome/prompt/ativo do espelho existente.
   */
  async syncConstrutorTipoParaPersonalizado(doc: { id: string; nome: string; ativo: boolean; promptInstrucoes: string | null }) {
    const existente = await prisma.construtorTipoDocumento.findUnique({ where: { documentoPersonalizadoId: doc.id } });
    const temPrompt = !!doc.promptInstrucoes?.trim();

    if (!temPrompt) {
      // Sem prompt: se existir um espelho de uma configuração anterior, só desativa — nunca
      // apaga (poderia ter execuções já geradas ligadas a ele, ver FK RESTRICT em
      // TenantConstrutorExecucao.tipoDocumentoId).
      if (existente) await prisma.construtorTipoDocumento.update({ where: { id: existente.id }, data: { ativo: false } });
      return;
    }

    if (existente) {
      await prisma.construtorTipoDocumento.update({
        where: { id: existente.id },
        data: { nome: doc.nome, promptInstrucoes: doc.promptInstrucoes!, ativo: doc.ativo },
      });
    } else {
      await prisma.construtorTipoDocumento.create({
        data: {
          nome: doc.nome,
          referenciaTipo: "PERSONALIZADO",
          documentoPersonalizadoId: doc.id,
          promptInstrucoes: doc.promptInstrucoes!,
          ativo: doc.ativo,
        },
      });
    }
  },

  async createDocumentoPersonalizado(input: {
    nome: string;
    descricao: string | null;
    promptInstrucoes: string | null;
    campos: { descricao: string; obrigatorio: boolean }[];
  }) {
    const baseSlug = slugify(input.nome);
    let codigo = baseSlug;
    let tentativa = 1;
    while (await prisma.documentoPersonalizado.findUnique({ where: { codigo } })) {
      codigo = `${baseSlug}-${++tentativa}`;
    }

    const totalExistente = await prisma.documentoPersonalizado.count();

    const usados = new Set<string>();
    const camposData = input.campos.map((c, i) => {
      const base = slugify(c.descricao) || `campo-${i + 1}`;
      let campoId = base;
      let n = 1;
      while (usados.has(campoId)) campoId = `${base}-${++n}`;
      usados.add(campoId);
      return { campoId, descricao: c.descricao, obrigatorio: c.obrigatorio, sortOrder: i };
    });

    const documento = await prisma.documentoPersonalizado.create({
      data: {
        codigo,
        nome: input.nome,
        descricao: input.descricao,
        promptInstrucoes: input.promptInstrucoes,
        sortOrder: totalExistente,
        campos: { create: camposData },
      },
      include: { campos: { orderBy: { sortOrder: "asc" } } },
    });

    await adminRepository.syncConstrutorTipoParaPersonalizado(documento);
    return documento;
  },

  async updateDocumentoPersonalizado(
    id: string,
    input: Partial<{ nome: string; descricao: string | null; promptInstrucoes: string | null; ativo: boolean }>,
  ) {
    const doc = await prisma.documentoPersonalizado.findUnique({ where: { id } });
    if (!doc) throw new HttpError(404, "Documento personalizado não encontrado.");
    const atualizado = await prisma.documentoPersonalizado.update({
      where: { id },
      data: input,
      include: { campos: { orderBy: { sortOrder: "asc" } } },
    });

    await adminRepository.syncConstrutorTipoParaPersonalizado(atualizado);
    return atualizado;
  },

  async deleteDocumentoPersonalizado(id: string) {
    const doc = await prisma.documentoPersonalizado.findUnique({ where: { id } });
    if (!doc) throw new HttpError(404, "Documento personalizado não encontrado.");
    // Desativa o espelho no Construtor antes de excluir — a FK (onDelete: SetNull) evita que a
    // exclusão do documento seja bloqueada mesmo se esse tipo já tiver execuções geradas.
    await prisma.construtorTipoDocumento.updateMany({ where: { documentoPersonalizadoId: id }, data: { ativo: false } });
    await prisma.documentoPersonalizado.delete({ where: { id } });
  },

  async addCampoDocumentoPersonalizado(documentoId: string, input: { descricao: string; obrigatorio: boolean }) {
    const doc = await prisma.documentoPersonalizado.findUnique({ where: { id: documentoId }, include: { campos: true } });
    if (!doc) throw new HttpError(404, "Documento personalizado não encontrado.");

    const usados = new Set(doc.campos.map((c) => c.campoId));
    const base = slugify(input.descricao) || `campo-${doc.campos.length + 1}`;
    let campoId = base;
    let n = 1;
    while (usados.has(campoId)) campoId = `${base}-${++n}`;

    return prisma.documentoPersonalizadoCampo.create({
      data: { documentoId, campoId, descricao: input.descricao, obrigatorio: input.obrigatorio, sortOrder: doc.campos.length },
    });
  },

  async updateCampoDocumentoPersonalizado(campoDbId: string, input: Partial<{ descricao: string; obrigatorio: boolean }>) {
    const campo = await prisma.documentoPersonalizadoCampo.findUnique({ where: { id: campoDbId } });
    if (!campo) throw new HttpError(404, "Campo não encontrado.");
    return prisma.documentoPersonalizadoCampo.update({ where: { id: campoDbId }, data: input });
  },

  async deleteCampoDocumentoPersonalizado(campoDbId: string) {
    const campo = await prisma.documentoPersonalizadoCampo.findUnique({ where: { id: campoDbId } });
    if (!campo) throw new HttpError(404, "Campo não encontrado.");
    await prisma.documentoPersonalizadoCampo.delete({ where: { id: campoDbId } });
  },
};
