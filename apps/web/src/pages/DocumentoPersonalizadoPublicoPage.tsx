import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Download } from "lucide-react";
import { api, type DocumentoPersonalizadoPublico } from "../lib/api";
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

// Página pública padrão de um Documento Personalizado publicado (ex.: DIPR) — mesmo portal
// (menu + rodapé, ver PortalPublicoLayout) da transparência principal, só que com os dados
// estruturados deste documento específico.
export function DocumentoPersonalizadoPublicoPage() {
  const { slug, codigo } = useParams<{ slug: string; codigo: string }>();
  const [dados, setDados] = useState<DocumentoPersonalizadoPublico | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!slug || !codigo) return;
    api
      .documentoPersonalizadoPublico(slug, codigo)
      .then(setDados)
      .catch((err) => setErro(err instanceof Error ? err.message : "Erro ao carregar."));
  }, [slug, codigo]);

  function exportarTudo() {
    if (!dados) return;
    const conteudo = dados.itens.map((item) => `${item.descricao}\n\n${item.valor}\n`).join("\n" + "-".repeat(60) + "\n\n");
    baixarTexto(`${codigo}-${slug}.txt`, `${dados.tenant.name} — ${dados.documento.nome}\n${"=".repeat(60)}\n\n${conteudo}`);
  }

  return (
    <PortalPublicoLayout tenant={dados?.tenant ?? null} menu={dados?.menu ?? []}>
      <div className="mx-auto max-w-3xl">
        <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">{dados?.tenant.name ?? "Portal de Transparência"}</p>
            <h1 className="mt-1 font-display text-2xl font-bold text-ink">{dados?.documento.nome ?? "Documento"}</h1>
            {dados?.documento.descricao && <p className="mt-1 text-sm text-ink-muted">{dados.documento.descricao}</p>}
            {dados?.publicadoEm && (
              <p className="mt-1 text-xs text-ink-muted">Publicado em {new Date(dados.publicadoEm).toLocaleString("pt-BR")}</p>
            )}
          </div>
          {dados && dados.itens.length > 0 && (
            <Button variant="ghost" onClick={exportarTudo}>
              <Download size={14} /> Exportar
            </Button>
          )}
        </header>

        {erro && (
          <Card className="p-5">
            <p className="text-sm text-ink-muted">{erro}</p>
          </Card>
        )}

        {dados && (
          <div className="flex flex-col gap-3">
            {dados.itens.map((item, i) => (
              <Card key={i} className="p-5">
                <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">{item.descricao}</p>
                <p className="mt-1 text-sm text-ink">{item.valor}</p>
              </Card>
            ))}
            {dados.itens.length === 0 && <p className="text-sm text-ink-muted">Nenhum dado publicado ainda.</p>}
          </div>
        )}
      </div>
    </PortalPublicoLayout>
  );
}
