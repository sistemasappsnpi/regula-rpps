import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Download, Search } from "lucide-react";
import { api, type TransparenciaPublica } from "../lib/api";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { PortalPublicoLayout } from "../components/layout/PortalPublicoLayout";

function baixarTexto(nomeArquivo: string, conteudo: string) {
  const blob = new Blob([conteudo], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nomeArquivo;
  link.click();
  URL.revokeObjectURL(url);
}

// Página pública (sem autenticação): gerada a partir de dado estruturado já aprovado,
// nunca a partir de PDF anexado — ver /docs/modelo-de-dados.md. Com busca, filtro por
// documento-fonte e exportação (geral e por item).
export function TransparenciaPublicaPage() {
  const { slug } = useParams<{ slug: string }>();
  const [dados, setDados] = useState<TransparenciaPublica | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [fonteFiltro, setFonteFiltro] = useState("Todas");

  useEffect(() => {
    if (!slug) return;
    api
      .transparenciaPublica(slug)
      .then(setDados)
      .catch((err) => setErro(err instanceof Error ? err.message : "Erro ao carregar."));
  }, [slug]);

  const fontes = useMemo(
    () => ["Todas", ...new Set(dados?.itens.map((i) => i.fonteAcaoCodigo) ?? [])],
    [dados],
  );

  const filtrados = useMemo(() => {
    if (!dados) return [];
    return dados.itens.filter((item) => {
      const bateFonte = fonteFiltro === "Todas" || item.fonteAcaoCodigo === fonteFiltro;
      const bateBusca = !busca.trim() || `${item.valor} ${item.descricao ?? ""}`.toLowerCase().includes(busca.toLowerCase());
      return bateFonte && bateBusca;
    });
  }, [dados, fonteFiltro, busca]);

  function exportarTudo() {
    if (!dados) return;
    const conteudo = dados.itens
      .map((item) => `${item.descricao ?? item.fonteAcaoCodigo}\nFonte: ${item.fonteAcaoCodigo}\n\n${item.valor}\n`)
      .join("\n" + "-".repeat(60) + "\n\n");
    baixarTexto(`transparencia-${slug}.txt`, `${dados.tenant.name}\n${"=".repeat(60)}\n\n${conteudo}`);
  }

  function exportarItem(item: TransparenciaPublica["itens"][number], index: number) {
    baixarTexto(
      `transparencia-${slug}-item-${index + 1}.txt`,
      `${item.descricao ?? item.fonteAcaoCodigo}\nFonte: ${item.fonteAcaoCodigo}\n\n${item.valor}\n`,
    );
  }

  return (
    <PortalPublicoLayout tenant={dados?.tenant ?? null} menu={dados?.menu ?? []}>
      <div className="mx-auto max-w-3xl">
        <header id="sobre" className="mb-8 flex flex-wrap items-start justify-between gap-4 scroll-mt-6">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Transparência ativa · Pró-Gestão RPPS</p>
            <h1 className="mt-1 font-display text-2xl font-bold text-ink">{dados?.tenant.name ?? "Portal de Transparência"}</h1>
            {dados && <p className="mt-1 text-sm text-ink-muted">{dados.tenant.federatedEntity}</p>}
            {dados?.publicadoEm && (
              <p className="mt-1 text-xs text-ink-muted">
                Publicado em {new Date(dados.publicadoEm).toLocaleString("pt-BR")}
              </p>
            )}
          </div>
          {dados && dados.itens.length > 0 && (
            <Button variant="ghost" onClick={exportarTudo}>
              <Download size={14} /> Exportar tudo
            </Button>
          )}
        </header>

        {erro && (
          <Card className="p-5">
            <p className="text-sm text-ink-muted">{erro}</p>
          </Card>
        )}

        {dados && dados.itens.length > 0 && (
          <div id="documentos" className="mb-4 flex flex-wrap items-center gap-3 scroll-mt-6">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar nos documentos publicados…"
                className="w-full rounded-full border border-border bg-surface py-2 pl-9 pr-3 text-sm outline-none focus:border-petrol"
              />
            </div>
            <select
              value={fonteFiltro}
              onChange={(e) => setFonteFiltro(e.target.value)}
              className="rounded-full border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-petrol"
            >
              {fontes.map((f) => (
                <option key={f} value={f}>
                  {f === "Todas" ? "Todos os documentos" : f}
                </option>
              ))}
            </select>
          </div>
        )}

        {dados && (
          <div className="flex flex-col gap-3">
            {filtrados.map((item, i) => (
              <Card key={i} className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm text-ink">{item.valor}</p>
                  <button
                    onClick={() => exportarItem(item, i)}
                    className="shrink-0 text-ink-muted hover:text-ink"
                    title="Baixar este documento"
                  >
                    <Download size={14} />
                  </button>
                </div>
                <p className="mt-2 text-xs text-ink-muted">Fonte: {item.fonteAcaoCodigo}</p>
              </Card>
            ))}
            {filtrados.length === 0 && (
              <p className="text-sm text-ink-muted">Nenhum documento encontrado para essa busca.</p>
            )}
          </div>
        )}
      </div>
    </PortalPublicoLayout>
  );
}
