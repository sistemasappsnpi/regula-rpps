// Link de visualização do portal gerado: serve, direto do Regula, o mesmo portal que o ZIP publica.
// O pacote real é PHP; aqui só index.php, proxy.php, manifest.php e feedback.php são reescritos em TypeScript
// (mesma saída, ver o teste de paridade); assets, ícones e sw.js saem do próprio modelo e os dados, do banco.

import { Router, type Response } from "express";
import { prisma } from "../../db/prisma";
import { apiUrlDe, baixarJson, lerArquivoModelo, slug } from "./gerador.service";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Cfg = Record<string, any>;

/* ---------- config.php ---------- */

const h = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");

// "vazio" do PHP: false, 0, "", "0", null e lista vazia
const ok = (v: unknown): boolean => !(v === undefined || v === null || v === false || v === 0 || v === "" || v === "0" || (Array.isArray(v) && v.length === 0));

function cfgDe(config: Cfg) {
  return (caminho: string, padrao: unknown = null): any => {
    let no: any = config;
    for (const k of caminho.split(".")) {
      if (no === null || typeof no !== "object" || !(k in no)) return padrao;
      no = no[k];
    }
    return no === null || no === "" ? padrao : no;
  };
}

function mixColor(hex: string, t: number): string {
  let c = hex.replace(/^#/, "");
  if (c.length === 3) c = [...c].map((x) => x + x).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(c)) return "#000000";
  let out = "#";
  for (const par of c.match(/../g)!) {
    let v = parseInt(par, 16);
    v = t >= 0 ? v + (255 - v) * t : v * (1 + t);
    out += Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0");
  }
  return out;
}

export function coresDoPortal(config: Cfg): Record<string, string> {
  const cfg = cfgDe(config);
  const p = cfg("cores.primaria", "#107078");
  const a = cfg("cores.destaque", "#98c810");
  return {
    primary: p,
    "primary-dark": cfg("cores.primariaEscura", mixColor(p, -0.32)),
    "primary-soft": cfg("cores.primariaSuave", mixColor(p, 0.86)),
    accent: a,
    "accent-strong": cfg("cores.destaqueForte", mixColor(a, -0.44)),
    "sidebar-bg": cfg("cores.lateral", mixColor(p, 0.92)),
    "sidebar-item": cfg("cores.lateralItem", mixColor(p, 0.86)),
    "footer-bg": cfg("cores.rodape", cfg("cores.primariaEscura", mixColor(p, -0.32))),
  };
}

/* ---------- index.php ---------- */

// tipo da imagem pela extensão (o navegador ignora o favicon se o type não bate com o arquivo)
function mimeDaImagem(nome: string): string {
  return /\.svg$/i.test(nome) ? "image/svg+xml" : /\.jpe?g$/i.test(nome) ? "image/jpeg" : /\.webp$/i.test(nome) ? "image/webp" : /\.gif$/i.test(nome) ? "image/gif" : "image/png";
}
const REDES_ICONES: Record<string, string> = { youtube: "i-youtube", x: "i-x", twitter: "i-x", instagram: "i-instagram", facebook: "i-facebook" };
const REDES_NOMES: Record<string, string> = { youtube: "YouTube", x: "X (Twitter)", twitter: "X (Twitter)", instagram: "Instagram", facebook: "Facebook" };

