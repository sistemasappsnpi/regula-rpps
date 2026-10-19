import { useMemo, useState, type FormEvent } from "react";
import { Calendar, ChevronLeft, ChevronRight, FileText, Search, Trash2 } from "lucide-react";
import type { RegistroTransparenciaApi } from "../../lib/api";
import type { ConfigListaDocumentos } from "./ListaDocumentosView";

// Versão BÁSICA das páginas de lista, no padrão do portal de transparência do órgão
// (ex.: transparencia.angraprev.rj.gov.br/publicacoes): painel de filtros no topo com "Pesquisar" e
// "Limpar", total de registros, lista de cartões simples (título em destaque, descrição, data/exercício,
// arquivos) e paginação à direita com "Próximo". Sem gráficos, sem cartões de resumo, sem animação e sem
// busca inteligente — de propósito. Recebe as mesmas props de ListaDocumentosView (mesma config por página).

interface Item {
  titulo: string;
  detalhe: string;
  ano: number | null;
  ordem: number;
  grupo: string;
  links: { rotulo: string; url: string }[];
}

const POR_PAGINA = 30;

// minúsculo e sem acento: "Previdenciária" encontra "previdenciaria"
function semAcento(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// janela de páginas: 1 … 4 5 [6] 7 8 … 60
function janelaDePaginas(atual: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const paginas = new Set<number>([1, total, atual - 1, atual, atual + 1]);
  if (atual <= 3) [2, 3, 4].forEach((p) => paginas.add(p));
  if (atual >= total - 2) [total - 3, total - 2, total - 1].forEach((p) => paginas.add(p));
  const ordenadas = [...paginas].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const saida: (number | "…")[] = [];
  ordenadas.forEach((p, i) => {
    if (i > 0 && p - ordenadas[i - 1] > 1) saida.push("…");
    saida.push(p);
  });
  return saida;
}

const CAMPO = "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-petrol";

export function ListaBasicaView({ registros, config }: { registros: RegistroTransparenciaApi[]; config: ConfigListaDocumentos }) {
  // o que está digitado nos campos (rascunho) x o que já foi aplicado ao clicar em Pesquisar
  const [rascunho, setRascunho] = useState({ texto: "", ano: "", grupo: "" });
  const [aplicado, setAplicado] = useState({ texto: "", ano: "", grupo: "" });
  const [pagina, setPagina] = useState(1);

  const itens = useMemo<Item[]>(
    () =>
      registros
        .map((r, i) => ({
          titulo: config.titulo(r).trim(),
          detalhe: config.detalhe?.(r).trim() ?? "",
          ano: config.ano(r),
          ordem: config.ordem(r, i),
          grupo: config.grupo?.valor(r).trim() ?? "",
          links: config.links
            .map((l) => ({ rotulo: l.rotulo, url: typeof r[l.campo] === "string" ? (r[l.campo] as string).trim() : "" }))
            // link da origem (http) ou da nossa cópia (/api/…); campo de ARQUIVO só vira botão se for arquivo de
            // verdade (o portal às vezes grava em "Arquivo" o endereço de uma página, não de um PDF)
            .filter((l) => {
              const campo = config.links.find((c) => c.rotulo === l.rotulo)?.campo ?? "";
              if (l.url.startsWith("/")) return true;
              if (!/^https?:\/\//i.test(l.url)) return false;
              return !/arquivo/i.test(campo) || /\.(pdf|docx?|xlsx?|odt|ods|zip|rar|jpe?g|png)(\?.*)?$/i.test(l.url);
            }),
        }))
        .sort((a, b) => b.ordem - a.ordem),
    [registros, config],
  );

  const anos = useMemo(() => [...new Set(itens.map((i) => i.ano).filter((a): a is number => a !== null))].sort((a, b) => b - a), [itens]);
  const grupos = useMemo(() => [...new Set(itens.map((i) => i.grupo).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR")), [itens]);
  const temGrupo = Boolean(config.grupo) && grupos.length > 1;

  const filtrados = useMemo(() => {
    const q = semAcento(aplicado.texto.trim());
    return itens.filter(
      (it) =>
        (!aplicado.ano || String(it.ano) === aplicado.ano) &&
        (!aplicado.grupo || it.grupo === aplicado.grupo) &&
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
    const vazio = { texto: "", ano: "", grupo: "" };
    setRascunho(vazio);
    setAplicado(vazio);
    setPagina(1);
  }

  function irPara(p: number) {
    setPagina(p);
    // sobe até o começo da lista (sem animação, é uma página simples)
    document.getElementById("lista-basica-topo")?.scrollIntoView({ block: "start" });
  }

  return (
    <div className="mt-6">
      {/* painel de filtros */}
      <form onSubmit={pesquisar} className="rounded-xl border border-border bg-surface p-4 shadow-soft sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-ink">Descrição</span>
            <input
              value={rascunho.texto}
              onChange={(e) => setRascunho({ ...rascunho, texto: e.target.value })}
              placeholder="Pesquisar pela descrição"
              className={CAMPO}
            />
          </label>
          {anos.length > 0 && (
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-ink">Exercício</span>
              <select value={rascunho.ano} onChange={(e) => setRascunho({ ...rascunho, ano: e.target.value })} className={CAMPO}>
                <option value="">Todos</option>
                {anos.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </label>
          )}
          {temGrupo && config.grupo && (
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-ink">{config.grupo.rotulo}</span>
              <select value={rascunho.grupo} onChange={(e) => setRascunho({ ...rascunho, grupo: e.target.value })} className={CAMPO}>
                <option value="">Todos</option>
                {grupos.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-lg bg-petrol px-4 py-2 text-sm font-semibold text-on-petrol hover:brightness-110"
          >
            <Search size={15} /> Pesquisar
          </button>
          <button
            type="button"
            onClick={limpar}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold text-ink hover:border-petrol hover:text-petrol"
          >
            <Trash2 size={15} /> Limpar
          </button>
        </div>
      </form>

      {/* total de registros */}
      <p id="lista-basica-topo" className="mb-3 mt-5 scroll-mt-4 text-sm font-medium text-ink-muted">
        {filtrados.length} {filtrados.length === 1 ? "registro" : "registros"}
      </p>

      {/* lista de cartões */}
      {exibidos.length > 0 ? (
        <ul className="space-y-3">
          {exibidos.map((it, i) => (
            <li key={`${paginaAtual}-${i}`} className="rounded-xl border border-border bg-surface p-4 shadow-soft">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold uppercase leading-snug text-ink">{it.titulo || "Sem título"}</p>
                  {it.detalhe && <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{it.detalhe}</p>}
                  <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-muted">
                    {it.ano !== null && (
                      <span className="inline-flex items-center gap-1.5">
                        <Calendar size={13} /> Exercício {it.ano}
                      </span>
                    )}
                    {it.grupo && !it.titulo.includes(it.grupo) && <span>{it.grupo}</span>}
                  </p>
                </div>
                {it.links.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {it.links.map((l) => (
                      <a
                        key={l.rotulo}
                        href={l.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-ink hover:border-petrol hover:text-petrol"
                      >
                        <FileText size={13} /> {l.rotulo}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-xl border border-border bg-surface px-4 py-10 text-center shadow-soft">
          <p className="text-sm font-medium text-ink">Nenhum registro encontrado.</p>
          {itens.length > 0 ? (
            <p className="mt-1 text-xs text-ink-muted">Altere os filtros ou clique em Limpar para ver tudo.</p>
          ) : (
            <p className="mt-1 text-xs text-ink-muted">Ainda não há registros coletados para esta página.</p>
          )}
        </div>
      )}

      {/* paginação à direita, como no portal */}
      {totalPaginas > 1 && (
        <nav aria-label="Paginação" className="mt-5 flex flex-wrap items-center justify-end gap-1.5">
          <button
            type="button"
            disabled={paginaAtual <= 1}
            onClick={() => irPara(paginaAtual - 1)}
            className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-ink hover:border-petrol disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronLeft size={14} /> Anterior
          </button>
          {janelaDePaginas(paginaAtual, totalPaginas).map((p, i) =>
            p === "…" ? (
              <span key={`e${i}`} className="px-1.5 text-sm text-ink-muted">
                …
              </span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => irPara(p)}
                aria-current={p === paginaAtual ? "page" : undefined}
                className={`min-w-[2.25rem] rounded-lg border px-2.5 py-1.5 text-sm font-medium ${
                  p === paginaAtual ? "border-petrol bg-petrol text-on-petrol" : "border-border bg-surface text-ink hover:border-petrol"
                }`}
              >
                {p}
              </button>
            ),
          )}
          <button
            type="button"
            disabled={paginaAtual >= totalPaginas}
            onClick={() => irPara(paginaAtual + 1)}
            className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-ink hover:border-petrol disabled:cursor-not-allowed disabled:opacity-40"
          >
            Próximo <ChevronRight size={14} />
          </button>
        </nav>
      )}
    </div>
  );
}
