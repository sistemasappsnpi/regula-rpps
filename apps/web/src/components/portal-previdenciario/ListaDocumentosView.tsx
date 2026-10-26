import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CalendarRange, ChevronDown, ExternalLink, FileText, Layers, SearchX, Wallet } from "lucide-react";
import { Card, StatTile } from "../ui/Card";
import type { RegistroTransparenciaApi } from "../../lib/api";
import type { DocBusca } from "../../lib/buscaInteligente";
import { corDoGrafico } from "./paletaGraficos";
import { ATRASO_GRAFICO, DURACAO_GRAFICO, entradaEscalonada, useAnimarGraficos, useMontado } from "./animacao";
import { CampoBusca, consultaDaUrl, Destaque, ResumoBusca, useBusca } from "./CampoBusca";
import { CamposDoRegistro } from "./CamposDoRegistro";
import { formatarMoeda, formatarMoedaCompacta } from "../../lib/textos";

// Molde das páginas "lista de documentos" da API Nexa (a maioria dos endpoints: cada registro é um
// documento com ano/período, às vezes um grupo — colegiado, tipo — e um ou mais PDFs). Cada página só
// declara uma ConfigListaDocumentos (ver listaDocumentosConfigs.ts); busca, cartões, gráficos, filtros e
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
  // quando os botões dependem do registro (lista que junta vários tipos); se existir, vale no lugar de `links`
  linksDe?: (r: RegistroTransparenciaApi) => { rotulo: string; campo: string }[];
  // páginas com dinheiro (licitações, contratos): valor de cada registro, em reais. Liga o cartão de total,
  // o gráfico de valor por exercício e o valor em cada linha.
  valor?: (r: RegistroTransparenciaApi) => number | null;
  rotuloValor?: string;
}

interface Item {
  id: number;
  titulo: string;
  detalhe: string;
  ano: number | null;
  ordem: number;
  grupo: string;
  valor: number | null;
  dados: RegistroTransparenciaApi;
  links: { rotulo: string; url: string }[];
}

const POR_PAGINA = 40;

function LinhaDocumento({ it, termos, mostrarAno, estilo }: { it: Item; termos: string[]; mostrarAno?: boolean; estilo?: React.CSSProperties }) {
  const [aberto, setAberto] = useState(false);
  const subtitulo = [it.grupo && !it.titulo.includes(it.grupo) ? it.grupo : "", it.detalhe].filter(Boolean).join(" · ");
  return (
    <li className="py-3" style={estilo}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="line-clamp-3 text-sm font-medium text-ink" title={it.titulo}>
            <Destaque texto={it.titulo || "Sem título"} termos={termos} />
          </p>
          {(subtitulo || (mostrarAno && it.ano)) && (
            <p className="mt-0.5 line-clamp-3 text-xs text-ink-muted" title={subtitulo}>
              {mostrarAno && it.ano && <span className="mr-1.5 rounded bg-petrol/10 px-1.5 py-0.5 font-semibold text-petrol">{it.ano}</span>}
              <Destaque texto={subtitulo} termos={termos} />
            </p>
          )}
        </div>
        {it.valor !== null && <span className="tabular shrink-0 rounded-lg bg-ok/10 px-2.5 py-1 text-xs font-bold text-ok">{formatarMoeda(it.valor)}</span>}
        <div className="flex flex-wrap items-center gap-2">
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
        <button
          type="button"
          onClick={() => setAberto((a) => !a)}
          aria-expanded={aberto}
          className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-ink-muted hover:bg-ink/5 hover:text-petrol"
        >
          Todos os campos
          <ChevronDown size={14} className={`transition-transform duration-200 ${aberto ? "rotate-180" : ""}`} />
        </button>
        </div>
      </div>
      {aberto && (
        <div className="mt-3" style={{ animation: "fade-up .35s ease-out both" }}>
          <CamposDoRegistro dados={it.dados} />
        </div>
      )}
    </li>
  );
}

