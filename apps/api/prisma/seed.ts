import { PrismaClient, type NivelAderencia } from "@prisma/client";
import * as fs from "node:fs";
import * as path from "node:path";
import { hashPassword } from "../src/utils/password";

const prisma = new PrismaClient();

// Nunca editar os critérios/ações diretamente aqui — a fonte da verdade é sempre
// /knowledge-base/*.json. Este script só projeta esse conhecimento no banco.
const KNOWLEDGE_BASE_DIR = path.join(__dirname, "../../../knowledge-base");

interface CrpCriterioJson {
  id: string;
  nome: string;
  bloco: string;
  objetivo: string;
  periodicidade: string;
  forma_verificacao: string;
  sistema_origem: string[];
  base_normativa: string;
  depende_de: string[];
}

interface ProGestaoCampoJson {
  id: string;
  descricao: string;
  nivel_minimo: "I" | "II" | "III" | "IV";
  quantidade_minima?: string | number;
  periodicidade?: string;
  substitui?: string;
}

interface ProGestaoAcaoJson {
  id: string;
  codigo: string;
  nome: string;
  dimensao: string;
  essencial: boolean;
  objetivo: string;
  depende_de: string[];
  depende_de_detalhe?: { fonte: string; tipo_relacao: string }[];
  campos: ProGestaoCampoJson[];
}

function loadJson<T>(filename: string): T {
  const raw = fs.readFileSync(path.join(KNOWLEDGE_BASE_DIR, filename), "utf-8");
  return JSON.parse(raw) as T;
}

async function seedCrpCatalog(): Promise<void> {
  const { criterios } = loadJson<{ criterios: CrpCriterioJson[] }>("crp-criterios.json");
  console.log(`Seeding catálogo de ${criterios.length} critérios do CRP a partir do knowledge-base...`);

  // 1ª passada: cria/atualiza todos os critérios sem a dependência (para o code referenciado já existir).
  for (const [index, c] of criterios.entries()) {
    const data = {
      category: c.bloco,
      title: c.nome,
      description: c.objetivo,
      legalBasis: c.base_normativa,
      periodicity: c.periodicidade,
      formaVerificacao: c.forma_verificacao,
      sistemaOrigem: c.sistema_origem.length > 0 ? c.sistema_origem.join(", ") : "nenhum",
      sortOrder: index + 1,
    };
    await prisma.crpCriterion.upsert({
      where: { code: c.id },
      update: data,
      create: { code: c.id, ...data },
    });
  }

  // 2ª passada: liga a cascata de regularidade (ex.: dipr-consistencia -> dipr-encaminhamento).
  for (const c of criterios) {
    if (c.depende_de.length > 0) {
      await prisma.crpCriterion.update({
        where: { code: c.id },
        data: { dependsOnCode: c.depende_de[0] },
      });
    }
  }
}

async function seedProGestaoCatalog(): Promise<void> {
  const { acoes } = loadJson<{ acoes: ProGestaoAcaoJson[] }>("pro-gestao-acoes.json");
  console.log(`Seeding catálogo de ${acoes.length} ações do Pró-Gestão a partir do knowledge-base...`);

  for (const [index, a] of acoes.entries()) {
    await prisma.proGestaoAcao.upsert({
      where: { codigo: a.id },
      update: {
        numero: a.codigo,
        nome: a.nome,
        dimensao: a.dimensao,
        essencial: a.essencial,
        objetivo: a.objetivo,
        sortOrder: index + 1,
      },
      create: {
        codigo: a.id,
        numero: a.codigo,
        nome: a.nome,
        dimensao: a.dimensao,
        essencial: a.essencial,
        objetivo: a.objetivo,
        sortOrder: index + 1,
      },
    });

    for (const [campoIndex, campo] of a.campos.entries()) {
      const data = {
        descricao: campo.descricao,
        nivelMinimo: campo.nivel_minimo as NivelAderencia,
        quantidadeMinima: campo.quantidade_minima !== undefined ? String(campo.quantidade_minima) : null,
        periodicidade: campo.periodicidade ?? null,
        substituiCampoId: campo.substitui ?? null,
        sortOrder: campoIndex,
      };
      await prisma.proGestaoCampo.upsert({
        where: { acaoCodigo_campoId: { acaoCodigo: a.id, campoId: campo.id } },
        update: data,
        create: { acaoCodigo: a.id, campoId: campo.id, ...data },
      });
    }
  }

  // Dependências entre ações (2ª passada: todas as ações já existem nesse ponto).
  for (const a of acoes) {
    const deps =
      a.depende_de_detalhe ??
      a.depende_de.map((fonte) => ({ fonte, tipo_relacao: "citacao_explicita_no_manual" }));

    for (const dep of deps) {
      await prisma.proGestaoAcaoDependencia.upsert({
        where: { acaoCodigo_fonteCodigo: { acaoCodigo: a.id, fonteCodigo: dep.fonte } },
        update: { tipoRelacao: dep.tipo_relacao },
        create: { acaoCodigo: a.id, fonteCodigo: dep.fonte, tipoRelacao: dep.tipo_relacao },
      });
    }
  }
}

