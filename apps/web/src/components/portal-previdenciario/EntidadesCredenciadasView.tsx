import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Building, CalendarCheck, Landmark, SearchX, Vault } from "lucide-react";
import { Card, StatTile } from "../ui/Card";
import type { RegistroTransparenciaApi } from "../../lib/api";
import type { DocBusca } from "../../lib/buscaInteligente";
import { corDoGrafico } from "./paletaGraficos";
import { ATRASO_GRAFICO, DURACAO_GRAFICO, entradaEscalonada, useAnimarGraficos } from "./animacao";
import { CampoBusca, consultaDaUrl, Destaque, ResumoBusca, useBusca } from "./CampoBusca";

// Conteúdo da página "Entidades de investimento credenciadas" (API Nexa: EntidadeInvestimentoCredenciada).
// Campos de cada registro: cnpj, instituicao, tipo, credenciamento (dd/mm/aaaa), renovacao (dd/mm/aaaa).
// Mesmo esqueleto das demais páginas: busca, cartões, gráficos animados e tabela.

interface Entidade {
  id: number;
  cnpj: string;
  instituicao: string;
  tipo: string;
  credenciamento: Date | null;
  renovacao: Date | null;
}

function texto(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function lerDataBr(v: unknown): Date | null {
  const m = texto(v).match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatarData(d: Date | null): string {
  return d ? d.toLocaleDateString("pt-BR") : "—";
}

function rotuloTipo(tipo: string): string {
  if (!tipo) return "Não informado";
  const t = tipo.toLocaleLowerCase("pt-BR");
  return t.charAt(0).toLocaleUpperCase("pt-BR") + t.slice(1);
}

export function EntidadesCredenciadasView({ registros }: { registros: RegistroTransparenciaApi[] }) {
  const [consulta, setConsulta] = useState(consultaDaUrl);
  const [tipoFiltro, setTipoFiltro] = useState("");
  const animar = useAnimarGraficos();

  const entidades = useMemo<Entidade[]>(
    () =>
      registros
        .map((r) => ({
          cnpj: texto(r.cnpj),
          instituicao: texto(r.instituicao),
          tipo: texto(r.tipo),
          credenciamento: lerDataBr(r.credenciamento),
          renovacao: lerDataBr(r.renovacao),
        }))
        .sort((a, b) => a.instituicao.localeCompare(b.instituicao, "pt-BR"))
        .map((e, id) => ({ ...e, id })),
    [registros],
  );

  // o que a busca enxerga: nome (peso maior), tipo, e o resto (CNPJ, anos e datas de credenciamento/renovação)
  const docsBusca = useMemo<DocBusca[]>(
    () =>
      entidades.map((e) => ({
        id: e.id,
        titulo: e.instituicao,
        grupo: rotuloTipo(e.tipo),
        desc: "",
        extra: [e.cnpj, e.cnpj.replace(/\D/g, ""), formatarData(e.credenciamento), formatarData(e.renovacao), e.credenciamento?.getFullYear(), e.renovacao?.getFullYear()].filter(Boolean).join(" "),
      })),
    [entidades],
  );
  const { motor, resultado } = useBusca(docsBusca, consulta);
  const sugestoes = useMemo(() => motor.sugestoes(5), [motor]);

  const resumo = useMemo(() => {
    const porTipo = new Map<string, number>();
    const renovacoesPorAno = new Map<number, number>();
    let ultimaRenovacao: Date | null = null;
    for (const e of entidades) {
      const tipo = rotuloTipo(e.tipo);
      porTipo.set(tipo, (porTipo.get(tipo) ?? 0) + 1);
      if (e.renovacao) {
        if (!ultimaRenovacao || e.renovacao > ultimaRenovacao) ultimaRenovacao = e.renovacao;
        const ano = e.renovacao.getFullYear();
        renovacoesPorAno.set(ano, (renovacoesPorAno.get(ano) ?? 0) + 1);
      }
    }
    return {
      porTipo: [...porTipo.entries()].map(([nome, total]) => ({ nome, total })).sort((a, b) => b.total - a.total),
      renovacoesPorAno: [...renovacoesPorAno.entries()].map(([ano, total]) => ({ ano: String(ano), total })).sort((a, b) => a.ano.localeCompare(b.ano)),
      ultimaRenovacao,
    };
  }, [entidades]);

  const tipos = resumo.porTipo.map((t) => t.nome);
  const buscando = consulta.trim().length > 0;
  const porId = useMemo(() => new Map(entidades.map((e) => [e.id, e])), [entidades]);

  // busca ativa: relevância; sem busca: ordem alfabética. O filtro de tipo vale nos dois casos.
  const lista = useMemo(() => {
    const base = buscando && resultado ? resultado.ids.map((id) => porId.get(id)!) : entidades;
    return base.filter((e) => !tipoFiltro || rotuloTipo(e.tipo) === tipoFiltro);
  }, [buscando, resultado, porId, entidades, tipoFiltro]);

  if (!entidades.length) {
    return (
      <Card className="mt-8 p-6">
        <p className="text-sm text-ink-muted">Nenhuma entidade credenciada foi coletada ainda.</p>
      </Card>
    );
  }

  const termos = buscando && resultado ? resultado.termos : [];

  return (
    <div className="mt-6 space-y-6">
      <div style={entradaEscalonada(0)}>
        <CampoBusca
          valor={consulta}
          onChange={setConsulta}
          placeholder="Pesquise por instituição, CNPJ, tipo ou ano… (ex.: banco, custodiante, 2025)"
          sugestoes={sugestoes}
          rotuloItens="instituições"
        />
        {buscando && resultado && (
          <ResumoBusca consulta={consulta} resultado={{ ...resultado, ids: lista.map((e) => e.id) }} total={entidades.length} rotuloItens="instituições" />
        )}
      </div>

      {!buscando && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div style={entradaEscalonada(1)}>
              <StatTile label="Instituições credenciadas" value={entidades.length} icon={<Building size={20} />} />
            </div>
            <div style={entradaEscalonada(2)}>
              <StatTile
                label="Administradores / gestores"
                value={resumo.porTipo.filter((t) => t.nome.toLocaleLowerCase("pt-BR").includes("gestor")).reduce((s, t) => s + t.total, 0)}
                icon={<Landmark size={20} />}
                tone="gold"
              />
            </div>
            <div style={entradaEscalonada(3)}>
              <StatTile
                label="Custodiantes"
                value={resumo.porTipo.filter((t) => t.nome.toLocaleLowerCase("pt-BR").includes("custodiante")).reduce((s, t) => s + t.total, 0)}
                icon={<Vault size={20} />}
                tone="ok"
              />
            </div>
            <div style={entradaEscalonada(4)}>
              <StatTile
                label="Última renovação registrada"
                value={formatarData(resumo.ultimaRenovacao)}
                hint="Data mais recente entre os credenciamentos"
                icon={<CalendarCheck size={20} />}
                tone="warn"
              />
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-5" style={entradaEscalonada(5)}>
              <p className="text-sm font-semibold text-ink">Credenciadas por tipo</p>
              <div className="mt-2 h-60">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie
                      data={resumo.porTipo}
                      dataKey="total"
                      nameKey="nome"
                      innerRadius={52}
                      outerRadius={88}
                      paddingAngle={2}
                      label={(p) => `${p.name}: ${p.value}`}
                      isAnimationActive={animar}
                      animationBegin={ATRASO_GRAFICO}
                      animationDuration={DURACAO_GRAFICO}
                      animationEasing="ease-out"
                    >
                      {resumo.porTipo.map((t, i) => (
                        <Cell key={t.nome} fill={corDoGrafico(i)} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <Card className="p-5" style={entradaEscalonada(6)}>
              <p className="text-sm font-semibold text-ink">Renovações por ano</p>
              <p className="text-xs text-ink-muted">Ano da última renovação de cada credenciamento.</p>
              <div className="mt-2 h-56">
                <ResponsiveContainer>
                  <BarChart data={resumo.renovacoesPorAno} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="rgb(var(--color-border))" strokeDasharray="3 3" />
                    <XAxis dataKey="ano" stroke="rgb(var(--color-ink-muted))" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis allowDecimals={false} stroke="rgb(var(--color-ink-muted))" fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip cursor={{ fill: "rgb(var(--color-ink) / 0.05)" }} />
                    <Bar
                      dataKey="total"
                      name="Renovações"
                      radius={[6, 6, 0, 0]}
                      maxBarSize={48}
                      isAnimationActive={animar}
                      animationBegin={ATRASO_GRAFICO}
                      animationDuration={DURACAO_GRAFICO}
                      animationEasing="ease-out"
                    >
                      {resumo.renovacoesPorAno.map((a, i) => (
                        <Cell key={a.ano} fill={corDoGrafico(i)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>
        </>
      )}

      <Card className="p-5" style={entradaEscalonada(buscando ? 1 : 7)}>
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={tipoFiltro}
            onChange={(e) => setTipoFiltro(e.target.value)}
            className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink outline-none"
          >
            <option value="">Todos os tipos</option>
            {tipos.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <span className="text-xs text-ink-muted">
            {lista.length} de {entidades.length}
          </span>
        </div>

        {lista.length > 0 ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-ink-muted">
                  <th className="py-2 pr-3 font-semibold">Instituição</th>
                  <th className="py-2 pr-3 font-semibold">CNPJ</th>
                  <th className="py-2 pr-3 font-semibold">Tipo</th>
                  <th className="py-2 pr-3 font-semibold">Credenciamento</th>
                  <th className="py-2 pr-3 font-semibold">Renovação</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((e) => (
                  <tr key={e.id} className="border-b border-border/60 last:border-0">
                    <td className="py-2.5 pr-3 font-medium text-ink">
                      <Destaque texto={e.instituicao || "—"} termos={termos} />
                    </td>
                    <td className="py-2.5 pr-3 tabular text-ink-muted">
                      <Destaque texto={e.cnpj || "—"} termos={termos} />
                    </td>
                    <td className="py-2.5 pr-3 text-ink">
                      <Destaque texto={rotuloTipo(e.tipo)} termos={termos} />
                    </td>
                    <td className="py-2.5 pr-3 tabular text-ink">
                      <Destaque texto={formatarData(e.credenciamento)} termos={termos} />
                    </td>
                    <td className="py-2.5 pr-3 tabular text-ink">
                      <Destaque texto={formatarData(e.renovacao)} termos={termos} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <SearchX size={32} className="text-ink-muted" />
            <p className="text-sm font-medium text-ink">{buscando ? `Nada encontrado para “${consulta.trim()}”.` : "Nenhuma instituição encontrada."}</p>
            {buscando && <p className="text-xs text-ink-muted">Tente outra palavra, parte do CNPJ ou o ano.</p>}
          </div>
        )}
      </Card>
    </div>
  );
}
