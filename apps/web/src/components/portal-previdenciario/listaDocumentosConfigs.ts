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
};
