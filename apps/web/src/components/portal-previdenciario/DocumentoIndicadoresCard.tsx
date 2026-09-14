import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Search } from "lucide-react";
import { Card } from "../ui/Card";
import type { PortalDocumentoPublico, PortalIndicadorPublico } from "../../lib/api";

export function formatarCompetencia(iso: string): string {
  const [ano, mes] = iso.slice(0, 7).split("-");
  return `${mes}/${ano}`;
}

const MESES_EXTENSO = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

// Versão "Julho de 2026" — usada em títulos e destaques, onde tem espaço de sobra e "07/2026" fica
// seco demais pra ser a primeira coisa que o cidadão lê na tela.
export function formatarCompetenciaExtenso(iso: string): string {
  const [ano, mes] = iso.slice(0, 7).split("-");
  const nomeMes = MESES_EXTENSO[Number(mes) - 1] ?? mes;
  return `${nomeMes} de ${ano}`;
}

export function numerico(tipo: PortalIndicadorPublico["tipo"]): boolean {
  return tipo === "NUMERICO" || tipo === "MOEDA";
}

export function valorParaNumero(valor: string): number {
  return Number(String(valor).replace(/\./g, "").replace(",", "."));
}

// CSV exige aspas duplicadas dentro de um campo entre aspas (padrão RFC 4180) — sem isso, um
// nome/valor extraído do PDF que contenha " quebra as colunas da planilha ao abrir no Excel.
function celulaCsv(valor: string): string {
  return `"${valor.replace(/"/g, '""')}"`;
}