interface FeatureSeed {
  key: string;
  nome: string;
  descricao: string;
  grupo: string;
  planos: { ESSENCIAL: boolean; GESTAO: boolean; PERFORMANCE: boolean };
}

// Catálogo de features + matriz padrão por plano. O Admin Global pode reconfigurar a matriz
// depois (/admin/parametrizacoes) — isto é só o estado inicial, o "de fábrica" de cada plano.
// O que cada RPPS específico realmente tem acesso pode ser sobrescrito individualmente em
// Admin → RPPS clientes → editar → Permissões (ver TenantFeature) — o plano nunca é um teto
// rígido. `grupo` só organiza a tela de permissões por aba, sem efeito na regra de acesso.
// Ordem deliberada — espelha a navegação do RPPS (Compliance CRP, Pró-Gestão RPPS/Documentos,
// Construtor) antes das features que não têm aba própria (Transparência, Auditoria), pra tela
// de permissões (Admin → RPPS clientes → editar → Permissões) listar na mesma ordem do menu.
const FEATURES: FeatureSeed[] = [
  {
    key: "crp_compliance",
    nome: "Central de Compliance CRP",
    descricao: "Acompanhamento dos 22 critérios oficiais do Certificado de Regularidade Previdenciária.",
    grupo: "Compliance CRP",
    planos: { ESSENCIAL: true, GESTAO: true, PERFORMANCE: true },
  },
  {
    key: "pro_gestao",
    nome: "Módulo Pró-Gestão RPPS",
    descricao: "As 24 ações do programa, formulário dinâmico por nível de aderência e painel de progresso.",
    grupo: "Pró-Gestão RPPS",
    planos: { ESSENCIAL: false, GESTAO: true, PERFORMANCE: true },
  },
  {
    key: "pro_gestao_ia_extracao",
    nome: "Extração de PDF por IA",
    descricao: "Upload de PDF existente com extração assistida por IA, campo a campo, com citação de origem.",
    grupo: "Pró-Gestão RPPS",
    planos: { ESSENCIAL: false, GESTAO: false, PERFORMANCE: true },
  },
  {
    key: "pro_gestao_dependencias",
    nome: "Motor de dependências entre documentos",
    descricao: "Geração de rascunho de documentos compostos (ex.: Transparência) citando a origem de cada dado.",
    grupo: "Pró-Gestão RPPS",
    planos: { ESSENCIAL: false, GESTAO: false, PERFORMANCE: true },
  },
  {
    key: "documentos_personalizados",
    nome: "Documentos Personalizados",
    descricao: "Tipos de documento fora do catálogo oficial, criados pelo Admin Global com campos livres.",
    grupo: "Documentos Personalizados",
    planos: { ESSENCIAL: false, GESTAO: true, PERFORMANCE: true },
  },
  {
    key: "construtor_documentos",
    nome: "Construtor de Documentos por IA",
    descricao:
      "Monta um documento final a partir dos relatórios enviados, seguindo um prompt configurado pelo " +
      "Admin Global para cada tipo de documento (ver /admin/parametrizacoes).",
    grupo: "Construtor de Documentos",
    planos: { ESSENCIAL: false, GESTAO: false, PERFORMANCE: true },
  },
  {
    key: "transparencia_publica",
    nome: "Portal de Transparência público",
    descricao: "Página pública sem login, gerada a partir de dado estruturado já aprovado.",
    grupo: "Transparência",
    planos: { ESSENCIAL: false, GESTAO: true, PERFORMANCE: true },
  },
  {
    key: "auditoria",
    nome: "Trilha de auditoria",
    descricao: "Histórico de quem alterou cada dado, quando e de onde veio (manual, PDF ou outro documento).",
    grupo: "Auditoria",
    planos: { ESSENCIAL: false, GESTAO: true, PERFORMANCE: true },
  },
];

interface AdminFeatureSeed {
  key: string;
  nome: string;
  descricao: string;
}

