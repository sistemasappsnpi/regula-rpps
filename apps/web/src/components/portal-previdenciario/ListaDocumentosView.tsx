import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CalendarRange, ExternalLink, FileText, Layers, Search } from "lucide-react";
import { Card, StatTile } from "../ui/Card";
import type { RegistroTransparenciaApi } from "../../lib/api";

// Molde das páginas "lista de documentos" da API Nexa (a maioria dos endpoints: cada registro é um
// documento com ano/período, às vezes um grupo — colegiado, tipo — e um ou mais PDFs). Cada página só
// declara uma ConfigListaDocumentos (ver listaDocumentosConfigs.ts); cartões, gráficos, filtros e
// lista saem daqui. Os números são sempre contagens simples do que a API entrega — nada que dê
// a entender regularidade/irregularidade do órgão.

export interface ConfigListaDocumentos {
  // "documentos", "atas"… (plural, minúsculo): aparece nos cartões e na contagem
  rotuloItens: string;
  titulo: (r: RegistroTransparenciaApi) => string;
  detalhe?: (r: RegistroTransparenciaApi) => string;
  ano: (r: RegistroTransparenciaApi) => number | null;
  // maior = mais recente; define a ordem da lista
  ordem: (r: RegistroTransparenciaApi, indice: number) => number;
  // segundo eixo de análise (colegiado, tipo de documento…): vira filtro e gráfico de distribuição
  grupo?: { rotulo: string; rotuloPlural: string; valor: (r: RegistroTransparenciaApi) => string };
  // campos do registro que são links de PDF
  links: { rotulo: string; campo: string }[];
}

interface Item {
  titulo: string;
  detalhe: string;
  ano: number | null;
  ordem: number;
  grupo: string;
  links: { rotulo: string; url: string }[];
}

const POR_PAGINA = 40;

