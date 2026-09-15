import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
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

function useMediaQuery(consulta: string): boolean {
  const [combina, setCombina] = useState(() => typeof window !== "undefined" && window.matchMedia(consulta).matches);
  useEffect(() => {
    const mq = window.matchMedia(consulta);
    const listener = () => setCombina(mq.matches);
    setCombina(mq.matches);
    mq.addEventListener("change", listener);
    return () => mq.removeEventListener("change", listener);
  }, [consulta]);
  return combina;
}

// Usado pra encolher a largura fixa do eixo de categorias dos gráficos horizontais (nomes de
// ativos/indicadores) em telas estreitas — sem isso, o eixo sozinho toma a maior parte do espaço
// disponível num celular, espremendo as barras a quase nada.
function useEhMobile(): boolean {
  return useMediaQuery("(max-width: 640px)");
}

// Mesma ideia da linha acima, mas pro caso oposto: no desktop os gráficos ficam lado a lado em duas
// colunas, então cada cartão tem cerca de metade da largura da página. `compacto` é o que cada
// gráfico recebe pra se ajustar a isso (eixo mais estreito, nome truncado antes, altura menor) —
// nunca é o tamanho da tela sozinho que decide, é a largura real que sobrou pro cartão.
function useEhDuasColunas(): boolean {
  return useMediaQuery("(min-width: 1024px)");
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

const TIPO_DOT_CLASSE: Record<CorGrafico, string> = {
  petrol: "bg-petrol",
  gold: "bg-gold",
  ok: "bg-ok",
  warn: "bg-warn",
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

// Quebra o nome de categoria em até duas linhas pro eixo dos gráficos horizontais. Só truncar não
// serve na coluna estreita do desktop: indicadores que começam igual ("Operação - Nova Aplicação
// em ...") viravam três rótulos idênticos, e o que diferencia um do outro fica justamente no fim
// do nome. Em duas linhas cabe o dobro, e o corte (quando ainda é preciso) cai bem mais tarde.
function quebrarEmLinhas(texto: string, porLinha: number, maxLinhas: number): string[] {
  const palavras = texto.split(/\s+/).map((p) => nomeCurto(p, porLinha));
  const linhas: string[] = [];
  let atual = "";
  for (const palavra of palavras) {
    const tentativa = atual ? `${atual} ${palavra}` : palavra;
    if (tentativa.length <= porLinha) {
      atual = tentativa;
      continue;
    }
    linhas.push(atual);
    atual = palavra;
    if (linhas.length === maxLinhas) break;
  }
  if (linhas.length < maxLinhas && atual) linhas.push(atual);
  const cortadas = linhas.slice(0, maxLinhas);
  // Sobrou nome que não coube: a reticência na última linha avisa que o rótulo continua (o nome
  // inteiro sempre aparece no tooltip).
  if (cortadas.join(" ").length < texto.replace(/\s+/g, " ").trim().length) {
    const ultima = cortadas[cortadas.length - 1] ?? "";
    cortadas[cortadas.length - 1] = `${ultima.slice(0, Math.max(1, porLinha - 1))}…`;
  }
  return cortadas;
}

interface TickCategoriaProps {
  x?: number;
  y?: number;
  payload?: { value?: string | number };
  fonte: number;
  porLinha: number;
}

function TickCategoria({ x = 0, y = 0, payload, fonte, porLinha }: TickCategoriaProps) {
  const linhas = quebrarEmLinhas(String(payload?.value ?? ""), porLinha, 2);
  const alturaLinha = fonte + 2;
  const inicio = -((linhas.length - 1) * alturaLinha) / 2 + fonte / 3;
  return (
    <text x={x} y={y} textAnchor="end" fill="rgb(var(--color-ink-muted))" fontSize={fonte}>
      {linhas.map((linha, i) => (
        <tspan key={linha + i} x={x} dy={i === 0 ? inicio : alturaLinha}>
          {linha}
        </tspan>
      ))}
    </text>
  );
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
function GraficoAlocacao({
  clusters,
  cor,
  compacto = false,
  atraso = 0,
}: {
  clusters: ClusterAlocacao[];
  cor: CorGrafico;
  compacto?: boolean;
  atraso?: number;
}) {
  const altura = compacto ? Math.max(280, clusters.length * 50) : Math.max(320, clusters.length * 52);
  const ehMobile = useEhMobile();

  // Escala do eixo precisa se ADAPTAR à dispersão real dos dados: numa política de investimentos
  // é comum um ativo permitir até 100% (ex.: títulos públicos) enquanto outros ficam na casa de
  // 1-25% — numa escala linear comum, esses poucos de até 100% esmagam visualmente todo o resto
  // (vira um gráfico "torto", ilegível pros ativos pequenos). Só troca pra raiz quadrada (comprime
  // os valores grandes, preserva a ordem, nunca mente sobre qual é maior) quando a dispersão real
  // dos dados justifica — um conjunto de valores parecidos entre si continua linear, mais preciso.
  const valoresAlocacao = clusters
    .flatMap((c) => [c.alvo, c.inferior, c.superior])
    .filter((v): v is number => typeof v === "number" && v > 0);
  const maxAlocacao = valoresAlocacao.length ? Math.max(...valoresAlocacao) : 0;
  const escalaAdaptativa: "sqrt" | "linear" = valoresAlocacao.some((v) => v < maxAlocacao / 8) ? "sqrt" : "linear";

  return (
    <div className="h-full rounded-xl border border-border p-5 transition-all hover:shadow-lift" style={estiloCartaoGrafico(cor, atraso)}>
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
            <XAxis type="number" hide scale={escalaAdaptativa} domain={[0, "auto"]} allowDataOverflow={false} />
            <YAxis
              type="category"
              dataKey="ativoCurto"
              fontSize={ehMobile ? 10 : 12}
              stroke="rgb(var(--color-ink-muted))"
              tickLine={false}
              axisLine={false}
              width={ehMobile ? 96 : compacto ? 132 : 190}
              tick={compacto && !ehMobile ? <TickCategoria fonte={10} porLinha={23} /> : undefined}
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
                minPointSize={8}
                animationDuration={3000}
                animationEasing="ease-out"
                animationBegin={200 + i * 180}
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
  compacto = false,
  atraso = 0,
}: {
  titulo: string;
  unidade: string | null;
  indicadores: PortalIndicadorPublico[];
  cor: CorGrafico;
  compacto?: boolean;
  atraso?: number;
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
  const altura = compacto ? Math.max(200, dados.length * 48) : Math.max(220, dados.length * 48);
  const ehMobile = useEhMobile();

  // Mesma ideia adaptativa do gráfico de alocação: só comprime (raiz quadrada) quando a dispersão
  // real dos valores justifica — nunca deixa um outlier grande esmagar visualmente o resto.
  const valoresComparativo = dados.map((d) => Math.abs(d.valor)).filter((v) => v > 0);
  const maxComparativo = valoresComparativo.length ? Math.max(...valoresComparativo) : 0;
  const escalaAdaptativa: "sqrt" | "linear" = valoresComparativo.some((v) => v < maxComparativo / 8) ? "sqrt" : "linear";

  return (
    <div className="h-full rounded-xl border border-border p-5 transition-all hover:shadow-lift" style={estiloCartaoGrafico(cor, atraso)}>
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
          <BarChart data={dados} layout="vertical" margin={{ top: 4, right: compacto ? 92 : 56, left: 8, bottom: 4 }} barCategoryGap="24%">
            <defs>
              {CORES_GRAFICO.map((c) => (
                <linearGradient key={c} id={`grad-comp-${c}`} x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor={`rgb(var(--color-${c}))`} stopOpacity={0.5} />
                  <stop offset="100%" stopColor={`rgb(var(--color-${c}))`} stopOpacity={1} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid horizontal={false} stroke="rgb(var(--color-border))" strokeDasharray="3 3" />
            <XAxis type="number" hide scale={escalaAdaptativa} domain={[0, "auto"]} allowDataOverflow={false} />
            <YAxis
              type="category"
              dataKey={compacto && !ehMobile ? "nome" : "nomeCurto"}
              fontSize={ehMobile ? 10 : 12}
              stroke="rgb(var(--color-ink-muted))"
              tickLine={false}
              axisLine={false}
              width={ehMobile ? 104 : compacto ? 148 : 210}
              tick={compacto && !ehMobile ? <TickCategoria fonte={10} porLinha={26} /> : undefined}
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
            <Bar dataKey="valor" radius={[0, 6, 6, 0]} maxBarSize={26} minPointSize={8} animationDuration={3000} animationEasing="ease-out" animationBegin={200}>
              {dados.map((d, i) => (
                <Cell key={d.id} fill={`url(#grad-comp-${CORES_GRAFICO[i % CORES_GRAFICO.length]})`} />
              ))}
              <LabelList
                dataKey="valor"
                position="right"
                fontSize={compacto ? 10 : 11}
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

function GraficoTendencia({
  titulo,
  unidade,
  indicadores,
  cor,
  compacto = false,
  atraso = 0,
}: {
  titulo: string;
  unidade: string | null;
  indicadores: PortalIndicadorPublico[];
  cor: CorGrafico;
  compacto?: boolean;
  atraso?: number;
}) {
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

  // Cada indicador sempre vira um cartão compacto do MESMO tamanho (nome + valor mais recente +
  // mini-gráfico com eixo próprio) — nunca um gráfico grande sobreposto: além de eixo comum
  // esmagar indicadores de magnitude bem diferente (ex.: "Limite Inferior 0%" ao lado de
  // "Estratégia Alvo 24%"), um painel com 1 indicador só ficava enorme e vazio do lado de um painel
  // com vários cartões pequenos — o mesmo cartão pro grupo inteiro, tenha ele 1 ou 50 indicadores,
  // é o que garante os painéis sempre do mesmo tamanho um do outro. Com mais indicadores do que
  // cabe numa "página" de cartões, pagina em vez de esticar a altura do painel.
  const POR_PAGINA = 2;
  const [pagina, setPagina] = useState(0);
  const totalPaginas = Math.max(1, Math.ceil(indicadores.length / POR_PAGINA));
  const paginaValida = Math.min(pagina, totalPaginas - 1);
  useEffect(() => {
    if (pagina !== paginaValida) setPagina(paginaValida);
  }, [pagina, paginaValida]);
  const indicadoresPagina = indicadores.slice(paginaValida * POR_PAGINA, paginaValida * POR_PAGINA + POR_PAGINA);

  return (
    <div className="h-full rounded-xl border border-border p-5 transition-all hover:shadow-lift" style={estiloCartaoGrafico(cor, atraso)}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <TrendingUp size={15} className="text-petrol" />
          <p className="text-sm font-semibold text-ink">{titulo}</p>
        </div>
        {totalPaginas > 1 && (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => setPagina((p) => (p - 1 + totalPaginas) % totalPaginas)}
              className="rounded-md border border-border p-1 text-ink-muted transition-colors hover:border-petrol hover:text-petrol"
              aria-label="Indicadores anteriores"
            >
              <ChevronLeft size={13} />
            </button>
            <span className="tabular text-[11px] text-ink-muted">
              {paginaValida + 1}/{totalPaginas}
            </span>
            <button
              type="button"
              onClick={() => setPagina((p) => (p + 1) % totalPaginas)}
              className="rounded-md border border-border p-1 text-ink-muted transition-colors hover:border-petrol hover:text-petrol"
              aria-label="Próximos indicadores"
            >
              <ChevronRight size={13} />
            </button>
          </div>
        )}
      </div>
      <p className="mb-2 text-xs text-ink-muted">
        {indicadores.length === 1 ? "Este indicador aparece" : `Estes ${indicadores.length} indicadores aparecem`} em
        todos os {dados.length} lançamentos deste documento (de {dados[0]?.competencia} até{" "}
        {dados[dados.length - 1]?.competencia}) — a linha mostra como o valor mudou de um lançamento pro outro, não
        só o retrato do mais recente.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {indicadoresPagina.map((ind) => {
          const i = indicadores.indexOf(ind);
          const corLinha = CORES_GRAFICO[i % CORES_GRAFICO.length];
          const pontosInd = dados
            .map((p) => ({ competencia: p.competencia, valor: p[ind.id] }))
            .filter((p): p is { competencia: string; valor: number } => typeof p.valor === "number");
          const valorAtual = pontosInd[pontosInd.length - 1]?.valor;
          return (
            <div key={ind.id} className="min-w-0 rounded-lg border border-border p-3">
              <div className="flex items-start gap-1.5 text-xs">
                <span
                  className="mt-1 h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: `rgb(var(--color-${corLinha}))` }}
                />
                <span className="min-w-0 flex-1 text-ink-muted">{ind.nome}</span>
                {typeof valorAtual === "number" && (
                  <span className="shrink-0 tabular font-semibold text-ink">
                    {valorAtual.toLocaleString("pt-BR")}
                    {unidade ? ` ${unidade}` : ""}
                  </span>
                )}
              </div>
              <div className="mt-2 h-16 w-full">
                <ResponsiveContainer>
                  <LineChart data={pontosInd} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                    <YAxis hide domain={["auto", "auto"]} />
                    <XAxis dataKey="competencia" hide />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null;
                        return (
                          <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-lift">
                            <p className="mb-1 font-medium text-ink">{label}</p>
                            <p className="tabular text-ink-muted" style={{ color: `rgb(var(--color-${corLinha}))` }}>
                              {payload[0]?.value?.toLocaleString("pt-BR")}
                              {unidade ? ` ${unidade}` : ""}
                            </p>
                          </div>
                        );
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="valor"
                      stroke={`rgb(var(--color-${corLinha}))`}
                      strokeWidth={2}
                      dot={{ r: 3, strokeWidth: 0 }}
                      activeDot={{ r: 5, strokeWidth: 0 }}
                      animationDuration={3000}
                      animationEasing="ease-out"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          );
        })}
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
  compacto = false,
  atraso = 0,
}: {
  competencia: string;
  fatias: FatiaComposicao[];
  corDestaque: CorGrafico;
  compacto?: boolean;
  atraso?: number;
}) {
  const dados = fatias.map((f, i) => ({ ...f, cor: CORES_GRAFICO[i % CORES_GRAFICO.length] }));

  return (
    <div className="h-full rounded-xl border border-border p-5 transition-all hover:shadow-lift" style={estiloCartaoGrafico(corDestaque, atraso)}>
      <div className="mb-1 flex items-center gap-2">
        <PieChartIcon size={14} className="text-gold" />
        <p className="text-sm font-medium text-ink">Composição da carteira</p>
      </div>
      <p className="mb-2 text-xs text-ink-muted">
        Campos em % que, somados, fecham perto de 100% no lançamento vigente ({formatarCompetencia(competencia)}) —
        ou seja, são de fato partes de um todo, não valores soltos.
      </p>
      <div className="flex flex-col items-center gap-4 sm:flex-row">
        <div className={`shrink-0 ${compacto ? "h-44 w-44" : "h-56 w-56"}`}>
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
                animationDuration={3000}
                animationEasing="ease-out"
                animationBegin={200}
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
        <div className={`grid min-w-0 flex-1 grid-cols-1 gap-1.5 ${compacto ? "" : "sm:grid-cols-2"}`}>
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

interface PainelGrafico {
  key: string;
  titulo: string;
  // "larga" é o gráfico que não cabe legível em meia página (muitas barras, nomes longos): ocupa a
  // linha inteira mesmo no desktop, em vez de espremer as barras pra caber na coluna.
  largura: "normal" | "larga";
  render: (compacto: boolean, atraso: number) => ReactNode;
}

// Todos os gráficos de uma vez, lado a lado no desktop (duas colunas) e empilhados no celular —
// nada de carrossel trocando sozinho: comparar composição com alocação exigia esperar a rotação,
// e quem lê um relatório precisa dos números juntos na mesma tela. Cada cartão já traz seu próprio
// título e legenda, então a grade não precisa rotular nada por fora.
// Só monta o conteúdo (e portanto só dispara a animação de entrada do gráfico — barras crescendo,
// linhas desenhando etc.) quando o cartão entra na tela pela primeira vez. Sem isso, todo gráfico
// da página monta junto no carregamento e anima de uma vez só; quem rola a página só vê os de
// baixo já "prontos", sem nunca ver a entrada deles. Uma vez visível, fica visível — não reanima
// toda vez que a pessoa rola pra cima e desce de novo.
function AoEntrarNaTela({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    if (visivel || !ref.current) return;
    const elemento = ref.current;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setVisivel(true);
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.15 },
    );
    observer.observe(elemento);
    return () => observer.disconnect();
  }, [visivel]);

  return <div ref={ref}>{visivel ? children : null}</div>;
}

function PainelGraficos({ paineis }: { paineis: PainelGrafico[] }) {
  const duasColunas = useEhDuasColunas();
  if (paineis.length === 0) return null;

  // Cartão sozinho sempre ocupa a largura toda — não faz sentido deixar metade da página vazia.
  const emGrade = duasColunas && paineis.length > 1;

  return (
    <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-2">
      {paineis.map((p, i) => {
        const compacto = emGrade && p.largura === "normal";
        return (
          <div key={p.key} className={compacto ? "min-w-0" : "min-w-0 lg:col-span-2"}>
            <AoEntrarNaTela>{p.render(compacto, i * 70)}</AoEntrarNaTela>
          </div>
        );
      })}
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
  grupos,
  aberto,
  onToggle,
  slug,
  codigo,
}: {
  documentoBase: PortalDocumentoPublico;
  competencia: string;
  campos: CampoLinha[];
  grupos: PortalIndicadorPublico[];
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

  // Indicadores-grupo (com subcampos) que têm pelo menos uma ocorrência nesta competência —
  // cada um vira uma mini-tabela própria abaixo dos campos escalares.
  const gruposDesteLancamento = useMemo(
    () =>
      grupos
        .map((g) => ({ ...g, instancias: (g.instancias ?? []).filter((inst) => inst.competencia === competencia) }))
        .filter((g) => g.instancias.length > 0),
    [grupos, competencia],
  );
  const totalOcorrenciasGrupo = gruposDesteLancamento.reduce((soma, g) => soma + g.instancias.length, 0);

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
              {totalOcorrenciasGrupo > 0 && (
                <span className="rounded-full bg-ink/5 px-2 py-0.5 font-medium text-ink">
                  {totalOcorrenciasGrupo} ocorrência{totalOcorrenciasGrupo === 1 ? "" : "s"} em grupo
                </span>
              )}
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
              <span
                className={`mr-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${TIPO_DOT_CLASSE[CORES_GRAFICO[i % CORES_GRAFICO.length]]}`}
              />
              <span className="text-ink-muted">{c.indicadorNome}: </span>
              <span className="tabular font-medium text-ink">
                {c.valor}
                {c.unidade ? ` ${c.unidade}` : ""}
              </span>
            </div>
          ))}

          {gruposDesteLancamento.length > 0 && (
            <div className="col-span-full mt-2 flex flex-col gap-4 border-t border-border/60 pt-4">
              {gruposDesteLancamento.map((g) => (
                <div key={g.id}>
                  <p className="mb-1.5 text-xs font-semibold text-ink">
                    {g.nome} <span className="font-normal text-ink-muted">({g.instancias.length})</span>
                  </p>
                  <div className="overflow-x-auto rounded-lg border border-border/60">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border/60 bg-ink/5 text-left text-ink-muted">
                          {(g.subcampos ?? []).map((sc) => (
                            <th key={sc.subcampoId} className="whitespace-nowrap px-2.5 py-1.5 font-medium">
                              {sc.nome}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {g.instancias.map((inst) => (
                          <tr key={inst.id} className="border-b border-border/40 last:border-0">
                            {(g.subcampos ?? []).map((sc) => (
                              <td key={sc.subcampoId} className="px-2.5 py-1.5 text-ink">
                                {inst.subcampoValores.find((v) => v.subcampoId === sc.subcampoId)?.valor ?? "—"}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}

          {arquivosOrigem.length > 0 && (
            <div className="col-span-full mt-3 flex flex-col items-center gap-3 border-t border-border/60 pt-5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Documento original</p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                {arquivosOrigem.map(([uploadId, nome]) => (
                  <a
                    key={uploadId}
                    href={`/api/public/portal-previdenciario/${slug}/documentos/${codigo}/arquivos/${uploadId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="group flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-2.5 shadow-soft transition-all hover:-translate-y-0.5 hover:border-petrol hover:shadow-lift"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-petrol to-gold text-white shadow-soft">
                      <FileText size={17} />
                    </span>
                    <span className="text-left">
                      <span className="block max-w-[220px] truncate text-sm font-semibold text-ink group-hover:text-petrol">
                        {nome}
                      </span>
                      <span className="flex items-center gap-1 text-[11px] text-ink-muted">
                        Ver PDF original
                        <Download size={11} className="transition-transform group-hover:translate-y-0.5" />
                      </span>
                    </span>
                  </a>
                ))}
              </div>
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

  // Do que sobrou: só vira gráfico de barras comparativo quando o grupo (por unidade) tem 2+
  // itens — um gráfico inteiro pra 1 valor solto é ilegível/desperdiçado. Esse valor continua
  // disponível no lançamento expandido, em "Lançamentos" logo abaixo.
  const gruposComparativos = useMemo(() => {
    const porUnidade = new Map<string, PortalIndicadorPublico[]>();
    for (const ind of indicadoresRestantes) {
      const chave = ind.unidade?.trim() || "__sem_unidade__";
      const lista = porUnidade.get(chave) ?? [];
      lista.push(ind);
      porUnidade.set(chave, lista);
    }
    const grupos: { unidade: string | null; titulo: string; indicadores: PortalIndicadorPublico[] }[] = [];
    for (const [chave, indicadores] of porUnidade) {
      if (indicadores.length < 2) continue;
      grupos.push({
        unidade: chave === "__sem_unidade__" ? null : chave,
        titulo: chave === "__sem_unidade__" ? "Outros números" : `Indicadores em ${chave}`,
        indicadores,
      });
    }
    return grupos;
  }, [indicadoresRestantes]);

  // Cada painel é sobre um tipo de dado específico — composição, alocação, e um por grupo de
  // unidade — nunca misturando tipos diferentes num painel só. Gráficos com muitas barras ganham a
  // linha inteira: numa coluna de meia página os nomes de ativo/indicador ficariam ilegíveis.
  const paineisGraficos = useMemo<PainelGrafico[]>(() => {
    const lista: PainelGrafico[] = [];
    let indiceCor = 0;
    const proximaCor = () => CORES_GRAFICO[indiceCor++ % CORES_GRAFICO.length];

    if (composicao) {
      const cor = proximaCor();
      lista.push({
        key: "composicao",
        titulo: "Composição da carteira",
        largura: "normal",
        render: (compacto, atraso) => (
          <GraficoComposicao
            competencia={composicao.competencia}
            fatias={composicao.fatias}
            corDestaque={cor}
            compacto={compacto}
            atraso={atraso}
          />
        ),
      });
    }
    if (clustersAlocacao.length > 0) {
      const cor = proximaCor();
      lista.push({
        key: "alocacao",
        titulo: "Estratégia de alocação por ativo",
        largura: clustersAlocacao.length > 4 ? "larga" : "normal",
        render: (compacto, atraso) => (
          <GraficoAlocacao clusters={clustersAlocacao} cor={cor} compacto={compacto} atraso={atraso} />
        ),
      });
    }
    for (const grupo of gruposTendencia) {
      const cor = proximaCor();
      lista.push({
        key: `tendencia-${grupo.titulo}`,
        titulo: grupo.titulo,
        largura: "normal",
        render: (compacto, atraso) => (
          <GraficoTendencia
            titulo={grupo.titulo}
            unidade={grupo.unidade}
            indicadores={grupo.indicadores}
            cor={cor}
            compacto={compacto}
            atraso={atraso}
          />
        ),
      });
    }
    for (const grupo of gruposComparativos) {
      const cor = proximaCor();
      lista.push({
        key: grupo.titulo,
        titulo: grupo.titulo,
        largura: grupo.indicadores.length > 6 ? "larga" : "normal",
        render: (compacto, atraso) => (
          <GraficoComparativo
            titulo={grupo.titulo}
            unidade={grupo.unidade}
            indicadores={grupo.indicadores}
            cor={cor}
            compacto={compacto}
            atraso={atraso}
          />
        ),
      });
    }
    return lista;
  }, [composicao, clustersAlocacao, gruposTendencia, gruposComparativos]);

  // Indicador com subcampos (ex.: "Membro do Comitê") — sem `valores` (fica vazio de propósito,
  // ver portal-previdenciario.routes.ts), então nunca entra em indicadoresFiltrados/gráficos por
  // conta própria (essas contas já ignoram indicador sem valor). Aparece dentro de cada
  // lançamento como uma mini-tabela por ocorrência, ver LinhaLancamento.
  const gruposIndicadores = useMemo(
    () => documento.indicadores.filter((i) => (i.subcampos?.length ?? 0) > 0 && (i.instancias?.length ?? 0) > 0),
    [documento.indicadores],
  );

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
    // Uma competência que só tem dado de indicador-grupo (nenhum campo escalar) ainda precisa
    // virar uma linha de lançamento — senão esses dados ficariam invisíveis na tabela.
    for (const g of gruposIndicadores) {
      for (const inst of g.instancias ?? []) {
        if (!porCompetencia.has(inst.competencia)) porCompetencia.set(inst.competencia, []);
      }
    }
    return [...porCompetencia.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [indicadoresFiltrados, gruposIndicadores]);

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

      {paineisGraficos.length === 0 ? (
        <Card className="p-6">
          <p className="text-sm text-ink-muted">Nenhum indicador numérico encontrado com esse filtro.</p>
        </Card>
      ) : (
        <PainelGraficos paineis={paineisGraficos} />
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
              grupos={gruposIndicadores}
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
