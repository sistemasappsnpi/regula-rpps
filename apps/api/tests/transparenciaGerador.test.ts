import { beforeEach, describe, expect, it, vi } from "vitest";
import { unzipSync } from "fflate";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Banco em memória: só o que o gerador usa (findUnique / upsert / deleteMany em transparenciaPortal).
const store: Record<string, any> = {};
vi.mock("../src/db/prisma", () => ({
  prisma: {
    transparenciaPortal: {
      findUnique: async ({ where }: any) => store[where.pasta] ?? null,
      upsert: async ({ where, create, update }: any) => {
        store[where.pasta] = store[where.pasta] ? { ...store[where.pasta], ...update } : { id: "x", ...create };
      },
      deleteMany: async ({ where }: any) => {
        const had = where.pasta in store;
        delete store[where.pasta];
        return { count: had ? 1 : 0 };
      },
    },
  },
}));

const svc = await import("../src/modules/transparencia-gerador/gerador.service");
const { parseOrdemHtml } = await import("../src/modules/transparencia-gerador/ordem");
const { hostPermitido } = await import("../src/modules/transparencia-gerador/http");
const { renderIndex, renderManifest } = await import("../src/modules/transparencia-gerador/preview");
const { extrairDaPagina, listaEmbutida, normalizarLinkPortal } = await import("../src/modules/transparencia-gerador/importar-link");

describe("gerador de transparência — normalização de URL", () => {
  it("completa domínio solto com endpoint e parâmetros", () => {
    expect(svc.normalizarApiUrl("transparencia.x.gov.br", "menu")).toBe(
      "https://transparencia.x.gov.br/dadosabertosexportar?d=menu&a=&f=json&itens_por_pagina=1000000",
    );
  });
  it("mantém o d= já informado e força a lista completa", () => {
    expect(svc.normalizarApiUrl("https://x.gov.br/dadosabertosexportar?d=transparencia&a=&f=json&itens_por_pagina=10", "menu")).toBe(
      "https://x.gov.br/dadosabertosexportar?d=transparencia&a=&f=json&itens_por_pagina=1000000",
    );
  });
  it("devolve vazio para entrada vazia", () => {
    expect(svc.normalizarApiUrl("  ", "menu")).toBe("");
  });
  it("slug tira acentos", () => {
    expect(svc.slug("Câmara de Saquarema")).toBe("camara-de-saquarema");
  });
});

describe("gerador de transparência — leitura da ordem oficial", () => {
  it("lê grupos e itens do cartão padrão", () => {
    const html = `<h3>Receita</h3><div class="cat-desc"><h6>Receitas Arrecadadas</h6></div><div class="cat-desc"><h6>Renúncia &amp; Isenção</h6></div>
      <h3>Despesa</h3><div class="cat-desc"><h6>Empenhos</h6></div>`;
    expect(parseOrdemHtml(html)).toEqual([
      { nome: "Receita", itens: ["Receitas Arrecadadas", "Renúncia & Isenção"] },
      { nome: "Despesa", itens: ["Empenhos"] },
    ]);
  });
});

describe("gerador de transparência — proteção de rede", () => {
  it("bloqueia hosts locais e privados", () => {
    for (const u of ["http://localhost/x", "http://127.0.0.1/", "http://10.0.0.5/", "http://192.168.1.1/", "http://169.254.169.254/", "ftp://x.gov.br/"]) {
      expect(hostPermitido(u)).toBe(false);
    }
    expect(hostPermitido("https://transparencia.ipres.rj.gov.br/")).toBe(true);
  });
});

