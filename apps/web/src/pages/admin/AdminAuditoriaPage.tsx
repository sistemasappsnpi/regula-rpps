import { useEffect, useState } from "react";
import { api, type EventoAuditoriaGlobal } from "../../lib/api";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";

const LIMITES = [25, 50, 100, 200, 500];

const TIPO_LABEL: Record<EventoAuditoriaGlobal["tipo"], string> = {
  CAMPO_PREENCHIDO: "Campo preenchido",
  UPLOAD: "Upload",
  DOCUMENTO_COMPOSTO: "Documento composto",
  CONSTRUTOR_EXECUCAO: "Construtor",
};

function tipoTone(tipo: EventoAuditoriaGlobal["tipo"]) {
  if (tipo === "UPLOAD") return "ok" as const;
  if (tipo === "DOCUMENTO_COMPOSTO") return "warn" as const;
  return "neutral" as const;
}

// Feed único de tudo que foi preenchido, enviado ou gerado em qualquer RPPS — diferente da
// auditoria por tenant (Pró-Gestão → rodapé), que só mostra 1 cliente por vez. `limit` é
// aplicado direto na consulta no backend, não só no que a tela exibe — protege o banco de uma
// busca pesada, e pode ser aumentado aqui quando fizer sentido.
export function AdminAuditoriaPage() {
  const [eventos, setEventos] = useState<EventoAuditoriaGlobal[]>([]);
  const [limit, setLimit] = useState(50);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = (limiteAtual: number) => {
    setLoading(true);
    setErro(null);
    api
      .adminListAuditoriaGlobal(limiteAtual)
      .then((res) => setEventos(res.eventos))
      .catch((err) => setErro(err instanceof Error ? err.message : "Erro ao carregar auditoria."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    carregar(limit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Auditoria</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Tudo que foi preenchido, enviado ou gerado em qualquer RPPS da plataforma, mais recente primeiro.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-ink-muted">Mostrar até</span>
            <select
              className="rounded-lg border border-border bg-bg px-3 py-2 text-sm"
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
            >
              {LIMITES.map((l) => (
                <option key={l} value={l}>
                  {l} eventos
                </option>
              ))}
            </select>
          </label>
          <Button variant="ghost" onClick={() => carregar(limit)} disabled={loading}>
            {loading ? "Buscando…" : "Buscar"}
          </Button>
        </div>
      </header>

      {erro && <p className="mb-4 text-sm text-crit">{erro}</p>}

      <Card className="p-0">
        {loading ? (
          <p className="p-5 text-sm text-ink-muted">Carregando…</p>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {eventos.map((e, i) => (
              <div key={i} className="flex items-start justify-between gap-3 p-4 text-sm">
                <div className="min-w-0">
                  <p className="text-ink">
                    <span className="font-medium">{e.tenantNome}</span>
                    {e.autor ? ` · ${e.autor}` : ""}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-muted">{e.descricao}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <Badge tone={tipoTone(e.tipo)}>{TIPO_LABEL[e.tipo]}</Badge>
                  <span className="text-xs text-ink-muted">{new Date(e.quando).toLocaleString("pt-BR")}</span>
                </div>
              </div>
            ))}
            {eventos.length === 0 && <p className="p-5 text-sm text-ink-muted">Nenhum evento registrado ainda.</p>}
          </div>
        )}
      </Card>
    </div>
  );
}