// Seções do painel Admin Global — não têm plano nem tenant por trás (ver Feature.escopo
// ADMIN em schema.prisma); sem override, todo Super Admin enxerga todas. Uma conta específica
// pode ser restrita em Admin → Usuários → editar → Permissões.
const ADMIN_FEATURES: AdminFeatureSeed[] = [
  { key: "admin_painel", nome: "Painel", descricao: "Visão consolidada de todos os RPPS clientes da plataforma." },
  {
    key: "admin_rpps_clientes",
    nome: "RPPS clientes",
    descricao: "Cadastro, edição, permissões e usuários de cada RPPS cliente da plataforma.",
  },
  {
    key: "admin_usuarios",
    nome: "Usuários",
    descricao: "Cadastro das contas Super Admin da plataforma e permissões de cada uma.",
  },
  {
    key: "admin_parametrizacoes",
    nome: "Parametrizações",
    descricao: "Matriz de planos e recursos, prompts de IA do Construtor de Documentos.",
  },
  {
    key: "admin_auditoria",
    nome: "Auditoria",
    descricao: "Feed cross-tenant de tudo que foi preenchido, enviado ou gerado na plataforma.",
  },
  {
    key: "admin_relatorios",
    nome: "Relatórios",
    descricao: "Tabelas consolidadas de RPPS clientes e uso de recursos, com exportação em CSV.",
  },
];

async function seedFeatureGating(): Promise<void> {
  console.log("Seeding catálogo de features e matriz padrão por plano...");

  for (const [index, f] of FEATURES.entries()) {
    await prisma.feature.upsert({
      where: { key: f.key },
      update: { nome: f.nome, descricao: f.descricao, grupo: f.grupo, escopo: "TENANT", sortOrder: index },
      create: { key: f.key, nome: f.nome, descricao: f.descricao, grupo: f.grupo, escopo: "TENANT", sortOrder: index },
    });

    for (const plan of ["ESSENCIAL", "GESTAO", "PERFORMANCE"] as const) {
      await prisma.planFeature.upsert({
        where: { plan_featureKey: { plan, featureKey: f.key } },
        // Nunca sobrescreve uma matriz já configurada manualmente pelo Admin Global em
        // reseeds subsequentes — só cria a linha se ela ainda não existir.
        update: {},
        create: { plan, featureKey: f.key, enabled: f.planos[plan] },
      });
    }
  }

  console.log("Seeding catálogo de seções do Admin Global...");
  for (const [index, f] of ADMIN_FEATURES.entries()) {
    await prisma.feature.upsert({
      where: { key: f.key },
      update: { nome: f.nome, descricao: f.descricao, grupo: "Admin Global", escopo: "ADMIN", sortOrder: index },
      create: {
        key: f.key,
        nome: f.nome,
        descricao: f.descricao,
        grupo: "Admin Global",
        escopo: "ADMIN",
        sortOrder: index,
      },
    });
  }
}