export function baixarCsv(nomeArquivo: string, documentos: PortalDocumentoPublico[]) {
  const linhas = ["Documento,Indicador,Competencia,Valor,Unidade"];
  for (const doc of documentos) {
    for (const indicador of doc.indicadores) {
      for (const v of indicador.valores) {
        linhas.push(
          [celulaCsv(doc.nome), celulaCsv(indicador.nome), formatarCompetencia(v.competencia), celulaCsv(v.valor), celulaCsv(indicador.unidade ?? "")].join(
            ",",
          ),
        );
      }
    }
  }
  const blob = new Blob(["﻿" + linhas.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nomeArquivo;
  link.click();
  URL.revokeObjectURL(url);
}

export function baixarJson(nomeArquivo: string, documentos: PortalDocumentoPublico[]) {
  const blob = new Blob([JSON.stringify(documentos, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nomeArquivo;
  link.click();
  URL.revokeObjectURL(url);
}

export function baixarTxt(nomeArquivo: string, documentos: PortalDocumentoPublico[]) {
  const linhas: string[] = [];
  for (const doc of documentos) {
    linhas.push(doc.nome.toUpperCase());
    linhas.push("=".repeat(doc.nome.length));
    for (const indicador of doc.indicadores) {
      linhas.push("");
      linhas.push(`${indicador.nome}${indicador.unidade ? ` (${indicador.unidade})` : ""}`);
      for (const v of [...indicador.valores].sort((a, b) => a.competencia.localeCompare(b.competencia))) {
        linhas.push(`  ${formatarCompetencia(v.competencia)}: ${v.valor}`);
      }
    }
    linhas.push("");
  }
  const blob = new Blob([linhas.join("\n")], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nomeArquivo;
  link.click();
  URL.revokeObjectURL(url);
}

// Tooltip do recharts vem sem estilo nenhum por padrão (fundo branco chapado, sem respeitar o
// tema) — este componente substitui pelos tokens do design system, incluindo modo escuro.
function GraficoTooltip({
  active,
  payload,
  label,
  unidade,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
  unidade?: string | null;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-lift">
      <p className="font-medium text-ink">{label}</p>
      <p className="mt-0.5 tabular text-ink-muted">
        {payload[0].value.toLocaleString("pt-BR")}
        {unidade ? ` ${unidade}` : ""}
      </p>
    </div>
  );
}

// Um indicador: NUMERICO/MOEDA vira um cartão compacto (valor mais recente em destaque + mini
// gráfico de área animado, sem tomar a tela toda); TEXTO/DATA vira uma tabela estruturada,
// mais recente primeiro. Nunca os dois brutos jogados na página sem organização.
function IndicadorCard({ indicador }: { indicador: PortalIndicadorPublico }) {
  const ordenados = useMemo(
    () => [...indicador.valores].sort((a, b) => a.competencia.localeCompare(b.competencia)),
    [indicador.valores],
  );
  const ultimo = ordenados[ordenados.length - 1];
  const ehNumerico = numerico(indicador.tipo);

  if (ehNumerico) {
    const dados = ordenados.map((v) => ({
      competencia: formatarCompetencia(v.competencia),
      valor: valorParaNumero(v.valor),
    }));
    const gradientId = `grad-indicador-${indicador.id}`;

    return (
      <div className="rounded-xl border border-border p-4">
        <p className="text-sm font-medium text-ink">{indicador.nome}</p>
        <p className="mt-1 font-display text-2xl font-extrabold tabular text-ink">
          {ultimo?.valor}
          {indicador.unidade && <span className="ml-1.5 text-xs font-normal text-ink-muted">{indicador.unidade}</span>}
        </p>
        {ultimo && <p className="text-xs text-ink-muted">competência {formatarCompetencia(ultimo.competencia)}</p>}

        {dados.length > 1 ? (
          <div className="mt-3 h-28 w-full">
            <ResponsiveContainer>
              <AreaChart data={dados} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgb(var(--color-petrol))" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="rgb(var(--color-petrol))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="rgb(var(--color-border))" strokeDasharray="3 3" />
                <XAxis
                  dataKey="competencia"
                  fontSize={10}
                  stroke="rgb(var(--color-ink-muted))"
                  tickLine={false}
                  axisLine={false}
                  minTickGap={24}
                />
                <YAxis hide domain={["auto", "auto"]} />
                <Tooltip
                  content={<GraficoTooltip unidade={indicador.unidade} />}
                  cursor={{ stroke: "rgb(var(--color-border))", strokeWidth: 1 }}
                />
                <Area
                  type="monotone"
                  dataKey="valor"
                  stroke="rgb(var(--color-petrol))"
                  strokeWidth={2}
                  fill={`url(#${gradientId})`}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                  animationDuration={700}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="mt-3 text-xs text-ink-muted">Só 1 competência lançada até agora — gráfico aparece a partir de 2.</p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border p-4">
      <p className="mb-2 text-sm font-medium text-ink">{indicador.nome}</p>
      <div className="max-h-52 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-surface">
            <tr className="text-left text-xs text-ink-muted">
              <th className="border-b border-border pb-1.5 font-medium">Competência</th>
              <th className="border-b border-border pb-1.5 pl-3 text-right font-medium">Valor</th>
            </tr>
          </thead>
          <tbody>
            {[...ordenados].reverse().map((v, i) => (
              <tr key={i} className="border-b border-border/60 last:border-0 hover:bg-ink/5">
                <td className="py-1.5 text-ink-muted">{formatarCompetencia(v.competencia)}</td>
                <td className="py-1.5 pl-3 text-right tabular text-ink">{v.valor}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type FiltroTipo = "todos" | "numericos" | "outros";

// Um documento do Portal Previdenciário — grade compacta de cartões (gráfico pra
// NUMERICO/MOEDA, tabela pra TEXTO/DATA), com busca por nome e filtro por tipo. Reaproveitado
// tanto pelo relatório multi-documento (PortalPrevidenciarioPage) quanto pela página dedicada de
// um único documento (PortalPrevidenciarioDocumentoPage).
export function DocumentoIndicadoresCard({ documento }: { documento: PortalDocumentoPublico }) {
  const [busca, setBusca] = useState("");
  const [filtroTipo, setFiltroTipo] = useState<FiltroTipo>("todos");

  const indicadoresFiltrados = useMemo(() => {
    return documento.indicadores.filter((i) => {
      if (i.valores.length === 0) return false;
      if (busca && !i.nome.toLowerCase().includes(busca.toLowerCase())) return false;
      const ehNumerico = numerico(i.tipo);
      if (filtroTipo === "numericos" && !ehNumerico) return false;
      if (filtroTipo === "outros" && ehNumerico) return false;
      return true;
    });
  }, [documento.indicadores, busca, filtroTipo]);

  return (
    <Card className="p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="font-display text-lg font-bold text-ink">{documento.nome}</p>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted" />
            <input
              type="text"
              placeholder="Buscar indicador…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="w-40 rounded-lg border border-border bg-surface py-1.5 pl-7 pr-2 text-xs focus:outline-none focus-visible:ring-1 focus-visible:ring-petrol"
            />
          </div>
          <div className="flex rounded-lg border border-border p-0.5 text-xs">
            {([
              ["todos", "Todos"],
              ["numericos", "Números"],
              ["outros", "Texto/Data"],
            ] as [FiltroTipo, string][]).map(([valor, rotulo]) => (
              <button
                key={valor}
                type="button"
                onClick={() => setFiltroTipo(valor)}
                className={`rounded-md px-2 py-1 font-medium transition-colors ${
                  filtroTipo === valor ? "bg-petrol/10 text-petrol" : "text-ink-muted hover:text-ink"
                }`}
              >
                {rotulo}
              </button>
            ))}
          </div>
        </div>
      </div>

      {indicadoresFiltrados.length === 0 ? (
        <p className="text-sm text-ink-muted">Nenhum indicador encontrado com esse filtro.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {indicadoresFiltrados.map((indicador) => (
            <IndicadorCard key={indicador.id} indicador={indicador} />
          ))}
        </div>
      )}
    </Card>
  );
}
