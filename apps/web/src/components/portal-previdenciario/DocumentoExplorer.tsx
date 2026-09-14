import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  FileJson,
  FileSpreadsheet,
  FileText,
  PieChart as PieChartIcon,
  Printer,
  Ruler,
  Search,
  SlidersHorizontal,
  Stamp,
  Tag,
  TrendingUp,
  X,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  LabelList,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "../ui/Card";
import type {
  PortalDocumentoPublico,
  PortalDocumentoPublicoDetalhe,
  PortalIndicadorPublico,
  PortalIndicadorPublicoValor,
} from "../../lib/api";
import { baixarCsv, baixarJson, baixarTxt, formatarCompetencia, formatarCompetenciaExtenso, numerico, valorParaNumero } from "./DocumentoIndicadoresCard";

// Cores do gráfico ciclam entre os dois tokens puramente decorativos da marca (petrol/gold) mais
// os dois "status" (ok/warn) — nunca "crit", reservado pra erro de verdade. É só variedade visual
// entre indicadores, nunca usado pra indicar bom/ruim.
const CORES_GRAFICO = ["petrol", "gold", "ok", "warn"] as const;
type CorGrafico = (typeof CORES_GRAFICO)[number];

// Usado pra encolher a largura fixa do eixo de categorias dos gráficos horizontais (nomes de
// ativos/indicadores) em telas estreitas — sem isso, o eixo sozinho toma a maior parte do espaço
// disponível num celular, espremendo as barras a quase nada.
function useEhMobile(): boolean {
  const [ehMobile, setEhMobile] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const listener = () => setEhMobile(mq.matches);
    mq.addEventListener("change", listener);
    return () => mq.removeEventListener("change", listener);
  }, []);
  return ehMobile;
}

// Faixa colorida na lateral de cada cartão de gráfico, alternando conforme desce a página — dá
// ritmo visual sem mexer no tipo de gráfico ou no que os dados significam (nunca troco pizza por
// barra só por variedade: o formato do gráfico continua sendo escolhido pelo que o dado É).
function estiloCartaoGrafico(cor: CorGrafico, atraso = 0): CSSProperties {
  return {
    animation: "fade-up .45s ease-out both",
    animationDelay: `${atraso}ms`,
    borderLeftWidth: 4,
    borderLeftColor: `rgb(var(--color-${cor}))`,
  };
}

const TIPO_LABEL: Record<PortalIndicadorPublico["tipo"], string> = {
  NUMERICO: "Número",
  MOEDA: "Moeda",
  TEXTO: "Texto",
  DATA: "Data",
};

const TIPO_DOT: Record<PortalIndicadorPublico["tipo"], string> = {
  NUMERICO: "bg-petrol",
  MOEDA: "bg-gold",
  TEXTO: "bg-ok",
  DATA: "bg-warn",
};

// Portal público — nunca expõe como o dado foi processado internamente (manual/IA/etc.), só que é
// um dado oficial do RPPS. Essa distinção continua existindo internamente (auditoria/compliance),
// só não aparece pro cidadão.
const ORIGEM_LABEL: Record<PortalIndicadorPublicoValor["origem"], string> = {
  MANUAL: "Lançamento oficial",
  PDF_EXTRACTION: "Documento oficial",
  AI_COMPOSED: "Documento oficial",
};

interface CampoLinha {
  indicadorId: string;
  indicadorNome: string;
  tipo: PortalIndicadorPublico["tipo"];
  unidade: string | null;
  competencia: string;
  valor: string;
  origem: PortalIndicadorPublicoValor["origem"];
  documentoUploadId: string | null;
  documentoUploadNome: string | null;
}