describe("gerador de transparência — cadastro por link", () => {
  const html = `<!doctype html><meta charset="utf-8"><title>Transparência XPTO</title>
    <meta name="description" content="Portal &amp; dados">
    <meta property="og:site_name" content="XPTO"><meta name="theme-color" content="#004080">
    <link rel="canonical" href="https://x.gov.br/transparencia/"><link rel="icon" href="fav.png">
    <style>:root{ --primary:#004080; --accent:#c99a3a; }</style>
    <header><a class="logo-link" href="https://x.gov.br/"><img src="img/logo.png" alt="XPTO — Instituto de Previdência de Lugar Nenhum"></a></header>
    <h2>Acesso à Informação</h2>
    <script>var TRANSPARENCIA_SNAPSHOT = [{"Grupo":"A [x]","Descricao":"B \\"q\\""}]; var OUTRA = 1;</script>
    <footer><ul class="footer-contact"><li>CNPJ: 11.111.111/0001-11</li><li>Rua A, 1 - Centro</li></ul>
    <ul class="footer-contact"><li>(22) 2621-8929</li><li><a href="mailto:a@x.gov.br">a@x.gov.br</a></li></ul>
    <div class="footer-social"><a href="https://www.youtube.com/c/x" aria-label="YouTube"></a><a href="#" aria-label="X (Twitter)"></a></div></footer>`;

  it("lê nome, cores, logo, contatos e redes da página", () => {
    const x = extrairDaPagina(html, "https://x.gov.br/transparencia/");
    expect(x).toMatchObject({
      nome: "XPTO", nomeCompleto: "Instituto de Previdência de Lugar Nenhum", corPrimaria: "#004080", corDestaque: "#c99a3a",
      logoUrl: "https://x.gov.br/transparencia/img/logo.png", iconeUrl: "https://x.gov.br/transparencia/fav.png",
      seoUrl: "https://x.gov.br/transparencia/", site: "https://x.gov.br/", cnpj: "11.111.111/0001-11",
      telefone: "(22) 2621-8929", email: "a@x.gov.br", descricao: "Portal & dados", titulo: "Acesso à Informação",
    });
    expect(x.endereco).toBe("Rua A, 1 - Centro");
    expect(x.redes).toEqual([{ tipo: "youtube", url: "https://www.youtube.com/c/x" }]); // link "#" não vale
  });

  it("extrai a lista embutida respeitando colchetes dentro de texto", () => {
    expect(JSON.parse(listaEmbutida(html, "TRANSPARENCIA_SNAPSHOT")!)).toEqual([{ Grupo: "A [x]", Descricao: 'B "q"' }]);
    expect(listaEmbutida(html, "NAO_EXISTE")).toBeNull();
  });

  it("recusa endereços internos", () => {
    expect(() => normalizarLinkPortal("http://127.0.0.1/x")).toThrow();
    expect(normalizarLinkPortal("previspa.rj.gov.br/transparencia/")).toBe("https://previspa.rj.gov.br/transparencia/");
  });
});

