import { getToken, setToken } from "./api";

// Cliente HTTP e utilitários do Gerador de Portal da Transparência (Admin Global).
// Fica fora de `api.ts` porque precisa de multipart, download de blob e de um formato de erro
// próprio (`erro`, e não `error`, nas respostas do gerador).

const BASE = "/api/admin/transparencia-gerador";

export interface ClienteResumo {
  pasta: string;
  nome: string;
  atualizadoEm?: string;
  /** Link do portal original, quando foi cadastrado pelo link (e não criado no gerador). */
  externo?: string | null;
}

export interface ResumoLink {
  nome: string;
  itens: number;
  grupos: number;
  menu: number;
  api: string;
  logo: boolean;
  cores: boolean;
}

export interface ResultadoRenovacao {
  pasta: string;
  nome: string;
  ok: boolean;
  alterado: boolean;
  mudancas: string[];
  avisos: string[];
  erro?: string;
}

export interface GrupoApi {
  nome: string;
  itens: number;
}

export interface OrdemGrupo {
  nome: string;
  itens: string[];
}

export interface TesteTransparencia {
  ok: boolean;
  erro?: string;
  url?: string;
  total?: number;
  grupos?: GrupoApi[];
  dominioLinks?: string;
  paginaOficial?: string;
  ordem?: OrdemGrupo[];
}

export interface TesteMenu {
  ok: boolean;
  erro?: string;
  url?: string;
  total?: number;
  itens?: string[];
}

export interface SugestaoItem {
  grupo: string;
  rotulo: string;
  descricao: string;
  icone: string;
  criterio: string;
  exigencia: string;
  fundamentacao: string;
  classificacao: string;
  atendido: boolean;
  parecido: string;
  grupoAtual: string;
}

export interface Catalogo {
  id: string;
  sigla: string;
  fonte: string;
  total: number;
  atendidos: number;
  itens: SugestaoItem[];
  recursos: number;
}

export interface ItemExtra {
  Ref: string;
  Grupo: string;
  Descricao: string;
  Link: string;
  MaisInformacoes: string;
  NomeImagem: string;
  Amparo: string;
  Fonte: string;
}

// config.json do portal — estrutura aberta (o modelo PHP acrescenta chaves próprias).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ConfigPortal = Record<string, any>;

export interface ClienteCarregado {
  config: ConfigPortal;
  logoDataUrl: string | null;
  iconeDataUrl: string | null;
}

export interface ResultadoGerar {
  ok: boolean;
  erro?: string;
  pasta?: string;
  novo?: boolean;
  avisos?: string[];
}

async function chamar<T>(path: string, init: RequestInit = {}, jsonBody = true): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = { ...(init.headers as Record<string, string> | undefined) };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (jsonBody && init.body && !(init.body instanceof FormData)) headers["Content-Type"] = "application/json";
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  const refreshed = res.headers.get("X-Refreshed-Token");
  if (refreshed) setToken(refreshed);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // /gerar devolve {ok:false, erro} com 400 — o chamador trata como resultado, não como exceção
    if (data && typeof data === "object" && "ok" in data) return data as T;
    throw new Error(data.erro ?? data.error ?? "Erro inesperado ao comunicar com o servidor.");
  }
  return data as T;
}