function indicadorTexto(indicador: PortalIndicadorPublico): string {
  return [
    indicador.nome,
    TIPO_LABEL[indicador.tipo],
    indicador.unidade,
    ...indicador.valores.flatMap((v) => [v.valor, formatarCompetencia(v.competencia), ORIGEM_LABEL[v.origem]]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function documentoDeCampos(base: PortalDocumentoPublico, campos: CampoLinha[]): PortalDocumentoPublico {
  return {
    id: base.id,
    nome: base.nome,
    indicadores: campos.map((c) => ({
      id: c.indicadorId,
      nome: c.indicadorNome,
      tipo: c.tipo,
      unidade: c.unidade,
      valores: [
        {
          competencia: c.competencia,
          valor: c.valor,
          origem: c.origem,
          documentoUploadId: c.documentoUploadId,
          documentoUploadNome: c.documentoUploadNome,
        },
      ],
    })),
  };
}

// Menu de exportação: abre ao passar o mouse (e por clique, pra funcionar em touch) mostrando
// vários formatos — cada um baixa o conjunto de dados passado (geral, com busca aplicada, ou de
// um lançamento específico).
function MenuExportar({
  documento,
  nomeArquivo,
  compacto,
}: {
  documento: PortalDocumentoPublico;
  nomeArquivo: string;
  compacto?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const opcoes = [
    { rotulo: "Planilha CSV", icone: FileSpreadsheet, acao: () => baixarCsv(`${nomeArquivo}.csv`, [documento]) },
    { rotulo: "JSON", icone: FileJson, acao: () => baixarJson(`${nomeArquivo}.json`, [documento]) },
    { rotulo: "Texto simples", icone: FileText, acao: () => baixarTxt(`${nomeArquivo}.txt`, [documento]) },
    ...(compacto ? [] : [{ rotulo: "Imprimir / PDF", icone: Printer, acao: () => window.print() }]),
  ];

  return (
    <div className="group relative" onMouseEnter={() => setAberto(true)} onMouseLeave={() => setAberto(false)}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setAberto((a) => !a);
        }}
        className={
          compacto
            ? "flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:border-petrol hover:text-petrol"
            : "flex items-center gap-2 rounded-full bg-gradient-to-r from-cyan-600 to-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-soft transition-all hover:brightness-110"
        }
      >
        <Download size={compacto ? 13 : 15} /> {compacto ? "Exportar" : "Exportar"}
        {!compacto && <ChevronDown size={14} className={`transition-transform duration-200 ${aberto ? "rotate-180" : ""}`} />}
      </button>
      <div
        className={`absolute right-0 z-20 mt-2 w-52 origin-top-right rounded-xl border border-border bg-surface p-1.5 shadow-lift transition-all duration-150 ${
          aberto ? "visible scale-100 opacity-100" : "invisible scale-95 opacity-0"
        }`}
      >
        {opcoes.map((o) => (
          <button
            key={o.rotulo}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              o.acao();
              setAberto(false);
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-ink transition-colors hover:bg-petrol/10 hover:text-petrol"
          >
            <o.icone size={15} /> {o.rotulo}
          </button>
        ))}
      </div>
    </div>
  );
}

interface BarraComparativa {
  id: string;
  nome: string;
  nomeCurto: string;
  valor: number;
}

function nomeCurto(nome: string, limite = 22): string {
  return nome.length > limite ? `${nome.slice(0, limite - 1)}…` : nome;
}

// Quase todo ativo começa com "Fundo/Classe de Investimento (em)" — boilerplate repetido que só
// atrapalha a leitura do eixo. Tira esse prefixo antes de truncar, sobrando só o que diferencia.
function resumirAtivo(nome: string): string {
  const semPrefixo = nome.replace(/^Fundo\/Classe(?: de Investimento)?(?: em)?\s*/i, "").trim();
  return nomeCurto(semPrefixo || nome, 30);
}

// Reconhece o padrão "<Ativo> - <Métrica> (%)" que o prompt do DPIN pede pra estratégia de
// alocação — assim, em vez de 30 barras soltas (ilegível), viram 3 séries coloridas fixas
// (Alvo/Superior/Inferior) agrupadas por ativo, um cluster por ativo.
const METRICAS_ALOCACAO = [
  { sufixo: "Estratégia Alvo (%)", chave: "alvo", rotulo: "Estratégia Alvo", cor: "petrol" },
  { sufixo: "Limite Inferior (%)", chave: "inferior", rotulo: "Limite Inferior", cor: "gold" },
  { sufixo: "Limite Superior (%)", chave: "superior", rotulo: "Limite Superior", cor: "ok" },
] as const;

function extrairAlocacao(nome: string): { ativo: string; metrica: (typeof METRICAS_ALOCACAO)[number] } | null {
  for (const metrica of METRICAS_ALOCACAO) {
    // A IA nomeia como "Estratégia Alvo (%) - <Ativo>" — a métrica vem ANTES do nome do ativo.
    const prefixo = `${metrica.sufixo} - `;
    if (nome.startsWith(prefixo)) {
      return { ativo: nome.slice(prefixo.length), metrica };
    }
  }
  return null;
}

interface ClusterAlocacao {
  ativo: string;
  ativoCurto: string;
  alvo?: number;
  inferior?: number;
  superior?: number;
}

// Gráfico de barras agrupadas: um cluster por ativo, 3 barras coloridas fixas (mesma cor sempre
// pra mesma métrica, em todos os clusters) — a cor aqui identifica a métrica, nunca é decorativa.
// Horizontal (não vertical rotacionado): nomes de ativo são longos demais pra caber legível
// embaixo de uma barra em pé, mesmo truncados — na horizontal, o nome fica inteiro na lateral.
function GraficoAlocacao({ clusters, cor }: { clusters: ClusterAlocacao[]; cor: CorGrafico }) {
  const altura = Math.max(320, clusters.length * 52);
  const ehMobile = useEhMobile();

  return (
    <div className="rounded-xl border border-border p-5 transition-all hover:shadow-lift" style={estiloCartaoGrafico(cor)}>
      <div className="mb-1 flex items-center gap-2">
        <BarChart3 size={15} className="text-petrol" />
        <p className="text-sm font-semibold text-ink">Estratégia de alocação por ativo (%)</p>
      </div>
      <p className="mb-1 text-xs text-ink-muted">
        Limites de investimento por classe de ativo definidos na Política de Investimentos (tabela "Estratégias de
        Alocação") — não é a posição atual da carteira.
      </p>
      <div className="mt-2 w-full" style={{ height: altura }}>
        <ResponsiveContainer>
          <BarChart
            data={clusters}
            layout="vertical"
            margin={{ top: 4, right: 32, left: 8, bottom: 4 }}
            barCategoryGap="28%"
            barGap={2}
          >
            <defs>
              {METRICAS_ALOCACAO.map((m) => (
                <linearGradient key={m.chave} id={`grad-aloc-${m.chave}`} x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor={`rgb(var(--color-${m.cor}))`} stopOpacity={0.5} />
                  <stop offset="100%" stopColor={`rgb(var(--color-${m.cor}))`} stopOpacity={1} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid horizontal={false} stroke="rgb(var(--color-border))" strokeDasharray="3 3" />
            <XAxis type="number" hide domain={[0, "auto"]} />
            <YAxis
              type="category"
              dataKey="ativoCurto"
              fontSize={ehMobile ? 10 : 12}
              stroke="rgb(var(--color-ink-muted))"
              tickLine={false}
              axisLine={false}
              width={ehMobile ? 96 : 190}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const item = payload[0].payload as ClusterAlocacao;
                return (
                  <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-lift">
                    <p className="mb-1 font-medium text-ink">{item.ativo}</p>
                    {METRICAS_ALOCACAO.map((m) => (
                      <p key={m.chave} className="tabular text-ink-muted">
                        {m.rotulo}: {item[m.chave]?.toLocaleString("pt-BR") ?? "—"}%
                      </p>
                    ))}
                  </div>
                );
              }}
              cursor={{ fill: "rgb(var(--color-ink) / 0.05)" }}
            />
            <Legend
              formatter={(value) => <span className="text-xs text-ink-muted">{value}</span>}
              iconType="circle"
              iconSize={8}
            />
            {METRICAS_ALOCACAO.map((m, i) => (
              <Bar
                key={m.chave}
                dataKey={m.chave}
                name={m.rotulo}
                fill={`url(#grad-aloc-${m.chave})`}
                radius={[0, 4, 4, 0]}
                maxBarSize={16}
                minPointSize={3}
                animationDuration={900}
                animationEasing="ease-out"
                animationBegin={150 + i * 120}
              >
                <LabelList
                  dataKey={m.chave}
                  position="right"
                  fontSize={10}
                  fill="rgb(var(--color-ink-muted))"
                  formatter={(v: unknown) => (Number(v) > 0 ? `${Number(v).toLocaleString("pt-BR")}%` : "")}
                />
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// Um gráfico largo por grupo de unidade (nunca misturando "%" com "R$" no mesmo eixo — escalas
// diferentes no mesmo gráfico é o erro clássico de leitura). Dentro do grupo, todos os indicadores
// entram como barras lado a lado — sem paginação, sem grade pequena. Usa o valor mais recente de
// cada indicador (o histórico completo continua disponível abrindo o lançamento correspondente
// embaixo). Horizontal, igual ao gráfico de alocação do DPIN: nomes de indicador costumam ser
// longos, e rótulo vertical rotacionado corta o texto — na horizontal, o nome cabe inteiro.
function GraficoComparativo({
  titulo,
  unidade,
  indicadores,
  cor,
}: {
  titulo: string;
  unidade: string | null;
  indicadores: PortalIndicadorPublico[];
  cor: CorGrafico;
}) {
  const dados = useMemo<BarraComparativa[]>(
    () =>
      indicadores.map((ind) => {
        const ordenados = [...ind.valores].sort((a, b) => a.competencia.localeCompare(b.competencia));
        const ultimo = ordenados[ordenados.length - 1];
        return { id: ind.id, nome: ind.nome, nomeCurto: nomeCurto(ind.nome, 34), valor: valorParaNumero(ultimo.valor) };
      }),
    [indicadores],
  );
  const altura = Math.max(220, dados.length * 48);
  const ehMobile = useEhMobile();

  return (
    <div className="rounded-xl border border-border p-5 transition-all hover:shadow-lift" style={estiloCartaoGrafico(cor)}>
      <div className="mb-1 flex items-center gap-2">
        <BarChart3 size={15} className="text-petrol" />
        <p className="text-sm font-semibold text-ink">{titulo}</p>
      </div>
      <p className="mb-1 text-xs text-ink-muted">
        Todo campo numérico em "{unidade ?? "sem unidade"}" do lançamento vigente, comparado pelo valor mais
        recente — é uma foto do momento, não uma tendência. Histórico completo de cada um em "Lançamentos" abaixo.
      </p>
      <div className="mt-2 w-full" style={{ height: altura }}>
        <ResponsiveContainer>
          <BarChart data={dados} layout="vertical" margin={{ top: 4, right: 56, left: 8, bottom: 4 }} barCategoryGap="24%">
            <defs>
              {CORES_GRAFICO.map((c) => (
                <linearGradient key={c} id={`grad-comp-${c}`} x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor={`rgb(var(--color-${c}))`} stopOpacity={0.5} />
                  <stop offset="100%" stopColor={`rgb(var(--color-${c}))`} stopOpacity={1} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid horizontal={false} stroke="rgb(var(--color-border))" strokeDasharray="3 3" />
            <XAxis type="number" hide domain={[0, "auto"]} />
            <YAxis
              type="category"
              dataKey="nomeCurto"
              fontSize={ehMobile ? 10 : 12}
              stroke="rgb(var(--color-ink-muted))"
              tickLine={false}
              axisLine={false}
              width={ehMobile ? 104 : 210}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const item = payload[0].payload as BarraComparativa;
                return (
                  <div className="max-w-xs rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-lift">
                    <p className="font-medium text-ink">{item.nome}</p>
                    <p className="tabular text-ink-muted">
                      {item.valor.toLocaleString("pt-BR")}
                      {unidade ? ` ${unidade}` : ""}
                    </p>
                  </div>
                );
              }}
              cursor={{ fill: "rgb(var(--color-ink) / 0.05)" }}
            />
            <Bar dataKey="valor" radius={[0, 6, 6, 0]} maxBarSize={26} minPointSize={3} animationDuration={800} animationEasing="ease-out" animationBegin={150}>
              {dados.map((d, i) => (
                <Cell key={d.id} fill={`url(#grad-comp-${CORES_GRAFICO[i % CORES_GRAFICO.length]})`} />
              ))}
              <LabelList
                dataKey="valor"
                position="right"
                fontSize={11}
                fontWeight={700}
                fill="rgb(var(--color-ink))"
                formatter={(v: unknown) => `${Number(v).toLocaleString("pt-BR")}${unidade ? ` ${unidade}` : ""}`}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

interface FatiaComposicao {
  id: string;
  nome: string;
  valor: number;
}

interface PontoTendencia {
  competencia: string;
  [indicadorId: string]: string | number;
}

// Indicadores que se repetem em TODOS os lançamentos deste documento (ex.: rentabilidade aparece
// todo ano) — diferente dos outros gráficos, que mostram só o valor mais recente, este é o único
// que compara a evolução ao longo do tempo, porque é o único caso onde comparar "mesmo indicador,
// competências diferentes" faz sentido de verdade (o indicador existe e é comparável em todos os
// períodos, não só no mais recente).
// Notação compacta ("242,9 mi") pro eixo — só pra dar uma referência de escala; o valor exato
// completo aparece no tooltip e nos chips de "valor mais recente" acima do gráfico.
function formatarNumeroCompacto(valor: number): string {
  return new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(valor);
}

function GraficoTendencia({ titulo, unidade, indicadores, cor }: { titulo: string; unidade: string | null; indicadores: PortalIndicadorPublico[]; cor: CorGrafico }) {
  const dados = useMemo<PontoTendencia[]>(() => {
    const porCompetencia = new Map<string, PontoTendencia>();
    for (const ind of indicadores) {
      for (const v of ind.valores) {
        const ponto = porCompetencia.get(v.competencia) ?? { competencia: v.competencia };
        ponto[ind.id] = valorParaNumero(v.valor);
        porCompetencia.set(v.competencia, ponto);
      }
    }
    return [...porCompetencia.values()]
      .sort((a, b) => a.competencia.localeCompare(b.competencia))
      .map((p) => ({ ...p, competencia: formatarCompetencia(p.competencia) }));
  }, [indicadores]);

  const ultimoPonto = dados[dados.length - 1];

  return (
    <div className="rounded-xl border border-border p-5 transition-all hover:shadow-lift" style={estiloCartaoGrafico(cor)}>
      <div className="mb-1 flex items-center gap-2">
        <TrendingUp size={15} className="text-petrol" />
        <p className="text-sm font-semibold text-ink">{titulo}</p>
      </div>
      <p className="mb-2 text-xs text-ink-muted">
        {indicadores.length === 1 ? "Este indicador aparece" : `Estes ${indicadores.length} indicadores aparecem`} em
        todos os {dados.length} lançamentos deste documento (de {dados[0]?.competencia} até{" "}
        {dados[dados.length - 1]?.competencia}) — a linha mostra como o valor mudou de um lançamento pro outro, não
        só o retrato do mais recente.
      </p>

      {/* Valor mais recente de cada linha, por extenso, com o nome completo (nunca truncado: é o
          principal jeito do leitor entender do que esse gráfico está falando) — o próprio gráfico
          (eixo compacto + linha subindo) não deixa claro QUANTO cada indicador vale hoje nem O QUE
          exatamente ele é, só a tendência. */}
      {ultimoPonto && (
        <div className="mb-3 flex flex-col gap-1.5">
          {indicadores.map((ind, i) => {
            const valor = ultimoPonto[ind.id];
            if (typeof valor !== "number") return null;
            const corLinha = CORES_GRAFICO[i % CORES_GRAFICO.length];
            return (
              <div key={ind.id} className="flex items-start gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs">
                <span
                  className="mt-1 h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: `rgb(var(--color-${corLinha}))` }}
                />
                <span className="min-w-0 flex-1 text-ink-muted">{ind.nome}</span>
                <span className="shrink-0 tabular font-semibold text-ink">
                  {valor.toLocaleString("pt-BR")}
                  {unidade ? ` ${unidade}` : ""}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-2 h-72 w-full">
        <ResponsiveContainer>
          <LineChart data={dados} margin={{ top: 20, right: 16, left: 0, bottom: 4 }}>
            <CartesianGrid vertical={false} stroke="rgb(var(--color-border))" strokeDasharray="3 3" />
            <XAxis dataKey="competencia" fontSize={11} stroke="rgb(var(--color-ink-muted))" tickLine={false} axisLine={false} />
            <YAxis
              width={52}
              fontSize={10}
              stroke="rgb(var(--color-ink-muted))"
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => formatarNumeroCompacto(v)}
              domain={["auto", "auto"]}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                return (
                  <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-lift">
                    <p className="mb-1 font-medium text-ink">{label}</p>
                    {payload.map((p) => (
                      <p key={p.dataKey as string} className="tabular text-ink-muted" style={{ color: p.color }}>
                        {indicadores.find((i) => i.id === p.dataKey)?.nome}: {p.value?.toLocaleString("pt-BR")}
                        {unidade ? ` ${unidade}` : ""}
                      </p>
                    ))}
                  </div>
                );
              }}
            />
            {indicadores.length > 1 && <Legend formatter={(_, entry) => <span className="text-xs text-ink-muted">{indicadores.find((i) => i.id === entry.dataKey)?.nome}</span>} iconType="circle" iconSize={8} />}
            {indicadores.map((ind, i) => (
              <Line
                key={ind.id}
                type="monotone"
                dataKey={ind.id}
                name={ind.nome}
                stroke={`rgb(var(--color-${CORES_GRAFICO[i % CORES_GRAFICO.length]}))`}
                strokeWidth={2.5}
                dot={{ r: 4, strokeWidth: 0 }}
                activeDot={{ r: 6, strokeWidth: 0 }}
                animationDuration={800}
                animationEasing="ease-out"
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// Composição da carteira no lançamento mais recente (ex.: "% da carteira" por classe de ativo) —
// só aparece quando os indicadores de "%" da mesma competência somam perto de 100, ou seja, quando
// realmente formam um todo. Nunca força pizza onde não há partes de um todo de verdade.
function GraficoComposicao({
  competencia,
  fatias,
  corDestaque,
}: {
  competencia: string;
  fatias: FatiaComposicao[];
  corDestaque: CorGrafico;
}) {
  const dados = fatias.map((f, i) => ({ ...f, cor: CORES_GRAFICO[i % CORES_GRAFICO.length] }));

  return (
    <div className="rounded-xl border border-border p-5 transition-all hover:shadow-lift" style={estiloCartaoGrafico(corDestaque)}>
      <div className="mb-1 flex items-center gap-2">
        <PieChartIcon size={14} className="text-gold" />
        <p className="text-sm font-medium text-ink">Composição da carteira</p>
      </div>
      <p className="mb-2 text-xs text-ink-muted">
        Campos em % que, somados, fecham perto de 100% no lançamento vigente ({formatarCompetencia(competencia)}) —
        ou seja, são de fato partes de um todo, não valores soltos.
      </p>
      <div className="flex flex-col items-center gap-4 sm:flex-row">
        <div className="h-56 w-56 shrink-0">
          <ResponsiveContainer>
            <PieChart>
              <Pie
                data={dados}
                dataKey="valor"
                nameKey="nome"
                innerRadius="55%"
                outerRadius="90%"
                paddingAngle={2}
                cornerRadius={4}
                stroke="rgb(var(--color-surface))"
                strokeWidth={2}
                animationDuration={800}
                animationEasing="ease-out"
                animationBegin={150}
              >
                {dados.map((f) => (
                  <Cell key={f.nome} fill={`rgb(var(--color-${f.cor}))`} />
                ))}
              </Pie>
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const item = payload[0].payload as FatiaComposicao;
                  return (
                    <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-lift">
                      <p className="font-medium text-ink">{item.nome}</p>
                      <p className="tabular text-ink-muted">{item.valor.toLocaleString("pt-BR")}%</p>
                    </div>
                  );
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="grid min-w-0 flex-1 grid-cols-1 gap-1.5 sm:grid-cols-2">
          {dados.map((f) => (
            <div key={f.nome} className="flex items-center gap-2 text-xs">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: `rgb(var(--color-${f.cor}))` }} />
              <span className="truncate text-ink-muted" title={f.nome}>
                {f.nome}
              </span>
              <span className="ml-auto shrink-0 tabular font-medium text-ink">{f.valor.toLocaleString("pt-BR")}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

interface SlideGrafico {
  key: string;
  titulo: string;
  node: ReactNode;
}

// Um gráfico por vez, trocando sozinho a cada 10s — cada slide é sobre um tipo de dado específico
// (composição, alocação, cada grupo de unidade). Pausa ao passar o mouse (senão ninguém consegue
// ler antes de trocar) e sempre dá pra navegar na mão (bolinhas + setas), nunca só automático.
function CarrosselGraficos({ slides }: { slides: SlideGrafico[] }) {
  const [indice, setIndice] = useState(0);
  const [pausado, setPausado] = useState(false);

  useEffect(() => {
    setIndice(0);
  }, [slides.length]);

  useEffect(() => {
    if (slides.length <= 1 || pausado) return;
    const intervalo = setInterval(() => setIndice((i) => (i + 1) % slides.length), 10000);
    return () => clearInterval(intervalo);
  }, [slides.length, pausado]);

  if (slides.length === 0) return null;
  const atual = slides[Math.min(indice, slides.length - 1)];

  return (
    <div onMouseEnter={() => setPausado(true)} onMouseLeave={() => setPausado(false)}>
      <div key={atual.key} style={{ animation: "fade-up .4s ease-out both" }}>
        {atual.node}
      </div>
      {slides.length > 1 && (
        <div className="mt-3 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => setIndice((i) => (i - 1 + slides.length) % slides.length)}
            className="text-ink-muted transition-colors hover:text-petrol"
            aria-label="Gráfico anterior"
          >
            <ChevronLeft size={18} />
          </button>
          <div className="flex items-center gap-1.5">
            {slides.map((s, i) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setIndice(i)}
                aria-label={`Ver gráfico: ${s.titulo}`}
                title={s.titulo}
                className={`h-2 rounded-full transition-all ${i === indice ? "w-6 bg-petrol" : "w-2 bg-border hover:bg-ink-muted"}`}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => setIndice((i) => (i + 1) % slides.length)}
            className="text-ink-muted transition-colors hover:text-petrol"
            aria-label="Próximo gráfico"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      )}
    </div>
  );
}

// Uma linha fechada da tabela de lançamentos — expande pra baixo mostrando todos os campos
// daquele lançamento específico, sem sair da página. Campo por linha (não pivotado): pra um
// documento com muitos campos de nome longo e poucos lançamentos, isso lê melhor do que uma
// tabela larga com cabeçalhos truncados em 3 linhas.
function LinhaLancamento({
  documentoBase,
  competencia,
  campos,
  aberto,
  onToggle,
  slug,
  codigo,
}: {
  documentoBase: PortalDocumentoPublico;
  competencia: string;
  campos: CampoLinha[];
  aberto: boolean;
  onToggle: () => void;
  slug: string;
  codigo: string;
}) {
  const [buscaLocal, setBuscaLocal] = useState("");
  const origens = new Set(campos.map((c) => c.origem));
  const origemTexto = origens.size === 1 ? ORIGEM_LABEL[[...origens][0]] : "Múltiplas origens";
  const buscaLocalNormalizada = buscaLocal.trim().toLowerCase();
  const camposFiltrados = buscaLocalNormalizada
    ? campos.filter((c) => `${c.indicadorNome} ${c.valor} ${c.unidade ?? ""}`.toLowerCase().includes(buscaLocalNormalizada))
    : campos;

  // Documentos-fonte reais deste lançamento (normalmente um só PDF, mas nada impede duas
  // competências terem sido montadas a partir de fontes diferentes) — o "PDF original" é sempre
  // derivado dos dados, nunca fixo por tipo documental.
  const arquivosOrigem = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const c of campos) {
      if (c.documentoUploadId) mapa.set(c.documentoUploadId, c.documentoUploadNome ?? "Documento original");
    }
    return [...mapa.entries()];
  }, [campos]);

  return (
    <div className="border-b border-border last:border-0">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left transition-colors hover:bg-petrol/5"
      >
        <div className="flex items-center gap-3">
          <ChevronRight size={16} className={`shrink-0 text-ink-muted transition-transform ${aberto ? "rotate-90" : ""}`} />
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-petrol/10 text-petrol">
            <CalendarDays size={16} />
          </span>
          <div>
            <p className="text-sm font-semibold text-ink">
              {documentoBase.nome} <span className="font-normal text-ink-muted">—</span> {formatarCompetenciaExtenso(competencia)}
            </p>
            <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
              <span className="rounded-full bg-ink/5 px-2 py-0.5 font-medium text-ink">
                {campos.length} campo{campos.length === 1 ? "" : "s"}
              </span>
              {origemTexto}
            </p>
          </div>
        </div>
        {aberto && (
          <div onClick={(e) => e.stopPropagation()} className="relative hidden min-w-[180px] flex-1 sm:block">
            <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted" />
            <input
              type="text"
              value={buscaLocal}
              onChange={(e) => setBuscaLocal(e.target.value)}
              placeholder="Filtrar campos deste lançamento…"
              className="w-full rounded-lg border border-border bg-bg py-1.5 pl-7 pr-2 text-xs text-ink outline-none focus:border-petrol"
            />
          </div>
        )}
        <div onClick={(e) => e.stopPropagation()}>
          <MenuExportar documento={documentoDeCampos(documentoBase, campos)} nomeArquivo={`${documentoBase.id}-${competencia.slice(0, 7)}`} compacto />
        </div>
      </button>

      {aberto && (
        <div
          className="grid grid-cols-1 gap-x-6 gap-y-1 px-4 pb-4 sm:grid-cols-2 xl:grid-cols-3"
          style={{ animation: "fade-up .25s ease-out both" }}
        >
          {camposFiltrados.length === 0 && <p className="text-xs text-ink-muted">Nenhum campo bate com esse filtro.</p>}
          {camposFiltrados.map((c, i) => (
            <div
              key={`${c.indicadorId}-${i}`}
              className="min-w-0 border-b border-border/50 py-1.5 text-xs leading-relaxed"
              title={`${TIPO_LABEL[c.tipo]} · ${ORIGEM_LABEL[c.origem]}`}
            >
              <span className={`mr-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${TIPO_DOT[c.tipo]}`} />
              <span className="text-ink-muted">{c.indicadorNome}: </span>
              <span className="tabular font-medium text-ink">
                {c.valor}
                {c.unidade ? ` ${c.unidade}` : ""}
              </span>
            </div>
          ))}

          {arquivosOrigem.length > 0 && (
            <div className="col-span-full mt-2 flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
              <span className="text-xs text-ink-muted">Documento original:</span>
              {arquivosOrigem.map(([uploadId, nome]) => (
                <a
                  key={uploadId}
                  href={`/api/public/portal-previdenciario/${slug}/documentos/${codigo}/arquivos/${uploadId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 rounded-full border border-border bg-bg px-3 py-1 text-xs font-medium text-petrol transition-colors hover:border-petrol hover:bg-petrol/5"
                >
                  <FileText size={13} /> {nome}
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Conteúdo central do Portal Previdenciário pra um documento (ex.: DPIN) — pensado pra vários
// lançamentos ao longo do tempo, não um só: busca única (acha literalmente qualquer coisa) +
// exportação geral no topo, gráficos GERAIS (escopados ao lançamento mais recente — dois
// lançamentos podem reportar taxonomias diferentes, ex.: mudança de resolução do CMN entre anos —
// ocupando a largura toda) e, embaixo, cada lançamento como uma linha fechada que expande com seus
// dados completos.
const TODOS_TIPOS: (PortalIndicadorPublico["tipo"] | "todos")[] = ["todos", "NUMERICO", "MOEDA", "TEXTO", "DATA"];

// Um campo da barra de filtros — ícone + rótulo + select, com o mesmo visual em todos os filtros
// (nenhum é específico de um tipo documental: Tipo/Unidade/Lançamento/Origem existem pra
// qualquer indicador de qualquer documento).
function FiltroCampo({
  icone: Icone,
  rotulo,
  ativo,
  className,
  children,
}: {
  icone: typeof Tag;
  rotulo: string;
  ativo?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
        <Icone size={12} className={ativo ? "text-petrol" : "text-ink-muted"} />
        {rotulo}
      </span>
      <div className="relative">{children}</div>
    </label>
  );
}

const CLASSE_SELECT_FILTRO =
  "block w-full appearance-none rounded-lg border bg-surface py-2 pl-3 pr-8 text-sm text-ink shadow-soft transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-petrol/40";

export function DocumentoExplorer({ documento, slug }: { documento: PortalDocumentoPublicoDetalhe; slug: string }) {
  const [busca, setBusca] = useState("");
  const [filtroTipo, setFiltroTipo] = useState<(typeof TODOS_TIPOS)[number]>("todos");
  const [filtroUnidade, setFiltroUnidade] = useState<string>("todas");
  const [filtroCompetencia, setFiltroCompetencia] = useState<string>("todas");
  const [filtroOrigem, setFiltroOrigem] = useState<"todas" | "MANUAL" | "OFICIAL">("todas");
  const [periodoInicio, setPeriodoInicio] = useState("");
  const [periodoFim, setPeriodoFim] = useState("");
  const [lancamentoAberto, setLancamentoAberto] = useState<string | null>(null);

  const buscaNormalizada = busca.trim().toLowerCase();

  // Opções dos filtros vêm sempre do documento inteiro (não do já filtrado) — senão a lista de
  // opções vai encolhendo conforme filtra, o que confunde mais do que ajuda.
  const unidadesDisponiveis = useMemo(() => {
    const s = new Set<string>();
    for (const i of documento.indicadores) if (i.unidade) s.add(i.unidade);
    return [...s].sort();
  }, [documento.indicadores]);

  const competenciasDisponiveis = useMemo(() => {
    const s = new Set<string>();
    for (const i of documento.indicadores) for (const v of i.valores) s.add(v.competencia);
    return [...s].sort((a, b) => b.localeCompare(a));
  }, [documento.indicadores]);

  const filtrosAtivos =
    filtroTipo !== "todos" || filtroUnidade !== "todas" || filtroCompetencia !== "todas" || filtroOrigem !== "todas" || periodoInicio !== "" || periodoFim !== "";

  function limparFiltros() {
    setFiltroTipo("todos");
    setFiltroUnidade("todas");
    setFiltroCompetencia("todas");
    setFiltroOrigem("todas");
    setPeriodoInicio("");
    setPeriodoFim("");
  }

  // Filtra por VALOR (competência específica, período, origem) antes de filtrar por INDICADOR
  // (tipo, unidade, busca) — um indicador só sobrevive se sobrar pelo menos 1 valor depois do
  // primeiro filtro.
  const indicadoresFiltrados = useMemo(() => {
    return documento.indicadores
      .map((ind) => ({
        ...ind,
        valores: ind.valores.filter((v) => {
          if (filtroCompetencia !== "todas" && v.competencia !== filtroCompetencia) return false;
          const mes = v.competencia.slice(0, 7);
          if (periodoInicio && mes < periodoInicio) return false;
          if (periodoFim && mes > periodoFim) return false;
          if (filtroOrigem === "MANUAL" && v.origem !== "MANUAL") return false;
          if (filtroOrigem === "OFICIAL" && v.origem === "MANUAL") return false;
          return true;
        }),
      }))
      .filter(
        (i) =>
          i.valores.length > 0 &&
          (filtroTipo === "todos" || i.tipo === filtroTipo) &&
          (filtroUnidade === "todas" || i.unidade === filtroUnidade) &&
          (!buscaNormalizada || indicadorTexto(i).includes(buscaNormalizada)),
      );
  }, [documento.indicadores, buscaNormalizada, filtroTipo, filtroUnidade, filtroCompetencia, filtroOrigem, periodoInicio, periodoFim]);

  const documentoFiltrado = useMemo(
    () => ({ ...documento, indicadores: indicadoresFiltrados }),
    [documento, indicadoresFiltrados],
  );

  // Dois lançamentos podem reportar classes de ativo diferentes de verdade (ex.: mudança de
  // resolução do CMN entre um ano e outro) — sem isso, "Gráficos gerais" juntaria taxonomias
  // incompatíveis de regulamentações diferentes no mesmo gráfico. Sem busca ativa, os gráficos
  // mostram só o lançamento mais recente (a política vigente agora); com busca, mostra qualquer
  // período que bata, já que aí a intenção é achar algo específico, não ver "o estado atual".
  const competenciaMaisRecente = useMemo(() => {
    const todas = indicadoresFiltrados.flatMap((i) => i.valores.map((v) => v.competencia));
    return todas.length ? todas.reduce((a, b) => (a > b ? a : b)) : null;
  }, [indicadoresFiltrados]);

  const indicadoresParaGraficos = useMemo(() => {
    if (buscaNormalizada || !competenciaMaisRecente) return indicadoresFiltrados;
    return indicadoresFiltrados.filter((i) => i.valores.some((v) => v.competencia === competenciaMaisRecente));
  }, [indicadoresFiltrados, buscaNormalizada, competenciaMaisRecente]);

  // Indicadores presentes em TODAS as competências do documento — só eles têm uma evolução real e
  // comparável ao longo do tempo (com 1 competência só, não tem "todos os lançamentos" pra
  // comparar). Ficam de fora do "valor mais recente" pra não mostrar o mesmo dado duas vezes.
  const todasCompetencias = useMemo(
    () => new Set(indicadoresFiltrados.flatMap((i) => i.valores.map((v) => v.competencia))),
    [indicadoresFiltrados],
  );
  const idsComuns = useMemo(() => {
    if (todasCompetencias.size < 2) return new Set<string>();
    const listaCompetencias = [...todasCompetencias];
    return new Set(
      indicadoresFiltrados
        .filter((i) => numerico(i.tipo) && listaCompetencias.every((c) => i.valores.some((v) => v.competencia === c)))
        .map((i) => i.id),
    );
  }, [indicadoresFiltrados, todasCompetencias]);
  const gruposTendencia = useMemo(() => {
    if (idsComuns.size === 0) return [];
    const comuns = indicadoresFiltrados.filter((i) => idsComuns.has(i.id));
    const porUnidade = new Map<string, PortalIndicadorPublico[]>();
    for (const ind of comuns) {
      const chave = ind.unidade?.trim() || "__sem_unidade__";
      const lista = porUnidade.get(chave) ?? [];
      lista.push(ind);
      porUnidade.set(chave, lista);
    }
    return [...porUnidade.entries()].map(([chave, indicadores]) => ({
      unidade: chave === "__sem_unidade__" ? null : chave,
      titulo: chave === "__sem_unidade__" ? "Evolução — outros números" : `Evolução — indicadores em ${chave}`,
      indicadores,
    }));
  }, [indicadoresFiltrados, idsComuns]);

  const indicadoresNumericos = useMemo(
    () => indicadoresParaGraficos.filter((i) => numerico(i.tipo) && !idsComuns.has(i.id)),
    [indicadoresParaGraficos, idsComuns],
  );

  // Campos "Estratégia Alvo/Limite Superior/Limite Inferior" NUNCA entram como candidato de
  // composição — são bandas-limite de ativos diferentes, não partes de um todo. Sem essa exclusão,
  // um recorte de busca podia juntar valores de ativos distintos que somam perto de 100 por pura
  // coincidência e virar uma pizza enganosa (já aconteceu — ver captura que motivou este fix).
  const idsAlocacao = useMemo(
    () => new Set(indicadoresParaGraficos.filter((i) => extrairAlocacao(i.nome) !== null).map((i) => i.id)),
    [indicadoresParaGraficos],
  );

  // Composição: indicadores NUMERICO em "%" (fora da estratégia de alocação) cuja competência mais
  // recente compartilhada soma perto de 100 — só então formam de fato "partes de um todo" e viram
  // pizza.
  const composicao = useMemo(() => {
    const candidatos = indicadoresParaGraficos.filter((i) => i.tipo === "NUMERICO" && i.unidade === "%" && !idsAlocacao.has(i.id));
    if (candidatos.length < 2) return null;
    const competenciaRecente = candidatos
      .flatMap((i) => i.valores.map((v) => v.competencia))
      .reduce((a, b) => (a > b ? a : b), "");
    if (!competenciaRecente) return null;
    const fatias: FatiaComposicao[] = candidatos
      .map((i) => {
        const v = i.valores.find((v) => v.competencia === competenciaRecente);
        return v ? { id: i.id, nome: i.nome, valor: valorParaNumero(v.valor) } : null;
      })
      .filter((f): f is FatiaComposicao => f !== null && f.valor > 0);
    const soma = fatias.reduce((s, f) => s + f.valor, 0);
    if (fatias.length < 2 || soma < 50 || soma > 150) return null;
    return { competencia: competenciaRecente, fatias };
  }, [indicadoresParaGraficos, idsAlocacao]);

  // Os campos que já viraram fatia da pizza não repetem como card individual — senão é a mesma
  // informação duas vezes na tela.
  const idsNaComposicao = useMemo(() => new Set(composicao?.fatias.map((f) => f.id) ?? []), [composicao]);
  const indicadoresParaGrafico = useMemo(
    () => indicadoresNumericos.filter((i) => !idsNaComposicao.has(i.id)),
    [indicadoresNumericos, idsNaComposicao],
  );

  // Separa quem casa com o padrão "<Ativo> - <Métrica> (%)" (vira cluster agrupado) do resto.
  const { clustersAlocacao, indicadoresRestantes } = useMemo(() => {
    const porAtivo = new Map<string, ClusterAlocacao>();
    const restantes: PortalIndicadorPublico[] = [];
    for (const ind of indicadoresParaGrafico) {
      const match = extrairAlocacao(ind.nome);
      if (!match) {
        restantes.push(ind);
        continue;
      }
      const ordenados = [...ind.valores].sort((a, b) => a.competencia.localeCompare(b.competencia));
      const ultimo = ordenados[ordenados.length - 1];
      const cluster = porAtivo.get(match.ativo) ?? { ativo: match.ativo, ativoCurto: resumirAtivo(match.ativo) };
      cluster[match.metrica.chave] = valorParaNumero(ultimo.valor);
      porAtivo.set(match.ativo, cluster);
    }
    return { clustersAlocacao: [...porAtivo.values()], indicadoresRestantes: restantes };
  }, [indicadoresParaGrafico]);

  // Do que sobrou: se um grupo (por unidade) tiver 2+ itens, vira gráfico de barras comparativo;
  // se tiver só 1, um gráfico inteiro pra um valor solto é ilegível/desperdiçado — vira uma
  // etiqueta de contexto ao lado do título (ex.: "Ano de vigência: 2026").
  const { gruposComparativos, indicadoresSoltos } = useMemo(() => {
    const porUnidade = new Map<string, PortalIndicadorPublico[]>();
    for (const ind of indicadoresRestantes) {
      const chave = ind.unidade?.trim() || "__sem_unidade__";
      const lista = porUnidade.get(chave) ?? [];
      lista.push(ind);
      porUnidade.set(chave, lista);
    }
    const grupos: { unidade: string | null; titulo: string; indicadores: PortalIndicadorPublico[] }[] = [];
    const soltos: PortalIndicadorPublico[] = [];
    for (const [chave, indicadores] of porUnidade) {
      if (indicadores.length < 2) {
        soltos.push(...indicadores);
        continue;
      }
      grupos.push({
        unidade: chave === "__sem_unidade__" ? null : chave,
        titulo: chave === "__sem_unidade__" ? "Outros números" : `Indicadores em ${chave}`,
        indicadores,
      });
    }
    return { gruposComparativos: grupos, indicadoresSoltos: soltos };
  }, [indicadoresRestantes]);

  // Cada slide do carrossel é sobre um tipo de dado específico — composição, alocação, e um por
  // grupo de unidade — nunca misturando tipos diferentes num slide só.
  const slidesGraficos = useMemo<SlideGrafico[]>(() => {
    const lista: SlideGrafico[] = [];
    let indiceCor = 0;
    const proximaCor = () => CORES_GRAFICO[indiceCor++ % CORES_GRAFICO.length];

    if (composicao) {
      lista.push({
        key: "composicao",
        titulo: "Composição da carteira",
        node: <GraficoComposicao competencia={composicao.competencia} fatias={composicao.fatias} corDestaque={proximaCor()} />,
      });
    }
    if (clustersAlocacao.length > 0) {
      lista.push({
        key: "alocacao",
        titulo: "Estratégia de alocação por ativo",
        node: <GraficoAlocacao clusters={clustersAlocacao} cor={proximaCor()} />,
      });
    }
    for (const grupo of gruposTendencia) {
      lista.push({
        key: `tendencia-${grupo.titulo}`,
        titulo: grupo.titulo,
        node: <GraficoTendencia titulo={grupo.titulo} unidade={grupo.unidade} indicadores={grupo.indicadores} cor={proximaCor()} />,
      });
    }
    for (const grupo of gruposComparativos) {
      lista.push({
        key: grupo.titulo,
        titulo: grupo.titulo,
        node: <GraficoComparativo titulo={grupo.titulo} unidade={grupo.unidade} indicadores={grupo.indicadores} cor={proximaCor()} />,
      });
    }
    return lista;
  }, [composicao, clustersAlocacao, gruposTendencia, gruposComparativos]);

  const lancamentos = useMemo(() => {
    const porCompetencia = new Map<string, CampoLinha[]>();
    for (const i of indicadoresFiltrados) {
      for (const v of i.valores) {
        const lista = porCompetencia.get(v.competencia) ?? [];
        lista.push({
          indicadorId: i.id,
          indicadorNome: i.nome,
          tipo: i.tipo,
          unidade: i.unidade,
          competencia: v.competencia,
          valor: v.valor,
          origem: v.origem,
          documentoUploadId: v.documentoUploadId,
          documentoUploadNome: v.documentoUploadNome,
        });
        porCompetencia.set(v.competencia, lista);
      }
    }
    return [...porCompetencia.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [indicadoresFiltrados]);

  return (
    <div className="mt-8">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="group relative min-w-[260px] flex-1">
          <div
            className="absolute -inset-0.5 rounded-xl bg-gradient-to-r from-petrol via-gold to-ok opacity-30 blur-md transition-opacity duration-300 group-focus-within:opacity-60"
            style={{ animation: "glow-shift 4s ease-in-out infinite" }}
          />
          <div className="relative flex items-center gap-2.5 rounded-xl border border-border bg-surface px-3.5 py-2.5 shadow-soft">
            <Search size={16} className="shrink-0 text-petrol" />
            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Busque por qualquer indicador, valor, competência, tipo…"
              className="w-full bg-transparent text-sm text-ink placeholder:text-ink-muted focus:outline-none"
            />
            {busca && (
              <button type="button" onClick={() => setBusca("")} className="shrink-0 text-ink-muted hover:text-ink" aria-label="Limpar busca">
                <X size={15} />
              </button>
            )}
          </div>
        </div>
        <MenuExportar documento={documentoFiltrado} nomeArquivo={`${documento.id}-geral`} />
      </div>

      <div className="mb-6 rounded-xl border border-border bg-bg/60 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            <SlidersHorizontal size={13} className="text-petrol" />
            Filtros
          </span>
          {filtrosAtivos && (
            <button
              type="button"
              onClick={limparFiltros}
              className="flex items-center gap-1 rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-medium text-ink-muted transition-colors hover:border-crit hover:text-crit"
            >
              <X size={12} /> Limpar filtros
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <FiltroCampo icone={Tag} rotulo="Tipo" ativo={filtroTipo !== "todos"}>
            <select
              value={filtroTipo}
              onChange={(e) => setFiltroTipo(e.target.value as (typeof TODOS_TIPOS)[number])}
              className={`${CLASSE_SELECT_FILTRO} ${filtroTipo !== "todos" ? "border-petrol/40 text-petrol" : "border-border"}`}
            >
              {TODOS_TIPOS.map((t) => (
                <option key={t} value={t}>
                  {t === "todos" ? "Todos" : TIPO_LABEL[t]}
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-muted" />
          </FiltroCampo>

          <FiltroCampo icone={Ruler} rotulo="Unidade" ativo={filtroUnidade !== "todas"}>
            <select
              value={filtroUnidade}
              onChange={(e) => setFiltroUnidade(e.target.value)}
              className={`${CLASSE_SELECT_FILTRO} ${filtroUnidade !== "todas" ? "border-petrol/40 text-petrol" : "border-border"}`}
            >
              <option value="todas">Todas</option>
              {unidadesDisponiveis.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-muted" />
          </FiltroCampo>

          <FiltroCampo icone={CalendarDays} rotulo="Lançamento" ativo={filtroCompetencia !== "todas"}>
            <select
              value={filtroCompetencia}
              onChange={(e) => setFiltroCompetencia(e.target.value)}
              className={`${CLASSE_SELECT_FILTRO} ${filtroCompetencia !== "todas" ? "border-petrol/40 text-petrol" : "border-border"}`}
            >
              <option value="todas">Todos</option>
              {competenciasDisponiveis.map((c) => (
                <option key={c} value={c}>
                  {formatarCompetencia(c)}
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-muted" />
          </FiltroCampo>

          <FiltroCampo
            icone={ArrowRight}
            rotulo="Período"
            ativo={periodoInicio !== "" || periodoFim !== ""}
            className="col-span-2 sm:col-span-1"
          >
            <div className="flex items-center gap-1.5">
              <input
                type="month"
                value={periodoInicio}
                onChange={(e) => setPeriodoInicio(e.target.value)}
                aria-label="De"
                className={`w-full rounded-lg border bg-surface p-2 text-sm text-ink shadow-soft transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-petrol/40 ${periodoInicio ? "border-petrol/40" : "border-border"}`}
              />
              <ArrowRight size={13} className="shrink-0 text-ink-muted" />
              <input
                type="month"
                value={periodoFim}
                onChange={(e) => setPeriodoFim(e.target.value)}
                aria-label="Até"
                className={`w-full rounded-lg border bg-surface p-2 text-sm text-ink shadow-soft transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-petrol/40 ${periodoFim ? "border-petrol/40" : "border-border"}`}
              />
            </div>
          </FiltroCampo>

          <FiltroCampo icone={Stamp} rotulo="Origem" ativo={filtroOrigem !== "todas"}>
            <select
              value={filtroOrigem}
              onChange={(e) => setFiltroOrigem(e.target.value as "todas" | "MANUAL" | "OFICIAL")}
              className={`${CLASSE_SELECT_FILTRO} ${filtroOrigem !== "todas" ? "border-petrol/40 text-petrol" : "border-border"}`}
            >
              <option value="todas">Todas</option>
              <option value="OFICIAL">Documento oficial</option>
              <option value="MANUAL">Lançamento manual</option>
            </select>
            <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-muted" />
          </FiltroCampo>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <BarChart3 size={17} className="text-petrol" />
        <h2 className="font-display text-lg font-bold text-ink">Gráficos gerais</h2>
        <span className="text-xs text-ink-muted">
          {buscaNormalizada
            ? "— resultado da busca, todos os períodos"
            : competenciaMaisRecente
              ? `— lançamento vigente (${formatarCompetencia(competenciaMaisRecente)})`
              : ""}
        </span>
        {indicadoresSoltos.map((ind) => {
          const ultimo = [...ind.valores].sort((a, b) => a.competencia.localeCompare(b.competencia)).slice(-1)[0];
          return (
            <span
              key={ind.id}
              className="ml-1 flex items-center gap-1.5 rounded-full border border-border bg-ink/5 px-3 py-1 text-xs font-medium text-ink"
              title={ind.nome}
            >
              {ind.nome}:
              <span className="tabular font-semibold text-petrol">
                {ultimo.valor}
                {ind.unidade ? ` ${ind.unidade}` : ""}
              </span>
            </span>
          );
        })}
      </div>
      {slidesGraficos.length === 0 ? (
        <Card className="p-6">
          <p className="text-sm text-ink-muted">Nenhum indicador numérico encontrado com esse filtro.</p>
        </Card>
      ) : (
        <CarrosselGraficos slides={slidesGraficos} />
      )}

      <div className="mb-3 mt-8 flex items-center gap-2">
        <FileSpreadsheet size={17} className="text-gold" />
        <h2 className="font-display text-lg font-bold text-ink">Lançamentos</h2>
        <span className="text-xs text-ink-muted">— clique pra abrir os dados completos de cada um</span>
      </div>
      <Card className="overflow-hidden p-0">
        {lancamentos.length === 0 ? (
          <p className="p-6 text-sm text-ink-muted">Nenhum lançamento encontrado com esse filtro.</p>
        ) : (
          lancamentos.map(([competencia, campos]) => (
            <LinhaLancamento
              key={competencia}
              documentoBase={documento}
              competencia={competencia}
              campos={campos}
              aberto={lancamentoAberto === competencia}
              onToggle={() => setLancamentoAberto((atual) => (atual === competencia ? null : competencia))}
              slug={slug}
              codigo={documento.codigo}
            />
          ))
        )}
      </Card>
    </div>
  );
}
