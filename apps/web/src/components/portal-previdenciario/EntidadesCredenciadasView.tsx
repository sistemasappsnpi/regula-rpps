import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BadgeCheck, Building, Landmark, Search, ShieldAlert, Vault } from "lucide-react";
import { Card, StatTile } from "../ui/Card";
import type { RegistroTransparenciaApi } from "../../lib/api";

// Conteúdo da página "Entidades de investimento credenciadas" (API Nexa: EntidadeInvestimentoCredenciada).
// Campos de cada registro: cnpj, instituicao, tipo, credenciamento (dd/mm/aaaa), renovacao (dd/mm/aaaa).
// Primeira página do padrão "API Nexa → cópia no banco → página com gráficos"; as próximas reaproveitam
// o mesmo esqueleto (cabeçalho, StatTiles, gráficos, tabela com busca).

interface Entidade {
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

const CORES_TIPO = ["rgb(var(--color-petrol))", "rgb(var(--color-gold))", "rgb(var(--color-ok))", "rgb(var(--color-warn))"];

export function EntidadesCredenciadasView({ registros }: { registros: RegistroTransparenciaApi[] }) {
  const [busca, setBusca] = useState("");
  const [tipoFiltro, setTipoFiltro] = useState("");

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
        .sort((a, b) => a.instituicao.localeCompare(b.instituicao, "pt-BR")),
    [registros],
  );

  const hoje = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const resumo = useMemo(() => {
    const porTipo = new Map<string, number>();
    const renovacoesPorAno = new Map<number, number>();
    let vigentes = 0;
    let vencidas = 0;
    for (const e of entidades) {
      const tipo = rotuloTipo(e.tipo);
      porTipo.set(tipo, (porTipo.get(tipo) ?? 0) + 1);
      if (e.renovacao) {
        if (e.renovacao >= hoje) vigentes++;
        else vencidas++;
        const ano = e.renovacao.getFullYear();
        renovacoesPorAno.set(ano, (renovacoesPorAno.get(ano) ?? 0) + 1);
      }
    }
    return {
      porTipo: [...porTipo.entries()].map(([nome, total]) => ({ nome, total })).sort((a, b) => b.total - a.total),
      renovacoesPorAno: [...renovacoesPorAno.entries()].map(([ano, total]) => ({ ano: String(ano), total })).sort((a, b) => a.ano.localeCompare(b.ano)),
      vigentes,
      vencidas,
    };
  }, [entidades, hoje]);

  const tipos = resumo.porTipo.map((t) => t.nome);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLocaleLowerCase("pt-BR");
    const digitos = q.replace(/\D/g, "");
    return entidades.filter(
      (e) =>
        (!tipoFiltro || rotuloTipo(e.tipo) === tipoFiltro) &&
        (!q ||
          e.instituicao.toLocaleLowerCase("pt-BR").includes(q) ||
          e.cnpj.includes(q) ||
          (digitos.length > 0 && e.cnpj.replace(/\D/g, "").includes(digitos))),
    );
  }, [entidades, busca, tipoFiltro]);

  if (!entidades.length) {
    return (
      <Card className="mt-8 p-6">
        <p className="text-sm text-ink-muted">Nenhuma entidade credenciada foi coletada ainda.</p>
      </Card>
    );
  }

  return (
    <div className="mt-6 space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Instituições credenciadas" value={entidades.length} icon={<Building size={20} />} />
        <StatTile
          label="Administradores / gestores"
          value={resumo.porTipo.filter((t) => t.nome.toLocaleLowerCase("pt-BR").includes("gestor")).reduce((s, t) => s + t.total, 0)}
          icon={<Landmark size={20} />}
          tone="gold"
        />
        <StatTile
          label="Custodiantes"
          value={resumo.porTipo.filter((t) => t.nome.toLocaleLowerCase("pt-BR").includes("custodiante")).reduce((s, t) => s + t.total, 0)}
          icon={<Vault size={20} />}
          tone="ok"
        />
        <StatTile
          label="Renovação em dia"
          value={`${resumo.vigentes}/${resumo.vigentes + resumo.vencidas}`}
          hint={resumo.vencidas ? `${resumo.vencidas} com a data de renovação já passada` : "Todas com renovação vigente"}
          icon={resumo.vencidas ? <ShieldAlert size={20} /> : <BadgeCheck size={20} />}
          tone={resumo.vencidas ? "warn" : "ok"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <p className="text-sm font-semibold text-ink">Credenciadas por tipo</p>
          <div className="mt-2 h-60">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={resumo.porTipo} dataKey="total" nameKey="nome" innerRadius={52} outerRadius={88} paddingAngle={2} label={(p) => `${p.name}: ${p.value}`}>
                  {resumo.porTipo.map((t, i) => (
                    <Cell key={t.nome} fill={CORES_TIPO[i % CORES_TIPO.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="p-5">
          <p className="text-sm font-semibold text-ink">Renovações por ano</p>
          <p className="text-xs text-ink-muted">Ano da última renovação de cada credenciamento.</p>
          <div className="mt-2 h-56">
            <ResponsiveContainer>
              <BarChart data={resumo.renovacoesPorAno} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="rgb(var(--color-border))" strokeDasharray="3 3" />
                <XAxis dataKey="ano" stroke="rgb(var(--color-ink-muted))" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} stroke="rgb(var(--color-ink-muted))" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ fill: "rgb(var(--color-ink) / 0.05)" }} />
                <Bar dataKey="total" name="Renovações" fill="rgb(var(--color-petrol))" radius={[6, 6, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card className="p-5">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex min-w-[220px] flex-1 items-center gap-2 rounded-lg border border-border bg-bg px-3 py-2">
            <Search size={15} className="text-ink-muted" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por instituição ou CNPJ"
              className="w-full bg-transparent text-sm text-ink outline-none"
            />
          </label>
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
            {filtradas.length} de {entidades.length}
          </span>
        </div>

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
              {filtradas.map((e) => {
                const vencida = e.renovacao ? e.renovacao < hoje : false;
                return (
                  <tr key={`${e.cnpj}|${e.tipo}|${e.instituicao}`} className="border-b border-border/60 last:border-0">
                    <td className="py-2.5 pr-3 font-medium text-ink">{e.instituicao || "—"}</td>
                    <td className="py-2.5 pr-3 tabular text-ink-muted">{e.cnpj || "—"}</td>
                    <td className="py-2.5 pr-3 text-ink">{rotuloTipo(e.tipo)}</td>
                    <td className="py-2.5 pr-3 tabular text-ink">{formatarData(e.credenciamento)}</td>
                    <td className="py-2.5 pr-3 tabular">
                      <span className={vencida ? "text-warn" : "text-ink"}>{formatarData(e.renovacao)}</span>
                    </td>
                  </tr>
                );
              })}
              {!filtradas.length && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-sm text-ink-muted">
                    Nenhuma instituição encontrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
