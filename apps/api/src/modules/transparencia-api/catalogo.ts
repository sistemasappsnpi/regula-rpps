// Catálogo dos endpoints da API Nexa de Transparência (Manual da API – Transparência, mar/2026).
// `codigo` é o que aparece na URL pública (/portal-previdenciario/:slug/:codigo) e a chave dos
// registros copiados no banco (TransparenciaApiRegistro.endpoint).
//
// Ficam de fora os 3 endpoints que, em 2026-10-15, respondiam HTTP 500 no servidor da Nexa
// (LicitacoesContratos, PoliticaSegurancaInformacao e RelatorioGovernancaCorporativa) — entram aqui
// quando a Nexa corrigir.

export const NEXA_BASE_URL = "https://sistema.nexasolucoes.com.br/transparencia";

export interface EndpointTransparenciaApi {
  codigo: string;
  titulo: string;
  // caminho depois de /transparencia/ (nem todos seguem o prefixo "Get": ver DemonstracoesFinanceirasContabeis)
  caminho: string;
}

export const CATALOGO_TRANSPARENCIA_API: EndpointTransparenciaApi[] = [
  { codigo: "acordaos-tce", titulo: "Acórdãos TCE", caminho: "api/AcordaosTce/GetAcordaosTce" },
  { codigo: "atas-colegiados", titulo: "Atas dos colegiados", caminho: "api/AtasDosColegiados/GetAtasDosColegiados" },
  { codigo: "audiencia-publica", titulo: "Audiência pública", caminho: "api/AudienciaPublica/GetAudienciaPublica" },
  { codigo: "avaliacao-atuarial", titulo: "Avaliação atuarial anual", caminho: "api/AvaliacaoAtuarialAnual/GetAvaliacaoAtuarialAnual" },
  { codigo: "cartilha-previdenciaria", titulo: "Cartilha previdenciária", caminho: "api/CartilhaPrevidenciaria/GetCartilhaPrevidenciaria" },
  { codigo: "certidoes-negativas", titulo: "Certidões negativas de tributos", caminho: "api/CertidaoNegativaTributos/GetCertidaoNegativaTributos" },
  { codigo: "crp", titulo: "Certificado de Regularidade Previdenciária", caminho: "api/CertidaoRegularidadePrevidenciaria/GetCertidaoRegularidadePrevidenciaria" },
  { codigo: "codigo-etica", titulo: "Código de ética e conduta", caminho: "api/CodigoEticaConduta/GetCodigoEticaConduta" },
  { codigo: "acoes-educacao", titulo: "Cronograma de ações de educação previdenciária", caminho: "api/CronogramaAcoesEducacao/GetCronogramaAcoesEducacao" },
  { codigo: "cronograma-reunioes", titulo: "Calendário de reuniões dos colegiados", caminho: "api/CronogramaReunioesColegiados/GetCronogramaReunioesColegiados" },
  { codigo: "limite-alcada", titulo: "Limites de alçada", caminho: "api/DefinicaoLimiteAlcada/GetDefinicaoLimiteAlcada" },
  { codigo: "demonstracoes-financeiras", titulo: "Demonstrações financeiras e contábeis", caminho: "api/DemonstracoesFinanceirasContabeis/DemonstracoesFinanceirasContabeis" },
  { codigo: "entidades-credenciadas", titulo: "Entidades de investimento credenciadas", caminho: "api/EntidadeInvestimentoCredenciada/GetEntidadeInvestimentoCredenciada" },
  { codigo: "planejamento-estrategico", titulo: "Planejamento estratégico", caminho: "api/PlanejamentoEstrategico/GetPlanejamentoEstrategico" },
  { codigo: "plano-acao-anual", titulo: "Plano de ação anual", caminho: "api/PlanoAcaoAnual/GetPlanoAcaoAnual" },
  { codigo: "politica-investimento", titulo: "Política de investimentos", caminho: "api/PoliticaInvestimento/GetPoliticaInvestimento" },
  { codigo: "regimentos-internos", titulo: "Regimentos internos dos colegiados", caminho: "api/RegimentosInternosColegiados/GetRegimentosInternosColegiados" },
  { codigo: "relatorio-controle-interno", titulo: "Relatórios de controle interno", caminho: "api/RelatorioControleInterno/GetRelatorioControleInterno" },
  { codigo: "relatorio-investimentos", titulo: "Relatório mensal/anual de investimentos", caminho: "api/RelatorioMensalAnualInvestimento/GetRelatorioMensalAnualInvestimento" },
  { codigo: "passivo-judicial", titulo: "Relatório de passivo judicial", caminho: "api/RelatorioPassivoJudicial/GetRelatorioPassivoJudicial" },
];

export function endpointPorCodigo(codigo: string): EndpointTransparenciaApi | undefined {
  return CATALOGO_TRANSPARENCIA_API.find((e) => e.codigo === codigo);
}
