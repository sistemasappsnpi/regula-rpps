const TOKEN_KEY = "regula-rpps.token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`/api${path}`, { ...options, headers });

  // Refresh rotativo do access_token do APP CENTRAL numa ação sensível (ver
  // requireFreshPermissions.ts, no backend) — o JWT local reemitido substitui o salvo, senão a
  // PRÓXIMA ação sensível falharia com refresh_token já consumido.
  const refreshedToken = res.headers.get("X-Refreshed-Token");
  if (refreshedToken) setToken(refreshedToken);

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error ?? "Erro inesperado ao comunicar com o servidor.");
  }

  return data as T;
}

export const api = {
  ssoProviders: () => request<{ central: boolean; microsoft: boolean; govbr: boolean }>("/auth/providers"),

  me: () =>
    request<{
      user: { id: string; name: string; email: string };
      tenant: Tenant | null;
      isSuperAdmin: boolean;
      features: string[];
    }>("/auth/me"),

  listCrpCriteria: () => request<{ criteria: CrpCriterion[] }>("/crp"),

  crpSummary: () =>
    request<{ total: number; regular: number; irregular: number; pendente: number; nextDueAt: string | null }>(
      "/crp/summary",
    ),

  updateCrpCriterion: (criterionId: string, patch: Partial<Pick<TenantCrpStatus, "status" | "notes">>) =>
    request<TenantCrpStatus>(`/crp/${criterionId}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),

  listProGestaoAcoes: () => request<{ acoes: ProGestaoAcao[] }>("/pro-gestao"),

  proGestaoResumo: () => request<ProGestaoResumo>("/pro-gestao/resumo"),

  setNivelAtual: (acaoCodigo: string, nivel: Nivel | null) =>
    request<unknown>(`/pro-gestao/${acaoCodigo}/nivel`, { method: "PATCH", body: JSON.stringify({ nivel }) }),

  setCampoValor: (campoDbId: string, valor: string) =>
    request<CampoValor>(`/pro-gestao/campos/${campoDbId}/valor`, { method: "PUT", body: JSON.stringify({ valor }) }),

  campoHistorico: (campoDbId: string) =>
    request<{ historico: CampoValor[] }>(`/pro-gestao/campos/${campoDbId}/historico`),

  prontidaoDeFontes: (acaoCodigo: string) =>
    request<{ prontidao: FonteReadiness[] }>(`/pro-gestao/${acaoCodigo}/prontidao`),

  getDocumentoComposto: (acaoCodigo: string) =>
    request<{ composto: DocumentoComposto | null }>(`/pro-gestao/${acaoCodigo}/composto`),

  gerarRascunho: (acaoCodigo: string) =>
    request<{ composto: DocumentoComposto; itens: ItemComposto[]; geradoSemIa: boolean; fontesPendentes: FonteReadiness[] }>(
      `/pro-gestao/${acaoCodigo}/rascunho`,
      { method: "POST" },
    ),

  aprovarRascunho: (acaoCodigo: string) =>
    request<DocumentoComposto>(`/pro-gestao/${acaoCodigo}/rascunho/aprovar`, { method: "POST" }),

  auditoria: () => request<Auditoria>("/pro-gestao/auditoria"),

  async uploadPdf(acaoCodigo: string, file: File): Promise<UploadResultado> {
    const token = getToken();
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch(`/api/uploads/acao/${acaoCodigo}`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: formData,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "Erro ao enviar PDF.");
    return data as UploadResultado;
  },

  listUploads: (acaoCodigo: string) => request<{ uploads: Upload[] }>(`/uploads/acao/${acaoCodigo}`),

  listUploadsProGestaoTodos: () => request<{ uploads: (Upload & { acaoCodigo: string })[] }>("/uploads/acao"),

  revisarSugestao: (sugestaoId: string, status: "APROVADA" | "REJEITADA" | "CORRIGIDA", valorFinal?: string) =>
    request<SugestaoExtraida>(`/uploads/sugestoes/${sugestaoId}`, {
      method: "PATCH",
      body: JSON.stringify({ status, valorFinal }),
    }),

  deleteUpload: (uploadId: string) => request<unknown>(`/uploads/${uploadId}`, { method: "DELETE" }),

  async uploadPdfCriterio(criterionCode: string, file: File, descricao?: string): Promise<{ documento: CriterioDocumento }> {
    const token = getToken();
    const formData = new FormData();
    formData.append("file", file);
    if (descricao) formData.append("descricao", descricao);

    const res = await fetch(`/api/uploads/criterio/${criterionCode}`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: formData,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "Erro ao enviar documento.");
    return data;
  },

  listUploadsCriterio: (criterionCode: string) =>
    request<{ documentos: CriterioDocumento[] }>(`/uploads/criterio/${criterionCode}`),

  listUploadsCriterioTodos: () =>
    request<{ documentos: (CriterioDocumento & { criterionCode: string })[] }>("/uploads/criterio"),

  transparenciaPublica: async (slug: string): Promise<TransparenciaPublica> => {
    const res = await fetch(`/api/public/transparencia/${slug}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "Página de transparência indisponível.");
    return data as TransparenciaPublica;
  },

  portalPrevidenciario: async (slug: string): Promise<PortalPrevidenciario> => {
    const res = await fetch(`/api/public/portal-previdenciario/${slug}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "Portal Previdenciário indisponível.");
    return data as PortalPrevidenciario;
  },

  // --- Admin Global: Documentos Personalizados (tipo documental do Construtor + checklist) -

  adminListDocumentosPersonalizados: () => request<{ documentos: AdminDocumentoPersonalizado[] }>("/admin/documentos-personalizados"),

  adminCreateDocumentoPersonalizado: (input: {
    nome: string;
    descricao: string | null;
    promptInstrucoes: string | null;
    modoExtracaoIA: ModoExtracaoIA;
  }) => request<AdminDocumentoPersonalizado>("/admin/documentos-personalizados", { method: "POST", body: JSON.stringify(input) }),

  adminUpdateDocumentoPersonalizado: (
    id: string,
    patch: Partial<{ nome: string; descricao: string | null; promptInstrucoes: string | null; modoExtracaoIA: ModoExtracaoIA; ativo: boolean }>,
  ) => request<AdminDocumentoPersonalizado>(`/admin/documentos-personalizados/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),

  adminDeleteDocumentoPersonalizado: (id: string) => request<unknown>(`/admin/documentos-personalizados/${id}`, { method: "DELETE" }),

  // Checklist de campos pra IA — sem subcampo é escalar, com 1+ subcampos vira um grupo repetível.
  adminAddCampoChecklist: (documentoId: string, input: { nome: string; tipo: PortalIndicadorTipo; unidade: string | null }) =>
    request<AdminPortalIndicador>(`/admin/documentos-personalizados/${documentoId}/campos`, {
      method: "POST",
      body: JSON.stringify(input),
    }),

  adminUpdateCampoChecklist: (
    documentoId: string,
    campoId: string,
    patch: Partial<{ nome: string; tipo: PortalIndicadorTipo; unidade: string | null }>,
  ) =>
    request<AdminPortalIndicador>(`/admin/documentos-personalizados/${documentoId}/campos/${campoId}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),

  adminRemoveCampoChecklist: (documentoId: string, campoId: string) =>
    request<unknown>(`/admin/documentos-personalizados/${documentoId}/campos/${campoId}`, { method: "DELETE" }),

  adminAddSubcampoChecklist: (
    documentoId: string,
    campoId: string,
    input: { nome: string; tipo: PortalIndicadorTipo; unidade: string | null },
  ) =>
    request<AdminPortalIndicadorSubcampo>(`/admin/documentos-personalizados/${documentoId}/campos/${campoId}/subcampos`, {
      method: "POST",
      body: JSON.stringify(input),
    }),

  adminUpdateSubcampoChecklist: (
    documentoId: string,
    campoId: string,
    subcampoId: string,
    patch: Partial<{ nome: string; tipo: PortalIndicadorTipo; unidade: string | null }>,
  ) =>
    request<AdminPortalIndicadorSubcampo>(`/admin/documentos-personalizados/${documentoId}/campos/${campoId}/subcampos/${subcampoId}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),

  adminRemoveSubcampoChecklist: (documentoId: string, campoId: string, subcampoId: string) =>
    request<unknown>(`/admin/documentos-personalizados/${documentoId}/campos/${campoId}/subcampos/${subcampoId}`, { method: "DELETE" }),

  // A partir de um PDF de exemplo, a IA propõe os campos (e subcampos) do checklist — já entram
  // criados no catálogo, prontos pra revisar/editar/apagar na mesma lista de sempre.
  async adminSugerirChecklistDePdf(documentoId: string, file: File): Promise<AdminDocumentoPersonalizado> {
    const token = getToken();
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch(`/api/admin/documentos-personalizados/${documentoId}/campos/sugerir-de-pdf`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: formData,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "Erro ao analisar o PDF de exemplo.");
    return data;
  },

  // --- Admin Global: Portal Previdenciário (catálogo de indicadores) ----------------------

  adminListPortalDocumentos: () => request<{ documentos: AdminPortalDocumento[] }>("/admin/portal-documentos"),

  adminCreatePortalDocumento: (input: {
    nome: string;
    descricao: string | null;
    indicadores: { nome: string; tipo: PortalIndicadorTipo; unidade: string | null }[];
  }) => request<AdminPortalDocumento>("/admin/portal-documentos", { method: "POST", body: JSON.stringify(input) }),

  adminUpdatePortalDocumento: (id: string, patch: Partial<{ nome: string; descricao: string | null; ativo: boolean }>) =>
    request<AdminPortalDocumento>(`/admin/portal-documentos/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),

  adminDeletePortalDocumento: (id: string) => request<unknown>(`/admin/portal-documentos/${id}`, { method: "DELETE" }),

  adminAddIndicadorPortalDocumento: (
    documentoId: string,
    input: { nome: string; tipo: PortalIndicadorTipo; unidade: string | null },
  ) =>
    request<AdminPortalIndicador>(`/admin/portal-documentos/${documentoId}/indicadores`, {
      method: "POST",
      body: JSON.stringify(input),
    }),

  adminUpdateIndicadorPortalDocumento: (
    documentoId: string,
    indicadorId: string,
    patch: Partial<{ nome: string; tipo: PortalIndicadorTipo; unidade: string | null }>,
  ) =>
    request<AdminPortalIndicador>(`/admin/portal-documentos/${documentoId}/indicadores/${indicadorId}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),

  adminRemoveIndicadorPortalDocumento: (documentoId: string, indicadorId: string) =>
    request<unknown>(`/admin/portal-documentos/${documentoId}/indicadores/${indicadorId}`, { method: "DELETE" }),

  // --- Portal Previdenciário (tenant: lançamento manual de indicadores) -------------------

  listPortalIndicadoresCatalogo: () => request<{ documentos: PortalDocumentoCatalogo[] }>("/portal-indicadores"),

  indicadorHistorico: (indicadorId: string) =>
    request<{ historico: PortalIndicadorValor[] }>(`/portal-indicadores/${indicadorId}/historico`),

  setIndicadorValor: (indicadorId: string, competencia: string, valor: string) =>
    request<PortalIndicadorValor>(`/portal-indicadores/${indicadorId}/valor`, {
      method: "PUT",
      body: JSON.stringify({ competencia, valor }),
    }),

  revisarIndicadorSugestao: (
    sugestaoId: string,
    status: "APROVADA" | "REJEITADA" | "CORRIGIDA",
    valorFinal?: string,
    competenciaFinal?: string,
  ) =>
    request<IndicadorSugestao>(`/construtor/indicador-sugestoes/${sugestaoId}`, {
      method: "PATCH",
      body: JSON.stringify({ status, valorFinal, competenciaFinal }),
    }),

  // Adiciona manualmente uma ocorrência em branco pra um indicador com subcampos (ex.: a IA achou
  // 8 membros de comitê mas o documento tem 9) — nasce PENDENTE, encontrado=false.
  criarIndicadorSugestao: (execucaoId: string, indicadorId: string, competencia: string) =>
    request<IndicadorSugestao>(`/construtor/execucoes/${execucaoId}/indicador-sugestoes`, {
      method: "POST",
      body: JSON.stringify({ indicadorId, competencia }),
    }),

  portalPrevidenciarioIndicadores: async (slug: string): Promise<PortalIndicadoresPublico> => {
    const res = await fetch(`/api/public/portal-previdenciario/${slug}/indicadores`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "Indicadores do Portal Previdenciário indisponíveis.");
    return data as PortalIndicadoresPublico;
  },

  portalPrevidenciarioDocumento: async (slug: string, codigo: string): Promise<{ documento: PortalDocumentoPublicoDetalhe }> => {
    const res = await fetch(`/api/public/portal-previdenciario/${slug}/documentos/${codigo}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "Documento não encontrado.");
    return data as { documento: PortalDocumentoPublicoDetalhe };
  },

  // --- Admin Global (Super Admin da plataforma) -----------------------------------------

  adminListTenants: () => request<{ tenants: AdminTenant[] }>("/admin/tenants"),

  adminCreateTenant: (input: { tenantName: string; federatedEntity: string; seguradosCount: number; plan: Tenant["plan"] }) =>
    request<Tenant>("/admin/tenants", { method: "POST", body: JSON.stringify(input) }),

  adminUpdateTenant: (
    id: string,
    patch: Partial<{
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
      plan: Tenant["plan"];
      nivelProGestaoAlvo: Nivel | null;
    }>,
  ) => request<Tenant>(`/admin/tenants/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),

  adminDeleteTenant: (id: string) => request<unknown>(`/admin/tenants/${id}`, { method: "DELETE" }),

  adminGetTenantPermissoes: (tenantId: string) =>
    request<{ permissoes: TenantPermissao[] }>(`/admin/tenants/${tenantId}/permissoes`),

  adminSetTenantPermissao: (tenantId: string, featureKey: string, enabled: boolean | null) =>
    request<{ permissoes: TenantPermissao[] }>(`/admin/tenants/${tenantId}/permissoes/${featureKey}`, {
      method: "PATCH",
      body: JSON.stringify({ enabled }),
    }),

  // Vínculos (Membership) de um RPPS — só pra Microsoft/gov.br (login central auto-vincula pelo
  // client_code, nunca passa por aqui, ver central-sso.routes.ts). Não cria usuário: a conta
  // precisa já existir (algum login SSO anterior).
  adminCreateMembership: (tenantId: string, email: string) =>
    request<unknown>(`/admin/tenants/${tenantId}/membros`, { method: "POST", body: JSON.stringify({ email }) }),

  adminRemoveMembership: (tenantId: string, membershipId: string) =>
    request<unknown>(`/admin/tenants/${tenantId}/membros/${membershipId}`, { method: "DELETE" }),

  adminSetUsuarioAtivo: (tenantId: string, userId: string, ativo: boolean) =>
    request<unknown>(`/admin/tenants/${tenantId}/membros/${userId}/ativo`, { method: "PATCH", body: JSON.stringify({ ativo }) }),

  adminListEntidades: () => request<{ entidades: EntidadeCertificadora[] }>("/admin/entidades-certificadoras"),

  adminCreateEntidade: (input: Omit<EntidadeCertificadora, "id" | "createdAt" | "updatedAt">) =>
    request<EntidadeCertificadora>("/admin/entidades-certificadoras", { method: "POST", body: JSON.stringify(input) }),

  adminUpdateEntidade: (id: string, input: Partial<Omit<EntidadeCertificadora, "id" | "createdAt" | "updatedAt">>) =>
    request<EntidadeCertificadora>(`/admin/entidades-certificadoras/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),

  adminDeleteEntidade: (id: string) =>
    request<unknown>(`/admin/entidades-certificadoras/${id}`, { method: "DELETE" }),

  // --- Construtor de Documentos -----------------------------------------------------------

  listConstrutorTipos: () => request<{ tipos: ConstrutorTipoResumo[] }>("/construtor/tipos"),

  async uploadDocumentoConstrutor(file: File): Promise<{ documento: Upload }> {
    const token = getToken();
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch(`/api/uploads/construtor`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: formData,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "Erro ao enviar documento.");
    return data;
  },

  gerarDocumentoConstrutor: (tipoDocumentoId: string, documentoUploadIds: string[]) =>
    request<ConstrutorExecucao>("/construtor/gerar", {
      method: "POST",
      body: JSON.stringify({ tipoDocumentoId, documentoUploadIds }),
    }),

  listConstrutorExecucoes: () => request<{ execucoes: ConstrutorExecucao[] }>("/construtor/execucoes"),

  aprovarConstrutorExecucao: (id: string) =>
    request<ConstrutorExecucao>(`/construtor/execucoes/${id}/aprovar`, { method: "POST" }),

  aprovarTodosIndicadoresConstrutor: (id: string) =>
    request<ConstrutorExecucao>(`/construtor/execucoes/${id}/aprovar-todos-indicadores`, { method: "POST" }),

  excluirConstrutorExecucao: (id: string) =>
    request<unknown>(`/construtor/execucoes/${id}`, { method: "DELETE" }),

  // --- Admin Global: Construtor de Documentos (tipos / prompts de IA) --------------------

  adminListConstrutorCatalogoAcoes: () =>
    request<{ acoes: { codigo: string; numero: string; nome: string }[] }>("/admin/construtor-catalogo/pro-gestao-acoes"),

  adminListConstrutorCatalogoCriterios: () =>
    request<{ criterios: { code: string; title: string }[] }>("/admin/construtor-catalogo/crp-criterios"),

  adminListConstrutorTipos: () => request<{ tipos: AdminConstrutorTipo[] }>("/admin/construtor-tipos"),

  adminSincronizarConstrutorTipos: () =>
    request<{ criados: number }>("/admin/construtor-tipos/sincronizar-pro-gestao", { method: "POST" }),

  adminCreateConstrutorTipo: (input: {
    nome: string;
    referenciaTipo: "PRO_GESTAO" | "CRP" | "LIVRE";
    acaoCodigo?: string | null;
    criterionCode?: string | null;
    promptInstrucoes: string;
    ativo: boolean;
  }) => request<AdminConstrutorTipo>("/admin/construtor-tipos", { method: "POST", body: JSON.stringify(input) }),

  adminUpdateConstrutorTipo: (
    id: string,
    patch: Partial<{
      nome: string;
      referenciaTipo: "PRO_GESTAO" | "CRP" | "LIVRE";
      acaoCodigo: string | null;
      criterionCode: string | null;
      promptInstrucoes: string;
      ativo: boolean;
    }>,
  ) => request<AdminConstrutorTipo>(`/admin/construtor-tipos/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),

  adminDeleteConstrutorTipo: (id: string) => request<unknown>(`/admin/construtor-tipos/${id}`, { method: "DELETE" }),

  // --- Auditoria cross-tenant e Relatórios (Admin Global) --------------------------------

  adminListAuditoriaGlobal: (limit: number) =>
    request<{ eventos: EventoAuditoriaGlobal[]; limit: number; limiteMaximo: number }>(`/admin/auditoria?limit=${limit}`),

  adminRelatorioRppsClientes: (limit: number) =>
    request<{ linhas: RelatorioRppsCliente[]; limit: number; limiteMaximo: number }>(
      `/admin/relatorios/rpps-clientes?limit=${limit}`,
    ),

  adminRelatorioConstrutorUso: (limit: number) =>
    request<{ linhas: RelatorioConstrutorUso[]; limit: number; limiteMaximo: number }>(
      `/admin/relatorios/construtor-uso?limit=${limit}`,
    ),
};

export interface EventoAuditoriaGlobal {
  quando: string;
  tipo: "CAMPO_PREENCHIDO" | "UPLOAD" | "DOCUMENTO_COMPOSTO" | "CONSTRUTOR_EXECUCAO";
  tenantId: string;
  tenantNome: string;
  autor: string | null;
  descricao: string;
}

export interface RelatorioRppsCliente {
  id: string;
  name: string;
  federatedEntity: string;
  plan: Tenant["plan"];
  nivelProGestaoAlvo: Nivel | null;
  seguradosCount: number;
  totalUsuarios: number;
  crpRegular: number;
  crpTotal: number;
  createdAt: string;
}

export interface RelatorioConstrutorUso {
  id: string;
  tenantNome: string;
  tipoDocumentoNome: string;
  status: "RASCUNHO" | "APROVADO" | "DESATUALIZADO";
  geradoEm: string;
  aprovadoEm: string | null;
}

export interface TenantPermissao {
  key: string;
  nome: string;
  descricao: string;
  grupo: string;
  padraoDoPlano: boolean;
  override: boolean | null;
  efetivo: boolean;
}

export interface AdminTenant {
  id: string;
  name: string;
  slug: string;
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
  plan: Tenant["plan"];
  nivelProGestaoAlvo: Nivel | null;
  seguradosCount: number;
  createdAt: string;
  membros: {
    membershipId: string;
    userId: string;
    name: string;
    email: string;
    telefone: string | null;
    ativo: boolean;
    lastLoginAt: string | null;
  }[];
  crpRegular: number;
  crpTotal: number;
}

export interface EntidadeCertificadora {
  id: string;
  nome: string;
  cnpj: string;
  email: string | null;
  telefone: string | null;
  status: "ATIVA" | "SUSPENSA" | "CANCELADA";
  dataCredenciamento: string;
  dataValidade: string | null;
  observacoes: string | null;
  createdAt: string;
  updatedAt: string;
}

export type Nivel = "I" | "II" | "III" | "IV";

export interface CampoValor {
  id: string;
  valor: string;
  origem: "MANUAL" | "PDF_EXTRACTION" | "AI_COMPOSED";
  origemDetalhe: string | null;
  createdAt: string;
  criadoPor?: { id?: string; name: string };
}

export interface ProGestaoCampo {
  id: string;
  campoId: string;
  descricao: string;
  nivelMinimo: Nivel;
  quantidadeMinima: string | null;
  periodicidade: string | null;
  substituiCampoId: string | null;
  valorAtual: CampoValor | null;
}

export interface ProGestaoAcao {
  id: string;
  codigo: string;
  numero: string;
  nome: string;
  dimensao: string;
  essencial: boolean;
  objetivo: string;
  nivelAtual: Nivel | null;
  campos: ProGestaoCampo[];
  dependeDe: { fonteCodigo: string; fonteNome: string; tipoRelacao: string }[];
}

export interface ProGestaoResumo {
  porDimensao: { dimensao: string; totalAcoes: number; acoesComNivelAlcancado: number }[];
  contagemPorNivel: Record<Nivel, number>;
  metas: Record<Nivel, number>;
  faltamPorNivel: Record<Nivel, number>;
}

export interface FonteReadiness {
  fonteCodigo: string;
  fonteNome: string;
  tipoRelacao: string;
  satisfeita: boolean;
  camposFaltando: string[];
}

export interface ItemComposto {
  descricao: string;
  valor: string;
  fonteAcaoCodigo: string;
  fonteCampoId: string;
}

export interface DocumentoComposto {
  id: string;
  status: "RASCUNHO" | "APROVADO" | "DESATUALIZADO";
  conteudo: ItemComposto[];
  geradoEm: string;
  aprovadoEm: string | null;
}

export interface SugestaoExtraida {
  id: string;
  campoId: string;
  valorSugerido: string;
  paginaOrigem: number | null;
  trechoOrigem: string | null;
  status: "PENDENTE" | "APROVADA" | "REJEITADA" | "CORRIGIDA";
  valorFinal: string | null;
}

export interface Upload {
  id: string;
  nomeArquivo: string;
  status: "PENDENTE" | "EXTRAIDO" | "ERRO";
  createdAt: string;
  sugestoes: SugestaoExtraida[];
}

export interface CriterioDocumento {
  id: string;
  nomeArquivo: string;
  descricao: string | null;
  status: "PENDENTE" | "EXTRAIDO" | "ERRO";
  createdAt: string;
}

export interface UploadResultado {
  upload: Upload;
  sugestoes: SugestaoExtraida[];
  aiConfigured: boolean;
  erroExtracao?: string;
}

export interface Auditoria {
  campoValores: (CampoValor & { campo: { campoId: string; descricao: string; acao: { nome: string } } })[];
  uploads: (Upload & { uploadedBy: { name: string; email: string } })[];
  compostos: { acaoCodigo: string; status: string; geradoEm: string; aprovadoEm: string | null }[];
}

export interface ConstrutorTipoResumo {
  id: string;
  nome: string;
  referenciaTipo: "PRO_GESTAO" | "CRP" | "LIVRE" | "PERSONALIZADO" | "PORTAL_PREVIDENCIARIO";
  referenciaNome: string | null;
}

export interface AdminConstrutorTipo {
  id: string;
  nome: string;
  referenciaTipo: "PRO_GESTAO" | "CRP" | "LIVRE";
  acaoCodigo: string | null;
  criterionCode: string | null;
  promptInstrucoes: string;
  ativo: boolean;
  acao: { nome: string } | null;
  criterion: { title: string } | null;
}

export interface ConstrutorCitacao {
  trecho: string;
  documentoNome: string;
  paginaOrigem: number | null;
}

export interface ConstrutorExecucao {
  id: string;
  status: "RASCUNHO" | "APROVADO" | "DESATUALIZADO";
  conteudo: string;
  citacoes: ConstrutorCitacao[];
  geradoEm: string;
  aprovadoEm: string | null;
  tipoDocumento: { id: string; nome: string; referenciaTipo: ConstrutorTipoResumo["referenciaTipo"] };
  documentos: { id: string; nomeArquivo: string }[];
  indicadorSugestoes: IndicadorSugestao[];
}

export interface PortalTenantInfo {
  name: string;
  federatedEntity: string;
  cnpj: string | null;
  site: string | null;
  enderecoPublico: string | null;
  telefonePublico: string | null;
  emailPublico: string | null;
}

export interface PortalMenuSecao {
  label: string;
  itens: { label: string; href: string }[];
}

export interface TransparenciaPublica {
  tenant: PortalTenantInfo;
  publicadoEm: string;
  itens: ItemComposto[];
  menu: PortalMenuSecao[];
}

export interface PortalPrevidenciarioMenuItem {
  id: string;
  nome: string;
  pagina: string;
  novaPag: string;
  itens: PortalPrevidenciarioMenuItem[];
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

export interface PortalPrevidenciario {
  tenant: { name: string; federatedEntity: string; slug: string; logoUrl: string | null; corPrimaria: string | null };
  menu: PortalPrevidenciarioMenuItem[] | null;
  menuConfigurado: boolean;
  rodape: PortalPrevidenciarioRodape | null;
  rodapeConfigurado: boolean;
  sincronizadoEm: string;
}

export type ModoExtracaoIA = "COMENTARIO_APENAS" | "CHECKLIST_APENAS" | "AMBOS";

export type PortalIndicadorTipo = "NUMERICO" | "MOEDA" | "TEXTO" | "DATA";

export interface AdminPortalIndicadorSubcampo {
  id: string;
  subcampoId: string;
  nome: string;
  tipo: PortalIndicadorTipo;
  unidade: string | null;
  sortOrder: number;
}

// Sem subcampo: campo escalar (comportamento de sempre). Com 1+ subcampos: vira um grupo
// repetível — ver comentário no schema.prisma (PortalIndicador.subcampos). Opcional porque nem
// toda consulta desse tipo inclui subcampos (ex.: catálogo geral do Portal Previdenciário).
export interface AdminPortalIndicador {
  id: string;
  indicadorId: string;
  nome: string;
  tipo: PortalIndicadorTipo;
  unidade: string | null;
  subcampos?: AdminPortalIndicadorSubcampo[];
}

export interface AdminPortalDocumento {
  id: string;
  codigo: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
  indicadores: AdminPortalIndicador[];
}

export interface AdminDocumentoPersonalizado {
  id: string;
  codigo: string;
  nome: string;
  descricao: string | null;
  promptInstrucoes: string | null;
  modoExtracaoIA: ModoExtracaoIA;
  ativo: boolean;
  // Checklist de campos pra IA mora no PortalDocumento espelhado — null enquanto o espelho ainda
  // não foi criado (não deveria acontecer na prática, o sync roda logo após criar o documento).
  portalDocumento: AdminPortalDocumento | null;
}

export interface PortalIndicadorValor {
  id: string;
  indicadorId: string;
  competencia: string;
  valor: string;
  origem: "MANUAL" | "PDF_EXTRACTION" | "AI_COMPOSED";
  origemDetalhe: string | null;
  createdAt: string;
  criadoPor: { id: string; name: string };
}

export interface PortalIndicadorCatalogo {
  id: string;
  indicadorId: string;
  nome: string;
  tipo: PortalIndicadorTipo;
  unidade: string | null;
  valoresAtuais: PortalIndicadorValor[];
}

export interface PortalDocumentoCatalogo {
  id: string;
  codigo: string;
  nome: string;
  descricao: string | null;
  indicadores: PortalIndicadorCatalogo[];
}

export interface IndicadorSugestao {
  id: string;
  indicadorId: string;
  competencia: string;
  // false = campo do checklist que a IA não achou no PDF — nasce com valorSugerido="" esperando
  // preenchimento manual (ver ConstrutorPage.tsx). Se nunca for preenchido/aprovado, some do Portal.
  encontrado: boolean;
  // Escalar: texto simples. Indicador com subcampos: JSON {subcampoId: valor} — uma sugestão por
  // OCORRÊNCIA (ex.: uma por membro de comitê).
  valorSugerido: string;
  valorFinal: string | null;
  documentoNomeOrigem: string;
  paginaOrigem: number | null;
  trechoOrigem: string | null;
  status: "PENDENTE" | "APROVADA" | "REJEITADA" | "CORRIGIDA";
  indicador?: {
    id: string;
    nome: string;
    tipo: PortalIndicadorTipo;
    unidade: string | null;
    subcampos: AdminPortalIndicadorSubcampo[];
  };
}

export interface PortalIndicadorPublicoValor {
  competencia: string;
  valor: string;
  origem: "MANUAL" | "PDF_EXTRACTION" | "AI_COMPOSED";
  documentoUploadId: string | null;
  documentoUploadNome: string | null;
}

export interface PortalIndicadorInstanciaPublica {
  id: string;
  competencia: string;
  documentoUploadId: string | null;
  documentoUploadNome: string | null;
  subcampoValores: { subcampoId: string; nome: string; valor: string }[];
}

export interface PortalIndicadorPublico {
  id: string;
  nome: string;
  tipo: PortalIndicadorTipo;
  unidade: string | null;
  // Indicador escalar: só `valores`. Indicador com subcampos (grupo): `valores` fica vazio,
  // `subcampos`/`instancias` vêm preenchidos — uma instância por ocorrência (ex.: uma por membro
  // de comitê), todas as ativas da competência aparecem, não só a mais recente.
  valores: PortalIndicadorPublicoValor[];
  subcampos?: { subcampoId: string; nome: string; tipo: PortalIndicadorTipo; unidade: string | null }[];
  instancias?: PortalIndicadorInstanciaPublica[];
}

export interface PortalDocumentoPublico {
  id: string;
  nome: string;
  indicadores: PortalIndicadorPublico[];
}

export interface PortalIndicadoresPublico {
  documentos: PortalDocumentoPublico[];
}

export interface PortalDocumentoPublicoDetalhe extends PortalDocumentoPublico {
  codigo: string;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  federatedEntity: string;
  logoUrl: string | null;
  plan: "ESSENCIAL" | "GESTAO" | "PERFORMANCE";
  seguradosCount: number;
  nivelProGestaoAlvo: Nivel | null;
}

export interface TenantCrpStatus {
  id: string;
  tenantId: string;
  criterionId: string;
  status: "REGULAR" | "IRREGULAR" | "PENDENTE";
  lastSentAt: string | null;
  nextDueAt: string | null;
  notes: string | null;
}

export interface CrpCriterion {
  id: string;
  code: string;
  category: string;
  title: string;
  description: string;
  legalBasis: string;
  periodicity: string;
  formaVerificacao: string;
  sistemaOrigem: string;
  dependsOnCode: string | null;
  dependsOn: { code: string; title: string } | null;
  effectiveStatus: "REGULAR" | "IRREGULAR" | "PENDENTE";
  cascadeBlocked: boolean;
  tenantStatuses: TenantCrpStatus[];
}
