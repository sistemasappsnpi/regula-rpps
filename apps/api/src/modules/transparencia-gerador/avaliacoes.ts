// Avaliações ("essa informação foi útil?") dos portais publicados. Os votos ficam na hospedagem PHP de cada
// cliente (dados/feedback_data.json); o Regula lê pelo feedback_dados.php do pacote, protegido por um token.
// O token e a senha do painel (admin.php) não ficam no banco: saem de um HMAC da pasta com o JWT_SECRET,
// então são os mesmos em todo ZIP gerado do portal e não mudam entre deploys.

import crypto from "node:crypto";
import { prisma } from "../../db/prisma";
import { env } from "../../config/env";
import { HttpError } from "../../middleware/errorHandler";
import { fetchComStatus } from "./http";
import { slug } from "./gerador.service";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Cfg = Record<string, any>;

const derivar = (pasta: string, finalidade: string, tamanho: number) =>
  crypto.createHmac("sha256", env.jwtSecret).update(`portal-${finalidade}:${slug(pasta)}`).digest("hex").slice(0, tamanho);

export const tokenFeedback = (pasta: string) => derivar(pasta, "feedback", 40);
export const senhaPainel = (pasta: string) => derivar(pasta, "painel", 20);
export const USUARIO_PAINEL = "admin";

/** Conteúdo do segredo.php que vai no ZIP (só hexadecimal: não há o que escapar). */
export function segredoPhp(pasta: string): string {
  return (
    "<?php\n// Acesso do painel (admin.php) e leitura de avaliações pelo Regula. Gerado pelo Regula: não publique em repositório.\n" +
    `return array('usuario' => '${USUARIO_PAINEL}', 'senha' => '${senhaPainel(pasta)}', 'token' => '${tokenFeedback(pasta)}');\n`
  );
}

/** Pasta onde o portal está publicado (seo.url), terminada em "/". Vazio se não informada. */
export function urlPublicada(config: Cfg): string {
  const url = String(config.seo?.url ?? "").trim();
  if (!/^https?:\/\//i.test(url)) return "";
  try {
    const u = new URL(url);
    u.hash = "";
    u.search = "";
    if (/\.\w{2,5}$/.test(u.pathname)) u.pathname = u.pathname.replace(/[^/]*$/, ""); // .../index.php -> .../
    if (!u.pathname.endsWith("/")) u.pathname += "/";
    return u.toString();
  } catch {
    return "";
  }
}

export async function dadosDeAcesso(pastaEntrada: string) {
  const pasta = slug(pastaEntrada);
  const p = await prisma.transparenciaPortal.findUnique({ where: { pasta } });
  if (!p) throw new HttpError(404, "Cliente não encontrado.");
  const url = urlPublicada(p.config as Cfg);
  return {
    urlPublicada: url,
    painel: url ? `${url}admin.php` : "",
    usuario: USUARIO_PAINEL,
    senha: senhaPainel(pasta),
    externo: !!(p.config as Cfg)?.externo?.url,
  };
}

export interface LinhaAvaliacao {
  grupo: string;
  up: number;
  down: number;
  total: number;
  /** % de "sim"; null sem votos. */
  pct: number | null;
}

export type ResultadoAvaliacoes =
  | { ok: true; url: string; atualizadoEm: string | null; linhas: LinhaAvaliacao[]; up: number; down: number }
  | { ok: false; motivo: "sem-url" | "externo" | "sem-arquivo" | "token" | "sem-resposta" | "invalido"; erro: string };

/** Ordena como o admin.php: pior aprovação primeiro, depois a mais votada; sem votos por último. */
export function montarLinhas(votos: Record<string, { up?: number; down?: number }>): LinhaAvaliacao[] {
  const linhas = Object.entries(votos).map(([grupo, v]) => {
    const up = Math.max(0, Number(v?.up) || 0);
    const down = Math.max(0, Number(v?.down) || 0);
    const total = up + down;
    return { grupo, up, down, total, pct: total ? Math.round((up / total) * 100) : null };
  });
  return linhas.sort((a, b) => {
    if (a.pct === b.pct) return b.total - a.total;
    if (a.pct === null) return 1;
    if (b.pct === null) return -1;
    return a.pct - b.pct;
  });
}

export async function lerAvaliacoes(pastaEntrada: string): Promise<ResultadoAvaliacoes> {
  const pasta = slug(pastaEntrada);
  const p = await prisma.transparenciaPortal.findUnique({ where: { pasta } });
  if (!p) throw new HttpError(404, "Cliente não encontrado.");
  const config = p.config as Cfg;
  const base = urlPublicada(config);
  if (!base) {
    return config.externo?.url
      ? { ok: false, motivo: "externo", erro: "Este portal foi cadastrado pelo link e não usa o pacote do gerador: as avaliações ficam no servidor dele." }
      : { ok: false, motivo: "sem-url", erro: "Informe o endereço onde o portal está publicado (campo “Endereço público do portal”, em Textos, SEO e recursos) e salve o portal." };
  }
  const r = await fetchComStatus(`${base}feedback_dados.php`, { "X-Portal-Token": tokenFeedback(pasta) });
  if (!r) return { ok: false, motivo: "sem-resposta", erro: `Não consegui falar com ${base}. O portal está no ar e com HTTPS válido?` };
  if (r.status === 404) {
    return { ok: false, motivo: "sem-arquivo", erro: "O portal publicado ainda não tem o feedback_dados.php. Baixe o ZIP atualizado e publique de novo (pode manter a pasta dados/)." };
  }
  if (r.status === 403) {
    return { ok: false, motivo: "token", erro: "O portal recusou o token: o segredo.php publicado é de outra versão. Publique o ZIP atual (inclui o segredo.php)." };
  }
  let corpo: { ok?: boolean; votos?: Record<string, { up?: number; down?: number }>; atualizadoEm?: string | null };
  try {
    corpo = JSON.parse(r.texto);
  } catch {
    return { ok: false, motivo: "invalido", erro: "A resposta do portal não é válida (o endereço publicado está certo?)." };
  }
  if (!corpo?.ok || typeof corpo.votos !== "object" || corpo.votos === null || Array.isArray(corpo.votos)) {
    return { ok: false, motivo: "invalido", erro: "A resposta do portal não é válida." };
  }
  const linhas = montarLinhas(corpo.votos);
  return {
    ok: true, url: base, atualizadoEm: corpo.atualizadoEm ?? null, linhas,
    up: linhas.reduce((s, l) => s + l.up, 0), down: linhas.reduce((s, l) => s + l.down, 0),
  };
}
