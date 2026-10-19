import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowRight, ArrowUp, Calendar, ChevronDown, Clock, FileText, Hash, Mail, MapPin, Menu, Phone, Search, Share2, Trash2 } from "lucide-react";
import type { PortalPrevidenciario, RegistroTransparenciaApi } from "../../lib/api";
import type { ConfigListaDocumentos } from "../portal-previdenciario/ListaDocumentosView";
import "../../styles/portal-basico.css";

// Página do estilo BÁSICO (Tenant.portalEstiloPaginas = "basico"): réplica enxuta do visual dos portais de
// transparência dos órgãos (ex.: transparencia.angraprev.rj.gov.br/publicacoes) — barra superior, logo, menu
// horizontal, trilha, painel de filtros, lista de cartões, paginação e rodapé. Propositalmente SEM relação com o
// layout, as cores e a tipografia do resto do sistema (tudo vem de styles/portal-basico.css, escopado em .pb).
// Os dados e as configurações por página são os mesmos do estilo completo (ConfigListaDocumentos).

const POR_PAGINA = 30;
const COR_PADRAO = "#2d886c";

interface Item {
  titulo: string;
  detalhe: string;
  ano: number | null;
  ordem: number;
  grupo: string;
  data: string | null; // aaaa-mm-dd
  links: { rotulo: string; url: string }[];
}

interface Filtros {
  texto: string;
  ano: string;
  grupo: string;
  de: string;
  ate: string;
}
const SEM_FILTROS: Filtros = { texto: "", ano: "", grupo: "", de: "", ate: "" };

