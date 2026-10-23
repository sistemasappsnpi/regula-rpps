import { describe, expect, it, vi } from "vitest";
import { unzipSync } from "fflate";

const store: Record<string, any> = {
  cli: { id: "x", pasta: "cli", nome: "Cliente", config: { seo: { url: "https://portal.exemplo.gov.br/transparencia/index.php" } }, relatorioLinks: null },
  ext: { id: "y", pasta: "ext", nome: "Externo", config: { externo: { url: "https://x.gov.br" } } },
  sem: { id: "z", pasta: "sem", nome: "Sem URL", config: {} },
};
vi.mock("../src/db/prisma", () => ({
  prisma: {
    transparenciaPortal: {
      findUnique: async ({ where }: any) => store[where.pasta] ?? null,
      update: async ({ where, data }: any) => Object.assign(store[where.pasta], data),
      findMany: async () => Object.values(store).map((p: any) => ({ pasta: p.pasta })),
      upsert: async ({ where, create, update }: any) => {
        store[where.pasta] = store[where.pasta] ? { ...store[where.pasta], ...update } : { id: "n", ...create };
      },
    },
  },
}));

const links = await import("../src/modules/transparencia-gerador/links");
const av = await import("../src/modules/transparencia-gerador/avaliacoes");
const svc = await import("../src/modules/transparencia-gerador/gerador.service");

describe("verificador de links", () => {
  it("corrige os links como o portal faz no navegador", () => {
    const base = "https://www.portal.gov.br";
    expect(links.corrigirLink("/a//b", base)).toBe("https://www.portal.gov.br/a/b");
    expect(links.corrigirLink("https://www.portal.gov.br/https://outro.gov.br/x", base)).toBe("https://outro.gov.br/x");
    expect(links.corrigirLink("", base)).toBe("#");
    expect(links.corrigirLink("mailto:a@b.c", base)).toBe("mailto:a@b.c");
  });

  it("agrupa itens pelo mesmo endereço e separa os sem link", () => {
    const { porHref, semLink } = links.agruparLinks(
      [
        { Grupo: "A", Descricao: "um", Link: "https://x.gov.br/p" },
        { Grupo: "B", Descricao: "dois", Link: "https://x.gov.br/p" },
        { Grupo: "B", Descricao: "sem", Link: "" },
        { Grupo: "B", Descricao: "mail", Link: "mailto:a@b.c" },
      ],
      "https://x.gov.br",
    );
    expect([...porHref.keys()]).toEqual(["https://x.gov.br/p"]);
    expect(porHref.get("https://x.gov.br/p")).toHaveLength(2);
    expect(semLink).toEqual([{ grupo: "B", descricao: "sem" }]);
  });

  it("classifica: 403 não é link quebrado, 404 e sem resposta são", () => {
    expect(links.classificar(200)).toBe("ok");
    expect(links.classificar(301)).toBe("ok");
    expect(links.classificar(403)).toBe("restrito");
    expect(links.classificar(404)).toBe("quebrado");
    expect(links.classificar(500)).toBe("quebrado");
    expect(links.classificar(0)).toBe("quebrado");
  });

  it("verifica todos os endereços respeitando o limite de simultâneos", async () => {
    let ativos = 0;
    let maximo = 0;
    const hrefs = Array.from({ length: 20 }, (_, i) => `https://x.gov.br/${i}`);
    const r = await links.verificarEnderecos(
      hrefs,
      async (u) => {
        ativos++;
        maximo = Math.max(maximo, ativos);
        await new Promise((ok) => setTimeout(ok, 2));
        ativos--;
        return u.endsWith("/3") ? 404 : 200;
      },
      4,
    );
    expect(r.size).toBe(20);
    expect(r.get("https://x.gov.br/3")).toBe(404);
    expect(maximo).toBeLessThanOrEqual(4);
  });
});

