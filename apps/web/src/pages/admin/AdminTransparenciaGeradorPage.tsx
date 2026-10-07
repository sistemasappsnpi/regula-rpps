import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Download, ExternalLink, Link2, Trash2, Upload } from "lucide-react";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { useConfirm } from "../../components/ui/confirm-context";
import { CategoriasStep, type GrupoEdit } from "../../components/transparencia-gerador/CategoriasStep";
import { SugestoesStep } from "../../components/transparencia-gerador/SugestoesStep";
import { PreviewMock } from "../../components/transparencia-gerador/PreviewMock";
import { Campo, Check, INPUT, Passo, Status, type StatusTipo } from "../../components/transparencia-gerador/ui";
import {
  carregarImagem,
  chave,
  contrasteBranco,
  escolherCores,
  extrairPaleta,
  geradorApi,
  mix,
  paraTextoBranco,
  slug,
  type Catalogo,
  type ClienteResumo,
  type ConfigPortal,
  type CorLogo,
  type ItemExtra,
  type OrdemGrupo,
  type ResultadoGerar,
} from "../../lib/transparencia-gerador";

const FORM_INICIAL = {
  pasta: "",
  preset: false,
  nome: "",
  nomeCompleto: "",
  site: "",
  cnpj: "",
  telefone: "",
  endereco: "",
  email: "",
  youtube: "",
  instagram: "",
  facebook: "",
  x: "",
  urlTransparencia: "",
  urlMenu: "",
  atualizarMinutos: 5,
  corPrimaria: "#107078",
  corDestaque: "#98c810",
  corRodape: "#0b4c52",
  autoP: true,
  autoA: true,
  autoF: true,
  ordemAutomatica: true,
  titulo: "Acesso à Informação",
  subtitulo: "Todas as categorias em uma página só. Use a busca ou o índice ao lado para ir direto ao que precisa.",
  placeholderBusca: "Ex.: licitações, folha de pagamento, atas, ouvidoria...",
  seoUrl: "",
  seoDescricao: "",
  vlibras: true,
  feedback: true,
  linksNovaAba: false,
};
type Form = typeof FORM_INICIAL;

type Msg = { tipo: StatusTipo; texto: ReactNode } | null;
type CfgHerdada = { icones: Record<string, string>; descs: Record<string, string>; ocultos: string[] };

function valor<T>(o: ConfigPortal | undefined, caminho: string, padrao: T): T {
  const v = caminho.split(".").reduce<unknown>((a, k) => (a && typeof a === "object" ? (a as Record<string, unknown>)[k] : undefined), o);
  return (v ?? padrao) as T;
}

function ordenarPelaOficial(grupos: GrupoEdit[], ordem: OrdemGrupo[] | null): GrupoEdit[] {
  if (!ordem) return grupos;
  const pos: Record<string, number> = {};
  ordem.forEach((o, i) => (pos[chave(o.nome)] = i));
  return grupos
    .map((g, i) => ({ g, i }))
    .sort((a, b) => (pos[chave(a.g.nome)] ?? 1e6) - (pos[chave(b.g.nome)] ?? 1e6) || a.i - b.i)
    .map((x) => x.g);
}