describe("gerador de transparência — link de visualização", () => {
  const cfgTeste = {
    cliente: {
      nome: "Órgão <Teste> & Cia", nomeCompleto: "Instituto \"de\" Previdência", site: "https://x.gov.br/", logo: "logo.png", icone: "logo-icon.png",
      cnpj: "11.111.111/0001-11", endereco: "Rua A, 1 — Centro", telefone: "", email: "a@x.gov.br",
      redes: [{ tipo: "youtube", url: "https://youtube.com/x" }, { tipo: "tiktok", url: "https://t.com/x" }, { tipo: "x", url: "" }],
    },
    cores: { primaria: "#004080", destaque: "#c99a3a" },
    api: { base: "https://x.gov.br" }, seo: { url: "https://x.gov.br/transparencia/", descricao: "Aspas 'simples' e \"duplas\"" },
    textos: { titulo: "Acesso à Informação" }, acessibilidade: { vlibras: false }, recursos: { feedback: true },
  };
  const php = (() => {
    try {
      execFileSync("php", ["-v"], { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  })();
  const modelo = path.resolve(process.cwd(), "assets/transparencia-gerador/modelo");
  const linhas = (s: string) => s.split("\n").map((l) => l.trim()).filter((l) => l !== "" && !l.includes("window.PORTAL_CONFIG"));

  it.skipIf(!php)("index e manifest saem iguais aos do PHP", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "portal-"));
    fs.cpSync(modelo, dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify(cfgTeste));
    const saidaPhp = execFileSync("php", [path.join(dir, "index.php")], { cwd: dir, encoding: "utf8" });
    const versao = saidaPhp.match(/app\.css\?v=([^"]+)"/)![1];
    const sprite = fs.readFileSync(path.join(modelo, "partes/icones.svg"), "utf8");
    const saidaTs = renderIndex(cfgTeste, { versao, sprite });
    expect(linhas(saidaTs)).toEqual(linhas(saidaPhp));
    const cfgJs = saidaTs.match(/window\.PORTAL_CONFIG = (.*);<\/script>/)![1];
    expect(JSON.parse(cfgJs)).toEqual(cfgTeste);
    expect(cfgJs).not.toMatch(/[<>&]/);

    const manPhp = execFileSync("php", [path.join(dir, "manifest.php")], { cwd: dir, encoding: "utf8" });
    expect(JSON.parse(renderManifest(cfgTeste))).toEqual(JSON.parse(manPhp));
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe("gerador de transparência — sugestões", () => {
  it("marca como atendido o que o portal já publica", () => {
    const cat = svc.sugestoesPara([{ Grupo: "Receita", Descricao: "Estrutura Organizacional", MaisInformacoes: "" }]);
    expect(cat.map((c) => c.id)).toEqual(["atricon", "progestao"]);
    const atricon = cat[0];
    expect(atricon.itens.find((i: any) => i.rotulo === "Estrutura Organizacional")?.atendido).toBe(true);
    expect(atricon.atendidos).toBeGreaterThan(0);
  });
});

describe("gerador de transparência — importar e empacotar", () => {
  beforeEach(() => {
    for (const k of Object.keys(store)) delete store[k];
  });

  const config = () => ({
    cliente: { nome: "Cliente Teste", logo: "logo.png", icone: "logo-icon.png" },
    cores: { primaria: "#01305f", destaque: "#98c810" },
    api: { base: "https://x.gov.br" },
    grupos: { ordem: ["Receita"] },
  });

  it("importa, guarda no banco e monta o ZIP com modelo + config + dados", async () => {
    const r = await svc.importarPortal({
      config: config(),
      logo: { buffer: Buffer.from("PNG"), nome: "logo.png" },
      cacheTransparencia: '[{"Grupo":"Receita","Descricao":"A"}]',
    });
    expect(r).toMatchObject({ pasta: "cliente-teste", novo: true });
    expect(store["cliente-teste"].config.cliente.icone).toBe("logo.png"); // sem ícone próprio, usa a logo

    const zip = unzipSync(new Uint8Array((await svc.montarZip("cliente-teste"))!));
    expect(Object.keys(zip)).toEqual(expect.arrayContaining(["index.php", "proxy.php", "config.json", "logo.png", "dados/.htaccess", "dados/cache_transparencia.json"]));
    expect(Object.keys(zip)).not.toContain("dados/feedback_data.json");
    expect(JSON.parse(Buffer.from(zip["config.json"]).toString("utf8")).cliente.nome).toBe("Cliente Teste");
  });

  it("recusa config sem cliente.nome e JSON de cache inválido", async () => {
    await expect(svc.importarPortal({ config: { cliente: {} } })).rejects.toThrow(/cliente\.nome/);
    await expect(svc.importarPortal({ config: config(), cacheMenu: "não é json" })).rejects.toThrow(/cacheMenu/);
  });

  it("gera logo provisório quando não há logo e valida cores", async () => {
    // sem URLs de API: só valida o fluxo local (nada de rede)
    const r = await svc.gerarCliente(
      { cliente: { nome: "Sem Logo" }, cores: { primaria: "#112233", destaque: "#445566" }, api: {}, grupos: {} },
      {},
    );
    expect(r.avisos.join(" ")).toMatch(/logo provisório/);
    expect(store["sem-logo"].logoNome).toBe("logo.svg");
    await expect(svc.gerarCliente({ cliente: { nome: "X" }, cores: { primaria: "azul", destaque: "#445566" } }, {})).rejects.toThrow(/Cores inválidas/);
  });

  it("zip de cliente inexistente é null e exclusão informa se havia", async () => {
    expect(await svc.montarZip("nao-existe")).toBeNull();
    expect(await svc.excluirCliente("nao-existe")).toBe(false);
  });
});

describe("siteDoMenu (cadastro só pelas APIs)", () => {
  it("usa o item Início do menu, mesmo com acento trocado", async () => {
    const { siteDoMenu } = await import("../src/modules/transparencia-gerador/renovar");
    const menu = [
      { Id: "2", NMenu: null, Nome: "INSTITUCIONAL", Pagina: "", Ordem: "2" },
      { Id: "1", NMenu: null, Nome: "Ínicio", Pagina: "https://orgao.gov.br/", Ordem: "1" },
      { Id: "3", NMenu: "2", Nome: "Quem somos", Pagina: "https://orgao.gov.br/quem-somos/", Ordem: "1" },
    ];
    expect(siteDoMenu(menu)).toBe("https://orgao.gov.br/");
  });
  it("sem item Início, cai no site mais citado", async () => {
    const { siteDoMenu } = await import("../src/modules/transparencia-gerador/renovar");
    expect(siteDoMenu([{ Id: "1", Nome: "Sobre", Pagina: "https://x.gov.br/a" }, { Id: "2", Nome: "Contato", Pagina: "https://x.gov.br/b" }])).toBe("https://x.gov.br");
    expect(siteDoMenu([])).toBe("");
  });
});
