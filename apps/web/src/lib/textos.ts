// Formatação de texto/data/valor dos dados vindos das APIs de transparência (Nexa e portal do órgão).

const SIGLAS = new Set(["dipr", "dair", "dpin", "apr", "tce", "crp", "alm", "draa", "lrf", "rpps", "cadprev", "cnpj", "ug", "rgf", "rreo", "ppa", "ldo", "loa", "pca", "ti", "ipres", "cmn", "cvm", "rj", "cpf", "iss", "pdf"]);
const LIGACAO = new Set(["de", "da", "do", "das", "dos", "e", "a", "o", "as", "os", "em", "para", "por", "com", "no", "na", "nos", "nas", "ao", "aos"]);

// "DEMONSTRATIVO DE INFORMAÇÕES PREVIDENCIÁRIAS E REPASSES" -> "Demonstrativo de Informações Previdenciárias e Repasses"
export function tituloAmigavel(texto: string): string {
  return texto
    .trim()
    .toLocaleLowerCase("pt-BR")
    .split(/\s+/)
    .map((p, i) => {
      if (SIGLAS.has(p)) return p.toLocaleUpperCase("pt-BR");
      if (i > 0 && LIGACAO.has(p)) return p;
      return p.charAt(0).toLocaleUpperCase("pt-BR") + p.slice(1);
    })
    .join(" ");
}

// "SEGUNDA-FEIRA À SEXTA-FEIRA, DAS 09 HORAS ÀS 17 HORAS" -> "Segunda-feira à sexta-feira, das 09 horas às 17 horas"
export function fraseSimples(texto: string): string {
  const t = texto.trim().toLocaleLowerCase("pt-BR");
  return t.charAt(0).toLocaleUpperCase("pt-BR") + t.slice(1);
}

// HTML do portal (notícias vêm com <FONT>, <P>, <BR>…) -> texto corrido
export function textoPuro(html: string): string {
  return html
    .replace(/<\s*br\s*\/?>/gi, " ")
    .replace(/<\/p\s*>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

// "2026-10-14" -> { ano: 2026, chave: 20261014 }
export function dataIso(v: string): { ano: number; chave: number } | null {
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return { ano: Number(m[1]), chave: Number(m[1]) * 10000 + Number(m[2]) * 100 + Number(m[3]) };
}

// "2026-10-14" -> "14/10/2026"; qualquer outra coisa volta como veio
// O campo "e-mail" do rodapé dos órgãos às vezes traz o endereço do webmail ("https://webmail.órgão…"), não um e-mail:
// vira link normal, com o domínio como texto, em vez de um "mailto:https://…" que não abre nada.
export function contatoDoRodape(valor: string): { href: string; texto: string } {
  const v = valor.trim();
  if (/^https?:\/\//i.test(v)) {
    try {
      return { href: v, texto: new URL(v).hostname.replace(/^www\./, "") };
    } catch {
      return { href: v, texto: v };
    }
  }
  return { href: `mailto:${v}`, texto: v };
}

export function formatarDataIso(v: string): string {
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : v;
}

// "10.575,66" (pt-BR) e "23600.00" (ponto decimal) -> número; vazio/ilegível -> null
export function lerValor(v: string): number | null {
  const s = v.trim();
  if (!s) return null;
  const limpo = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  const n = Number(limpo.replace(/[^\d.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

export function formatarMoeda(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// versão curta para eixos e cartões: 1,2 mi · 340 mil
export function formatarMoedaCompacta(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `R$ ${(n / 1_000_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} bi`;
  if (abs >= 1_000_000) return `R$ ${(n / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (abs >= 1_000) return `R$ ${(n / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil`;
  return formatarMoeda(n);
}

// Nomes dos campos das APIs -> rótulo legível (tudo o que não estiver aqui vira "Palavras Separadas")
const ROTULOS: Record<string, string> = {
  id: "Código no portal",
  numero: "Número",
  numerocontrato: "Nº do contrato",
  numeroprecesso: "Nº do processo",
  numeroedital: "Nº do edital",
  numeroprocesso: "Nº do processo",
  data: "Data",
  dataabertura: "Data de abertura",
  datacontrato: "Data do contrato",
  datacriacao: "Data de criação",
  datainicio: "Início",
  datafim: "Fim",
  descricao: "Descrição",
  exercicio: "Exercício",
  tipo: "Tipo",
  tipoarquivo: "Tipo de arquivo",
  linkarquivo: "Arquivo",
  link: "Link",
  url: "Página no portal",
  objeto: "Objeto",
  modalidade: "Modalidade",
  situacao: "Situação",
  valorestimado: "Valor estimado",
  valorglobal: "Valor global",
  valormensal: "Valor mensal",
  nomecredor: "Credor",
  cnpjcpf: "CNPJ/CPF",
  cnpj: "CNPJ",
  vigenciainicio: "Início da vigência",
  vigenciafim: "Fim da vigência",
  secretaria: "Órgão",
  contratovinculado: "Contrato vinculado",
  arquivo: "Arquivo do contrato",
  demaisarquivos: "Demais arquivos",
  desctipoarq: "Tipo de demonstrativo",
  desclei: "Referência legal",
  desccargo: "Cargo",
  nome: "Nome",
  titulo: "Título",
  resumo: "Resumo",
  categoria: "Categoria",
  capa: "Imagem de capa",
  capaurl: "Link da capa",
  sigla: "Sigla",
  portaria: "Portaria",
  gestor: "Gestor",
  cargo: "Cargo",
  email: "E-mail",
  telefone1: "Telefone",
  telefone2: "Telefone 2",
  ramalsec: "Ramal",
  horariofunciona: "Horário de funcionamento",
  rua: "Rua",
  bairro: "Bairro",
  cep: "CEP",
  complemento: "Complemento",
  fotosecretario: "Foto",
  apresentacao: "Apresentação",
  missao: "Missão",
  visao: "Visão",
  valores: "Valores",
  proposito: "Propósito",
  maps: "Mapa",
  grupo: "Grupo",
  caracteristica: "Característica",
  descselo: "Selo",
  seloimagem: "Imagem do selo",
  texto: "Texto",
  explicativo: "Explicação",
  objetivo: "Objetivo",
  nomeimagem: "Imagem",
  formato: "Formato",
  // API Nexa
  ano: "Ano",
  colegiado: "Colegiado",
  instrumento: "Instrumento",
  aprovador: "Aprovador",
  aprovacao: "Aprovação",
  elaboracao: "Elaboração",
  revisao: "Revisão",
  periodo: "Período",
  documento: "Documento",
  certidao: "Certidão",
  data_validade: "Validade",
  tipo_documento: "Tipo de documento",
  instituicao: "Instituição",
  credenciamento: "Credenciamento",
  renovacao: "Renovação",
  contratado: "Contratado",
  processo: "Processo",
  linkarquivo_ata: "Ata",
  linkarquivoata: "Ata",
  linkaaquivo_ata: "Ata",
  ata_aprovacao: "Ata de aprovação",
  inicio: "Início",
  fim: "Fim",
};

export function rotuloDoCampo(campo: string): string {
  const k = campo.toLowerCase();
  if (ROTULOS[k]) return ROTULOS[k];
  // "NumeroContrato" / "numero_contrato" -> "Numero Contrato"
  return campo
    .replace(/_/g, " ")
    .replace(/([a-zà-ú])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (c) => c.toLocaleUpperCase("pt-BR"));
}
