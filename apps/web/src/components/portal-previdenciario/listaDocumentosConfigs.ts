import type { RegistroTransparenciaApi } from "../../lib/api";
import type { ConfigListaDocumentos } from "./ListaDocumentosView";
import { dataIso, formatarDataIso, fraseSimples, lerValor, textoPuro, tituloAmigavel } from "../../lib/textos";

// Uma config por página "lista de documentos". A chave é o `codigo` do catálogo da API
// (apps/api/src/modules/transparencia-api/catalogo.ts). Os campos lidos de cada registro são os que a
// API Nexa realmente entrega para aquele endpoint.

function txt(r: RegistroTransparenciaApi, campo: string): string {
  const v = r[campo];
  return typeof v === "string" ? v.trim() : "";
}

// "dd/mm/aaaa" -> { ano, valor ordenável aaaammdd }
function dataBr(v: string): { ano: number; chave: number } | null {
  const m = v.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  return { ano: Number(m[3]), chave: Number(m[3]) * 10000 + Number(m[2]) * 100 + Number(m[1]) };
}

// "mm/aaaa" -> { ano, valor ordenável aaaamm }
function mesAno(v: string): { ano: number; chave: number } | null {
  const m = v.match(/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  return { ano: Number(m[2]), chave: Number(m[2]) * 100 + Number(m[1]) };
}

const MESES = ["JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"];

function anoNumero(r: RegistroTransparenciaApi): number | null {
  const n = Number(r.ano);
  return Number.isInteger(n) && n > 1900 && n < 2200 ? n : null;
}

// primeiro ano (20xx) que aparece num texto — "PLANO DE AÇÃO DE CAPACITAÇÃO 2026", "2024/2028"
function anoEm(v: string): number | null {
  const m = v.match(/(19|20)\d{2}/);
  return m ? Number(m[0]) : null;
}

function partes(...itens: string[]): string {
  return itens.map((i) => i.trim()).filter(Boolean).join(" · ");
}

export const CONFIGS_LISTA_DOCUMENTOS: Record<string, ConfigListaDocumentos> = {
  "acordaos-tce": {
    rotuloItens: "acórdãos",
    titulo: (r) => txt(r, "descricao"),
    ano: anoNumero,
    ordem: (r, i) => (anoNumero(r) ?? 0) * 1000 - i,
    links: [{ rotulo: "Abrir PDF", campo: "linkArquivo" }],
  },

  "atas-colegiados": {
    rotuloItens: "atas",
    titulo: (r) => `${txt(r, "titulo")} nº ${txt(r, "numero")}`.trim(),
    detalhe: (r) => txt(r, "data"),
    ano: (r) => dataBr(txt(r, "data"))?.ano ?? null,
    ordem: (r) => dataBr(txt(r, "data"))?.chave ?? 0,
    grupo: { rotulo: "Colegiado", rotuloPlural: "Colegiados", valor: (r) => txt(r, "colegiado") },
    links: [{ rotulo: "Abrir ata", campo: "linkArquivo" }],
  },

  "relatorio-investimentos": {
    rotuloItens: "relatórios",
    titulo: (r) => txt(r, "descricao"),
    detalhe: (r) => (txt(r, "periodo") ? `Período: ${txt(r, "periodo")}` : ""),
    ano: (r) => mesAno(txt(r, "periodo"))?.ano ?? null,
    ordem: (r) => mesAno(txt(r, "periodo"))?.chave ?? 0,
    grupo: { rotulo: "Tipo de documento", rotuloPlural: "Tipos de documento", valor: (r) => txt(r, "descricao") },
    links: [{ rotulo: "Abrir PDF", campo: "linkArquivo" }],
  },

  "relatorio-controle-interno": {
    rotuloItens: "relatórios",
    titulo: (r) => txt(r, "descricao"),
    detalhe: (r) =>
      [txt(r, "periodo"), txt(r, "aprovador") ? `Aprovado pelo ${txt(r, "aprovador")}` : "", txt(r, "instrumento") ? `em ${txt(r, "instrumento")}` : ""]
        .filter(Boolean)
        .join(" · "),
    ano: (r) => dataBr(txt(r, "instrumento"))?.ano ?? null,
    ordem: (r) => dataBr(txt(r, "instrumento"))?.chave ?? 0,
    links: [
      { rotulo: "Relatório", campo: "linkArquivo" },
      { rotulo: "Ata de aprovação", campo: "linkArquivo_ata" },
    ],
  },

  "demonstracoes-financeiras": {
    rotuloItens: "demonstrações",
    titulo: (r) => `${txt(r, "documento")} — ${txt(r, "periodo")}/${txt(r, "ano")}`,
    ano: anoNumero,
    ordem: (r) => (anoNumero(r) ?? 0) * 100 + (MESES.indexOf(txt(r, "periodo").toLocaleUpperCase("pt-BR")) + 1),
    grupo: { rotulo: "Tipo de demonstração", rotuloPlural: "Tipos de demonstração", valor: (r) => txt(r, "documento") },
    links: [{ rotulo: "Abrir PDF", campo: "linkArquivo" }],
  },

  "audiencia-publica": {
    rotuloItens: "audiências",
    titulo: (r) => `Audiência pública de ${txt(r, "data")}`,
    ano: (r) => dataBr(txt(r, "data"))?.ano ?? null,
    ordem: (r) => dataBr(txt(r, "data"))?.chave ?? 0,
    links: [
      { rotulo: "Abrir documento", campo: "linkArquivo" },
      { rotulo: "Ver link da audiência", campo: "link" },
    ],
  },

  "avaliacao-atuarial": {
    rotuloItens: "avaliações",
    titulo: (r) => `Avaliação atuarial ${txt(r, "ano")}`,
    detalhe: (r) => partes(txt(r, "colegiado") ? `Aprovada pelo ${txt(r, "colegiado")}` : "", txt(r, "instrumento"), txt(r, "data") ? `em ${txt(r, "data")}` : ""),
    ano: anoNumero,
    ordem: (r) => dataBr(txt(r, "data"))?.chave ?? (anoNumero(r) ?? 0) * 10000,
    links: [
      { rotulo: "Avaliação atuarial", campo: "linkArquivo" },
      { rotulo: "Ata de aprovação", campo: "linkArquivo_ata" },
    ],
  },

  "cartilha-previdenciaria": {
    rotuloItens: "cartilhas",
    titulo: (r) => txt(r, "descricao"),
    detalhe: (r) => (txt(r, "data") ? `Publicada em ${txt(r, "data")}` : ""),
    ano: (r) => dataBr(txt(r, "data"))?.ano ?? null,
    ordem: (r) => dataBr(txt(r, "data"))?.chave ?? 0,
    links: [{ rotulo: "Abrir cartilha", campo: "linkArquivo" }],
  },

  "certidoes-negativas": {
    rotuloItens: "certidões",
    titulo: (r) => txt(r, "certidao"),
    detalhe: (r) => (txt(r, "data_validade") ? `Validade: ${txt(r, "data_validade")}` : ""),
    ano: (r) => dataBr(txt(r, "data_validade"))?.ano ?? null,
    ordem: (r) => dataBr(txt(r, "data_validade"))?.chave ?? 0,
    grupo: { rotulo: "Tipo de certidão", rotuloPlural: "Tipos de certidão", valor: (r) => txt(r, "certidao") },
    links: [{ rotulo: "Abrir certidão", campo: "linkArquivo" }],
  },

  crp: {
    rotuloItens: "certificados",
    titulo: () => "Certificado de Regularidade Previdenciária (CRP)",
    detalhe: (r) => (txt(r, "data_validade") ? `Validade: ${txt(r, "data_validade")}` : ""),
    ano: (r) => dataBr(txt(r, "data_validade"))?.ano ?? null,
    ordem: (r) => dataBr(txt(r, "data_validade"))?.chave ?? 0,
    links: [{ rotulo: "Abrir certificado", campo: "linkArquivo" }],
  },

  "codigo-etica": {
    rotuloItens: "versões",
    titulo: () => "Código de Ética e Conduta",
    detalhe: (r) =>
      partes(
        txt(r, "elaboracao") ? `Elaboração: ${txt(r, "elaboracao")}` : "",
        txt(r, "aprovacao") ? `Aprovação: ${txt(r, "aprovacao")}${txt(r, "aprovador") ? ` (${txt(r, "aprovador")})` : ""}` : "",
        txt(r, "revisao") ? `Revisão: ${txt(r, "revisao")}` : "",
        txt(r, "instrumento"),
      ),
    ano: (r) => dataBr(txt(r, "aprovacao"))?.ano ?? null,
    ordem: (r) => dataBr(txt(r, "aprovacao"))?.chave ?? 0,
    links: [
      { rotulo: "Código de ética", campo: "linkArquivo" },
      { rotulo: "Ata de aprovação", campo: "linkArquivo_ata" },
    ],
  },

  "acoes-educacao": {
    rotuloItens: "planos",
    titulo: (r) => txt(r, "periodo"),
    detalhe: (r) => txt(r, "instrumento"),
    ano: (r) => anoEm(txt(r, "periodo")),
    ordem: (r, i) => (anoEm(txt(r, "periodo")) ?? 0) * 1000 - i,
    links: [
      { rotulo: "Abrir plano", campo: "linkArquivo" },
      { rotulo: "Ata de aprovação", campo: "linkArquivoAta" },
    ],
  },

  "cronograma-reunioes": {
    rotuloItens: "calendários",
    titulo: (r) => `Calendário de reuniões ${txt(r, "ano")}`,
    ano: anoNumero,
    ordem: (r, i) => (anoNumero(r) ?? 0) * 1000 - i,
    grupo: { rotulo: "Colegiado", rotuloPlural: "Colegiados", valor: (r) => txt(r, "colegiado") },
    links: [{ rotulo: "Abrir calendário", campo: "linkArquivo" }],
  },

  "limite-alcada": {
    rotuloItens: "documentos",
    titulo: (r) => txt(r, "tipo_documento"),
    detalhe: (r) => (txt(r, "data") ? `Data: ${txt(r, "data")}` : ""),
    ano: (r) => dataBr(txt(r, "data"))?.ano ?? null,
    ordem: (r) => dataBr(txt(r, "data"))?.chave ?? 0,
    grupo: { rotulo: "Tipo de documento", rotuloPlural: "Tipos de documento", valor: (r) => txt(r, "tipo_documento") },
    links: [{ rotulo: "Abrir documento", campo: "linkArquivo" }],
  },

  "planejamento-estrategico": {
    rotuloItens: "documentos",
    titulo: (r) => `${txt(r, "documento")} — ${txt(r, "periodo")}`,
    detalhe: (r) => txt(r, "instrumento"),
    ano: (r) => anoEm(txt(r, "periodo")),
    ordem: (r, i) => (anoEm(txt(r, "periodo")) ?? 0) * 1000 - i,
    grupo: { rotulo: "Documento", rotuloPlural: "Documentos", valor: (r) => txt(r, "documento") },
    links: [
      { rotulo: "Abrir documento", campo: "linkArquivo" },
      { rotulo: "Ata de aprovação", campo: "linkArquivoAta" },
    ],
  },

  "plano-acao-anual": {
    rotuloItens: "planos",
    titulo: (r) => txt(r, "descricao"),
    detalhe: (r) => partes(txt(r, "inicio") && txt(r, "fim") ? `Vigência: ${txt(r, "inicio")} a ${txt(r, "fim")}` : "", txt(r, "instrumento")),
    ano: (r) => dataBr(txt(r, "inicio"))?.ano ?? anoEm(txt(r, "descricao")),
    ordem: (r) => dataBr(txt(r, "inicio"))?.chave ?? 0,
    links: [
      { rotulo: "Abrir plano", campo: "linkArquivo" },
      { rotulo: "Ata de aprovação", campo: "linkArquivoAta" },
    ],
  },

  "politica-investimento": {
    rotuloItens: "políticas",
    titulo: (r) => `Política de investimentos ${txt(r, "ano")}`,
    detalhe: (r) => partes(txt(r, "colegiado") ? `Aprovada pelo ${txt(r, "colegiado")}` : "", txt(r, "instrumento"), txt(r, "data") ? `em ${txt(r, "data")}` : ""),
    ano: anoNumero,
    ordem: (r) => (anoNumero(r) ?? 0) * 10000 + (dataBr(txt(r, "data"))?.chave ?? 0) % 10000,
    links: [
      { rotulo: "Política de investimentos", campo: "linkArquivo" },
      { rotulo: "Ata de aprovação", campo: "linkArquivo_ata" },
    ],
  },

  "regimentos-internos": {
    rotuloItens: "regimentos",
    titulo: (r) => `Regimento interno — ${txt(r, "colegiado")}`,
    detalhe: (r) => partes(txt(r, "aprovador") ? `Aprovado pelo ${txt(r, "aprovador")}` : "", txt(r, "data") ? `em ${txt(r, "data")}` : "", txt(r, "ata_aprovacao")),
    ano: (r) => dataBr(txt(r, "data"))?.ano ?? null,
    ordem: (r) => dataBr(txt(r, "data"))?.chave ?? 0,
    grupo: { rotulo: "Colegiado", rotuloPlural: "Colegiados", valor: (r) => txt(r, "colegiado") },
    links: [
      { rotulo: "Abrir regimento", campo: "linkArquivo" },
      { rotulo: "Ata de aprovação", campo: "linkArquivo_Ata" },
    ],
  },

  "passivo-judicial": {
    rotuloItens: "relatórios",
    titulo: (r) => `Relatório de passivo judicial ${txt(r, "ano")}`,
    detalhe: (r) => partes(txt(r, "aprovador") ? `Aprovado pelo ${txt(r, "aprovador")}` : "", txt(r, "instrumento"), txt(r, "data") ? `em ${txt(r, "data")}` : ""),
    ano: anoNumero,
    ordem: (r) => dataBr(txt(r, "data"))?.chave ?? (anoNumero(r) ?? 0) * 10000,
    links: [
      { rotulo: "Abrir relatório", campo: "linkArquivo" },
      // o nome deste campo vem com erro de digitação da própria API (linkaAquivo_Ata)
      { rotulo: "Ata de aprovação", campo: "linkaAquivo_Ata" },
    ],
  },};


// ---------------------------------------------------------------------------------------------------------
// Dados abertos do portal de transparência do órgão (IPRES, Angraprev…): os campos aqui seguem a página
// /dadosabertos do próprio portal (Id, Numero, Data "aaaa-mm-dd", Descricao, Exercicio, Tipo, Url, LinkArquivo…).
// ---------------------------------------------------------------------------------------------------------

function exercicio(r: RegistroTransparenciaApi): number | null {
  const n = Number(txt(r, "Exercicio"));
  return Number.isInteger(n) && n > 1900 && n < 2200 ? n : null;
}

// ordem: data (aaaammdd) e, no empate, o código do portal (mais novo primeiro)
function ordemPorData(campo: string) {
  return (r: RegistroTransparenciaApi) => (dataIso(txt(r, campo))?.chave ?? 0) * 100000 + (Number(txt(r, "Id")) % 100000 || 0);
}

function data(r: RegistroTransparenciaApi, campo: string): string {
  const v = txt(r, campo);
  return v ? formatarDataIso(v) : "";
}

const PAGINA_NO_PORTAL = { rotulo: "Ver no portal", campo: "Url" };

export function configPublicacoes(porTipo: boolean): ConfigListaDocumentos {
  return {
    rotuloItens: "publicações",
    // publicação sem descrição cadastrada ainda precisa de um título legível
    titulo: (r) => txt(r, "Descricao") || `${tituloAmigavel(txt(r, "Tipo") || "Publicação")}${txt(r, "Numero") ? ` nº ${txt(r, "Numero")}` : ""}${exercicio(r) ? `/${exercicio(r)}` : ""}`,
    detalhe: (r) => partes(txt(r, "Numero") ? `Nº ${txt(r, "Numero")}` : "", data(r, "Data")),
    ano: (r) => exercicio(r) ?? dataIso(txt(r, "Data"))?.ano ?? null,
    ordem: ordemPorData("Data"),
    ...(porTipo ? {} : { grupo: { rotulo: "Tipo de publicação", rotuloPlural: "Tipos de publicação", valor: (r: RegistroTransparenciaApi) => tituloAmigavel(txt(r, "Tipo")) } }),
    links: [{ rotulo: "Abrir PDF", campo: "LinkArquivo" }],
  };
}

export const CONFIGS_PORTAL: Record<string, ConfigListaDocumentos> = {
  licitacoes: {
    rotuloItens: "licitações",
    titulo: (r) => txt(r, "Objeto"),
    detalhe: (r) =>
      partes(
        txt(r, "NumeroPrecesso") ? `Processo ${txt(r, "NumeroPrecesso")}` : "",
        txt(r, "NumeroEdital") ? `Edital ${txt(r, "NumeroEdital")}` : "",
        txt(r, "DataAbertura") ? `Abertura ${data(r, "DataAbertura")}` : "",
        txt(r, "Tipo"),
        txt(r, "Situacao"),
      ),
    ano: (r) => exercicio(r) ?? dataIso(txt(r, "DataAbertura"))?.ano ?? null,
    ordem: ordemPorData("DataAbertura"),
    grupo: { rotulo: "Modalidade", rotuloPlural: "Modalidades", valor: (r) => tituloAmigavel(txt(r, "Modalidade")) },
    valor: (r) => lerValor(txt(r, "ValorEstimado")),
    rotuloValor: "Valor estimado",
    links: [PAGINA_NO_PORTAL],
  },

  contratos: {
    rotuloItens: "contratos",
    titulo: (r) => `${txt(r, "NomeCredor") || "Credor não informado"} — ${txt(r, "Tipo") ? tituloAmigavel(txt(r, "Tipo")) : "Contrato"} nº ${txt(r, "NumeroContrato")}${txt(r, "Exercicio") ? `/${txt(r, "Exercicio")}` : ""}`,
    detalhe: (r) =>
      partes(
        txt(r, "VigenciaInicio") && txt(r, "VigenciaFim") ? `Vigência ${data(r, "VigenciaInicio")} a ${data(r, "VigenciaFim")}` : "",
        txt(r, "NumeroProcesso") ? `Processo ${txt(r, "NumeroProcesso")}` : "",
        txt(r, "Objeto"),
      ),
    ano: (r) => exercicio(r) ?? dataIso(txt(r, "DataContrato"))?.ano ?? null,
    ordem: ordemPorData("DataContrato"),
    grupo: { rotulo: "Modalidade", rotuloPlural: "Modalidades", valor: (r) => tituloAmigavel(txt(r, "Modalidade")) },
    valor: (r) => lerValor(txt(r, "ValorGlobal")),
    rotuloValor: "Valor global",
    links: [
      { rotulo: "Contrato (PDF)", campo: "Arquivo" },
      { rotulo: "Demais arquivos", campo: "DemaisArquivos" },
      PAGINA_NO_PORTAL,
    ],
  },

  leis: {
    rotuloItens: "normas",
    titulo: (r) => `${tituloAmigavel(txt(r, "Tipo") || "Norma")} nº ${txt(r, "Numero")}${exercicio(r) ? `/${exercicio(r)}` : ""}`,
    detalhe: (r) => partes(data(r, "Data"), txt(r, "Descricao")),
    ano: (r) => exercicio(r) ?? dataIso(txt(r, "Data"))?.ano ?? null,
    ordem: ordemPorData("Data"),
    grupo: { rotulo: "Tipo de norma", rotuloPlural: "Tipos de norma", valor: (r) => tituloAmigavel(txt(r, "Tipo")) },
    links: [{ rotulo: "Ver norma", campo: "Url" }],
  },

  portarias: {
    rotuloItens: "portarias",
    titulo: (r) => `Portaria nº ${txt(r, "Numero")}${exercicio(r) ? `/${exercicio(r)}` : ""} — ${tituloAmigavel(txt(r, "Nome"))}`,
    detalhe: (r) => partes(txt(r, "DescCargo") ? tituloAmigavel(txt(r, "DescCargo")) : "", data(r, "Data")),
    ano: (r) => exercicio(r) ?? dataIso(txt(r, "Data"))?.ano ?? null,
    ordem: ordemPorData("Data"),
    grupo: { rotulo: "Cargo", rotuloPlural: "Cargos", valor: (r) => tituloAmigavel(txt(r, "DescCargo")) },
    links: [{ rotulo: "Ver portaria", campo: "Url" }],
  },

  lrf: {
    rotuloItens: "demonstrativos",
    titulo: (r) => txt(r, "DescTipoArq"),
    detalhe: (r) => partes(data(r, "Data"), txt(r, "DescLei")),
    ano: (r) => exercicio(r) ?? dataIso(txt(r, "Data"))?.ano ?? null,
    ordem: ordemPorData("Data"),
    grupo: { rotulo: "Demonstrativo", rotuloPlural: "Demonstrativos", valor: (r) => txt(r, "DescLei") },
    links: [{ rotulo: "Ver demonstrativo", campo: "Url" }],
  },

  noticias: {
    rotuloItens: "notícias",
    titulo: (r) => txt(r, "Titulo"),
    detalhe: (r) => {
      const resumo = textoPuro(txt(r, "Resumo"));
      return partes(data(r, "Data"), resumo.length > 220 ? `${resumo.slice(0, 217)}…` : resumo);
    },
    ano: (r) => dataIso(txt(r, "Data"))?.ano ?? null,
    ordem: ordemPorData("Data"),
    grupo: { rotulo: "Categoria", rotuloPlural: "Categorias", valor: (r) => txt(r, "Categoria").replace(/^#/, "").trim() },
    links: [{ rotulo: "Ler no portal", campo: "Url" }],
  },

  conselhos: {
    rotuloItens: "órgãos",
    titulo: (r) => tituloAmigavel(txt(r, "Descricao")),
    detalhe: (r) => partes(txt(r, "Sigla"), txt(r, "Portaria") ? `Portaria ${txt(r, "Portaria")}` : "", data(r, "DataCriacao") ? `Criado em ${data(r, "DataCriacao")}` : ""),
    ano: (r) => dataIso(txt(r, "DataCriacao"))?.ano ?? null,
    ordem: (r, i) => (dataIso(txt(r, "DataCriacao"))?.chave ?? 0) - i,
    links: [],
  },

  "gestao-e-atendimento": {
    rotuloItens: "unidades",
    titulo: (r) => tituloAmigavel(txt(r, "Secretaria")),
    detalhe: (r) => partes(txt(r, "Gestor") ? `${tituloAmigavel(txt(r, "Gestor"))}${txt(r, "Cargo") ? ` — ${tituloAmigavel(txt(r, "Cargo"))}` : ""}` : "", fraseSimples(txt(r, "HorarioFunciona"))),
    ano: (r) => dataIso(txt(r, "DataInicio"))?.ano ?? null,
    ordem: (r, i) => (dataIso(txt(r, "DataInicio"))?.chave ?? 0) - i,
    links: [{ rotulo: "Ver no portal", campo: "Url" }],
  },

  "concursos-publicos": configConcurso("concursos"),
  "processos-seletivos": configConcurso("processos"),

  "servicos-online": {
    rotuloItens: "serviços",
    titulo: (r) => txt(r, "Titulo"),
    detalhe: (r) => txt(r, "Descricao"),
    ano: () => null,
    ordem: (_r, i) => -i,
    links: [{ rotulo: "Acessar", campo: "Link" }],
  },

  selos: {
    rotuloItens: "selos",
    titulo: (r) => txt(r, "DescSelo"),
    detalhe: (r) => textoPuro(txt(r, "Texto")).slice(0, 240),
    ano: () => null,
    ordem: (r, i) => Number(txt(r, "Id")) * -1 - i,
    links: [{ rotulo: "Ver selo", campo: "Url" }],
  },
};

function configConcurso(rotuloItens: string): ConfigListaDocumentos {
  return {
    rotuloItens,
    titulo: (r) => txt(r, "Descricao"),
    detalhe: (r) => partes(txt(r, "TipoArquivo") ? tituloAmigavel(txt(r, "TipoArquivo")) : "", txt(r, "Numero") ? `Nº ${txt(r, "Numero")}` : "", data(r, "Data")),
    ano: (r) => exercicio(r) ?? dataIso(txt(r, "Data"))?.ano ?? null,
    ordem: ordemPorData("Data"),
    grupo: { rotulo: "Tipo", rotuloPlural: "Tipos", valor: (r) => tituloAmigavel(txt(r, "TipoArquivo")) },
    links: [
      { rotulo: "Abrir arquivo", campo: "Link" },
      PAGINA_NO_PORTAL,
    ],
  };
}

// Entidades credenciadas no estilo BÁSICO (no estilo completo elas têm a página própria, EntidadesCredenciadasView).
export const CONFIG_ENTIDADES_BASICA: ConfigListaDocumentos = {
  rotuloItens: "instituições",
  titulo: (r) => txt(r, "instituicao"),
  detalhe: (r) =>
    partes(
      txt(r, "cnpj") ? `CNPJ ${txt(r, "cnpj")}` : "",
      txt(r, "credenciamento") ? `Credenciamento ${txt(r, "credenciamento")}` : "",
      txt(r, "renovacao") ? `Renovação ${txt(r, "renovacao")}` : "",
    ),
  ano: (r) => dataBr(txt(r, "renovacao"))?.ano ?? null,
  ordem: (r, i) => (dataBr(txt(r, "renovacao"))?.chave ?? 0) - i,
  grupo: { rotulo: "Tipo", rotuloPlural: "Tipos", valor: (r) => tituloAmigavel(txt(r, "tipo")) },
  links: [],
};

// Qual configuração de lista vale para um código de página (ou null se a página não é uma lista).
export function configDaLista(codigo: string): ConfigListaDocumentos | null {
  if (CONFIGS_LISTA_DOCUMENTOS[codigo]) return CONFIGS_LISTA_DOCUMENTOS[codigo];
  if (CONFIGS_PORTAL[codigo]) return CONFIGS_PORTAL[codigo];
  if (codigo === "publicacoes") return configPublicacoes(false);
  if (codigo.startsWith("pub-")) return configPublicacoes(true);
  return null;
}