export const geradorApi = {
  listarClientes: () => chamar<ClienteResumo[]>("/clientes"),
  carregarCliente: (pasta: string) => chamar<ClienteCarregado>(`/clientes/${encodeURIComponent(pasta)}`),
  testarTransparencia: (url: string) =>
    chamar<TesteTransparencia>(`/testar?d=transparencia&url=${encodeURIComponent(url)}`),
  testarMenu: (url: string) => chamar<TesteMenu>(`/testar?d=menu&url=${encodeURIComponent(url)}`),
  sugestoes: (url: string, pasta: string) =>
    chamar<{ ok: boolean; itensApi: number; catalogos: Catalogo[] }>(
      `/sugestoes?url=${encodeURIComponent(url)}${pasta ? `&pasta=${encodeURIComponent(pasta)}` : ""}`,
    ),
  icones: () => chamar<{ svg: string; ids: string[] }>("/icones"),
  gerar: (dados: unknown, logo: File | null, icone: File | null) => {
    const fd = new FormData();
    fd.append("dados", JSON.stringify(dados));
    if (logo) fd.append("logo", logo);
    if (icone) fd.append("icone", icone);
    return chamar<ResultadoGerar>("/gerar", { method: "POST", body: fd });
  },
  // Cadastra um portal que já existe fora do gerador só pelo link (o servidor lê página, logo, cores, dados e API).
  importarLink: (url: string, pasta?: string) =>
    chamar<ResultadoGerar & { resumo: ResumoLink }>("/importar-link", { method: "POST", body: JSON.stringify({ url, pasta: pasta || undefined }) }),
  // Cadastra um portal novo só com as APIs de dados abertos; nome, logo e cores vêm do site do órgão.
  importarApis: (d: { urlTransparencia: string; urlMenu?: string; pasta?: string; nome?: string; site?: string }) =>
    chamar<ResultadoGerar & { resumo: ResumoLink }>("/importar-apis", { method: "POST", body: JSON.stringify(d) }),
  // Consulta de novo a origem do portal (link ou APIs) e atualiza dados, identidade e modelo.
  renovar: (pasta: string) => chamar<ResultadoRenovacao>(`/clientes/${encodeURIComponent(pasta)}/renovar`, { method: "POST" }),
  renovarTodos: () => chamar<{ ok: boolean; resultados: ResultadoRenovacao[] }>("/renovar-todos", { method: "POST" }),
  // Link público de visualização do portal gerado (a barra final é necessária para os links relativos do portal)
  urlVisualizacao: (pasta: string) => `${window.location.origin}/api/public/transparencia-portal/${encodeURIComponent(pasta)}/`,
  excluir: (pasta: string) => chamar<{ ok: boolean }>(`/clientes/${encodeURIComponent(pasta)}`, { method: "DELETE" }),

  async baixarZip(pasta: string): Promise<void> {
    const token = getToken();
    const res = await fetch(`${BASE}/clientes/${encodeURIComponent(pasta)}/zip`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.erro ?? data.error ?? "Não foi possível baixar o ZIP.");
    }
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = `portal-${pasta}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  },
};

/* ---------- texto ---------- */

export function chave(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function slug(s: string): string {
  return chave(s)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/* ---------- cores (mesma matemática do config.php do modelo) ---------- */

function hexToRgb(h: string): [number, number, number] {
  const x = h.replace("#", "");
  return [parseInt(x.slice(0, 2), 16), parseInt(x.slice(2, 4), 16), parseInt(x.slice(4, 6), 16)];
}

function rgbToHex(c: number[]): string {
  return (
    "#" +
    c.map((v) => ("0" + Math.round(Math.max(0, Math.min(255, v))).toString(16)).slice(-2)).join("")
  );
}

/** t > 0 clareia (mistura com branco), t < 0 escurece. */
export function mix(hex: string, t: number): string {
  return rgbToHex(hexToRgb(hex).map((v) => (t >= 0 ? v + (255 - v) * t : v * (1 + t))));
}

function lum(hex: string): number {
  const c = hexToRgb(hex).map((v) => {
    const n = v / 255;
    return n <= 0.03928 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

export function contrasteBranco(hex: string): number {
  return 1.05 / (lum(hex) + 0.05);
}

/** Escurece até o texto branco ficar legível (contraste mínimo 4,5:1). */
export function paraTextoBranco(hex: string): string {
  let h = hex;
  let i = 0;
  while (contrasteBranco(h) < 4.5 && i++ < 30) h = mix(h, -0.06);
  return h;
}

function hsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let s = 0;
  let h = 0;
  if (d) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}

function distanciaMatiz(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

export interface CorLogo {
  hex: string;
  n: number;
  h: number;
  s: number;
  l: number;
  score: number;
}

/** Lê a logo num canvas e agrupa os pixels em cores dominantes (ignora fundo branco/transparente e cinzas). */
export function extrairPaleta(img: HTMLImageElement): CorLogo[] {
  const W = 80;
  const ratio = img.naturalHeight / img.naturalWidth || 1;
  const H = Math.max(1, Math.round(W * ratio));
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext("2d");
  if (!ctx) return [];
  ctx.drawImage(img, 0, 0, W, H);
  let px: Uint8ClampedArray;
  try {
    px = ctx.getImageData(0, 0, W, H).data;
  } catch {
    return [];
  }
  type Balde = { r: number; g: number; b: number; n: number };
  const buckets: Record<string, Balde> = {};
  const neutral: Record<string, Balde> = {};
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 160) continue;
    const r = px[i];
    const g = px[i + 1];
    const b = px[i + 2];
    const c = hsl(r, g, b);
    if (c[2] > 0.93) continue;
    const alvo = c[1] < 0.2 || c[2] < 0.1 ? neutral : buckets;
    const k = `${r >> 5},${g >> 5},${b >> 5}`;
    const bk = alvo[k] ?? (alvo[k] = { r: 0, g: 0, b: 0, n: 0 });
    bk.r += r;
    bk.g += g;
    bk.b += b;
    bk.n++;
  }
  const paraLista = (src: Record<string, Balde>): CorLogo[] =>
    Object.values(src)
      .map((b) => {
        const hex = rgbToHex([b.r / b.n, b.g / b.n, b.b / b.n]);
        const c = hsl(b.r / b.n, b.g / b.n, b.b / b.n);
        return { hex, n: b.n, h: c[0], s: c[1], l: c[2], score: b.n * (0.4 + c[1]) };
      })
      .sort((a, b) => b.score - a.score);
  let lista = paraLista(buckets);
  if (!lista.length) lista = paraLista(neutral);
  const out: CorLogo[] = [];
  for (const c of lista) {
    if (out.length >= 6) break;
    const perto = out.some((o) => {
      const a = hexToRgb(o.hex);
      const b = hexToRgb(c.hex);
      return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 60;
    });
    if (!perto) out.push(c);
  }
  return out;
}

/** Escolhe menu e destaque a partir da paleta da logo (mesma regra do gerador original). */
export function escolherCores(pal: CorLogo[]): { primaria: string; destaque: string } | null {
  if (!pal.length) return null;
  const relevantes = pal.filter((c) => c.n >= pal[0].n * 0.15);
  let main = relevantes.slice().sort((a, b) => contrasteBranco(b.hex) - contrasteBranco(a.hex))[0];
  if (contrasteBranco(main.hex) < 2.5) main = pal[0];
  const accent = pal.filter((c) => c !== main && c.s > 0.25 && distanciaMatiz(c.h, main.h) > 35)[0];
  return { primaria: paraTextoBranco(main.hex), destaque: accent ? accent.hex : mix(main.hex, 0.45) };
}

export function carregarImagem(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Imagem inválida."));
    img.src = src;
  });
}