export function ListaDocumentosView({ registros, config }: { registros: RegistroTransparenciaApi[]; config: ConfigListaDocumentos }) {
  const [consulta, setConsulta] = useState(consultaDaUrl);
  // abre já filtrado pelo exercício mais recente; o filtro troca de exercício (ou mostra todos).
  // Em página pequena (poucos documentos), ou quando o exercício mais recente tem só uns poucos (ex.: 43 normas, 1 em
  // 2024), filtrar esconderia quase tudo e o total não bateria com a lista: abre mostrando todos.
  const [anoFiltro, setAnoFiltro] = useState(() => {
    if (registros.length <= 12) return "";
    const anos = registros.map((r) => config.ano(r)).filter((a): a is number => a !== null);
    if (!anos.length) return "";
    const maisRecente = Math.max(...anos);
    return anos.filter((a) => a === maisRecente).length >= 8 ? String(maisRecente) : "";
  });
  const [grupoFiltro, setGrupoFiltro] = useState("");
  const [visiveis, setVisiveis] = useState(POR_PAGINA);
  const [verTodosGrupos, setVerTodosGrupos] = useState(false);
  const animar = useAnimarGraficos();
  const montado = useMontado();

  const itens = useMemo<Item[]>(
    () =>
      registros
        .map((r, i) => ({
          titulo: config.titulo(r).trim(),
          detalhe: config.detalhe?.(r).trim() ?? "",
          ano: config.ano(r),
          ordem: config.ordem(r, i),
          grupo: config.grupo?.valor(r).trim() ?? "",
          valor: config.valor ? config.valor(r) : null,
          dados: r,
          links: config.links
            .map((l) => ({ rotulo: l.rotulo, url: typeof r[l.campo] === "string" ? (r[l.campo] as string).trim() : "" }))
            // link da origem (http) ou da nossa cópia (/api/…). Campo de ARQUIVO só vira botão se for arquivo de
            // verdade (ou cópia nossa): o portal às vezes grava em "Arquivo" um endereço de página, não de PDF.
            .filter((l) => {
              const campo = config.links.find((c) => c.rotulo === l.rotulo)?.campo ?? "";
              if (l.url.startsWith("/")) return true;
              if (!/^https?:\/\//i.test(l.url)) return false;
              return !/arquivo/i.test(campo) || /\.(pdf|docx?|xlsx?|odt|ods|zip|rar|jpe?g|png)(\?.*)?$/i.test(l.url);
            }),
        }))
        .sort((a, b) => b.ordem - a.ordem)
        .map((it, id) => ({ ...it, id })),
    [registros, config],
  );

  // o que a busca enxerga de cada documento: título, grupo, detalhe e o resto (ano, rótulos dos anexos)
  const docsBusca = useMemo<DocBusca[]>(
    () =>
      itens.map((it) => ({
        id: it.id,
        titulo: it.titulo,
        grupo: it.grupo,
        desc: it.detalhe,
        // o resto do registro inteiro (credor, CNPJ, processo, cargo…), sem endereços de arquivo: a busca acha qualquer campo
        extra: `${it.ano ?? ""} ${it.links.map((l) => l.rotulo).join(" ")} ${Object.entries(it.dados)
          .filter(([k, v]) => !k.startsWith("_") && typeof v === "string" && v.trim() && !/^(https?:\/\/|\/api\/)/i.test(v.trim()))
          .map(([, v]) => (v as string).replace(/<[^>]*>/g, " ").slice(0, 300))
          .join(" ")}`,
      })),
    [itens],
  );
  const { motor, resultado } = useBusca(docsBusca, consulta);
  const sugestoes = useMemo(() => motor.sugestoes(6), [motor]);

  const resumo = useMemo(() => {
    const porAno = new Map<number, number>();
    const porGrupo = new Map<string, number>();
    const valorAno = new Map<number, number>();
    let valorTotal = 0;
    for (const it of itens) {
      if (it.ano) porAno.set(it.ano, (porAno.get(it.ano) ?? 0) + 1);
      if (it.grupo) porGrupo.set(it.grupo, (porGrupo.get(it.grupo) ?? 0) + 1);
      if (it.valor !== null) {
        valorTotal += it.valor;
        if (it.ano) valorAno.set(it.ano, (valorAno.get(it.ano) ?? 0) + it.valor);
      }
    }
    const anos = [...porAno.keys()].sort((a, b) => a - b);
    return {
      anos,
      valorTotal,
      valorPorAno: anos.map((a) => ({ ano: String(a), total: Math.round((valorAno.get(a) ?? 0) * 100) / 100 })),
      porAno: anos.map((a) => ({ ano: String(a), total: porAno.get(a) ?? 0 })),
      porGrupo: [...porGrupo.entries()].map(([nome, total]) => ({ nome, total })).sort((a, b) => b.total - a.total),
    };
  }, [itens]);

  const filtrados = useMemo(
    () => itens.filter((it) => (!anoFiltro || String(it.ano) === anoFiltro) && (!grupoFiltro || it.grupo === grupoFiltro)),
    [itens, anoFiltro, grupoFiltro],
  );

  // busca ativa: o resultado ocupa a página (do mais ao menos relevante, em todos os exercícios)
  const buscando = consulta.trim().length > 0;
  const porId = useMemo(() => new Map(itens.map((it) => [it.id, it])), [itens]);
  const achados = useMemo(
    () => (resultado ? resultado.ids.map((id) => porId.get(id)!).filter((it) => !grupoFiltro || it.grupo === grupoFiltro) : []),
    [resultado, porId, grupoFiltro],
  );
  const relacionados = useMemo(() => (resultado ? resultado.relacionados.map((id) => porId.get(id)!).filter(Boolean) : []), [resultado, porId]);

  if (!itens.length) {
    return (
      <Card className="mt-8 p-6">
        <p className="text-sm text-ink-muted">Nenhum registro foi coletado ainda.</p>
      </Card>
    );
  }

  const maxGrupo = Math.max(1, ...resumo.porGrupo.map((g) => g.total));
  const primeiroAno = resumo.anos[0];
  const ultimoAno = resumo.anos[resumo.anos.length - 1];
  const temGrupos = Boolean(config.grupo) && resumo.porGrupo.length > 1;
  const fonteLista = buscando ? achados : filtrados;
  const exibidos = fonteLista.slice(0, visiveis);

  // agrupa por exercício mantendo a ordem (já vem do mais recente pro mais antigo) — só fora da busca
  const secoes: { ano: string; itens: Item[] }[] = [];
  if (!buscando) {
    for (const it of exibidos) {
      const chave = it.ano ? String(it.ano) : "Sem ano informado";
      const ultima = secoes[secoes.length - 1];
      if (ultima && ultima.ano === chave) ultima.itens.push(it);
      else secoes.push({ ano: chave, itens: [it] });
    }
  }

  const filtroGrupo = temGrupos && (
    <select
      value={grupoFiltro}
      onChange={(e) => {
        setGrupoFiltro(e.target.value);
        setVisiveis(POR_PAGINA);
      }}
      className="max-w-[260px] rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink outline-none"
    >
      <option value="">Todos — {config.grupo!.rotuloPlural.toLocaleLowerCase("pt-BR")}</option>
      {resumo.porGrupo.map((g) => (
        <option key={g.nome} value={g.nome}>
          {g.nome}
        </option>
      ))}
    </select>
  );

  return (
    <div className="mt-6 space-y-6">
      <div style={entradaEscalonada(0)}>
        <CampoBusca
          valor={consulta}
          onChange={(v) => {
            setConsulta(v);
            setVisiveis(POR_PAGINA);
          }}
          placeholder={`Pesquise ${config.rotuloItens} por assunto, colegiado, ano, número… (ex.: ${sugestoes[0] ?? "relatório"})`}
          sugestoes={sugestoes}
          rotuloItens={config.rotuloItens}
        />
        {buscando && resultado && (
          <ResumoBusca
            consulta={consulta}
            resultado={{ ...resultado, ids: achados.map((a) => a.id) }}
            total={itens.length}
            rotuloItens={config.rotuloItens}
            extra={<span>Buscando em todos os exercícios.</span>}
          />
        )}
      </div>

      {buscando ? (
        <Card className="p-5">
          {temGrupos && <div className="mb-3 flex flex-wrap items-center gap-3">{filtroGrupo}</div>}
          {resultado && achados.length > 0 ? (
            <ul className="divide-y divide-border/60">
              {exibidos.map((it, i) => (
                <LinhaDocumento key={it.id} it={it} termos={resultado.termos} mostrarAno estilo={entradaEscalonada(Math.min(i, 8), 0)} />
              ))}
            </ul>
          ) : (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <SearchX size={32} className="text-ink-muted" />
              <p className="text-sm font-medium text-ink">Nada encontrado para “{consulta.trim()}”.</p>
              <p className="text-xs text-ink-muted">Tente outra palavra, o número do documento ou o ano.</p>
            </div>
          )}
          {fonteLista.length > exibidos.length && (
            <div className="mt-5 text-center">
              <button
                type="button"
                onClick={() => setVisiveis((v) => v + POR_PAGINA)}
                className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-ink hover:border-petrol"
              >
                Mostrar mais ({fonteLista.length - exibidos.length} restantes)
              </button>
            </div>
          )}
          {relacionados.length > 0 && (
            <div className="mt-6 border-t border-border pt-4">
              <p className="mb-1 text-sm font-semibold text-ink">Do mesmo assunto</p>
              <ul className="divide-y divide-border/60">
                {relacionados.map((it) => (
                  <LinhaDocumento key={it.id} it={it} termos={[]} mostrarAno />
                ))}
              </ul>
            </div>
          )}
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div style={entradaEscalonada(1)}>
              <StatTile label={`Total de ${config.rotuloItens}`} value={itens.length} icon={<FileText size={20} />} />
            </div>
            <div style={entradaEscalonada(2)}>
              <StatTile
                label="Período coberto"
                value={primeiroAno ? (primeiroAno === ultimoAno ? String(primeiroAno) : `${primeiroAno}–${ultimoAno}`) : "—"}
                icon={<CalendarRange size={20} />}
                tone="gold"
              />
            </div>
            <div style={entradaEscalonada(3)}>
              {config.grupo ? (
                <StatTile label={config.grupo.rotuloPlural} value={resumo.porGrupo.length} icon={<Layers size={20} />} tone="ok" />
              ) : (
                <StatTile label="Anos com publicação" value={resumo.anos.length} icon={<Layers size={20} />} tone="ok" />
              )}
            </div>
            <div style={entradaEscalonada(4)}>
              {config.valor ? (
                <StatTile
                  label={config.rotuloValor ?? "Valor total"}
                  value={<span className="text-2xl leading-tight">{formatarMoedaCompacta(resumo.valorTotal)}</span>}
                  hint={formatarMoeda(resumo.valorTotal)}
                  icon={<Wallet size={20} />}
                  tone="warn"
                />
              ) : (
                <StatTile
                  label="Mais recente"
                  value={<span className="text-xl leading-tight">{itens[0].ano ?? "—"}</span>}
                  hint={itens[0].titulo.length > 60 ? `${itens[0].titulo.slice(0, 57)}…` : itens[0].titulo}
                  icon={<FileText size={20} />}
                  tone="warn"
                />
              )}
            </div>
          </div>

          <div className={`grid gap-4 ${(resumo.porAno.length > 1 ? 1 : 0) + (temGrupos ? 1 : 0) + (config.valor && resumo.porAno.length > 1 ? 1 : 0) >= 2 ? "lg:grid-cols-2" : ""}`}>
            {/* gráfico de uma barra só não diz nada: só aparece com 2 exercícios ou mais */}
            {resumo.porAno.length > 1 && (
              <Card className="p-5" style={entradaEscalonada(5)}>
                <p className="text-sm font-semibold text-ink">{config.rotuloItens.charAt(0).toLocaleUpperCase("pt-BR") + config.rotuloItens.slice(1)} por exercício</p>
                <div className="mt-2 h-56">
                  <ResponsiveContainer>
                    <BarChart data={resumo.porAno} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                      <CartesianGrid vertical={false} stroke="rgb(var(--color-border))" strokeDasharray="3 3" />
                      <XAxis dataKey="ano" stroke="rgb(var(--color-ink-muted))" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis allowDecimals={false} stroke="rgb(var(--color-ink-muted))" fontSize={12} tickLine={false} axisLine={false} />
                      <Tooltip cursor={{ fill: "rgb(var(--color-ink) / 0.05)" }} />
                      <Bar
                        dataKey="total"
                        name="Quantidade"
                        radius={[6, 6, 0, 0]}
                        maxBarSize={48}
                        isAnimationActive={animar}
                        animationBegin={ATRASO_GRAFICO}
                        animationDuration={DURACAO_GRAFICO}
                        animationEasing="ease-out"
                      >
                        {resumo.porAno.map((a, i) => (
                          <Cell key={a.ano} fill={corDoGrafico(i)} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            )}
            {config.valor && resumo.porAno.length > 1 && (
              <Card className="p-5" style={entradaEscalonada(6)}>
                <p className="text-sm font-semibold text-ink">{config.rotuloValor ?? "Valor"} por exercício</p>
                <div className="mt-2 h-56">
                  <ResponsiveContainer>
                    <BarChart data={resumo.valorPorAno} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid vertical={false} stroke="rgb(var(--color-border))" strokeDasharray="3 3" />
                      <XAxis dataKey="ano" stroke="rgb(var(--color-ink-muted))" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis
                        stroke="rgb(var(--color-ink-muted))"
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                        width={64}
                        tickFormatter={(v: number) => formatarMoedaCompacta(v).replace("R$ ", "")}
                      />
                      <Tooltip cursor={{ fill: "rgb(var(--color-ink) / 0.05)" }} formatter={(v: unknown) => [formatarMoeda(Number(v)), config.rotuloValor ?? "Valor"]} />
                      <Bar
                        dataKey="total"
                        name={config.rotuloValor ?? "Valor"}
                        radius={[6, 6, 0, 0]}
                        maxBarSize={48}
                        isAnimationActive={animar}
                        animationBegin={ATRASO_GRAFICO}
                        animationDuration={DURACAO_GRAFICO}
                        animationEasing="ease-out"
                      >
                        {resumo.valorPorAno.map((a, i) => (
                          <Cell key={a.ano} fill={corDoGrafico(i + 3)} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            )}
            {temGrupos && (
              <Card className="p-5" style={entradaEscalonada(7)}>
                <p className="text-sm font-semibold text-ink">Por {config.grupo!.rotulo.toLocaleLowerCase("pt-BR")}</p>
                <div className="mt-4 space-y-3">
                  {(verTodosGrupos ? resumo.porGrupo : resumo.porGrupo.slice(0, 10)).map((g, i) => (
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
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: montado || !animar ? `${(g.total / maxGrupo) * 100}%` : "0%",
                            backgroundColor: corDoGrafico(i),
                            transition: animar ? `width ${DURACAO_GRAFICO}ms cubic-bezier(.22,.8,.3,1) ${ATRASO_GRAFICO + i * 120}ms` : "none",
                          }}
                        />
                      </div>
                    </button>
                  ))}
                  {resumo.porGrupo.length > 10 && (
                    <button type="button" onClick={() => setVerTodosGrupos((v) => !v)} className="text-xs font-semibold text-petrol hover:underline">
                      {verTodosGrupos ? "Mostrar só os 10 maiores" : `Mostrar todos (${resumo.porGrupo.length})`}
                    </button>
                  )}
                </div>
              </Card>
            )}
          </div>

          <Card className="p-5" style={entradaEscalonada(7)}>
            <div className="flex flex-wrap items-center gap-3">
              {resumo.anos.length > 1 && (
                <select
                  value={anoFiltro}
                  onChange={(e) => {
                    setAnoFiltro(e.target.value);
                    setVisiveis(POR_PAGINA);
                  }}
                  className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink outline-none"
                >
                  <option value="">Todos os exercícios</option>
                  {[...resumo.anos].reverse().map((a) => (
                    <option key={a} value={a}>
                      Exercício {a}
                    </option>
                  ))}
                </select>
              )}
              {filtroGrupo}
              <span className="text-xs text-ink-muted">
                {filtrados.length} de {itens.length}
              </span>
            </div>

            <div className="mt-4 space-y-6">
              {secoes.map((s) => (
                <section key={s.ano}>
                  <h3 className="mb-2 border-b border-border pb-1 text-sm font-bold text-petrol">{/^\d{4}$/.test(s.ano) ? `Exercício ${s.ano}` : s.ano}</h3>
                  <ul className="divide-y divide-border/60">
                    {s.itens.map((it) => (
                      <LinhaDocumento key={it.id} it={it} termos={[]} />
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
        </>
      )}
    </div>
  );
}
