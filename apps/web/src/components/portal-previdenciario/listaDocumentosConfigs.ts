import type { RegistroTransparenciaApi } from "../../lib/api";
import type { ConfigListaDocumentos } from "./ListaDocumentosView";

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