function semAcento(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// primeira data reconhecível do registro (os campos de data variam de endpoint para endpoint)
const CAMPOS_DATA = ["data", "dataabertura", "datacontrato", "datacriacao", "vigenciainicio", "data_validade", "aprovacao", "inicio", "credenciamento", "renovacao"];
function dataDoRegistro(r: RegistroTransparenciaApi): string | null {
  const minusculo = new Map<string, unknown>();
  for (const [k, v] of Object.entries(r)) minusculo.set(k.toLowerCase(), v);
  for (const campo of CAMPOS_DATA) {
    const v = minusculo.get(campo);
    if (typeof v !== "string") continue;
    const iso = v.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    const br = v.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  }
  return null;
}

function formatarData(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

// a data já aparece em itálico logo abaixo do título: tira do texto de detalhe o pedaço que é só a data
function semDataRepetida(detalhe: string, iso: string | null): string {
  if (!iso) return detalhe;
  const br = formatarData(iso);
  return detalhe
    .split(" · ")
    .filter((p) => p.trim() !== br && p.trim() !== `Data: ${br}`)
    .join(" · ");
}

function recente(iso: string | null): boolean {
  if (!iso) return false;
  const t = new Date(`${iso}T00:00:00`).getTime();
  const agora = Date.now();
  return t <= agora + 86_400_000 && agora - t <= 30 * 86_400_000;
}

function baixar(nome: string, tipo: string, conteudo: string) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}

// 1 … 4 5 [6] 7 8 … 60
function janela(atual: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const s = new Set<number>([1, total, atual - 1, atual, atual + 1]);
  if (atual <= 3) [2, 3, 4].forEach((p) => s.add(p));
  if (atual >= total - 2) [total - 3, total - 2, total - 1].forEach((p) => s.add(p));
  const ord = [...s].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const saida: (number | "…")[] = [];
  ord.forEach((p, i) => {
    if (i > 0 && p - ord[i - 1] > 1) saida.push("…");
    saida.push(p);
  });
  return saida;
}

export function PortalBasico({
  slug,
  dados,
  titulo,
  atualizadoEm,
  registros,
  config,
}: {
  slug: string;
  dados: PortalPrevidenciario | null;
  titulo: string;
  atualizadoEm: string | null;
  registros: RegistroTransparenciaApi[];
  config: ConfigListaDocumentos | null;
}) {
  const [rascunho, setRascunho] = useState<Filtros>(SEM_FILTROS);
  const [aplicado, setAplicado] = useState<Filtros>(SEM_FILTROS);
  const [pagina, setPagina] = useState(1);
  const [exportarAberto, setExportarAberto] = useState(false);
  const [menuAberto, setMenuAberto] = useState(false); // só no celular

  const tenant = dados?.tenant;
  const rodape = dados?.rodape ?? null;
  const cor = tenant?.corPrimaria && /^#[0-9a-fA-F]{6}$/.test(tenant.corPrimaria) ? tenant.corPrimaria : COR_PADRAO;
  const nome = tenant?.name ?? "Portal da Transparência";
  const siteUrl = tenant?.site && /^https?:\/\//i.test(tenant.site) ? tenant.site : `/portal-previdenciario/${slug}`;

  // fecha o menu "Exportar" ao clicar fora
  useEffect(() => {
    if (!exportarAberto) return;
    const fechar = () => setExportarAberto(false);
    window.addEventListener("click", fechar);
    return () => window.removeEventListener("click", fechar);
  }, [exportarAberto]);

  const itens = useMemo<Item[]>(() => {
    if (!config) return [];
    return registros
      .map((r, i) => {
        const data = dataDoRegistro(r);
        return {
        titulo: config.titulo(r).trim(),
        detalhe: semDataRepetida(config.detalhe?.(r).trim() ?? "", data),
        ano: config.ano(r),
        ordem: config.ordem(r, i),
        grupo: config.grupo?.valor(r).trim() ?? "",
        data,
        links: config.links
          .map((l) => ({ rotulo: l.rotulo, campo: l.campo, url: typeof r[l.campo] === "string" ? (r[l.campo] as string).trim() : "" }))
          // link da origem (http) ou da nossa cópia (/api/…); campo de ARQUIVO só vira botão se for arquivo de verdade
          .filter((l) => {
            if (l.url.startsWith("/")) return true;
            if (!/^https?:\/\//i.test(l.url)) return false;
            return !/arquivo/i.test(l.campo) || /\.(pdf|docx?|xlsx?|odt|ods|zip|rar|jpe?g|png)(\?.*)?$/i.test(l.url);
          })
          .map(({ rotulo, url }) => ({ rotulo, url })),
        };
      })
      .sort((a, b) => b.ordem - a.ordem);
  }, [registros, config]);

  const anos = useMemo(() => [...new Set(itens.map((i) => i.ano).filter((a): a is number => a !== null))].sort((a, b) => b - a), [itens]);
  const grupos = useMemo(() => [...new Set(itens.map((i) => i.grupo).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR")), [itens]);
  const temPeriodo = useMemo(() => itens.some((i) => i.data), [itens]);

  const filtrados = useMemo(() => {
    const q = semAcento(aplicado.texto.trim());
    return itens.filter(
      (it) =>
        (!aplicado.ano || String(it.ano) === aplicado.ano) &&
        (!aplicado.grupo || it.grupo === aplicado.grupo) &&
        (!aplicado.de || (it.data !== null && it.data >= aplicado.de)) &&
        (!aplicado.ate || (it.data !== null && it.data <= aplicado.ate)) &&
        (!q || semAcento(`${it.titulo} ${it.detalhe} ${it.grupo}`).includes(q)),
    );
  }, [itens, aplicado]);

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const exibidos = filtrados.slice((paginaAtual - 1) * POR_PAGINA, paginaAtual * POR_PAGINA);

  function pesquisar(e: FormEvent) {
    e.preventDefault();
    setAplicado(rascunho);
    setPagina(1);
  }
  function limpar() {
    setRascunho(SEM_FILTROS);
    setAplicado(SEM_FILTROS);
    setPagina(1);
  }
  function irPara(p: number) {
    setPagina(p);
    document.getElementById("pb-lista")?.scrollIntoView({ block: "start" });
  }

  function exportar(formato: "csv" | "json" | "txt") {
    const linhas = filtrados.map((it) => ({
      data: it.data ? formatarData(it.data) : "",
      exercicio: it.ano ?? "",
      titulo: it.titulo,
      detalhe: it.detalhe,
      grupo: it.grupo,
      arquivos: it.links.map((l) => (l.url.startsWith("/") ? `${window.location.origin}${l.url}` : l.url)).join(" | "),
    }));
    const base = `${slug}-${titulo.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    if (formato === "json") return baixar(`${base}.json`, "application/json", JSON.stringify(linhas, null, 2));
    if (formato === "txt") {
      return baixar(`${base}.txt`, "text/plain", linhas.map((l) => `${l.data} | ${l.exercicio} | ${l.titulo}${l.detalhe ? ` | ${l.detalhe}` : ""}${l.arquivos ? ` | ${l.arquivos}` : ""}`).join("\n"));
    }
    const esc = (v: unknown) => `"${String(v).replace(/"/g, '""')}"`;
    const cab = ["Data", "Exercício", "Título", "Detalhe", "Grupo", "Arquivos"];
    const csv = [cab.map(esc).join(";"), ...linhas.map((l) => [l.data, l.exercicio, l.titulo, l.detalhe, l.grupo, l.arquivos].map(esc).join(";"))].join("\r\n");
    baixar(`${base}.csv`, "text/csv;charset=utf-8", `﻿${csv}`);
  }

  const menu = dados?.menu ?? [];
  const redes = rodape
    ? ([["Facebook", rodape.facebook], ["Instagram", rodape.instagram], ["YouTube", rodape.youtube], ["X", rodape.twitter]] as [string, string | null][]).filter(([, u]) => u)
    : [];
  const endereco = rodape ? [rodape.rua && rodape.numero ? `${rodape.rua}, ${rodape.numero}` : rodape.rua, rodape.bairro, rodape.cep].filter(Boolean).join(" - ") : "";

  return (
    <div className="pb" style={{ "--pb-cor": cor, "--pb-cor-clara": `${cor}1a` } as React.CSSProperties}>
      <div className="pb-topo">
        <div className="pb-container">
          <a className="pb-topo-nome" href={siteUrl}>
            {nome}
          </a>
          {redes.map(([rotulo, url]) => (
            <a key={rotulo} href={url!} target="_blank" rel="noreferrer">
              {rotulo}
            </a>
          ))}
        </div>
      </div>

      <div className="pb-logo">
        <div className="pb-container">
          <a href={siteUrl} aria-label={nome}>
            {tenant?.logoUrl ? <img src={tenant.logoUrl} alt={nome} /> : <span className="pb-logo-texto">{nome}</span>}
          </a>
        </div>
      </div>

      <nav className={`pb-menu${menuAberto ? " aberto" : ""}`} aria-label="Menu principal">
        <div className="pb-container">
          <button type="button" className="pb-menu-toggle" onClick={() => setMenuAberto((a) => !a)} aria-expanded={menuAberto}>
            <Menu size={18} /> Menu
          </button>
          <ul className="pb-menu-lista">
            {menu.map((item) => (
              <li key={item.id} className="pb-menu-item">
                {item.itens.length > 0 ? (
                  <button type="button">
                    {item.nome}
                    <ChevronDown size={13} />
                  </button>
                ) : (
                  <a href={item.pagina} target={item.novaPag === "_blank" ? "_blank" : undefined} rel={item.novaPag === "_blank" ? "noreferrer" : undefined}>
                    {item.nome}
                  </a>
                )}
                {item.itens.length > 0 && (
                  <ul className="pb-submenu">
                    {item.itens.map((f) => (
                      <li key={f.id}>
                        <a href={f.pagina} target={f.novaPag === "_blank" ? "_blank" : undefined} rel={f.novaPag === "_blank" ? "noreferrer" : undefined}>
                          {f.nome}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </div>
      </nav>

      <div className="pb-faixa">
        <div className="pb-container">
          <ol className="pb-trilha">
            <li>
              <a href={siteUrl}>Início</a>
            </li>
            <li>
              <a href={`/portal-previdenciario/${slug}`}>Acesso à informação</a>
            </li>
            <li>{titulo}</li>
          </ol>
        </div>
      </div>

      <main className="pb-principal">
        <div className="pb-container">
          <div className="pb-painel-cab">
            <h1 className="pb-painel-titulo">{titulo}</h1>
            <p className="pb-painel-desc">Utilize os campos abaixo para refinar sua busca</p>
          </div>

          <form className="pb-painel" onSubmit={pesquisar}>
            <div className="pb-grade">
              {temPeriodo && (
                <div className="pb-campo">
                  <label>Período</label>
                  <div className="pb-par">
                    <input type="date" value={rascunho.de} onChange={(e) => setRascunho({ ...rascunho, de: e.target.value })} aria-label="Data inicial" />
                    <input type="date" value={rascunho.ate} onChange={(e) => setRascunho({ ...rascunho, ate: e.target.value })} aria-label="Data final" />
                  </div>
                </div>
              )}
              {config?.grupo && grupos.length > 1 && (
                <div className="pb-campo">
                  <label>{config.grupo.rotulo}</label>
                  <select value={rascunho.grupo} onChange={(e) => setRascunho({ ...rascunho, grupo: e.target.value })}>
                    <option value="">Todos</option>
                    {grupos.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {anos.length > 0 && (
                <div className="pb-campo">
                  <label>Exercício</label>
                  <select value={rascunho.ano} onChange={(e) => setRascunho({ ...rascunho, ano: e.target.value })}>
                    <option value="">Todos</option>
                    {anos.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="pb-campo">
                <label>Descrição</label>
                <input type="text" value={rascunho.texto} onChange={(e) => setRascunho({ ...rascunho, texto: e.target.value })} placeholder="Pesquisar pela descrição" />
              </div>
            </div>

            <div className="pb-acoes">
              <div className="pb-acoes-esq">
                <button type="submit" className="pb-btn pb-btn-cheio">
                  <Search size={15} /> Pesquisar
                </button>
                <button type="button" className="pb-btn pb-btn-vazado" onClick={limpar}>
                  <Trash2 size={15} /> Limpar
                </button>
              </div>
              <div className={`pb-exportar${exportarAberto ? " aberto" : ""}`} onClick={(e) => e.stopPropagation()}>
                <button type="button" className="pb-btn pb-btn-vazado" onClick={() => setExportarAberto((a) => !a)}>
                  <Share2 size={15} /> Exportar <ChevronDown size={13} />
                </button>
                <div className="pb-exportar-menu">
                  <button type="button" onClick={() => { exportar("csv"); setExportarAberto(false); }}>CSV</button>
                  <button type="button" onClick={() => { exportar("json"); setExportarAberto(false); }}>JSON</button>
                  <button type="button" onClick={() => { exportar("txt"); setExportarAberto(false); }}>TXT</button>
                </div>
              </div>
            </div>
          </form>

          <div id="pb-lista" className="pb-lista-cab">
            <div>
              <h2 className="pb-lista-titulo">Lista de {config?.rotuloItens ?? "registros"}</h2>
              <p className="pb-meta">Foram encontrados {filtrados.length} registros</p>
            </div>
            {atualizadoEm && (
              <p className="pb-meta" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <Clock size={13} /> Atualizado em: {new Date(atualizadoEm).toLocaleString("pt-BR")}
              </p>
            )}
          </div>

          {!config ? (
            <div className="pb-vazio">Carregando…</div>
          ) : exibidos.length === 0 ? (
            <div className="pb-vazio">Nenhum registro encontrado para os filtros informados.</div>
          ) : (
            exibidos.map((it, i) => {
              const principal = it.links[0]?.url;
              return (
                <div key={`${paginaAtual}-${i}`} className="pb-card">
                  <span className="pb-card-icone">
                    <FileText size={22} />
                  </span>
                  <div className="pb-card-corpo">
                    {principal ? (
                      <a className="pb-card-titulo" href={principal} target="_blank" rel="noreferrer">
                        {it.titulo || "Sem título"}
                      </a>
                    ) : (
                      <span className="pb-card-titulo">{it.titulo || "Sem título"}</span>
                    )}
                    {it.data && (
                      <span className="pb-card-data">
                        <Calendar size={11} /> {formatarData(it.data)}
                      </span>
                    )}
                    {it.detalhe && <p className="pb-card-desc">{it.detalhe}</p>}
                    {(it.grupo || recente(it.data)) && (
                      <div className="pb-card-tags">
                        {recente(it.data) && <span className="pb-novo">NOVO</span>}
                        {it.grupo && <span className="pb-tag">{it.grupo}</span>}
                        {it.ano !== null && !it.data && <span className="pb-tag">Exercício {it.ano}</span>}
                      </div>
                    )}
                  </div>
                  <div className="pb-card-acoes">
                    {it.links.map((l, k) => (
                      <a key={l.rotulo} className="pb-acessar" href={l.url} target="_blank" rel="noreferrer">
                        {k === 0 ? "Acessar" : l.rotulo} <ArrowRight size={15} />
                      </a>
                    ))}
                  </div>
                </div>
              );
            })
          )}

          {totalPaginas > 1 && (
            <ul className="pb-paginacao" aria-label="Paginação">
              {janela(paginaAtual, totalPaginas).map((p, i) =>
                p === "…" ? (
                  <li key={`e${i}`}>
                    <button type="button" disabled>
                      …
                    </button>
                  </li>
                ) : (
                  <li key={p} className={p === paginaAtual ? "ativo" : ""}>
                    <button type="button" onClick={() => irPara(p)} disabled={p === paginaAtual}>
                      {p}
                    </button>
                  </li>
                ),
              )}
              <li>
                <button type="button" disabled={paginaAtual >= totalPaginas} onClick={() => irPara(paginaAtual + 1)}>
                  Próximo ›
                </button>
              </li>
            </ul>
          )}
        </div>
      </main>

      <footer className="pb-rodape">
        <div className="pb-rodape-main">
          <div className="pb-container pb-rodape-grade">
            <p className="pb-rodape-nome">{nome}</p>
            <ul>
              {rodape?.cnpj && (
                <li>
                  <Hash size={14} /> CNPJ: {rodape.cnpj}
                </li>
              )}
              {endereco && (
                <li>
                  <MapPin size={14} /> {endereco}
                </li>
              )}
              {rodape?.horario && (
                <li>
                  <Clock size={14} /> {rodape.horario}
                </li>
              )}
            </ul>
            <ul>
              {rodape?.telefone && (
                <li>
                  <Phone size={14} /> {rodape.telefone}
                </li>
              )}
              {rodape?.email && (
                <li>
                  <Mail size={14} /> <a href={`mailto:${rodape.email}`}>{rodape.email}</a>
                </li>
              )}
            </ul>
          </div>
        </div>
        <div className="pb-rodape-baixo">
          <div className="pb-container">
            {redes.length > 0 && (
              <div className="pb-redes">
                {redes.map(([rotulo, url]) => (
                  <a key={rotulo} href={url!} target="_blank" rel="noreferrer">
                    {rotulo}
                  </a>
                ))}
              </div>
            )}
            © {new Date().getFullYear()} . Todos os direitos reservados. · Página desenvolvida por NPI BRASIL
          </div>
        </div>
      </footer>

      <button type="button" className="pb-voltar" title="Voltar ao topo" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
        <ArrowUp size={18} />
      </button>
    </div>
  );
}