export function AdminTransparenciaGeradorPage() {
  const confirmar = useConfirm();
  const [form, setForm] = useState<Form>(FORM_INICIAL);
  const set = useCallback(<K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v })), []);

  const [clientes, setClientes] = useState<ClienteResumo[]>([]);
  const [pastaEdit, setPastaEdit] = useState("");
  const [sprite, setSprite] = useState<{ svg: string; ids: string[] } | null>(null);

  const [grupos, setGrupos] = useState<GrupoEdit[]>([]);
  const [extras, setExtras] = useState<Record<string, ItemExtra>>({});
  const [catalogos, setCatalogos] = useState<Catalogo[]>([]);
  const [menuItens, setMenuItens] = useState<string[] | null>(null);
  const [ordemOficial, setOrdemOficial] = useState<OrdemGrupo[] | null>(null);
  const [paginaOficial, setPaginaOficial] = useState("");
  const [stT, setStT] = useState<Msg>(null);
  const [stM, setStM] = useState<Msg>(null);

  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [iconeFile, setIconeFile] = useState<File | null>(null);
  const [logoUrl, setLogoUrl] = useState("");
  const [logoNome, setLogoNome] = useState("");
  const [paleta, setPaleta] = useState<CorLogo[]>([]);
  const [arrastando, setArrastando] = useState(false);

  const [gerando, setGerando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoGerar | null>(null);
  const [erroForm, setErroForm] = useState<string | null>(null);
  const [baixando, setBaixando] = useState(false);
  const [importando, setImportando] = useState(false);
  const [linkPortal, setLinkPortal] = useState("");
  const [linkPasta, setLinkPasta] = useState("");
  const [lendoLink, setLendoLink] = useState(false);
  const cfgRef = useRef<CfgHerdada>({ icones: {}, descs: {}, ocultos: [] });
  const topoResultado = useRef<HTMLDivElement>(null);

  const editando = pastaEdit !== "";

  const listarClientes = useCallback(
    () => geradorApi.listarClientes().then(setClientes).catch(() => setClientes([])),
    [],
  );

  useEffect(() => {
    listarClientes();
    geradorApi.icones().then(setSprite).catch(() => setSprite(null));
  }, [listarClientes]);

  const rodapeEfetivo = form.autoF ? mix(form.corPrimaria, -0.32) : form.corRodape;

  /* ---------- logo e cores ---------- */

  async function usarLogo(src: string, nome: string, aplicarCores: boolean) {
    setLogoUrl(src);
    setLogoNome(nome);
    try {
      const img = await carregarImagem(src);
      const pal = extrairPaleta(img);
      setPaleta(pal);
      if (aplicarCores) {
        const c = escolherCores(pal);
        if (c) setForm((f) => ({ ...f, corPrimaria: f.autoP ? c.primaria : f.corPrimaria, corDestaque: f.autoA ? c.destaque : f.corDestaque }));
      }
    } catch {
      setPaleta([]);
    }
  }

  function escolherLogo(file: File | undefined | null) {
    if (!file) return;
    setLogoFile(file);
    setForm((f) => ({ ...f, autoP: true, autoA: true }));
    // as flags acima só valem no próximo render; aplica as cores direto, como no original
    carregarImagem(URL.createObjectURL(file))
      .then((img) => {
        const pal = extrairPaleta(img);
        setPaleta(pal);
        const c = escolherCores(pal);
        if (c) setForm((f) => ({ ...f, corPrimaria: c.primaria, corDestaque: c.destaque }));
      })
      .catch(() => setPaleta([]));
    setLogoUrl(URL.createObjectURL(file));
    setLogoNome(file.name);
  }

  function clicarCor(hex: string, shift: boolean) {
    if (shift) setForm((f) => ({ ...f, corDestaque: hex, autoA: false }));
    else setForm((f) => ({ ...f, corPrimaria: paraTextoBranco(hex), autoP: false }));
  }

  /* ---------- APIs ---------- */

  function juntarGrupos(prev: GrupoEdit[], daApi: { nome: string; itens: number }[], ordem: OrdemGrupo[] | null, auto: boolean): GrupoEdit[] {
    const cfg = cfgRef.current;
    const merged: GrupoEdit[] = prev.filter((g) => daApi.some((a) => chave(a.nome) === chave(g.nome))).map((g) => ({ ...g }));
    const vistos = new Set(merged.map((g) => chave(g.nome)));
    for (const a of daApi) {
      const k = chave(a.nome);
      const existente = merged.find((g) => chave(g.nome) === k);
      if (existente) {
        existente.nome = a.nome;
        existente.itens = a.itens;
        if (!existente.icone && cfg.icones[k]) existente.icone = cfg.icones[k];
        if (!existente.descricao && cfg.descs[k]) existente.descricao = cfg.descs[k];
        if (cfg.ocultos.includes(k)) existente.ocultar = true;
      } else if (!vistos.has(k)) {
        merged.push({ nome: a.nome, itens: a.itens, icone: cfg.icones[k] ?? "", descricao: cfg.descs[k] ?? "", ocultar: cfg.ocultos.includes(k) });
      }
      vistos.add(k);
    }
    return auto ? ordenarPelaOficial(merged, ordem) : merged;
  }

  async function carregarSugestoes(url: string, pasta: string) {
    if (!url && !pasta) return;
    try {
      const res = await geradorApi.sugestoes(url, pasta);
      if (res.ok) setCatalogos(res.catalogos ?? []);
    } catch {
      /* sugestões são opcionais */
    }
  }

  async function testar(d: "transparencia" | "menu", urlArg?: string, pasta = pastaEdit, auto = form.ordemAutomatica) {
    const url = (urlArg ?? (d === "menu" ? form.urlMenu : form.urlTransparencia)).trim();
    const setSt = d === "menu" ? setStM : setStT;
    if (!url) {
      setSt(null);
      if (d === "menu") setMenuItens(null);
      return;
    }
    setSt({ tipo: "load", texto: "Testando…" });
    try {
      if (d === "transparencia") {
        const res = await geradorApi.testarTransparencia(url);
        if (!res.ok) {
          setSt({ tipo: "bad", texto: <>✘ {res.erro}{res.url && <><br /><small>{res.url}</small></>}</> });
          return;
        }
        const lista = res.grupos ?? [];
        setSt({ tipo: "ok", texto: `✔ ${res.total} itens em ${lista.length} categorias` });
        const ordem = res.ordem && res.ordem.length ? res.ordem : null;
        setOrdemOficial(ordem);
        setPaginaOficial(res.paginaOficial ?? "");
        setGrupos((prev) => juntarGrupos(prev, lista, ordem, auto));
        carregarSugestoes(url, pasta);
      } else {
        const res = await geradorApi.testarMenu(url);
        if (!res.ok) {
          setSt({ tipo: "bad", texto: <>✘ {res.erro}{res.url && <><br /><small>{res.url}</small></>}</> });
          return;
        }
        setSt({ tipo: "ok", texto: `✔ ${res.total} itens de menu: ${(res.itens ?? []).join(" · ")}` });
        setMenuItens(res.itens ?? []);
      }
    } catch (e) {
      setSt({ tipo: "bad", texto: `✘ ${e instanceof Error ? e.message : "Não foi possível testar."}` });
    }
  }

  // Quem cola só a URL de uma das APIs geralmente usa o mesmo portal para a outra.
  function aoSairTransparencia() {
    const t = form.urlTransparencia.trim();
    if (t && !form.urlMenu.trim() && /d=transparencia/.test(t)) {
      const m = t.replace(/d=transparencia/, "d=menu");
      set("urlMenu", m);
      testar("menu", m);
    }
    testar("transparencia");
  }
  function aoSairMenu() {
    const m = form.urlMenu.trim();
    if (m && !form.urlTransparencia.trim() && /d=menu/.test(m)) {
      const t = m.replace(/d=menu/, "d=transparencia");
      set("urlTransparencia", t);
      testar("transparencia", t);
    }
    testar("menu");
  }

  /* ---------- categorias ---------- */

  function moverGrupo(i: number, delta: -1 | 1) {
    const j = i + delta;
    if (j < 0 || j >= grupos.length) return;
    const prox = grupos.slice();
    [prox[i], prox[j]] = [prox[j], prox[i]];
    setGrupos(prox);
    if (form.ordemAutomatica) set("ordemAutomatica", false); // reordenou na mão: para de seguir o portal
  }
  function mudarGrupo(i: number, patch: Partial<GrupoEdit>) {
    setGrupos((gs) => gs.map((g, k) => (k === i ? { ...g, ...patch } : g)));
  }
  function alternarOrdemAuto(v: boolean) {
    set("ordemAutomatica", v);
    if (v && ordemOficial) setGrupos((gs) => ordenarPelaOficial(gs, ordemOficial));
  }

  /* ---------- cliente existente ---------- */

  function limpar() {
    setForm(FORM_INICIAL);
    setPastaEdit("");
    setGrupos([]);
    setExtras({});
    setCatalogos([]);
    setMenuItens(null);
    setOrdemOficial(null);
    setPaginaOficial("");
    setStT(null);
    setStM(null);
    setLogoFile(null);
    setIconeFile(null);
    setLogoUrl("");
    setLogoNome("");
    setPaleta([]);
    setResultado(null);
    setErroForm(null);
    cfgRef.current = { icones: {}, descs: {}, ocultos: [] };
  }

  async function carregarCliente(pasta: string) {
    limpar();
    try {
      const { config: c, logoDataUrl } = await geradorApi.carregarCliente(pasta);
      const redes: Record<string, string> = {};
      for (const r of valor<{ tipo?: string; url?: string }[]>(c, "cliente.redes", [])) {
        let t = (r.tipo ?? "").toLowerCase();
        if (t === "twitter") t = "x";
        redes[t] = r.url ?? "";
      }
      const base = valor(c, "api.base", "");
      const urlT = valor(c, "api.urlTransparencia", "") || (base && valor<boolean>(c, "api.transparencia", true) !== false ? base : "");
      const urlM = valor(c, "api.urlMenu", "") || (base && valor<boolean>(c, "api.menu", true) !== false ? base : "");
      const rodape = valor(c, "cores.rodape", "") || valor(c, "cores.primariaEscura", "");
      const auto = valor<boolean>(c, "grupos.ordemAutomatica", true) !== false;
      setForm({
        ...FORM_INICIAL,
        pasta,
        nome: valor(c, "cliente.nome", ""),
        nomeCompleto: valor(c, "cliente.nomeCompleto", ""),
        site: valor(c, "cliente.site", ""),
        cnpj: valor(c, "cliente.cnpj", ""),
        endereco: valor(c, "cliente.endereco", ""),
        telefone: valor(c, "cliente.telefone", ""),
        email: valor(c, "cliente.email", ""),
        youtube: redes.youtube ?? "",
        instagram: redes.instagram ?? "",
        facebook: redes.facebook ?? "",
        x: redes.x ?? "",
        urlTransparencia: urlT,
        urlMenu: urlM,
        atualizarMinutos: valor(c, "api.atualizarMinutos", 5),
        titulo: valor(c, "textos.titulo", FORM_INICIAL.titulo),
        subtitulo: valor(c, "textos.subtitulo", FORM_INICIAL.subtitulo),
        placeholderBusca: valor(c, "textos.placeholderBusca", FORM_INICIAL.placeholderBusca),
        seoUrl: valor(c, "seo.url", ""),
        seoDescricao: valor(c, "seo.descricao", ""),
        ordemAutomatica: auto,
        vlibras: valor<boolean>(c, "acessibilidade.vlibras", true) !== false,
        feedback: valor<boolean>(c, "recursos.feedback", true) !== false,
        linksNovaAba: !!valor<boolean>(c, "recursos.linksNovaAba", false),
        autoP: false,
        autoA: false,
        autoF: !rodape,
        corPrimaria: valor(c, "cores.primaria", FORM_INICIAL.corPrimaria),
        corDestaque: valor(c, "cores.destaque", FORM_INICIAL.corDestaque),
        corRodape: rodape || FORM_INICIAL.corRodape,
      });
      setPastaEdit(pasta);

      const icones: Record<string, string> = {};
      const descs: Record<string, string> = {};
      for (const [k, v] of Object.entries(valor<Record<string, string>>(c, "grupos.icones", {}))) icones[chave(k)] = v;
      for (const [k, v] of Object.entries(valor<Record<string, string>>(c, "grupos.descricoes", {}))) descs[chave(k)] = v;
      const ocultos = valor<string[]>(c, "grupos.ocultar", []).map(chave);
      cfgRef.current = { icones, descs, ocultos };
      setGrupos(
        valor<string[]>(c, "grupos.ordem", []).map((n) => ({
          nome: n,
          itens: null,
          icone: icones[chave(n)] ?? "",
          descricao: descs[chave(n)] ?? "",
          ocultar: ocultos.includes(chave(n)),
        })),
      );

      const prox: Record<string, ItemExtra> = {};
      valor<Partial<ItemExtra>[]>(c, "itensExtras", []).forEach((e, i) => {
        const k = e.Ref || chave(`${e.Fonte || "extra" + i}|${e.Descricao}`);
        prox[k] = {
          Ref: k,
          Grupo: e.Grupo ?? "",
          Descricao: e.Descricao ?? "",
          Link: e.Link ?? "",
          MaisInformacoes: e.MaisInformacoes ?? "",
          NomeImagem: e.NomeImagem ?? "",
          Amparo: e.Amparo ?? "",
          Fonte: e.Fonte ?? "",
        };
      });
      setExtras(prox);

      if (logoDataUrl) usarLogo(logoDataUrl, "Logo atual (clique para trocar)", false);
      testar("transparencia", urlT, pasta, auto);
      testar("menu", urlM, pasta, auto);
    } catch (e) {
      setErroForm(e instanceof Error ? e.message : "Não foi possível carregar o cliente.");
    }
  }

  // Importa um portal do gerador antigo (pasta clientes/<nome> inteira ou arquivos soltos).
  async function importarPortal(lista: FileList | null) {
    if (!lista || !lista.length) return;
    setErroForm(null);
    setImportando(true);
    try {
      const arquivos = Array.from(lista);
      const configs = arquivos.filter((f) => f.name.toLowerCase() === "config.json");
      if (configs.length !== 1) {
        throw new Error(
          configs.length ? "Foram encontrados vários config.json: escolha a pasta de um único cliente." : "Não encontrei o config.json: escolha a pasta clientes/<nome> do gerador antigo.",
        );
      }
      let cfg: ConfigPortal = {};
      try {
        cfg = JSON.parse((await configs[0].text()).replace(/^﻿/, ""));
      } catch {
        throw new Error("O config.json não é um JSON válido.");
      }
      const porNome = (n: string) => arquivos.find((f) => f.name.toLowerCase() === n.toLowerCase());
      const imagem = /\.(png|jpe?g|svg|webp|gif)$/i;
      const nomeLogo = valor<string>(cfg, "cliente.logo", "");
      const nomeIcone = valor<string>(cfg, "cliente.icone", "");
      const logo =
        (nomeLogo && porNome(nomeLogo)) || arquivos.find((f) => /^logo\.[a-z]+$/i.test(f.name) && imagem.test(f.name));
      const icone =
        (nomeIcone && nomeIcone !== nomeLogo && porNome(nomeIcone)) ||
        arquivos.find((f) => /^logo-icon\.[a-z]+$/i.test(f.name) && imagem.test(f.name));
      const res = await geradorApi.importar({
        config: configs[0],
        logo: logo || undefined,
        icone: icone || undefined,
        cacheTransparencia: porNome("cache_transparencia.json"),
        cacheMenu: porNome("cache_menu.json"),
        cacheOrdem: porNome("cache_ordem.json"),
      });
      await listarClientes();
      if (res.pasta) await carregarCliente(res.pasta);
      setResultado({ ok: true, pasta: res.pasta, novo: res.novo, avisos: res.avisos });
    } catch (e) {
      setErroForm(e instanceof Error ? e.message : "Não foi possível importar o portal.");
    } finally {
      setImportando(false);
    }
  }

  // Cadastra um portal que já existe fora do gerador: o servidor lê o link e preenche tudo.
  async function cadastrarPorLink() {
    if (!linkPortal.trim()) return;
    setErroForm(null);
    setResultado(null);
    setLendoLink(true);
    try {
      const res = await geradorApi.importarLink(linkPortal.trim(), linkPasta.trim());
      const r = res.resumo;
      const lido = r
        ? [`Lido de ${r.nome}: ${r.itens} itens em ${r.grupos} categorias, menu com ${r.menu} itens${r.api ? `, API ${r.api}` : ""}.`]
        : [];
      await listarClientes();
      if (res.pasta) await carregarCliente(res.pasta);
      setResultado({ ok: true, pasta: res.pasta, novo: res.novo, avisos: [...lido, ...(res.avisos ?? [])] });
      setLinkPortal("");
      setLinkPasta("");
    } catch (e) {
      setErroForm(e instanceof Error ? e.message : "Não foi possível cadastrar o portal por esse link.");
    } finally {
      setLendoLink(false);
    }
  }

  async function excluirCliente() {
    if (!editando) return;
    const ok = await confirmar({
      title: "Excluir cliente",
      message: `Excluir o portal "${form.nome || pastaEdit}" do gerador? Isso apaga a configuração, a logo e os dados em cache guardados aqui (o que já foi publicado na hospedagem não é afetado).`,
      tone: "danger",
      confirmLabel: "Excluir",
    });
    if (!ok) return;
    try {
      await geradorApi.excluir(pastaEdit);
      limpar();
      listarClientes();
    } catch (e) {
      setErroForm(e instanceof Error ? e.message : "Não foi possível excluir.");
    }
  }

  /* ---------- gerar ---------- */

  async function gerar() {
    setErroForm(null);
    const nome = form.nome.trim();
    if (!nome) {
      setErroForm("Informe o nome do cliente (passo 2).");
      return;
    }
    const lista = Object.values(extras);
    const semLink = lista.filter((e) => !e.Link);
    if (semLink.length) {
      setErroForm(
        `Falta o link de ${semLink.length} botão(ões) das sugestões: ${semLink.slice(0, 8).map((e) => e.Descricao).join(", ")}. Preencha o link ou desmarque a sugestão (passo 5).`,
      );
      return;
    }
    const redes = (["youtube", "instagram", "facebook", "x"] as const)
      .map((t) => ({ tipo: t, url: form[t].trim() }))
      .filter((r) => r.url);
    const icones: Record<string, string> = {};
    const descricoes: Record<string, string> = {};
    grupos.forEach((g) => {
      if (g.icone) icones[g.nome] = g.icone;
      if (g.descricao.trim()) descricoes[g.nome] = g.descricao.trim();
    });
    const dados: Record<string, unknown> = {
      pasta: editando ? pastaEdit : form.pasta.trim() || slug(nome),
      preset: form.preset ? "atricon" : "",
      cliente: {
        nome,
        nomeCompleto: form.nomeCompleto.trim() || nome,
        site: form.site.trim(),
        cnpj: form.cnpj.trim(),
        endereco: form.endereco.trim(),
        telefone: form.telefone.trim(),
        email: form.email.trim(),
        redes,
      },
      cores: { primaria: form.corPrimaria, destaque: form.corDestaque, ...(form.autoF ? {} : { rodape: form.corRodape }) },
      api: { urlTransparencia: form.urlTransparencia.trim(), urlMenu: form.urlMenu.trim(), atualizarMinutos: Number(form.atualizarMinutos) || 5 },
      seo: { url: form.seoUrl.trim(), descricao: form.seoDescricao.trim() },
      textos: { titulo: form.titulo.trim(), subtitulo: form.subtitulo.trim(), placeholderBusca: form.placeholderBusca.trim() },
      acessibilidade: { vlibras: form.vlibras },
      recursos: { feedback: form.feedback, linksNovaAba: form.linksNovaAba },
      itensExtras: lista,
    };
    if (grupos.length) {
      dados.grupos = {
        ordemAutomatica: form.ordemAutomatica,
        ordem: grupos.map((g) => g.nome),
        ocultar: grupos.filter((g) => g.ocultar).map((g) => g.nome),
        icones,
        descricoes,
      };
    }
    setGerando(true);
    try {
      const res = await geradorApi.gerar(dados, logoFile, iconeFile);
      setResultado(res);
      if (res.ok && res.pasta) {
        setLogoFile(null);
        setIconeFile(null);
        if (res.novo) setPastaEdit(res.pasta);
        listarClientes();
      }
      setTimeout(() => topoResultado.current?.scrollIntoView({ behavior: "smooth" }), 50);
    } catch (e) {
      setErroForm(e instanceof Error ? e.message : "Falha ao falar com o servidor.");
    } finally {
      setGerando(false);
    }
  }

  async function baixarZip(pasta: string) {
    setBaixando(true);
    try {
      await geradorApi.baixarZip(pasta);
    } catch (e) {
      setErroForm(e instanceof Error ? e.message : "Não foi possível baixar o ZIP.");
    } finally {
      setBaixando(false);
    }
  }

  const infoRodape = ["cnpj", "endereco", "telefone", "email"]
    .map((k) => {
      const v = form[k as "cnpj" | "endereco" | "telefone" | "email"].trim();
      return k === "cnpj" && v ? `CNPJ: ${v}` : v;
    })
    .filter(Boolean)
    .join(" · ");

  const contraste = contrasteBranco(form.corPrimaria);

  return (
    <div className="animate-page-in space-y-5">
      {sprite && (
        <div aria-hidden="true" style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }} dangerouslySetInnerHTML={{ __html: sprite.svg }} />
      )}

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold sm:text-3xl text-ink">Gerador de transparência</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Monta o Portal da Transparência de um cliente a partir das APIs de dados abertos, e entrega o pacote (ZIP) para publicar.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-ink-muted">Editar existente</span>
          <select
            className={`${INPUT} min-w-[220px]`}
            value={pastaEdit}
            onChange={(e) => (e.target.value ? carregarCliente(e.target.value) : limpar())}
          >
            <option value="">— novo cliente —</option>
            {clientes.map((c) => (
              <option key={c.pasta} value={c.pasta}>
                {c.nome} ({c.pasta}){c.externo ? " · via link" : ""}
              </option>
            ))}
          </select>
        </label>
      </header>

      <section className="rounded-xl border border-border bg-surface p-4 text-sm shadow-soft">
        <h2 className="flex items-center gap-2 font-semibold text-ink">
          <Link2 size={16} /> Cadastrar portal que já existe, pelo link
        </h2>
        <p className="mt-1 text-ink-muted">
          Cole o endereço de um portal já publicado (ex.: <code>https://previspa.rj.gov.br/transparencia/</code>). O sistema lê a página e
          preenche nome, logo, cores, contatos, menu, categorias e a API de dados abertos. Depois é só conferir e, se quiser, baixar o pacote.
        </p>
        <form
          className="mt-3 flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            cadastrarPorLink();
          }}
        >
          <input
            type="url"
            className={`${INPUT} min-w-[260px] flex-1`}
            value={linkPortal}
            placeholder="https://portal-do-cliente.gov.br/transparencia/"
            aria-label="Link do portal"
            onChange={(e) => setLinkPortal(e.target.value)}
          />
          <input
            type="text"
            className={`${INPUT} w-44`}
            value={linkPasta}
            placeholder="pasta (opcional)"
            aria-label="Nome da pasta (opcional)"
            onChange={(e) => setLinkPasta(e.target.value)}
          />
          <Button type="submit" disabled={lendoLink || !linkPortal.trim()}>
            {lendoLink ? "Lendo o portal…" : "Cadastrar"}
          </Button>
        </form>
      </section>

      <details className="rounded-xl border border-border bg-surface px-4 py-2.5 text-sm shadow-soft">
        <summary className="cursor-pointer font-medium text-ink">Importar portal do gerador antigo (arquivos)</summary>
        <p className="mt-2 text-ink-muted">
          Traz um portal do gerador antigo para cá. Escolha a pasta <code>clientes/&lt;nome&gt;</code> inteira (config.json, logo e
          <code> dados/cache_*.json</code> são localizados sozinhos) ou selecione os arquivos soltos.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <label className={`inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border px-3 py-2 font-semibold hover:border-petrol ${importando ? "pointer-events-none opacity-50" : ""}`}>
            <Upload size={16} /> {importando ? "Importando…" : "Escolher pasta"}
            <input
              type="file"
              hidden
              multiple
              {...({ webkitdirectory: "" } as object)}
              onChange={(e) => {
                importarPortal(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
          <label className={`inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border px-3 py-2 font-semibold hover:border-petrol ${importando ? "pointer-events-none opacity-50" : ""}`}>
            <Upload size={16} /> Escolher arquivos soltos
            <input
              type="file"
              hidden
              multiple
              onChange={(e) => {
                importarPortal(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      </details>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          <Passo n={1} titulo="APIs de dados abertos" dica={<>Cole a URL de cada API. Pode ser a URL completa, só o endereço do portal (<code>transparencia.cliente.gov.br</code>) ou deixar em branco se não houver.</>}>
            <div className="space-y-4">
              <Campo label="API da Transparência">
                <div className="flex gap-2">
                  <input
                    type="text"
                    className={INPUT}
                    value={form.urlTransparencia}
                    placeholder="https://transparencia.cliente.gov.br/dadosabertosexportar?d=transparencia&a=&f=json"
                    onChange={(e) => set("urlTransparencia", e.target.value)}
                    onBlur={aoSairTransparencia}
                  />
                  <Button type="button" variant="ghost" onClick={() => testar("transparencia")}>Testar</Button>
                </div>
                {stT && <Status tipo={stT.tipo}>{stT.texto}</Status>}
              </Campo>
              <Campo label="API do Menu">
                <div className="flex gap-2">
                  <input
                    type="text"
                    className={INPUT}
                    value={form.urlMenu}
                    placeholder="https://transparencia.cliente.gov.br/dadosabertosexportar?d=menu&a=&f=json"
                    onChange={(e) => set("urlMenu", e.target.value)}
                    onBlur={aoSairMenu}
                  />
                  <Button type="button" variant="ghost" onClick={() => testar("menu")}>Testar</Button>
                </div>
                {stM && <Status tipo={stM.tipo}>{stM.texto}</Status>}
              </Campo>
              <Check checked={form.preset} onChange={(v) => set("preset", v)}>
                Usar o catálogo Atricon (128 itens) como reserva, para cliente sem API ou com API incompleta
              </Check>
            </div>
          </Passo>

          <Passo n={2} titulo="Identidade" dica="Envie a logo e as cores do menu e do rodapé são tiradas dela automaticamente.">
            <div className="grid gap-4 sm:grid-cols-2">
              <label
                className={`flex min-h-[110px] cursor-pointer items-center gap-4 rounded-xl border-2 border-dashed p-4 sm:col-span-2 ${
                  arrastando ? "border-petrol bg-petrol/5" : "border-border bg-bg hover:border-petrol"
                }`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setArrastando(true);
                }}
                onDragLeave={() => setArrastando(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setArrastando(false);
                  escolherLogo(e.dataTransfer.files[0]);
                }}
              >
                {logoUrl ? <img src={logoUrl} alt="" className="max-h-[78px] max-w-[220px]" /> : <Upload className="text-ink-muted" />}
                <span className="text-sm text-ink-muted">
                  <b className="block text-ink">{logoNome || "Clique ou arraste a logo aqui"}</b>
                  PNG, SVG, JPG ou WEBP, com até 3 MB
                </span>
                <input type="file" hidden accept=".png,.jpg,.jpeg,.svg,.webp,.gif" onChange={(e) => escolherLogo(e.target.files?.[0])} />
              </label>

              <Campo label="Nome curto">
                <input type="text" className={INPUT} value={form.nome} placeholder="Ex.: IPRES, Câmara de Saquarema" onChange={(e) => set("nome", e.target.value)} />
              </Campo>
              <Campo label="Nome institucional completo">
                <input type="text" className={INPUT} value={form.nomeCompleto} placeholder="Instituto de Previdência dos Servidores..." onChange={(e) => set("nomeCompleto", e.target.value)} />
              </Campo>
              <Campo label="Site principal" hint="para onde a logo leva">
                <input type="url" className={INPUT} value={form.site} placeholder="https://cliente.gov.br/" onChange={(e) => set("site", e.target.value)} />
              </Campo>
              <Campo label="Ícone da aba" hint="opcional; se vazio, usa a logo">
                <input type="file" className={INPUT} accept=".png,.jpg,.jpeg,.svg,.webp" onChange={(e) => setIconeFile(e.target.files?.[0] ?? null)} />
              </Campo>

              <div className="sm:col-span-2">
                <span className="mb-1 block text-sm font-medium text-ink">
                  Cores <span className="font-normal text-ink-muted">· as cores encontradas na logo aparecem aqui. Clique numa delas para usar no menu; com Shift, para usar no destaque.</span>
                </span>
                <div className="flex flex-wrap gap-2">
                  {paleta.map((c) => (
                    <button
                      key={c.hex}
                      type="button"
                      title={c.hex}
                      onClick={(e) => clicarCor(c.hex, e.shiftKey)}
                      className="h-8 w-8 rounded-lg border-2 border-surface shadow-[0_0_0_1px_rgb(var(--color-border))] hover:shadow-[0_0_0_2px_rgb(var(--color-petrol))]"
                      style={{ background: c.hex }}
                    />
                  ))}
                </div>
              </div>

              <div className="grid gap-3 sm:col-span-2 sm:grid-cols-3">
                <SeletorCor
                  rotulo="Menu"
                  etiqueta={form.autoP && logoFile ? "da logo" : ""}
                  valor={form.corPrimaria}
                  onChange={(v) => setForm((f) => ({ ...f, corPrimaria: v, autoP: false }))}
                />
                <SeletorCor
                  rotulo="Destaque"
                  etiqueta={form.autoA && logoFile ? "da logo" : ""}
                  valor={form.corDestaque}
                  onChange={(v) => setForm((f) => ({ ...f, corDestaque: v, autoA: false }))}
                />
                <SeletorCor
                  rotulo="Rodapé"
                  etiqueta={form.autoF ? "automático" : "voltar ao automático"}
                  onEtiqueta={form.autoF ? undefined : () => set("autoF", true)}
                  valor={rodapeEfetivo}
                  onChange={(v) => setForm((f) => ({ ...f, corRodape: v, autoF: false }))}
                />
              </div>
              {contraste < 4.5 && (
                <p className="text-xs text-crit sm:col-span-2">
                  O texto branco no menu tem contraste baixo ({contraste.toFixed(1)}:1). Escolha uma cor do menu mais escura.
                </p>
              )}
            </div>
          </Passo>

          <Passo n={3} titulo="Rodapé" dica="O rodapé padrão mostra o nome completo, os contatos e as redes sociais. Campos vazios não aparecem.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo label="CNPJ"><input type="text" className={INPUT} value={form.cnpj} placeholder="00.000.000/0001-00" onChange={(e) => set("cnpj", e.target.value)} /></Campo>
              <Campo label="Telefone"><input type="text" className={INPUT} value={form.telefone} placeholder="(22) 0000-0000" onChange={(e) => set("telefone", e.target.value)} /></Campo>
              <Campo label="Endereço" className="sm:col-span-2"><input type="text" className={INPUT} value={form.endereco} placeholder="Rua, nº - Bairro, CEP, Cidade" onChange={(e) => set("endereco", e.target.value)} /></Campo>
              <Campo label="E-mail"><input type="email" className={INPUT} value={form.email} placeholder="contato@cliente.gov.br" onChange={(e) => set("email", e.target.value)} /></Campo>
              <Campo label="YouTube"><input type="url" className={INPUT} value={form.youtube} placeholder="https://youtube.com/@..." onChange={(e) => set("youtube", e.target.value)} /></Campo>
              <Campo label="Instagram"><input type="url" className={INPUT} value={form.instagram} placeholder="https://instagram.com/..." onChange={(e) => set("instagram", e.target.value)} /></Campo>
              <Campo label="Facebook"><input type="url" className={INPUT} value={form.facebook} placeholder="https://facebook.com/..." onChange={(e) => set("facebook", e.target.value)} /></Campo>
              <Campo label="X (Twitter)"><input type="url" className={INPUT} value={form.x} placeholder="https://x.com/..." onChange={(e) => set("x", e.target.value)} /></Campo>
            </div>
          </Passo>

          <Passo n={4} titulo="Categorias da transparência" dica="Vêm da API. Ajuste o ícone e a descrição de cada uma, ou oculte as que não quiser mostrar.">
            <Check checked={form.ordemAutomatica} onChange={alternarOrdemAuto} className="mb-2">
              Seguir a ordem de exibição do portal oficial do cliente (categorias e botões, atualizada sozinha)
            </Check>
            {stT?.tipo === "ok" &&
              (!form.ordemAutomatica ? (
                <Status tipo="load">Ordem definida por você aqui (as setas mandam). Os botões dentro de cada categoria seguem o portal oficial.</Status>
              ) : ordemOficial ? (
                <Status tipo="ok">
                  ✔ Ordem lida do portal oficial ({ordemOficial.length} categorias e os botões de cada uma).<br />
                  <small>{paginaOficial}</small>
                </Status>
              ) : (
                <Status tipo="bad">
                  Não achei a ordem no portal oficial do cliente: as categorias ficam na ordem em que a API as devolve. Reordene aqui se precisar.
                </Status>
              ))}
            <div className="mt-3">
              <CategoriasStep grupos={grupos} iconesIds={sprite?.ids ?? []} onMover={moverGrupo} onMudar={mudarGrupo} />
            </div>
          </Passo>

          <Passo
            n={5}
            titulo="Sugestões de botões"
            dica={<>Compara o que o cliente já publica com a <b>cartilha da Atricon</b> (Programa Nacional de Transparência Pública) e com o <b>portal da MesquitaPrev</b>, RPPS já preparado para auditoria do Pró-Gestão. Cada sugestão traz a base legal (passe o mouse na etiqueta) e se é obrigatória, essencial ou só recomendada — marque o que faltar, confira o nome, escolha a categoria e cole o link.</>}
          >
            <SugestoesStep catalogos={catalogos} gruposDoPortal={grupos.map((g) => g.nome)} extras={extras} onExtras={setExtras} />
          </Passo>

          <details className="rounded-2xl border border-border bg-surface p-5 shadow-soft">
            <summary className="cursor-pointer text-base font-semibold text-ink">
              <span className="mr-2.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-petrol text-xs font-bold text-on-petrol">6</span>
              Textos, SEO e recursos <small className="font-normal text-ink-muted">opcional</small>
            </summary>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Campo label="Título da página"><input type="text" className={INPUT} value={form.titulo} onChange={(e) => set("titulo", e.target.value)} /></Campo>
              <Campo label="Texto de exemplo da busca"><input type="text" className={INPUT} value={form.placeholderBusca} onChange={(e) => set("placeholderBusca", e.target.value)} /></Campo>
              <Campo label="Subtítulo" className="sm:col-span-2"><input type="text" className={INPUT} value={form.subtitulo} onChange={(e) => set("subtitulo", e.target.value)} /></Campo>
              <Campo label="Endereço público do portal" hint="para o Google e para compartilhamento"><input type="url" className={INPUT} value={form.seoUrl} placeholder="https://cliente.gov.br/transparencia/" onChange={(e) => set("seoUrl", e.target.value)} /></Campo>
              <Campo label="Atualizar dados a cada (min)"><input type="number" min={1} className={INPUT} value={form.atualizarMinutos} onChange={(e) => set("atualizarMinutos", Number(e.target.value))} /></Campo>
              <Campo label="Descrição para o Google" className="sm:col-span-2">
                <textarea rows={2} className={INPUT} value={form.seoDescricao} placeholder="Gerada automaticamente se ficar vazia" onChange={(e) => set("seoDescricao", e.target.value)} />
              </Campo>
              <Check checked={form.vlibras} onChange={(v) => set("vlibras", v)}>Tradutor de Libras (VLibras)</Check>
              <Check checked={form.feedback} onChange={(v) => set("feedback", v)}>"Essa informação foi útil?"</Check>
              <Check checked={form.linksNovaAba} onChange={(v) => set("linksNovaAba", v)}>Abrir links externos em nova aba</Check>
              <Campo label="Pasta" hint="nome do pacote">
                <input type="text" className={INPUT} value={editando ? pastaEdit : form.pasta} readOnly={editando} placeholder="gerada a partir do nome" onChange={(e) => set("pasta", e.target.value)} />
              </Campo>
            </div>
          </details>

          {erroForm && <div className="rounded-xl bg-crit/10 px-4 py-3 text-sm text-crit">{erroForm}</div>}

          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" onClick={gerar} disabled={gerando} className="px-6 py-3">
              {gerando ? "Gerando…" : editando ? "Salvar e atualizar portal" : "Gerar portal"}
            </Button>
            {editando && (
              <>
                <a
                  href={geradorApi.urlVisualizacao(pastaEdit)}
                  target="_blank"
                  rel="noopener"
                  className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-semibold hover:border-petrol"
                >
                  <ExternalLink size={16} /> Ver portal
                </a>
                <Button type="button" variant="ghost" onClick={() => baixarZip(pastaEdit)} disabled={baixando}>
                  <Download size={16} /> Baixar ZIP
                </Button>
                <Button type="button" variant="ghost" onClick={excluirCliente}>
                  <Trash2 size={16} /> Excluir cliente
                </Button>
              </>
            )}
            <span className="text-sm text-ink-muted">
              {editando ? (
                <>Editando <code>{pastaEdit}</code>. Os dados e o histórico de feedback já publicados não são tocados.</>
              ) : form.nome.trim() ? (
                <>Será criado como <code>{form.pasta.trim() || slug(form.nome)}</code></>
              ) : null}
            </span>
          </div>

          <div ref={topoResultado}>
            {resultado && (
              <Card className="p-5">
                {resultado.ok ? (
                  <>
                    <h2 className="text-base font-semibold text-ink">
                      {resultado.novo ? `Portal criado: ${resultado.pasta}` : "Portal atualizado"}
                    </h2>
                    {!!resultado.avisos?.length && (
                      <ul className="mt-2 list-disc pl-5 text-sm text-warn">
                        {resultado.avisos.map((a, i) => (
                          <li key={i}>{a}</li>
                        ))}
                      </ul>
                    )}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {resultado.pasta && (
                        <a
                          href={geradorApi.urlVisualizacao(resultado.pasta)}
                          target="_blank"
                          rel="noopener"
                          className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-semibold hover:border-petrol"
                        >
                          <ExternalLink size={16} /> Ver portal
                        </a>
                      )}
                      <Button type="button" onClick={() => resultado.pasta && baixarZip(resultado.pasta)} disabled={baixando}>
                        <Download size={16} /> Baixar ZIP para publicar
                      </Button>
                    </div>
                    <div className="mt-4 rounded-xl bg-bg p-4 text-sm text-ink-muted">
                      <b className="text-ink">Como publicar</b>
                      <ol className="mt-1 list-decimal space-y-0.5 pl-5">
                        <li>Descompacte o ZIP e envie o conteúdo para uma hospedagem com <b>PHP</b> (o portal gerado é PHP, não roda no Regula).</li>
                        <li>A pasta <code>dados/</code> precisa de permissão de escrita (cache da API e votos de feedback).</li>
                        <li>Depois de publicar, abra <code>/diagnostico.php</code> no portal para conferir se a API responde.</li>
                      </ol>
                    </div>
                  </>
                ) : (
                  <>
                    <h2 className="text-base font-semibold text-crit">Não foi possível gerar</h2>
                    <p className="mt-1 text-sm text-ink-muted">{resultado.erro ?? "erro desconhecido"}</p>
                  </>
                )}
              </Card>
            )}
          </div>
        </div>

        <aside className="lg:sticky lg:top-4">
          <PreviewMock
            nome={form.nome.trim()}
            nomeCompleto={form.nomeCompleto.trim()}
            logoUrl={logoUrl}
            menuItens={menuItens}
            titulo={form.titulo}
            grupos={grupos.filter((g) => !g.ocultar).map((g) => g.nome)}
            infoRodape={infoRodape}
            primaria={form.corPrimaria}
            destaque={form.corDestaque}
            rodape={rodapeEfetivo}
          />
        </aside>
      </div>
    </div>
  );
}

function SeletorCor({
  rotulo,
  etiqueta,
  onEtiqueta,
  valor,
  onChange,
}: {
  rotulo: string;
  etiqueta: string;
  onEtiqueta?: () => void;
  valor: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-border p-2">
      <input type="color" value={valor} onChange={(e) => onChange(e.target.value)} className="h-10 w-10 cursor-pointer border-0 bg-transparent p-0" aria-label={`Cor do ${rotulo}`} />
      <div className="text-xs leading-tight">
        <b className="block text-sm text-ink">{rotulo}</b>
        {etiqueta &&
          (onEtiqueta ? (
            <button type="button" onClick={onEtiqueta} className="font-bold uppercase text-ok">{etiqueta}</button>
          ) : (
            <span className="font-bold uppercase text-ok">{etiqueta}</span>
          ))}{" "}
        <code className="text-ink-muted">{valor}</code>
      </div>
    </div>
  );
}

