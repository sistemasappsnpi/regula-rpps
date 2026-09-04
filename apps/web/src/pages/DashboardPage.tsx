import { useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle, Clock, CalendarClock } from "lucide-react";
import { api, type CrpCriterion, type ProGestaoResumo } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { Card, StatTile } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";

interface Summary {
  total: number;
  regular: number;
  irregular: number;
  pendente: number;
  nextDueAt: string | null;
}

const DIA_MS = 24 * 60 * 60 * 1000;

const MODULOS = [
  {
    nome: "Central de Compliance CRP",
    descricao:
      "Os 22 critérios oficiais do Certificado de Regularidade Previdenciária, com verificação de dependência entre eles (ex.: DIPR-Consistência exige DIPR-Encaminhamento em dia).",
    pronto: true,
  },
  {
    nome: "Pró-Gestão RPPS",
    descricao:
      "As 24 ações do programa de certificação, com formulário que se adapta ao nível de aderência (I a IV) e upload de PDF com extração assistida por IA, campo a campo.",
    pronto: true,
  },
  {
    nome: "Motor de dependências entre documentos",
    descricao:
      "Quando um documento é composto por outros (ex.: Transparência), o sistema detecta o que já está pronto, monta um rascunho citando a origem de cada dado e pede aprovação humana.",
    pronto: true,
  },
  {
    nome: "Portal de transparência público",
    descricao: "Página sem login, gerada só a partir de dado estruturado já aprovado — nunca de um PDF anexado.",
    pronto: true,
  },
  {
    nome: "Trilha de auditoria",
    descricao: "Todo dado preenchido guarda quem alterou, quando e se veio de preenchimento manual, PDF ou outro documento.",
    pronto: true,
  },
  {
    nome: "Construtor de Documentos por IA",
    descricao:
      "Envie os relatórios que já tem e escolha o que quer montar — a IA identifica o que precisa de cada um e monta o documento final, sempre citando de onde cada informação veio.",
    pronto: true,
  },
  {
    nome: "Integrações federais e planos",
    descricao: "Sincronização automática com CADPREV/GESCON/SICONFI e liberação de módulos por plano contratado.",
    pronto: false,
  },
];

export function DashboardPage() {
  const { tenant, hasFeature } = useAuth();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [criterios, setCriterios] = useState<CrpCriterion[]>([]);
  const [resumoProGestao, setResumoProGestao] = useState<ProGestaoResumo | null>(null);

  useEffect(() => {
    api.crpSummary().then(setSummary);
    api.listCrpCriteria().then((res) => setCriterios(res.criteria));
    if (hasFeature("pro_gestao")) api.proGestaoResumo().then(setResumoProGestao);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const now = Date.now();
  const proximosVencimentos = criterios
    .map((c) => ({ criterion: c, nextDueAt: c.tenantStatuses[0]?.nextDueAt }))
    .filter((c): c is { criterion: CrpCriterion; nextDueAt: string } => Boolean(c.nextDueAt))
    .sort((a, b) => new Date(a.nextDueAt).getTime() - new Date(b.nextDueAt).getTime())
    .slice(0, 8);

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold text-ink">Painel geral</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {tenant?.federatedEntity} · {tenant?.seguradosCount.toLocaleString("pt-BR")} segurados
        </p>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Critérios do CRP regulares"
          value={summary ? `${summary.regular}/${summary.total}` : "—"}
          hint="Certificado de Regularidade Previdenciária"
          icon={<CheckCircle2 size={18} />}
          tone="ok"
        />
        <StatTile
          label="Irregulares"
          value={summary?.irregular ?? "—"}
          hint="Requerem ação imediata"
          icon={<AlertTriangle size={18} />}
          tone="crit"
        />
        <StatTile
          label="Pendentes de envio"
          value={summary?.pendente ?? "—"}
          icon={<Clock size={18} />}
          tone="warn"
        />
        <StatTile
          label="Próximo vencimento"
          value={summary?.nextDueAt ? new Date(summary.nextDueAt).toLocaleDateString("pt-BR") : "—"}
          icon={<CalendarClock size={18} />}
          tone="petrol"
        />
      </section>

      {resumoProGestao && (
        <section className="mt-8">
          <h2 className="mb-3 font-display text-lg font-bold text-ink">Progresso no Pró-Gestão RPPS</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {resumoProGestao.porDimensao.map((d) => (
              <StatTile
                key={d.dimensao}
                label={d.dimensao}
                value={`${d.acoesComNivelAlcancado}/${d.totalAcoes}`}
                hint="ações com nível de aderência já registrado"
              />
            ))}
          </div>
        </section>
      )}

      <section className="mt-10">
        <h2 className="mb-3 font-display text-lg font-bold text-ink">Calendário de obrigações</h2>
        <Card className="p-5">
          {proximosVencimentos.length === 0 && <p className="text-sm text-ink-muted">Nenhum vencimento agendado.</p>}
          <div className="flex flex-col divide-y divide-border">
            {proximosVencimentos.map(({ criterion, nextDueAt }) => {
              const dias = Math.round((new Date(nextDueAt).getTime() - now) / DIA_MS);
              const atrasado = dias < 0;
              const vencendo = dias >= 0 && dias <= 10;
              return (
                <div key={criterion.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div>
                    <p className="text-ink">{criterion.title}</p>
                    <p className="text-xs text-ink-muted">{criterion.periodicity}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-ink-muted">{new Date(nextDueAt).toLocaleDateString("pt-BR")}</span>
                    <Badge tone={atrasado ? "crit" : vencendo ? "warn" : "neutral"}>
                      {atrasado ? `${Math.abs(dias)}d atrasado` : `em ${dias}d`}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </section>

      <section className="mt-10">
        <Card className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-petrol">Sobre o sistema</p>
              <h2 className="mt-1 font-display text-xl font-bold text-ink">O que é o Regula RPPS</h2>
            </div>
            <Badge tone="warn">Em construção</Badge>
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-muted">
            O Regula RPPS ajuda o seu RPPS a fazer três coisas: acompanhar se está regular no CRP, evoluir de nível
            no Pró-Gestão RPPS, e publicar ao público o que a lei exige — tudo usando o conteúdo oficial dos dois
            programas do Ministério da Previdência Social, nunca uma regra inventada dentro do sistema.
          </p>

          <p className="mb-3 mt-6 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            O que já funciona nesta versão
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {MODULOS.map((m) => (
              <div key={m.nome} className="flex gap-3 rounded-xl border border-border p-3.5">
                <span
                  className={`mt-1 h-2 w-2 shrink-0 rounded-full ${m.pronto ? "bg-ok" : "bg-ink-muted/40"}`}
                  aria-hidden
                />
                <div>
                  <p className="text-sm font-medium text-ink">
                    {m.nome}
                    {!m.pronto && <span className="ml-2 text-[10px] font-normal uppercase text-ink-muted">planejado</span>}
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">{m.descricao}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </section>
    </div>
  );
}