describe("verificação automática", () => {
  it("verifica todos os portais a cada 1 h e um portal com problema não trava os outros", async () => {
    vi.useFakeTimers();
    store.cli.cacheTransparencia = JSON.stringify([
      { Grupo: "A", Descricao: "ok", Link: "https://x.gov.br/ok" },
      { Grupo: "A", Descricao: "quebrado", Link: "https://x.gov.br/sumiu" },
    ]);
    vi.stubGlobal("fetch", async (url: string) => new Response(null, { status: url.endsWith("/sumiu") ? 404 : 200 }));
    links.iniciarVerificacaoAgendada();

    await vi.advanceTimersByTimeAsync(2 * 60_000 + 1000); // primeira rodada
    await vi.waitFor(() => expect(store.cli.relatorioLinks).toBeTruthy());
    expect(store.cli.relatorioLinks).toMatchObject({ totalLinks: 2, quebrados: 1 });
    expect(store.cli.relatorioLinks.itensQuebrados[0].href).toBe("https://x.gov.br/sumiu");

    const primeira = store.cli.relatorioLinks.verificadoEm;
    store.cli.relatorioLinks = null;
    await vi.advanceTimersByTimeAsync(60 * 60_000); // hora seguinte
    await vi.waitFor(() => expect(store.cli.relatorioLinks).toBeTruthy());
    expect(store.cli.relatorioLinks.verificadoEm).not.toBe(primeira);
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
});

describe("avaliações do portal publicado", () => {
  it("ordena como o admin.php: pior aprovação primeiro, sem votos por último", () => {
    const l = av.montarLinhas({ Folha: { up: 5, down: 0 }, Licitacoes: { up: 1, down: 3 }, Vazia: { up: 0, down: 0 }, Outra: { up: 1, down: 3 } });
    expect(l.map((x) => x.grupo)).toEqual(["Licitacoes", "Outra", "Folha", "Vazia"]);
    expect(l[0].pct).toBe(25);
    expect(l[3].pct).toBeNull();
  });

  it("acha a pasta publicada a partir de seo.url", () => {
    expect(av.urlPublicada({ seo: { url: "https://portal.exemplo.gov.br/transparencia/index.php" } })).toBe("https://portal.exemplo.gov.br/transparencia/");
    expect(av.urlPublicada({ seo: { url: "https://portal.exemplo.gov.br" } })).toBe("https://portal.exemplo.gov.br/");
    expect(av.urlPublicada({ seo: { url: "" } })).toBe("");
  });

  it("token e senha são estáveis por portal e diferentes entre portais", () => {
    expect(av.tokenFeedback("cli")).toBe(av.tokenFeedback("cli"));
    expect(av.tokenFeedback("cli")).not.toBe(av.tokenFeedback("ext"));
    expect(av.senhaPainel("cli")).not.toBe(av.tokenFeedback("cli").slice(0, 20));
    expect(av.segredoPhp("cli")).toContain(av.tokenFeedback("cli"));
  });

  it("explica o motivo quando não dá para ler", async () => {
    expect(await av.lerAvaliacoes("sem")).toMatchObject({ ok: false, motivo: "sem-url" });
    expect(await av.lerAvaliacoes("ext")).toMatchObject({ ok: false, motivo: "externo" });
  });

  it("lê os votos do feedback_dados.php enviando o token", async () => {
    const chamadas: any[] = [];
    vi.stubGlobal("fetch", async (url: string, init: any) => {
      chamadas.push({ url, token: init.headers["X-Portal-Token"] });
      return new Response(JSON.stringify({ ok: true, votos: { A: { up: 2, down: 2 } }, atualizadoEm: "2026-10-22T10:00:00+00:00" }), { status: 200 });
    });
    const r = await av.lerAvaliacoes("cli");
    vi.unstubAllGlobals();
    expect(chamadas[0].url).toBe("https://portal.exemplo.gov.br/transparencia/feedback_dados.php");
    expect(chamadas[0].token).toBe(av.tokenFeedback("cli"));
    expect(r).toMatchObject({ ok: true, up: 2, down: 2, linhas: [{ grupo: "A", pct: 50 }] });
  });

  it("avisa quando o portal publicado é antigo (sem o arquivo) ou recusa o token", async () => {
    vi.stubGlobal("fetch", async () => new Response("nao achei", { status: 404 }));
    expect(await av.lerAvaliacoes("cli")).toMatchObject({ ok: false, motivo: "sem-arquivo" });
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 403 }));
    expect(await av.lerAvaliacoes("cli")).toMatchObject({ ok: false, motivo: "token" });
    vi.unstubAllGlobals();
  });
});