export function ListaDocumentosView({ registros, config }: { registros: RegistroTransparenciaApi[]; config: ConfigListaDocumentos }) {
  const [busca, setBusca] = useState("");
  const [anoFiltro, setAnoFiltro] = useState("");
  const [grupoFiltro, setGrupoFiltro] = useState("");
  const [visiveis, setVisiveis] = useState(POR_PAGINA);

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
            .filter((l) => /^https?:\/\//i.test(l.url)),
        }))
        .sort((a, b) => b.ordem - a.ordem),
    [registros, config],
  );

  const resumo = useMemo(() => {
    const porAno = new Map<number, number>();
    const porGrupo = new Map<string, number>();
    for (const it of itens) {
      if (it.ano) porAno.set(it.ano, (porAno.get(it.ano) ?? 0) + 1);
      if (it.grupo) porGrupo.set(it.grupo, (porGrupo.get(it.grupo) ?? 0) + 1);
    }
    const anos = [...porAno.keys()].sort((a, b) => a - b);
    return {
      anos,
      porAno: anos.map((a) => ({ ano: String(a), total: porAno.get(a) ?? 0 })),
      porGrupo: [...porGrupo.entries()].map(([nome, total]) => ({ nome, total })).sort((a, b) => b.total - a.total),
    };
  }, [itens]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLocaleLowerCase("pt-BR");
    return itens.filter(
      (it) =>
        (!anoFiltro || String(it.ano) === anoFiltro) &&
        (!grupoFiltro || it.grupo === grupoFiltro) &&
        (!q || `${it.titulo} ${it.detalhe} ${it.grupo}`.toLocaleLowerCase("pt-BR").includes(q)),
    );
  }, [itens, busca, anoFiltro, grupoFiltro]);

  if (!itens.length) {
    return (
      <Card className="mt-8 p-6">
        <p className="text-sm text-ink-muted">Nenhum registro foi coletado ainda.</p>
      </Card>
    );
  }

  const exibidos = filtrados.slice(0, visiveis);
  const maxGrupo = Math.max(1, ...resumo.porGrupo.map((g) => g.total));
  const primeiroAno = resumo.anos[0];
  const ultimoAno = resumo.anos[resumo.anos.length - 1];

  // agrupa por ano mantendo a ordem (já vem do mais recente pro mais antigo)
  const secoes: { ano: string; itens: Item[] }[] = [];
  for (const it of exibidos) {
    const chave = it.ano ? String(it.ano) : "Sem ano informado";
    const ultima = secoes[secoes.length - 1];
    if (ultima && ultima.ano === chave) ultima.itens.push(it);
    else secoes.push({ ano: chave, itens: [it] });
  }

  return (
    <div className="mt-6 space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label={`Total de ${config.rotuloItens}`} value={itens.length} icon={<FileText size={20} />} />
        <StatTile
          label="Período coberto"
          value={primeiroAno ? (primeiroAno === ultimoAno ? String(primeiroAno) : `${primeiroAno}–${ultimoAno}`) : "—"}
          icon={<CalendarRange size={20} />}
          tone="gold"
        />
        {config.grupo ? (
          <StatTile label={config.grupo.rotuloPlural} value={resumo.porGrupo.length} icon={<Layers size={20} />} tone="ok" />
        ) : (
          <StatTile label="Anos com publicação" value={resumo.anos.length} icon={<Layers size={20} />} tone="ok" />
        )}
        <StatTile
          label="Mais recente"
          value={<span className="text-xl leading-tight">{itens[0].ano ?? "—"}</span>}
          hint={itens[0].titulo.length > 60 ? `${itens[0].titulo.slice(0, 57)}…` : itens[0].titulo}
          icon={<FileText size={20} />}
          tone="warn"
        />
      </div>

      <div className={`grid gap-4 ${config.grupo && resumo.porGrupo.length > 1 ? "lg:grid-cols-2" : ""}`}>
        {resumo.porAno.length > 0 && (
          <Card className="p-5">
            <p className="text-sm font-semibold text-ink">{config.rotuloItens.charAt(0).toLocaleUpperCase("pt-BR") + config.rotuloItens.slice(1)} por ano</p>
            <div className="mt-2 h-56">
              <ResponsiveContainer>
                <BarChart data={resumo.porAno} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="rgb(var(--color-border))" strokeDasharray="3 3" />
                  <XAxis dataKey="ano" stroke="rgb(var(--color-ink-muted))" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} stroke="rgb(var(--color-ink-muted))" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip cursor={{ fill: "rgb(var(--color-ink) / 0.05)" }} />
                  <Bar dataKey="total" name="Quantidade" fill="rgb(var(--color-petrol))" radius={[6, 6, 0, 0]} maxBarSize={48} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        )}
        {config.grupo && resumo.porGrupo.length > 1 && (
          <Card className="p-5">
            <p className="text-sm font-semibold text-ink">Por {config.grupo.rotulo.toLocaleLowerCase("pt-BR")}</p>
            <div className="mt-4 space-y-3">
              {resumo.porGrupo.map((g) => (
                <button
                  key={g.nome}
                  type="button"
                  onClick={() => {
                    setGrupoFiltro(grupoFiltro === g.nome ? "" : g.nome);
                    setVisiveis(POR_PAGINA);
                  }}
                  className="block w-full text-left"
                  title="Clique para filtrar a lista"
                >
                  <div className="flex items-baseline justify-between gap-3 text-xs">
                    <span className={`font-medium ${grupoFiltro === g.nome ? "text-petrol" : "text-ink"}`}>{g.nome}</span>
                    <span className="tabular text-ink-muted">{g.total}</span>
                  </div>
                  <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-border/60">
                    <div className="h-full rounded-full bg-petrol" style={{ width: `${(g.total / maxGrupo) * 100}%` }} />
                  </div>
                </button>
              ))}
            </div>
          </Card>
        )}
      </div>

      <Card className="p-5">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex min-w-[220px] flex-1 items-center gap-2 rounded-lg border border-border bg-bg px-3 py-2">
            <Search size={15} className="text-ink-muted" />
            <input
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value);
                setVisiveis(POR_PAGINA);
              }}
              placeholder="Buscar"
              className="w-full bg-transparent text-sm text-ink outline-none"
            />
          </label>
          {resumo.anos.length > 1 && (
            <select
              value={anoFiltro}
              onChange={(e) => {
                setAnoFiltro(e.target.value);
                setVisiveis(POR_PAGINA);
              }}
              className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink outline-none"
            >
              <option value="">Todos os anos</option>
              {[...resumo.anos].reverse().map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          )}
          {config.grupo && resumo.porGrupo.length > 1 && (
            <select
              value={grupoFiltro}
              onChange={(e) => {
                setGrupoFiltro(e.target.value);
                setVisiveis(POR_PAGINA);
              }}
              className="max-w-[260px] rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink outline-none"
            >
              <option value="">Todos — {config.grupo.rotuloPlural.toLocaleLowerCase("pt-BR")}</option>
              {resumo.porGrupo.map((g) => (
                <option key={g.nome} value={g.nome}>
                  {g.nome}
                </option>
              ))}
            </select>
          )}
          <span className="text-xs text-ink-muted">
            {filtrados.length} de {itens.length}
          </span>
        </div>

        <div className="mt-4 space-y-6">
          {secoes.map((s) => (
            <section key={s.ano}>
              <h3 className="mb-2 border-b border-border pb-1 text-sm font-bold text-petrol">{s.ano}</h3>
              <ul className="divide-y divide-border/60">
                {s.itens.map((it, i) => (
                  <li key={`${s.ano}-${i}`} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-ink">{it.titulo || "Sem título"}</p>
                      {(it.detalhe || (it.grupo && !it.titulo.includes(it.grupo))) && (
                        <p className="mt-0.5 text-xs text-ink-muted">
                          {[it.grupo && !it.titulo.includes(it.grupo) ? it.grupo : "", it.detalhe].filter(Boolean).join(" · ")}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {it.links.map((l) => (
                        <a
                          key={l.rotulo}
                          href={l.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-ink hover:border-petrol hover:text-petrol"
                        >
                          <ExternalLink size={13} />
                          {l.rotulo}
                        </a>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {!filtrados.length && <p className="py-6 text-center text-sm text-ink-muted">Nada encontrado com esses filtros.</p>}
        </div>

        {filtrados.length > exibidos.length && (
          <div className="mt-5 text-center">
            <button
              type="button"
              onClick={() => setVisiveis((v) => v + POR_PAGINA)}
              className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-ink hover:border-petrol"
            >
              Mostrar mais ({filtrados.length - exibidos.length} restantes)
            </button>
          </div>
        )}
      </Card>
    </div>
  );
}
