import { useCallback, useEffect, useState } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import { Card } from "../ui/Card";
import { Button } from "../ui/Button";
import {
  geradorApi,
  type AcessoPortal,
  type EstadoLinks,
  type LinkProblema,
  type ResultadoAvaliacoes,
} from "../../lib/transparencia-gerador";

const quando = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("pt-BR") : "—");

// Avaliações dos visitantes e links quebrados de um portal já cadastrado.
export function MonitoramentoPortal({ pasta }: { pasta: string }) {
  const [aba, setAba] = useState<"avaliacoes" | "links">("avaliacoes");
  const [aval, setAval] = useState<ResultadoAvaliacoes | null>(null);
  const [carregandoAval, setCarregandoAval] = useState(false);
  const [links, setLinks] = useState<EstadoLinks | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [acesso, setAcesso] = useState<AcessoPortal | null>(null);
  const [verSenha, setVerSenha] = useState(false);

  const carregarAval = useCallback(async () => {
    setCarregandoAval(true);
    try {
      setAval(await geradorApi.avaliacoes(pasta));
    } catch (e) {
      setAval({ ok: false, motivo: "erro", erro: e instanceof Error ? e.message : "Não foi possível ler as avaliações." });
    } finally {
      setCarregandoAval(false);
    }
  }, [pasta]);

  useEffect(() => {
    setAval(null);
    setLinks(null);
    setAcesso(null);
    setVerSenha(false);
    setErro(null);
    carregarAval();
    geradorApi.estadoLinks(pasta).then(setLinks).catch(() => undefined);
    geradorApi.acesso(pasta).then(setAcesso).catch(() => undefined);
  }, [pasta, carregarAval]);

  // enquanto a verificação roda no servidor, consulta o andamento
  const rodando = links?.andamento === true;
  useEffect(() => {
    if (!rodando) return;
    const t = setInterval(() => geradorApi.estadoLinks(pasta).then(setLinks).catch(() => undefined), 2500);
    return () => clearInterval(t);
  }, [rodando, pasta]);

  async function verificar() {
    setErro(null);
    try {
      setLinks(await geradorApi.verificarLinks(pasta));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível iniciar a verificação.");
    }
  }

  const rel = links?.relatorio ?? null;
  const abaCls = (a: string) =>
    `rounded-md px-3 py-1 text-xs font-semibold ${aba === a ? "bg-petrol text-on-petrol" : "text-ink-muted hover:text-ink"}`;

  return (
    <Card className="space-y-3 p-5 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-ink">Avaliações e links do portal</h2>
        <div className="flex gap-1 rounded-lg border border-border p-0.5" role="tablist">
          <button type="button" role="tab" aria-selected={aba === "avaliacoes"} className={abaCls("avaliacoes")} onClick={() => setAba("avaliacoes")}>
            Avaliações
          </button>
          <button type="button" role="tab" aria-selected={aba === "links"} className={abaCls("links")} onClick={() => setAba("links")}>
            Links quebrados{rel && rel.quebrados > 0 ? ` (${rel.quebrados})` : ""}
          </button>
        </div>
      </div>

      {aba === "avaliacoes" && (
        <div className="space-y-3">
          <p className="text-ink-muted">
            Votos de “essa informação foi útil?” dados pelos visitantes, lidos do portal publicado. Quem tem a menor aprovação aparece primeiro.
          </p>
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" onClick={carregarAval} disabled={carregandoAval}>
              <RefreshCw size={16} className={carregandoAval ? "animate-spin" : ""} /> Atualizar
            </Button>
            {aval?.ok && <span className="text-xs text-ink-muted">Dados de {quando(aval.atualizadoEm)} · {aval.url}</span>}
          </div>
          {carregandoAval && !aval && <p className="text-ink-muted">Lendo do portal…</p>}
          {aval && !aval.ok && <div className="rounded-lg bg-warn/10 px-3 py-2 text-warn">{aval.erro}</div>}
          {aval?.ok &&
            (aval.linhas.length === 0 ? (
              <p className="text-ink-muted">Ainda não há votos registrados.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-left text-xs">
                  <thead className="bg-bg text-ink-muted">
                    <tr>
                      <th className="px-3 py-2">Categoria</th>
                      <th className="px-3 py-2">Sim</th>
                      <th className="px-3 py-2">Não</th>
                      <th className="px-3 py-2">Aprovação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aval.linhas.map((l) => (
                      <tr key={l.grupo} className="border-t border-border">
                        <td className="px-3 py-2 text-ink">{l.grupo}</td>
                        <td className="px-3 py-2">{l.up}</td>
                        <td className="px-3 py-2">{l.down}</td>
                        <td className="px-3 py-2">
                          {l.pct === null ? (
                            "—"
                          ) : (
                            <span className={l.pct < 60 ? "font-semibold text-crit" : "text-ok"}>{l.pct}%</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t border-border bg-bg text-ink-muted">
                    <tr>
                      <td className="px-3 py-2 font-semibold">Total</td>
                      <td className="px-3 py-2">{aval.up}</td>
                      <td className="px-3 py-2">{aval.down}</td>
                      <td className="px-3 py-2">
                        {aval.up + aval.down ? `${Math.round((aval.up / (aval.up + aval.down)) * 100)}%` : "—"}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ))}
        </div>
      )}

      {aba === "links" && (
        <div className="space-y-3">
          <p className="text-ink-muted">
            Confere se cada link publicado ainda abre. A verificação roda aqui no Regula e pode levar alguns minutos; você pode sair da tela e voltar.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" onClick={verificar} disabled={rodando}>
              <RefreshCw size={16} className={rodando ? "animate-spin" : ""} /> {rodando ? "Verificando…" : "Verificar links agora"}
            </Button>
            {rodando && links && (
              <span className="text-xs text-ink-muted">
                {links.feitos} de {links.total} links
              </span>
            )}
          </div>
          {(erro || links?.erro) && <div className="rounded-lg bg-crit/10 px-3 py-2 text-crit">{erro ?? links?.erro}</div>}
          {rodando && links && links.total > 0 && (
            <div className="h-1.5 overflow-hidden rounded bg-border" aria-hidden="true">
              <div className="h-full bg-petrol transition-all" style={{ width: `${Math.round((links.feitos / links.total) * 100)}%` }} />
            </div>
          )}
          {!rel && !rodando && <p className="text-ink-muted">Nenhuma verificação rodou ainda para este portal.</p>}
          {rel && (
            <>
              <p className="text-ink-muted">
                Última verificação: <b className="text-ink">{quando(rel.verificadoEm)}</b> · {rel.totalLinks} links ·{" "}
                <span className={rel.quebrados ? "font-semibold text-crit" : "font-semibold text-ok"}>{rel.quebrados} quebrado(s)</span> ·{" "}
                {rel.restritos} restrito(s) · {rel.semLink} sem link cadastrado
                {rel.origem === "cache" && " · feita sobre a cópia salva (a API do cliente não respondeu)"}
              </p>
              <TabelaLinks titulo="Quebrados" lista={rel.itensQuebrados} vazio="Nenhum link quebrado." />
              <TabelaLinks
                titulo="Restritos"
                dica="O site respondeu 401, 403 ou 429: costuma ser bloqueio a verificadores automáticos, não link quebrado. Vale abrir à mão."
                lista={rel.itensRestritos}
              />
              {rel.itensSemLink.length > 0 && (
                <details className="rounded-lg border border-border px-3 py-2">
                  <summary className="cursor-pointer font-medium text-ink">Itens sem link cadastrado ({rel.itensSemLink.length})</summary>
                  <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-ink-muted">
                    {rel.itensSemLink.map((u, i) => (
                      <li key={i}>
                        {u.grupo} — {u.descricao}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          )}
        </div>
      )}

      {acesso && !acesso.externo && (
        <div className="space-y-1 border-t border-border pt-3 text-xs text-ink-muted">
          <b className="text-ink">Painel no próprio portal publicado</b> (<code>admin.php</code>, mostra o mesmo, com botão para verificar links).
          {acesso.painel ? (
            <>
              {" "}
              <a href={acesso.painel} target="_blank" rel="noopener" className="inline-flex items-center gap-1 font-semibold text-petrol hover:underline">
                Abrir <ExternalLink size={12} />
              </a>
            </>
          ) : (
            " Informe o endereço público do portal para ver o link."
          )}
          <div>
            Usuário <code>{acesso.usuario}</code> · senha{" "}
            {verSenha ? <code>{acesso.senha}</code> : <button type="button" className="font-semibold text-petrol hover:underline" onClick={() => setVerSenha(true)}>mostrar</button>}
          </div>
        </div>
      )}
    </Card>
  );
}

function TabelaLinks({ titulo, dica, lista, vazio }: { titulo: string; dica?: string; lista: LinkProblema[]; vazio?: string }) {
  if (lista.length === 0) return vazio ? <p className="text-ok">{vazio}</p> : null;
  return (
    <div className="space-y-1">
      <h3 className="font-semibold text-ink">
        {titulo} ({lista.length})
      </h3>
      {dica && <p className="text-xs text-ink-muted">{dica}</p>}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-left text-xs">
          <thead className="bg-bg text-ink-muted">
            <tr>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Link</th>
              <th className="px-3 py-2">Onde aparece</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((l) => (
              <tr key={l.href} className="border-t border-border align-top">
                <td className="whitespace-nowrap px-3 py-2 font-semibold text-crit">{l.status || "sem resposta"}</td>
                <td className="break-all px-3 py-2">
                  <a href={l.href} target="_blank" rel="noopener noreferrer" className="text-petrol hover:underline">
                    {l.href}
                  </a>
                </td>
                <td className="px-3 py-2 text-ink-muted">{l.usos.map((u) => `${u.grupo} — ${u.descricao}`).join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
