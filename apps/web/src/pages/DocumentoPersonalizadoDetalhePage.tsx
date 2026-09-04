import { useCallback, useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { api, type DocumentoPersonalizadoTenant } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";

// Preenchimento e publicação de um Documento Personalizado (tipo + campos criados pelo Super
// Admin — ver AdminParametrizacoesPage). Mesma convenção do Pró-Gestão: todo campo é opcional
// e independente, um único "Salvar" grava tudo de uma vez; "Publicar" é o ato explícito que
// manda o conteúdo pro Portal público (ver PortalPublicoLayout / DocumentoPersonalizadoPublicoPage).
export function DocumentoPersonalizadoDetalhePage() {
  const { codigo } = useParams<{ codigo: string }>();
  const { tenant } = useAuth();

  const [documento, setDocumento] = useState<DocumentoPersonalizadoTenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [rascunhos, setRascunhos] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);
  const [publicando, setPublicando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!codigo) return;
    const res = await api.listDocumentosPersonalizados();
    setDocumento(res.documentos.find((d) => d.codigo === codigo) ?? null);
  }, [codigo]);

  useEffect(() => {
    carregar().finally(() => setLoading(false));
  }, [carregar]);

  if (loading) return <p className="text-sm text-ink-muted">Carregando…</p>;
  if (!documento) return <p className="text-sm text-crit">Documento não encontrado.</p>;

  async function salvarTudo() {
    if (!documento) return;
    const alterados = documento.campos.filter((campo) => {
      const rascunho = rascunhos[campo.id];
      return rascunho !== undefined && rascunho.trim() !== "" && rascunho !== (campo.valorAtual ?? "");
    });
    if (alterados.length === 0) return;

    setSalvando(true);
    setAviso(null);
    try {
      for (const campo of alterados) {
        await api.setDocumentoPersonalizadoCampoValor(campo.id, rascunhos[campo.id]);
      }
      setRascunhos({});
      await carregar();
    } catch (err) {
      setAviso(err instanceof Error ? err.message : "Erro ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function publicar() {
    if (!documento) return;
    setPublicando(true);
    setAviso(null);
    try {
      await api.publicarDocumentoPersonalizado(documento.id);
      await carregar();
    } catch (err) {
      setAviso(err instanceof Error ? err.message : "Erro ao publicar.");
    } finally {
      setPublicando(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <Link to="/documentos" className="mb-4 flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
        <ArrowLeft size={15} /> Voltar para Documentos
      </Link>

      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">{documento.nome}</h1>
          {documento.descricao && <p className="mt-1 max-w-2xl text-sm text-ink-muted">{documento.descricao}</p>}
        </div>
        <div className="flex flex-col items-end gap-2">
          {documento.publicacao?.status === "APROVADO" ? (
            <Badge tone="ok">
              Publicado em {new Date(documento.publicacao.aprovadoEm ?? documento.publicacao.geradoEm).toLocaleDateString("pt-BR")}
            </Badge>
          ) : (
            <Badge tone="neutral">Ainda não publicado</Badge>
          )}
          {tenant?.slug && documento.publicacao?.status === "APROVADO" && (
            <a
              href={`/documentos-publicos/${tenant.slug}/${documento.codigo}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-xs font-medium text-petrol hover:underline"
            >
              Ver publicado <ExternalLink size={12} />
            </a>
          )}
        </div>
      </header>

      <Card className="mb-6 p-5">
        <p className="mb-1 text-sm font-medium text-ink">Preenchimento</p>
        <p className="mb-3 text-xs text-ink-muted">
          Todos os campos são opcionais e independentes — preencha o que já tiver em mãos, na ordem que quiser, e
          clique em "Salvar" no final para gravar tudo de uma vez.
        </p>
        <div className="flex flex-col gap-4">
          {documento.campos.map((campo) => (
            <div key={campo.id} className="rounded-lg border border-border p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-ink">{campo.descricao}</p>
                {campo.obrigatorio && <Badge tone="warn">obrigatório para publicar</Badge>}
              </div>
              <textarea
                className="w-full rounded-lg border border-border bg-bg p-2 text-sm text-ink"
                rows={2}
                defaultValue={campo.valorAtual ?? ""}
                placeholder="Opcional — preencha e depois clique em Salvar…"
                onChange={(e) => setRascunhos((prev) => ({ ...prev, [campo.id]: e.target.value }))}
              />
            </div>
          ))}
          {documento.campos.length === 0 && <p className="text-sm text-ink-muted">Este documento ainda não tem campos cadastrados.</p>}
        </div>
        {documento.campos.length > 0 && (
          <div className="mt-4 flex items-center justify-end gap-3 border-t border-border pt-4">
            {aviso && <p className="text-xs text-crit">{aviso}</p>}
            <Button onClick={salvarTudo} disabled={salvando}>
              {salvando ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        )}
      </Card>

      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-ink">Publicar na Transparência</p>
            <p className="mt-1 text-xs text-ink-muted">
              Envia o que estiver preenchido agora para uma página pública padronizada. Pode publicar de novo a
              qualquer momento para atualizar o conteúdo já publicado.
            </p>
          </div>
          <Button onClick={publicar} disabled={publicando}>
            {publicando ? "Publicando…" : "Publicar"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