async function main() {
  await seedFeatureGating();
  await seedCrpCatalog();
  await seedProGestaoCatalog();

  console.log("Seeding tenant de demonstração...");
  const passwordHash = await hashPassword("demo1234");

  const tenant = await prisma.tenant.upsert({
    where: { slug: "prefeitura-de-vale-verde" },
    update: {},
    create: {
      name: "Prefeitura de Vale Verde — RPPS",
      slug: "prefeitura-de-vale-verde",
      federatedEntity: "Município de Vale Verde - UF",
      // PERFORMANCE porque este tenant já demonstra o motor de dependências e a extração de
      // PDF por IA (ver dados-piloto abaixo) — ambos exclusivos desse plano na matriz padrão
      // de features (ver seedFeatureGating e /admin/parametrizacoes).
      plan: "PERFORMANCE",
      seguradosCount: 1800,
      memberships: {
        create: {
          user: {
            connectOrCreate: {
              where: { email: "admin@valeverde.rpps.gov.br" },
              create: {
                name: "Ana Beatriz Souza",
                email: "admin@valeverde.rpps.gov.br",
                passwordHash,
              },
            },
          },
        },
      },
    },
  });

  const allCriteria = await prisma.crpCriterion.findMany();
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;

  for (const [index, criterion] of allCriteria.entries()) {
    // A maioria regular, alguns pendentes/vencendo, para demonstrar os estados visuais.
    const isPending = index % 8 === 0;
    const isIrregular = index % 11 === 0;
    const status = isIrregular ? "IRREGULAR" : isPending ? "PENDENTE" : "REGULAR";

    await prisma.tenantCrpCriterion.upsert({
      where: { tenantId_criterionId: { tenantId: tenant.id, criterionId: criterion.id } },
      update: {},
      create: {
        tenantId: tenant.id,
        criterionId: criterion.id,
        status,
        lastSentAt: status === "PENDENTE" ? null : new Date(now - 20 * day),
        nextDueAt: new Date(now + ((index % 6) + 1) * day * 10),
      },
    });
  }

  // Piloto do MVP: "Código de Ética" já com o campo de Nível I preenchido manualmente,
  // para o motor de dependências já ter uma fonte satisfeita assim que o app subir
  // (ver /docs/modelo-de-dados.md e a conversa que definiu o subconjunto piloto).
  console.log("Seeding dados-piloto do Pró-Gestão (Código de Ética / Transparência)...");

  await prisma.tenantProGestaoAcao.upsert({
    where: { tenantId_acaoCodigo: { tenantId: tenant.id, acaoCodigo: "codigo-etica" } },
    update: {},
    create: { tenantId: tenant.id, acaoCodigo: "codigo-etica", nivelAtual: "I" },
  });

  const campoDivulgacao = await prisma.proGestaoCampo.findUnique({
    where: { acaoCodigo_campoId: { acaoCodigo: "codigo-etica", campoId: "divulgacao-codigo-etica" } },
  });
  const adminUser = await prisma.user.findUnique({ where: { email: "admin@valeverde.rpps.gov.br" } });

  if (campoDivulgacao && adminUser) {
    const jaTemValor = await prisma.tenantProGestaoCampoValor.findFirst({
      where: { tenantId: tenant.id, campoId: campoDivulgacao.id },
    });

    if (!jaTemValor) {
      await prisma.tenantProGestaoCampoValor.create({
        data: {
          tenantId: tenant.id,
          campoId: campoDivulgacao.id,
          valor:
            "Código de Ética da Prefeitura de Vale Verde, aprovado pelo Decreto nº 1.234/2025, divulgado no " +
            "site oficial da unidade gestora e apresentado em reunião geral aos servidores do RPPS, aos membros " +
            "do Conselho Deliberativo e Fiscal, e às partes relacionadas (fornecedores e prestadores de serviço).",
          origem: "MANUAL",
          criadoPorUserId: adminUser.id,
        },
      });
    }
  }

  console.log("Seeding Super Admin da plataforma e parametrizações globais...");

  const superAdminPasswordHash = await hashPassword("superadmin123");
  await prisma.user.upsert({
    where: { email: "superadmin@regularpps.com.br" },
    update: { isSuperAdmin: true },
    create: {
      name: "Admin da Plataforma",
      email: "superadmin@regularpps.com.br",
      passwordHash: superAdminPasswordHash,
      isSuperAdmin: true,
    },
  });

  await prisma.entidadeCertificadora.upsert({
    where: { cnpj: "12.345.678/0001-90" },
    update: {},
    create: {
      nome: "Instituto Brasileiro de Certificação Previdenciária",
      cnpj: "12.345.678/0001-90",
      email: "contato@ibcp-exemplo.com.br",
      telefone: "(61) 3333-4444",
      status: "ATIVA",
      dataCredenciamento: new Date("2023-03-15T00:00:00Z"),
      dataValidade: new Date("2028-03-15T00:00:00Z"),
      observacoes: "Dado de demonstração — substituir pelo cadastro real de entidades credenciadas pela SRPC.",
    },
  });

  // Exemplo pronto do Construtor de Documentos, pra o Admin Global já ter um caso real de
  // referência (e o time de piloto já conseguir testar) em vez de partir de uma tela vazia.
  // Não há chave natural aqui além do nome — upsert manual por findFirst/create.
  const jaExisteTipoExemplo = await prisma.construtorTipoDocumento.findFirst({
    where: { nome: "Mapeamento das Atividades das Áreas de Atuação do RPPS" },
  });
  if (!jaExisteTipoExemplo) {
    await prisma.construtorTipoDocumento.create({
      data: {
        nome: "Mapeamento das Atividades das Áreas de Atuação do RPPS",
        referenciaTipo: "PRO_GESTAO",
        acaoCodigo: "mapeamento-atividades-areas-atuacao",
        promptInstrucoes:
          "Monte o documento de Mapeamento das Atividades das Áreas de Atuação do RPPS. Para cada área/setor do " +
          "RPPS identificada nos relatórios enviados, liste: (1) o nome da área, (2) as atividades que ela executa, " +
          "(3) os processos ou rotinas descritos, e (4) eventuais responsáveis ou cargos mencionados. Organize o " +
          "resultado em uma seção por área, do jeito mais fiel possível ao que está escrito nos documentos — não " +
          "resuma a ponto de perder informação relevante para auditoria.",
        ativo: true,
        sortOrder: 0,
      },
    });
  }

  console.log("Seed concluído.");
  console.log("Login de demonstração (tenant): admin@valeverde.rpps.gov.br / demo1234");
  console.log("Login de demonstração (Super Admin): superadmin@regularpps.com.br / superadmin123");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