export function renderIndex(config: Cfg, opcoes: { versao: string; sprite: string; previa?: boolean }): string {
  const cfg = cfgDe(config);
  const nome = cfg("cliente.nome", "Portal");
  const nomeCompleto = cfg("cliente.nomeCompleto", nome);
  const logo = cfg("cliente.logo", "logo.png");
  const icone = cfg("cliente.icone", logo);
  const site = cfg("cliente.site", "#");
  const urlPortal = cfg("seo.url", "");
  const descricao = cfg("seo.descricao", `Portal da Transparência do ${nome} — contas públicas, licitações, folha de pagamento, atas, relatórios e dados abertos, conforme a Lei de Acesso à Informação.`);
  const titulo = cfg("textos.titulo", "Acesso à Informação");
  const colors = coresDoPortal(config);
  const mimeIcone = mimeDaImagem(icone);
const absIcon = ok(urlPortal) ? String(urlPortal).replace(/\/+$/, "") + "/" + icone : icone;

  const redesCfg = cfg("cliente.redes", []);
  const redes = (Array.isArray(redesCfg) ? redesCfg : Object.values(redesCfg ?? {})).filter((r: any) => ok(r?.url));

  const contatos: string[][][] = [[], []];
  if (ok(cfg("cliente.cnpj"))) contatos[0].push(["i-card", h("CNPJ: " + cfg("cliente.cnpj"))]);
  if (ok(cfg("cliente.endereco"))) contatos[0].push(["i-pin", h(cfg("cliente.endereco"))]);
  if (ok(cfg("cliente.telefone"))) contatos[1].push(["i-phone", h(cfg("cliente.telefone"))]);
  if (ok(cfg("cliente.email"))) contatos[1].push(["i-mail", `<a href="mailto:${h(cfg("cliente.email"))}">${h(cfg("cliente.email"))}</a>`]);

  const configJson = JSON.stringify(config).replace(/</g, "\\u003C").replace(/>/g, "\\u003E").replace(/&/g, "\\u0026");
  const v = opcoes.versao;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${h(`${titulo} — ${nome}`)}</title>
<meta name="description" content="${h(descricao)}">
<meta name="robots" content="${opcoes.previa ? "noindex, nofollow" : "index, follow"}">
${ok(urlPortal) ? `<link rel="canonical" href="${h(urlPortal)}">\n<meta property="og:url" content="${h(urlPortal)}">\n` : ""}<meta property="og:type" content="website">
<meta property="og:locale" content="pt_BR">
<meta property="og:site_name" content="${h(nome)}">
<meta property="og:title" content="${h(`Portal da Transparência — ${nome}`)}">
<meta property="og:description" content="${h(descricao)}">
<meta property="og:image" content="${h(absIcon)}">
<meta name="twitter:card" content="summary">
<link rel="icon" type="${mimeIcone}" href="${h(icone)}">
<link rel="apple-touch-icon" href="${h(icone)}">
<link rel="manifest" href="manifest.php">
<meta name="theme-color" content="${h(colors.primary)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,600;8..60,700&family=Public+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap">
<link rel="stylesheet" href="assets/app.css?v=${h(v)}">
<style>
  :root{${Object.entries(colors).map(([k, c]) => `--${k}:${h(c)};`).join("")}}
</style>

<header class="masthead">
  <div class="masthead-inner">
    <a class="logo-link" href="${h(site)}" aria-label="${h(nome)} — página inicial">
      <img src="${h(logo)}" alt="${h(`${nome} — ${nomeCompleto}`)}">
    </a>
  </div>
</header>

<nav class="navbar" id="navbar">
  <div class="navbar-inner">
    <ul class="nav-list" id="navList"></ul>
    <button class="nav-toggle" id="navToggle" aria-label="Abrir menu"><svg class="icon" aria-hidden="true"><use href="#i-menu"/></svg></button>
  </div>
</nav>

<div class="dock-search" id="dockSearch" aria-hidden="true">
  <div class="search-box">
    <svg class="icon" aria-hidden="true"><use href="#i-search"/></svg>
    <input id="dockInput" type="text" placeholder="${h(cfg("textos.placeholderDock", "Pesquisar em toda a transparência…"))}" aria-label="Pesquisar em toda a transparência">
    <button type="button" class="clear-btn" id="dockClear" aria-label="Limpar busca"><svg class="icon" aria-hidden="true"><use href="#i-x"/></svg></button>
  </div>
</div>

<section id="transparencia">
  <div class="hero">
    <div class="hero-panel">
      <h2>${h(titulo)}</h2>
      <p>${h(cfg("textos.subtitulo", "Todas as categorias em uma página só. Use a busca ou o índice ao lado para ir direto ao que precisa."))}</p>
      <form class="search-form" id="searchForm">
        <div class="search-box">
          <svg class="icon" aria-hidden="true"><use href="#i-search"/></svg>
          <input id="searchInput" type="text" placeholder="${h(cfg("textos.placeholderBusca", "Ex.: licitações, folha de pagamento, atas, ouvidoria..."))}" data-placeholder-curto="${h(cfg("textos.placeholderCurto", "Pesquisar na transparência…"))}" aria-label="Pesquisar item de transparência">
          <button type="button" class="clear-btn" id="clearSearch" aria-label="Limpar busca"><svg class="icon" aria-hidden="true"><use href="#i-x"/></svg></button>
        </div>
        <button class="search-submit" type="submit">Buscar <svg class="icon" aria-hidden="true"><use href="#i-arrow"/></svg></button>
      </form>
      <nav class="profile-row" id="profileRow" aria-label="Atalhos por perfil"></nav>
    </div>
  </div>

  <div class="layout">
    <nav class="sidebar" id="sidebar" aria-label="Índice de categorias"></nav>
    <main>
      <div id="resultsView" hidden>
        <div class="content-head">
          <h2 id="contentTitle"></h2>
          <span class="content-basis" id="contentBasis"></span>
        </div>
        <p class="content-sub" id="contentSub"></p>
        <div class="feedback-row" id="feedbackRow" hidden></div>
        <div class="profile-hint" id="profileHint" hidden></div>
        <div class="card-grid" id="cardGrid"></div>
        <div class="empty-state" id="emptyState">
          <svg class="icon" aria-hidden="true"><use href="#i-question"/></svg>
          <p>Nenhum item encontrado para esta busca.</p>
        </div>
        <section class="related-block" id="relatedBlock" hidden>
          <h3>Itens relacionados</h3>
          <p class="content-sub" id="relatedSub"></p>
          <div class="card-grid" id="relatedGrid"></div>
        </section>
      </div>
      <div id="allGroups"></div>
    </main>
  </div>
</section>

<footer>
  <div class="footer-main">
    <div class="footer-col footer-col-brand">
      <p class="footer-brand-name">${h(nomeCompleto === nome ? nome : `${nome} - ${nomeCompleto}`)}</p>
    </div>
${[0, 1].map((col) => `    <div class="footer-col">
      <ul class="footer-contact">
${contatos[col].map((c) => `        <li><svg class="icon" aria-hidden="true"><use href="#${c[0]}"/></svg><span>${c[1]}</span></li>\n`).join("")}      </ul>
    </div>
`).join("")}  </div>
${redes.length ? `  <div class="footer-social">
${redes.map((r: any) => {
    const t = String(r.tipo ?? "").toLowerCase();
    return `    <a href="${h(r.url)}" target="_blank" rel="noopener" aria-label="${h(REDES_NOMES[t] ?? t)}"><svg class="icon" aria-hidden="true"><use href="#${REDES_ICONES[t] ?? "i-globe"}"/></svg></a>\n`;
  }).join("")}  </div>
` : ""}  <div class="footer-bottom">
    © <span id="footerYear"></span> . Todos os direitos reservados.
    <div class="footer-sync">${h(nome)} · Portal de Acesso à Informação — dados extraídos da API oficial de dados abertos. <span class="mono" id="footerSync">Sincronizando…</span></div>
  </div>
</footer>

<button class="top-btn" id="topBtn" aria-label="Voltar ao topo"><svg class="icon" aria-hidden="true"><use href="#i-chevron-up"/></svg></button>

${ok(cfg("acessibilidade.vlibras", true)) ? `<div vw class="enabled">
  <div vw-access-button class="active"></div>
  <div vw-plugin-wrapper>
    <div class="vw-plugin-top-wrapper"></div>
  </div>
</div>
<script src="https://vlibras.gov.br/app/vlibras-plugin.js"></script>
<script>
  if (window.VLibras) { new window.VLibras.Widget("https://vlibras.gov.br/app"); }
</script>
` : ""}
<button type="button" class="a11y-toggle" id="a11yToggle" aria-expanded="false" aria-controls="a11yTools" aria-label="Opções de acessibilidade">Aa</button>
<div class="a11y-toolbar" id="a11yTools" role="group" aria-label="Acessibilidade">
  <button class="a11y-btn" id="a11yContrast" aria-label="Alternar alto contraste" aria-pressed="false"><svg class="icon" aria-hidden="true"><use href="#i-contrast"/></svg></button>
  <button class="a11y-btn" id="a11yFontDown" aria-label="Diminuir fonte">A-</button>
  <button class="a11y-btn" id="a11yFontUp" aria-label="Aumentar fonte">A+</button>
  <button class="a11y-btn" id="a11yReadAloud" aria-label="Ouvir o conteúdo da seção atual" aria-pressed="false"><svg class="icon" aria-hidden="true"><use href="#i-speaker"/></svg></button>
</div>

${opcoes.sprite}

<script>window.PORTAL_CONFIG = ${configJson};</script>
<script src="assets/app.js?v=${h(v)}"></script>
`;
}

export function renderManifest(config: Cfg): string {
  const cfg = cfgDe(config);
  const nome = cfg("cliente.nome", "Portal");
  const icone = cfg("cliente.icone", cfg("cliente.logo", "logo.png"));
  return JSON.stringify(
    {
      name: `Portal da Transparência — ${nome}`,
      short_name: `Transparência ${nome}`,
      description: cfg("seo.descricao", "Portal da Transparência e Acesso à Informação."),
      start_url: "./",
      scope: "./",
      display: "standalone",
      background_color: "#f4f6f9",
      theme_color: coresDoPortal(config).primary,
      lang: "pt-BR",
      icons: [{ src: icone, sizes: "260x260", type: mimeDaImagem(icone), purpose: "any" }],
    },
    null,
    4,
  );
}

/* ---------- rotas públicas ---------- */

export const portalPreviewRouter = Router();

const CONTENT_TYPES: Record<string, string> = {
  css: "text/css; charset=utf-8", js: "text/javascript; charset=utf-8",
};

// cópia ao vivo da API do cliente, guardada por api.cacheSegundos (como o proxy.php)
const vivo = new Map<string, { em: number; raw: string }>();

async function dadosDe(pasta: string, d: "transparencia" | "menu", p: { config: unknown; cacheTransparencia: string | null; cacheMenu: string | null }) {
  const config = p.config as Cfg;
  const salvo = d === "menu" ? p.cacheMenu : p.cacheTransparencia;
  const url = apiUrlDe((config.api ?? {}) as Cfg, d);
  if (!url) return salvo ? { raw: salvo, fonte: "cache" } : null;
  const ttl = Math.max(0, Number(config.api?.cacheSegundos ?? 60)) * 1000;
  const k = `${pasta}|${d}`;
  const c = vivo.get(k);
  if (c && Date.now() - c.em < ttl) return { raw: c.raw, fonte: "cache-recente" };
  const r = await baixarJson(url);
  if (r.data && r.raw) {
    vivo.set(k, { em: Date.now(), raw: r.raw });
    return { raw: r.raw, fonte: "api" };
  }
  return salvo ? { raw: salvo, fonte: "cache" } : null;
}

function naoEncontrado(res: Response) {
  res.status(404).type("text/plain; charset=utf-8").send("Portal não encontrado.");
}

// /public/transparencia-portal/<pasta>/<arquivo>
portalPreviewRouter.use(async (req, res, next) => {
  try {
    if (req.method !== "GET" && req.method !== "POST") return void res.status(405).end();
    const m = req.path.match(/^\/([^/]+)(\/(.*))?$/);
    if (!m) return naoEncontrado(res);
    const pasta = slug(decodeURIComponent(m[1]));
    if (pasta === "") return naoEncontrado(res);
    if (m[2] === undefined) return void res.redirect(302, `${m[1]}/`); // links relativos do portal precisam da barra final
    const arq = decodeURIComponent(m[3] ?? "");

    const p = await prisma.transparenciaPortal.findUnique({ where: { pasta } });
    if (!p) return naoEncontrado(res);
    const config = p.config as Cfg;
    res.setHeader("X-Robots-Tag", "noindex, nofollow");

    if (arq === "" || arq === "index.php" || arq === "index.html") {
      const app = lerArquivoModelo("assets/app.js");
      const css = lerArquivoModelo("assets/app.css");
      const sprite = lerArquivoModelo("partes/icones.svg");
      const versao = `${Math.floor((app?.mtimeMs ?? 0) / 1000)}-${Math.floor((css?.mtimeMs ?? 0) / 1000)}`;
      res.setHeader("Cache-Control", "no-cache");
      return void res.type("text/html; charset=utf-8").send(renderIndex(config, { versao, sprite: sprite?.dados.toString("utf8") ?? "", previa: true }));
    }
    if (arq === "manifest.php") {
      res.setHeader("Cache-Control", "no-cache");
      return void res.type("application/manifest+json; charset=utf-8").send(renderManifest(config));
    }
    if (arq === "proxy.php") {
      const d = String(req.query.d ?? "");
      res.setHeader("Cache-Control", "no-store");
      if (d !== "menu" && d !== "transparencia" && d !== "ordem") return void res.status(400).json({ error: "parametro d invalido" });
      if (d === "ordem") {
        res.setHeader("X-Data-Source", "cache");
        return void res.type("application/json; charset=utf-8").send(p.cacheOrdem ?? "[]");
      }
      const r = await dadosDe(pasta, d, p);
      if (!r) return void res.status(502).json({ error: "API de origem indisponivel e sem copia local" });
      res.setHeader("X-Data-Source", r.fonte);
      return void res.type("application/json; charset=utf-8").send(r.raw);
    }
    if (arq === "feedback.php") {
      // na pré-visualização o voto não é guardado
      return void res.json(req.method === "POST" ? { ok: true } : { error: "metodo nao permitido" });
    }
    const dado = arq.match(/^dados\/cache_(transparencia|menu|ordem)\.json$/)?.[1];
    if (dado) {
      const t = dado === "menu" ? p.cacheMenu : dado === "ordem" ? p.cacheOrdem : p.cacheTransparencia;
      return t ? void res.type("application/json; charset=utf-8").send(t) : void res.status(404).end();
    }
    if (p.logoNome && arq === p.logoNome && p.logoDados) return void res.type(p.logoMime ?? "application/octet-stream").send(Buffer.from(p.logoDados));
    if (p.iconeNome && arq === p.iconeNome && p.iconeDados) return void res.type(p.iconeMime ?? "application/octet-stream").send(Buffer.from(p.iconeDados));
    if (arq === "assets/app.js" || arq === "assets/app.css" || arq === "sw.js") {
      const f = lerArquivoModelo(arq);
      if (!f) return void res.status(404).end();
      res.setHeader("Cache-Control", "no-cache");
      return void res.type(CONTENT_TYPES[arq.split(".").pop()!] ?? "text/javascript; charset=utf-8").send(f.dados);
    }
    return void res.status(404).end();
  } catch (err) {
    next(err);
  }
});
