import { useEffect, useState } from "react";
import { api, type RelatorioConstrutorUso, type RelatorioRppsCliente } from "../../lib/api";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";

const LIMITES = [25, 50, 100, 200, 500];

function baixarCsv(nomeArquivo: string, cabecalho: string[], linhas: (string | number)[][]) {
  const escapar = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const csv = [cabecalho.map(escapar).join(";"), ...linhas.map((l) => l.map(escapar).join(";"))].join("\n");
  const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo;
  a.click();
  URL.revokeObjectURL(url);
}

// Tabelas consolidadas cross-tenant, com exportação em CSV. Mesmo cuidado de `limit` do backend
// (ver /admin/auditoria): quem decide o tamanho da consulta é o Super Admin, nunca ilimitado.
export function AdminRelatoriosPage() {
  const [relatorio, setRelatorio] = useState<"rpps" | "construtor">("rpps");
  const [limit, setLimit] = useState(50);
  const [rppsLinhas, setRppsLinhas] = useState<RelatorioRppsCliente[]>([]);
  const [construtorLinhas, setConstrutorLinhas] = useState<RelatorioConstrutorUso[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  function carregar(tipo: "rpps" | "construtor", limiteAtual: number) {
    setLoading(true);
    setErro(null);
    const promessa =
      tipo === "rpps"
        ? api.adminRelatorioRppsClientes(limiteAtual).then((res) => setRppsLinhas(res.linhas))
        : api.adminRelatorioConstrutorUso(limiteAtual).then((res) => setConstrutorLinhas(res.linhas));
    promessa
      .catch((err) => setErro(err instanceof Error ? err.message : "Erro ao carregar relatório."))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    carregar(relatorio, limit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relatorio]);

  function exportarCsv() {
    if (relatorio === "rpps") {
      baixarCsv(
        "rpps-clientes.csv",
        ["Nome", "Ente federativo", "Plano", "Nível Pró-Gestão", "Segurados", "Usuários", "CRP regular", "CRP total", "Criado em"],
        rppsLinhas.map((r) => [
          r.name,
          r.federatedEntity,
          r.plan,
          r.nivelProGestaoAlvo ?? "",
          r.seguradosCount,
          r.totalUsuarios,
          r.crpRegular,
          r.crpTotal,
          new Date(r.createdAt).toLocaleDateString("pt-BR"),
        ]),
      );
    } else {
      baixarCsv(
        "construtor-uso.csv",
        ["RPPS", "Tipo de documento", "Status", "Gerado em", "Aprovado em"],
        construtorLinhas.map((r) => [
          r.tenantNome,
          r.tipoDocumentoNome,
          r.status,
          new Date(r.geradoEm).toLocaleString("pt-BR"),
          r.aprovadoEm ? new Date(r.aprovadoEm).toLocaleString("pt-BR") : "",
        ]),
      );
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold text-ink">Relatórios</h1>
        <p className="mt-1 text-sm text-ink-muted">Tabelas consolidadas de todos os RPPS clientes, exportáveis em CSV.</p>
      </header>

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="flex gap-2">
          <Button variant={relatorio === "rpps" ? "primary" : "ghost"} onClick={() => setRelatorio("rpps")}>
            RPPS clientes
          </Button>
          <Button variant={relatorio === "construtor" ? "primary" : "ghost"} onClick={() => setRelatorio("construtor")}>
            Uso do Construtor
          </Button>
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
                  {l} linhas
                </option>
              ))}
            </select>
          </label>
          <Button variant="ghost" onClick={() => carregar(relatorio, limit)} disabled={loading}>
            {loading ? "Buscando…" : "Buscar"}
          </Button>
          <Button onClick={exportarCsv} disabled={loading}>
            Exportar CSV
          </Button>
        </div>
      </div>

      {erro && <p className="mb-4 text-sm text-crit">{erro}</p>}

      <Card className="overflow-x-auto p-0">
        {loading ? (
          <p className="p-5 text-sm text-ink-muted">Carregando…</p>
        ) : relatorio === "rpps" ? (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="p-3 font-medium text-ink">RPPS</th>
                <th className="p-3 font-medium text-ink">Plano</th>
                <th className="p-3 font-medium text-ink">Nível</th>
                <th className="p-3 font-medium text-ink">Segurados</th>
                <th className="p-3 font-medium text-ink">Usuários</th>
                <th className="p-3 font-medium text-ink">CRP</th>
              </tr>
            </thead>
            <tbody>
              {rppsLinhas.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0">
                  <td className="p-3">
                    <p className="text-ink">{r.name}</p>
                    <p className="text-xs text-ink-muted">{r.federatedEntity}</p>
                  </td>
                  <td className="p-3 text-ink-muted">{r.plan}</td>
                  <td className="p-3 text-ink-muted">{r.nivelProGestaoAlvo ?? "—"}</td>
                  <td className="p-3 text-ink-muted">{r.seguradosCount.toLocaleString("pt-BR")}</td>
                  <td className="p-3 text-ink-muted">{r.totalUsuarios}</td>
                  <td className="p-3">
                    <Badge tone={r.crpRegular === r.crpTotal ? "ok" : "warn"}>
                      {r.crpRegular}/{r.crpTotal}
                    </Badge>
                  </td>
                </tr>
              ))}
              {rppsLinhas.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-5 text-center text-sm text-ink-muted">
                    Nenhum RPPS cadastrado ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="p-3 font-medium text-ink">RPPS</th>
                <th className="p-3 font-medium text-ink">Tipo de documento</th>
                <th className="p-3 font-medium text-ink">Status</th>
                <th className="p-3 font-medium text-ink">Gerado em</th>
              </tr>
            </thead>
            <tbody>
              {construtorLinhas.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0">
                  <td className="p-3 text-ink">{r.tenantNome}</td>
                  <td className="p-3 text-ink-muted">{r.tipoDocumentoNome}</td>
                  <td className="p-3">
                    <Badge tone={r.status === "APROVADO" ? "ok" : r.status === "DESATUALIZADO" ? "crit" : "warn"}>
                      {r.status}
                    </Badge>
                  </td>
                  <td className="p-3 text-ink-muted">{new Date(r.geradoEm).toLocaleString("pt-BR")}</td>
                </tr>
              ))}
              {construtorLinhas.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-5 text-center text-sm text-ink-muted">
                    Nenhuma execução do Construtor ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