describe("pacote Câmara", () => {
  it("lista o tipo Câmara com textos, cores e a quantidade de itens do catálogo", async () => {
    const { listarTipos } = await import("../src/modules/transparencia-gerador/tipos");
    const t = listarTipos();
    expect(t.map((x) => x.id)).toEqual(["camara", "prefeitura"]);
    expect(t.every((x) => x.abaRotulo && x.descricao && x.exemploNome)).toBe(true);
    expect(t[0]).toMatchObject({ id: "camara", preset: "camara", rotulo: "Câmara Municipal" });
    expect(t[0].itens).toBeGreaterThan(50);
    expect(t[0].textos.titulo).toBeTruthy();
  });

  it("aplica o pacote sem sobrescrever o que o cliente já definiu", async () => {
    const pacote = { tipo: "camara", perfis: [{ id: "p" }], temas: ["a b"], sinonimos: { voto: "x", pl: "y" }, glossario: { PL: "z" }, descricoesItens: {} };
    const cfg: any = { sinonimos: { voto: "meu" }, temas: [] };
    svc.aplicarTipo(cfg, pacote);
    expect(cfg.tipo).toBe("camara");
    expect(cfg.sinonimos).toEqual({ voto: "meu", pl: "y" });
    expect(cfg.perfis).toHaveLength(1);
    expect(cfg.temas).toEqual(["a b"]);
    const outro: any = { tipo: "rpps" };
    svc.aplicarTipo(outro, pacote);
    expect(outro.tipo).toBe("rpps");
    expect(outro.perfis).toBeUndefined();
  });

  it("cria o portal de exemplo da Câmara, que entra na lista como exemplo do tipo camara", async () => {
    store.camaraexemplo = undefined as any;
    const { criarExemploCamara, PASTA_EXEMPLO_CAMARA } = await import("../src/modules/transparencia-gerador/tipos");
    const r = await criarExemploCamara();
    expect(r.pasta).toBe(PASTA_EXEMPLO_CAMARA);
    const p = store[PASTA_EXEMPLO_CAMARA];
    expect(p.config).toMatchObject({ tipo: "camara", exemplo: true, cliente: { nome: "Câmara de Vila Modelo" } });
    expect(JSON.parse(p.cacheTransparencia).length).toBeGreaterThan(50);
    expect(p.config.perfis.length).toBeGreaterThan(3);
    const { renderIndex } = await import("../src/modules/transparencia-gerador/preview");
    const html = renderIndex(p.config, { versao: "1", sprite: "", previa: true });
    expect(html).toContain("Transparência da Câmara");
    expect(html).toContain("Câmara Municipal de Vila Modelo");
    // todo botão tem nome, grupo e descrição curta
    for (const it of JSON.parse(p.cacheTransparencia)) {
      expect(it.Descricao).toBeTruthy();
      expect(p.config.grupos.ordem).toContain(it.Grupo);
      expect(p.config.descricoesItens[it.Descricao]).toBeTruthy();
    }
  });
});

describe("pacote Prefeitura", () => {
  it("cria o portal de exemplo da Prefeitura, coerente e que renderiza", async () => {
    const { criarExemplo, pastaExemplo } = await import("../src/modules/transparencia-gerador/tipos");
    const r = await criarExemplo("prefeitura");
    expect(r.pasta).toBe(pastaExemplo("prefeitura"));
    const p = store["prefeitura-exemplo"];
    expect(p.config).toMatchObject({ tipo: "prefeitura", exemplo: true, cliente: { nome: "Prefeitura de Vila Modelo" } });
    const itens = JSON.parse(p.cacheTransparencia);
    expect(itens.length).toBeGreaterThan(70);
    const grupos: string[] = p.config.grupos.ordem;
    expect(new Set(itens.map((i: any) => i.Grupo))).toEqual(new Set(grupos));
    for (const it of itens) expect(p.config.descricoesItens[it.Descricao]).toBeTruthy();
    // cada atalho de perfil aponta para botões que existem de verdade
    const nomes = new Set(itens.map((i: any) => i.Descricao.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim()));
    for (const perfil of p.config.perfis) for (const m of perfil.match) expect(nomes.has(m)).toBe(true);
    const { renderIndex } = await import("../src/modules/transparencia-gerador/preview");
    expect(renderIndex(p.config, { versao: "1", sprite: "", previa: true })).toContain("Prefeitura Municipal de Vila Modelo");
  });

  it("o exemplo de cada tipo é criado na subida, sem refazer o que já existe", async () => {
    const { garantirExemplos } = await import("../src/modules/transparencia-gerador/tipos");
    delete store["prefeitura-exemplo"];
    store["camara-exemplo"].nome = "editado";
    await garantirExemplos();
    expect(store["prefeitura-exemplo"].config.exemplo).toBe(true);
    expect(store["camara-exemplo"].nome).toBe("editado");
  });
});

describe("exemplo da Câmara na subida da API", () => {
  it("cria quando falta e não refaz o que já existe", async () => {
    const { garantirExemploCamara, PASTA_EXEMPLO_CAMARA } = await import("../src/modules/transparencia-gerador/tipos");
    delete store[PASTA_EXEMPLO_CAMARA];
    expect(await garantirExemploCamara()).toBe(true);
    expect(store[PASTA_EXEMPLO_CAMARA].config.exemplo).toBe(true);
    store[PASTA_EXEMPLO_CAMARA].nome = "editado";
    expect(await garantirExemploCamara()).toBe(false);
    expect(store[PASTA_EXEMPLO_CAMARA].nome).toBe("editado");
  });
});

describe("pacote do portal", () => {
  it("traz o painel, o verificador, as avaliações e o segredo em todo ZIP", async () => {
    store.cli.logoNome = null;
    const zip = await svc.montarZip("cli", av.segredoPhp("cli"));
    const nomes = Object.keys(unzipSync(new Uint8Array(zip!)));
    for (const f of ["admin.php", "link-check.php", "feedback_dados.php", "segredo.php", "feedback.php", "config.json"]) expect(nomes).toContain(f);
    expect(nomes).not.toContain("dados/link_check_report.json");
  });
});
