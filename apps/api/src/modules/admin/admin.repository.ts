import {
  type ModoExtracaoIA,
  type NivelAderencia,
  type Plan,
  type PortalIndicadorTipo,
  type ReferenciaConstrutor,
  type StatusEntidadeCertificadora,
} from "@prisma/client";
import { prisma } from "../../db/prisma";
import { slugify } from "../../utils/slugify";
import { HttpError } from "../../middleware/errorHandler";
import { crpRepository } from "../crp/crp.repository";
import { listEnabledAdminFeaturesForUser, listEnabledFeaturesForUser } from "../../middleware/features";

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
      portalMenuApiUrl: t.portalMenuApiUrl,
      portalRodapeApiUrl: t.portalRodapeApiUrl,
      portalCorPrimaria: t.portalCorPrimaria,
      observacao: t.observacao,
      plan: t.plan,
      nivelProGestaoAlvo: t.nivelProGestaoAlvo,
      seguradosCount: t.seguradosCount,
      centralClientCode: t.centralClientCode,
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

  /**
   * Cria só o Tenant — não cria mais nenhum usuário admin junto (não existe mais senha local pra
   * atribuir, ver migração pro APP CENTRAL). O jeito normal de um RPPS nascer agora é o
   * auto-provisionamento pelo `client_code` no primeiro login central (ver central-sso.routes.ts);
   * isto aqui serve pra um Super Admin pré-cadastrar um tenant manualmente antes disso acontecer.
   */
  async createTenant(input: { tenantName: string; federatedEntity: string; seguradosCount: number; plan: Plan }) {
    const baseSlug = slugify(input.tenantName);
    let slug = baseSlug;
    let attempt = 1;
    while (await prisma.tenant.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${++attempt}`;
    }

    const tenant = await prisma.tenant.create({
      data: {
        name: input.tenantName,
        slug,
        federatedEntity: input.federatedEntity,
        seguradosCount: input.seguradosCount,
        plan: input.plan,
      },
    });

    // Mesma rotina usada no auto-provisionamento via client_code — garante que o novo RPPS já
    // nasce com uma linha de status (PENDENTE) para cada um dos 22 critérios do CRP.
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
      portalMenuApiUrl: string | null;
      portalRodapeApiUrl: string | null;
      portalCorPrimaria: string | null;
      observacao: string | null;
      seguradosCount: number;
      plan: Plan;
      nivelProGestaoAlvo: NivelAderencia | null;
      centralClientCode: string | null;
    }>,
  ) {
    const tenant = await prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw new HttpError(404, "RPPS não encontrado.");

    if (data.centralClientCode) {
      const outro = await prisma.tenant.findUnique({ where: { centralClientCode: data.centralClientCode } });
      if (outro && outro.id !== id) {
        throw new HttpError(409, "Este código do APP CENTRAL já está vinculado a outro RPPS.");
      }
    }

    if (data.cnpj) {
      const outroComMesmoCnpj = await prisma.tenant.findUnique({ where: { cnpj: data.cnpj } });
      if (outroComMesmoCnpj && outroComMesmoCnpj.id !== id) {
        throw new HttpError(409, "Já existe outro RPPS cadastrado com este CNPJ.");
      }
    }

    // A URL pública (Portal de Transparência / Portal Previdenciário) usa o slug — se o nome do
    // cliente mudar, a URL segue junto, mesma regra de geração/desempate usada na criação (ver
    // createTenant acima), pra nunca deixar a URL presa a um nome antigo (ex.: um nome de teste
    // digitado na criação, corrigido depois pro nome real do cliente).
    let slug: string | undefined;
    if (data.name && data.name !== tenant.name) {
      const baseSlug = slugify(data.name);
      slug = baseSlug;
      let attempt = 1;
      while (true) {
        const conflito = await prisma.tenant.findUnique({ where: { slug } });
        if (!conflito || conflito.id === id) break;
        slug = `${baseSlug}-${++attempt}`;
      }
    }

    return prisma.tenant.update({ where: { id }, data: { ...data, ...(slug ? { slug } : {}) } });
  },

  /**
   * Gera o arquivo de importação em massa da Central de Comando (clientes + usuários + permissões
   * efetivas de cada um). Também grava o `centralClientCode` em todo RPPS que ainda não tinha um
   * (derivado do slug) — assim o código que vai pra Central é exatamente o que o login central
   * usa depois pra achar o RPPS certo, sem vínculo manual. Idempotente: roda de novo sem mudar
   * códigos já gravados.
   */
  async exportarParaCentral() {
    const tenants = await prisma.tenant.findMany({
      orderBy: { createdAt: "asc" },
      include: { memberships: { include: { user: true } } },
    });

    const usados = new Set(tenants.map((t) => t.centralClientCode).filter((c): c is string => !!c));
    for (const t of tenants) {
      if (t.centralClientCode) continue;
      const base = t.slug.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 28) || "RPPS";
      let code = base;
      let n = 1;
      while (usados.has(code)) code = `${base}-${++n}`;
      usados.add(code);
      t.centralClientCode = code;
      await prisma.tenant.update({ where: { id: t.id }, data: { centralClientCode: code } });
    }

    const clients = tenants.map((t) => ({ code: t.centralClientCode!, name: t.name, city: t.federatedEntity }));

    const users: {
      email: string;
      full_name: string;
      client_code: string | null;
      is_superuser: boolean;
      permissions: string[];
    }[] = [];
    const jaExportados = new Set<string>();

    for (const t of tenants) {
      for (const m of t.memberships) {
        if (!m.user.ativo || m.user.isSuperAdmin || jaExportados.has(m.user.id)) continue;
        jaExportados.add(m.user.id);
        users.push({
          email: m.user.email,
          full_name: m.user.name,
          client_code: t.centralClientCode!,
          is_superuser: false,
          permissions: await listEnabledFeaturesForUser(m.user.id, t.id, t.plan),
        });
      }
    }

    const admins = await prisma.user.findMany({ where: { isSuperAdmin: true, ativo: true } });
    for (const u of admins) {
      users.push({
        email: u.email,
        full_name: u.name,
        client_code: null,
        is_superuser: false,
        permissions: await listEnabledAdminFeaturesForUser(u.id),
      });
    }

    return { app_slug: "regula-rpps", clients, users };
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

  // ---------------------------------------------------------------------------------------
  // Vínculos (Membership) — só pra Microsoft/gov.br (ver admin.routes.ts): login central
  // auto-vincula pelo client_code, nunca passa por aqui. Sem criação de usuário com senha: a
  // conta já precisa existir (criada por um login SSO em algum momento).
  // ---------------------------------------------------------------------------------------
  async createOrUpdateMembership(input: { tenantId: string; email: string }) {
    const user = await prisma.user.findUnique({ where: { email: input.email } });
    if (!user) {
      throw new HttpError(
        404,
        "Não existe conta com este e-mail. A pessoa precisa entrar ao menos uma vez pela Microsoft ou gov.br antes de ser vinculada a um RPPS.",
      );
    }

    return prisma.membership.upsert({
      where: { userId_tenantId: { userId: user.id, tenantId: input.tenantId } },
      update: {},
      create: { userId: user.id, tenantId: input.tenantId },
    });
  },

  async removeMembership(membershipId: string) {
    return prisma.membership.delete({ where: { id: membershipId } });
  },

  /** Ativar/desativar sem apagar o vínculo — revoga/concede acesso (checado no login SSO). */
  async setUsuarioAtivo(userId: string, ativo: boolean) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new HttpError(404, "Usuário não encontrado.");
    return prisma.user.update({ where: { id: userId }, data: { ativo } });
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
  // o Super Admin cria do zero (nome + comentário de apoio pra IA + checklist opcional de
  // campos) pra cobrir algo específico (ex.: DPIN, DAIR). Tudo passa pelo Construtor de
  // Documentos (extração por IA) — não existe mais preenchimento manual sem IA. O checklist
  // (PortalIndicador/PortalIndicadorSubcampo) mora no PortalDocumento espelhado, não neste model.
  // ---------------------------------------------------------------------------------------
  async listDocumentosPersonalizados() {
    return prisma.documentoPersonalizado.findMany({
      orderBy: { sortOrder: "asc" },
      include: {
        portalDocumento: {
          include: { indicadores: { orderBy: { sortOrder: "asc" }, include: { subcampos: { orderBy: { sortOrder: "asc" } } } } },
        },
      },
    });
  },

  /**
   * Espelha um DocumentoPersonalizado num ConstrutorTipoDocumento (referenciaTipo=PERSONALIZADO),
   * pra ele aparecer pro tenant no Construtor de Documentos sem o Super Admin ter que cadastrar
   * um tipo separado à mão. O comentário de apoio (promptInstrucoes) é OPCIONAL — a extração
   * autônoma (ver extrairIndicadoresAutonomamente) já tem um prompt-base fixo no código; o
   * comentário do admin só se soma quando preenchido, nunca é obrigatório pra o documento
   * aparecer no Construtor. Idempotente: chamar de novo só atualiza nome/prompt/ativo do espelho.
   */
  async syncConstrutorTipoParaPersonalizado(doc: { id: string; nome: string; ativo: boolean; promptInstrucoes: string | null }) {
    const existente = await prisma.construtorTipoDocumento.findUnique({ where: { documentoPersonalizadoId: doc.id } });
    const promptInstrucoes = doc.promptInstrucoes?.trim() ?? "";

    if (existente) {
      await prisma.construtorTipoDocumento.update({
        where: { id: existente.id },
        data: { nome: doc.nome, promptInstrucoes, ativo: doc.ativo },
      });
    } else {
      await prisma.construtorTipoDocumento.create({
        data: {
          nome: doc.nome,
          referenciaTipo: "PERSONALIZADO",
          documentoPersonalizadoId: doc.id,
          promptInstrucoes,
          ativo: doc.ativo,
        },
      });
    }
  },

  /**
   * Espelha um DocumentoPersonalizado num PortalDocumento com o mesmo nome/codigo (nunca criado/
   * editado à mão — ver DocumentoPersonalizado.portalDocumentoId no schema). É onde a extração
   * autônoma por IA do Construtor (referenciaTipo=PERSONALIZADO) guarda os indicadores que
   * encontrar em cada PDF, sem precisar de catálogo pré-cadastrado. Idempotente: só cria o
   * espelho na primeira chamada, depois só atualiza nome/ativo.
   */
  async syncPortalDocumentoParaDocumentoPersonalizado(doc: {
    id: string;
    codigo: string;
    nome: string;
    ativo: boolean;
    portalDocumentoId: string | null;
  }) {
    if (doc.portalDocumentoId) {
      await prisma.portalDocumento.update({
        where: { id: doc.portalDocumentoId },
        data: { nome: doc.nome, ativo: doc.ativo },
      });
      return;
    }

    let codigo = doc.codigo;
    let tentativa = 1;
    while (await prisma.portalDocumento.findUnique({ where: { codigo } })) {
      codigo = `${doc.codigo}-${++tentativa}`;
    }

    const portalDocumento = await prisma.portalDocumento.create({
      data: { codigo, nome: doc.nome, ativo: doc.ativo },
    });
    await prisma.documentoPersonalizado.update({
      where: { id: doc.id },
      data: { portalDocumentoId: portalDocumento.id },
    });
  },

  async createDocumentoPersonalizado(input: {
    nome: string;
    descricao: string | null;
    promptInstrucoes: string | null;
    modoExtracaoIA: ModoExtracaoIA;
  }) {
    const baseSlug = slugify(input.nome);
    let codigo = baseSlug;
    let tentativa = 1;
    while (await prisma.documentoPersonalizado.findUnique({ where: { codigo } })) {
      codigo = `${baseSlug}-${++tentativa}`;
    }

    const totalExistente = await prisma.documentoPersonalizado.count();

    const documento = await prisma.documentoPersonalizado.create({
      data: {
        codigo,
        nome: input.nome,
        descricao: input.descricao,
        promptInstrucoes: input.promptInstrucoes,
        modoExtracaoIA: input.modoExtracaoIA,
        sortOrder: totalExistente,
      },
    });

    await adminRepository.syncConstrutorTipoParaPersonalizado(documento);
    await adminRepository.syncPortalDocumentoParaDocumentoPersonalizado(documento);
    return adminRepository.getDocumentoPersonalizado(documento.id);
  },

  async updateDocumentoPersonalizado(
    id: string,
    input: Partial<{
      nome: string;
      descricao: string | null;
      promptInstrucoes: string | null;
      modoExtracaoIA: ModoExtracaoIA;
      ativo: boolean;
    }>,
  ) {
    const doc = await prisma.documentoPersonalizado.findUnique({ where: { id } });
    if (!doc) throw new HttpError(404, "Documento personalizado não encontrado.");
    const atualizado = await prisma.documentoPersonalizado.update({ where: { id }, data: input });

    await adminRepository.syncConstrutorTipoParaPersonalizado(atualizado);
    await adminRepository.syncPortalDocumentoParaDocumentoPersonalizado(atualizado);
    return adminRepository.getDocumentoPersonalizado(atualizado.id);
  },

  async getDocumentoPersonalizado(id: string) {
    const doc = await prisma.documentoPersonalizado.findUnique({
      where: { id },
      include: {
        portalDocumento: {
          include: { indicadores: { orderBy: { sortOrder: "asc" }, include: { subcampos: { orderBy: { sortOrder: "asc" } } } } },
        },
      },
    });
    if (!doc) throw new HttpError(404, "Documento personalizado não encontrado.");
    return doc;
  },

  async deleteDocumentoPersonalizado(id: string) {
    const doc = await prisma.documentoPersonalizado.findUnique({ where: { id } });
    if (!doc) throw new HttpError(404, "Documento personalizado não encontrado.");
    // Desativa os dois espelhos (Construtor e Portal Previdenciário) antes de excluir — as FKs
    // (onDelete: SetNull) evitam que a exclusão do documento seja bloqueada mesmo se já houver
    // execuções geradas ou indicadores/valores lançados.
    await prisma.construtorTipoDocumento.updateMany({ where: { documentoPersonalizadoId: id }, data: { ativo: false } });
    if (doc.portalDocumentoId) {
      await prisma.portalDocumento.update({ where: { id: doc.portalDocumentoId }, data: { ativo: false } });
    }
    await prisma.documentoPersonalizado.delete({ where: { id } });
  },

  // ---------------------------------------------------------------------------------------
  // Checklist de campos pra IA (ver PortalIndicador/PortalIndicadorSubcampo) — cadastrado pelo
  // admin no PortalDocumento espelhado do documento personalizado. Sem subcampo nenhum, um campo
  // é escalar (comportamento de sempre); com 1+ subcampos, vira um "grupo" repetível (ex.:
  // "Membro do Comitê" → nome/cargo/portaria, várias ocorrências por competência).
  // ATENÇÃO: excluir um campo (ou subcampo) já usado apaga em cascata os valores publicados
  // dele — mesmo risco que excluir um campo de qualquer catálogo do sistema.
  // ---------------------------------------------------------------------------------------
  async addCampoChecklist(documentoPersonalizadoId: string, input: { nome: string; tipo: PortalIndicadorTipo; unidade: string | null }) {
    const doc = await prisma.documentoPersonalizado.findUnique({ where: { id: documentoPersonalizadoId } });
    if (!doc) throw new HttpError(404, "Documento personalizado não encontrado.");
    if (!doc.portalDocumentoId) throw new HttpError(409, "Este documento ainda não tem um espelho do Portal Previdenciário configurado.");

    const indicadores = await prisma.portalIndicador.findMany({ where: { documentoId: doc.portalDocumentoId } });
    const usados = new Set(indicadores.map((i) => i.indicadorId));
    const base = slugify(input.nome) || `campo-${indicadores.length + 1}`;
    let indicadorId = base;
    let n = 1;
    while (usados.has(indicadorId)) indicadorId = `${base}-${++n}`;

    return prisma.portalIndicador.create({
      data: {
        documentoId: doc.portalDocumentoId,
        indicadorId,
        nome: input.nome,
        tipo: input.tipo,
        unidade: input.unidade,
        sortOrder: indicadores.length,
      },
    });
  },

  async updateCampoChecklist(indicadorDbId: string, input: Partial<{ nome: string; tipo: PortalIndicadorTipo; unidade: string | null }>) {
    const indicador = await prisma.portalIndicador.findUnique({ where: { id: indicadorDbId } });
    if (!indicador) throw new HttpError(404, "Campo não encontrado.");
    return prisma.portalIndicador.update({ where: { id: indicadorDbId }, data: input });
  },

  async deleteCampoChecklist(indicadorDbId: string) {
    const indicador = await prisma.portalIndicador.findUnique({ where: { id: indicadorDbId } });
    if (!indicador) throw new HttpError(404, "Campo não encontrado.");
    await prisma.portalIndicador.delete({ where: { id: indicadorDbId } });
  },

  async addSubcampoChecklist(indicadorDbId: string, input: { nome: string; tipo: PortalIndicadorTipo; unidade: string | null }) {
    const indicador = await prisma.portalIndicador.findUnique({ where: { id: indicadorDbId }, include: { subcampos: true } });
    if (!indicador) throw new HttpError(404, "Campo não encontrado.");

    const usados = new Set(indicador.subcampos.map((s) => s.subcampoId));
    const base = slugify(input.nome) || `subcampo-${indicador.subcampos.length + 1}`;
    let subcampoId = base;
    let n = 1;
    while (usados.has(subcampoId)) subcampoId = `${base}-${++n}`;

    return prisma.portalIndicadorSubcampo.create({
      data: {
        indicadorId: indicadorDbId,
        subcampoId,
        nome: input.nome,
        tipo: input.tipo,
        unidade: input.unidade,
        sortOrder: indicador.subcampos.length,
      },
    });
  },

  async updateSubcampoChecklist(subcampoDbId: string, input: Partial<{ nome: string; tipo: PortalIndicadorTipo; unidade: string | null }>) {
    const subcampo = await prisma.portalIndicadorSubcampo.findUnique({ where: { id: subcampoDbId } });
    if (!subcampo) throw new HttpError(404, "Subcampo não encontrado.");
    return prisma.portalIndicadorSubcampo.update({ where: { id: subcampoDbId }, data: input });
  },

  async deleteSubcampoChecklist(subcampoDbId: string) {
    const subcampo = await prisma.portalIndicadorSubcampo.findUnique({ where: { id: subcampoDbId } });
    if (!subcampo) throw new HttpError(404, "Subcampo não encontrado.");
    await prisma.portalIndicadorSubcampo.delete({ where: { id: subcampoDbId } });
  },

  // Aplica a proposta de checklist que a IA gerou a partir de um PDF de exemplo (ver
  // sugerirChecklistDePdf) — cria cada campo (e seus subcampos) direto no catálogo, reaproveitando
  // o mesmo add*Checklist de sempre pra herdar a geração/desempate de slug. Sem etapa extra de
  // aprovação: é config de admin (não dado de tenant), e cada campo pode ser editado/apagado na
  // hora pela mesma tela — igual ao padrão já usado quando o admin adiciona um campo manualmente.
  async aplicarChecklistSugerido(
    documentoPersonalizadoId: string,
    sugeridos: { nome: string; tipo: PortalIndicadorTipo; unidade: string | null; subcampos: { nome: string; tipo: PortalIndicadorTipo; unidade: string | null }[] }[],
  ) {
    for (const campo of sugeridos) {
      if (!campo.nome.trim()) continue;
      const criado = await adminRepository.addCampoChecklist(documentoPersonalizadoId, {
        nome: campo.nome,
        tipo: campo.tipo,
        unidade: campo.unidade,
      });
      for (const sub of campo.subcampos) {
        if (!sub.nome.trim()) continue;
        await adminRepository.addSubcampoChecklist(criado.id, { nome: sub.nome, tipo: sub.tipo, unidade: sub.unidade });
      }
    }
    return adminRepository.getDocumentoPersonalizado(documentoPersonalizadoId);
  },

  // ---------------------------------------------------------------------------------------
  // Portal Previdenciário — catálogo de indicadores (ver schema.prisma, PortalDocumento):
  // cada "documento" (ex.: DIPR) agrupa indicadores tipados; o RPPS lança valores por
  // competência depois (fora do Admin Global — ver módulo do Portal Previdenciário).
  // ---------------------------------------------------------------------------------------
  async listPortalDocumentos() {
    return prisma.portalDocumento.findMany({
      orderBy: { sortOrder: "asc" },
      include: { indicadores: { orderBy: { sortOrder: "asc" } } },
    });
  },

  /**
   * Espelha um PortalDocumento num ConstrutorTipoDocumento (referenciaTipo=PORTAL_PREVIDENCIARIO),
   * pra ele aparecer pro tenant no Construtor de Documentos sem o Super Admin ter que cadastrar
   * um tipo separado à mão — mesmo padrão de syncConstrutorTipoParaPersonalizado. Sem prompt do
   * admin: a extração aqui é guiada pelo catálogo de PortalIndicador do próprio documento, não
   * por texto livre (ver extrairIndicadoresDoPdf). Idempotente.
   */
  async syncConstrutorTipoParaPortalDocumento(doc: { id: string; nome: string; ativo: boolean }) {
    const existente = await prisma.construtorTipoDocumento.findUnique({ where: { portalDocumentoId: doc.id } });
    const promptInstrucoes =
      "Extrair, do(s) PDF(s) enviado(s), os indicadores cadastrados para este documento no catálogo do Portal " +
      "Previdenciário, identificando também a competência (mês/ano) de cada valor encontrado, sempre citando " +
      "página e trecho de origem.";

    if (existente) {
      await prisma.construtorTipoDocumento.update({
        where: { id: existente.id },
        data: { nome: doc.nome, ativo: doc.ativo },
      });
    } else {
      await prisma.construtorTipoDocumento.create({
        data: {
          nome: doc.nome,
          referenciaTipo: "PORTAL_PREVIDENCIARIO",
          portalDocumentoId: doc.id,
          promptInstrucoes,
          ativo: doc.ativo,
        },
      });
    }
  },

  async createPortalDocumento(input: {
    nome: string;
    descricao: string | null;
    indicadores: { nome: string; tipo: PortalIndicadorTipo; unidade: string | null }[];
  }) {
    const baseCodigo = slugify(input.nome);
    let codigo = baseCodigo;
    let tentativa = 1;
    while (await prisma.portalDocumento.findUnique({ where: { codigo } })) {
      codigo = `${baseCodigo}-${++tentativa}`;
    }

    const totalExistente = await prisma.portalDocumento.count();

    const usados = new Set<string>();
    const indicadoresData = input.indicadores.map((ind, i) => {
      const base = slugify(ind.nome) || `indicador-${i + 1}`;
      let indicadorId = base;
      let n = 1;
      while (usados.has(indicadorId)) indicadorId = `${base}-${++n}`;
      usados.add(indicadorId);
      return { indicadorId, nome: ind.nome, tipo: ind.tipo, unidade: ind.unidade, sortOrder: i };
    });

    const documento = await prisma.portalDocumento.create({
      data: {
        codigo,
        nome: input.nome,
        descricao: input.descricao,
        sortOrder: totalExistente,
        indicadores: { create: indicadoresData },
      },
      include: { indicadores: { orderBy: { sortOrder: "asc" } } },
    });

    await adminRepository.syncConstrutorTipoParaPortalDocumento(documento);
    return documento;
  },

  async updatePortalDocumento(id: string, input: Partial<{ nome: string; descricao: string | null; ativo: boolean }>) {
    const doc = await prisma.portalDocumento.findUnique({ where: { id } });
    if (!doc) throw new HttpError(404, "Documento não encontrado.");
    const atualizado = await prisma.portalDocumento.update({
      where: { id },
      data: input,
      include: { indicadores: { orderBy: { sortOrder: "asc" } } },
    });

    await adminRepository.syncConstrutorTipoParaPortalDocumento(atualizado);
    return atualizado;
  },

  async deletePortalDocumento(id: string) {
    const doc = await prisma.portalDocumento.findUnique({ where: { id } });
    if (!doc) throw new HttpError(404, "Documento não encontrado.");
    // Desativa o espelho no Construtor antes de excluir — a FK (onDelete: SetNull) evita que a
    // exclusão do documento seja bloqueada mesmo se esse tipo já tiver execuções geradas.
    await prisma.construtorTipoDocumento.updateMany({ where: { portalDocumentoId: id }, data: { ativo: false } });
    await prisma.portalDocumento.delete({ where: { id } });
  },

  async addIndicadorPortalDocumento(
    documentoId: string,
    input: { nome: string; tipo: PortalIndicadorTipo; unidade: string | null },
  ) {
    const doc = await prisma.portalDocumento.findUnique({ where: { id: documentoId }, include: { indicadores: true } });
    if (!doc) throw new HttpError(404, "Documento não encontrado.");

    const usados = new Set(doc.indicadores.map((i) => i.indicadorId));
    const base = slugify(input.nome) || `indicador-${doc.indicadores.length + 1}`;
    let indicadorId = base;
    let n = 1;
    while (usados.has(indicadorId)) indicadorId = `${base}-${++n}`;

    return prisma.portalIndicador.create({
      data: { documentoId, indicadorId, nome: input.nome, tipo: input.tipo, unidade: input.unidade, sortOrder: doc.indicadores.length },
    });
  },

  async updateIndicadorPortalDocumento(
    indicadorDbId: string,
    input: Partial<{ nome: string; tipo: PortalIndicadorTipo; unidade: string | null }>,
  ) {
    const indicador = await prisma.portalIndicador.findUnique({ where: { id: indicadorDbId } });
    if (!indicador) throw new HttpError(404, "Indicador não encontrado.");
    return prisma.portalIndicador.update({ where: { id: indicadorDbId }, data: input });
  },

  async deleteIndicadorPortalDocumento(indicadorDbId: string) {
    const indicador = await prisma.portalIndicador.findUnique({ where: { id: indicadorDbId } });
    if (!indicador) throw new HttpError(404, "Indicador não encontrado.");
    await prisma.portalIndicador.delete({ where: { id: indicadorDbId } });
  },
};
