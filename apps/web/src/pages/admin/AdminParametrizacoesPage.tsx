import { useEffect, useState } from "react";
import { FileStack, Plus, Trash2 } from "lucide-react";
import { api, type AdminDocumentoPersonalizado } from "../../lib/api";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Modal";

type CampoForm = { id?: string; descricao: string; obrigatorio: boolean };

const DOCUMENTO_FORM_VAZIO = { nome: "", descricao: "", promptInstrucoes: "", campos: [] as CampoForm[] };

// Personalizados: único ponto de cadastro de documento hoje — o Super Admin só nomeia o
// documento (ex.: DPIN) e, opcionalmente, dá um comentário de apoio pra IA. Sem catálogo de
// indicadores pré-cadastrado: a IA decide sozinha, no Construtor de Documentos, quais indicadores
// extrair de cada PDF (ver extrairIndicadoresAutonomamente, anthropic.client.ts) — o comentário
// aqui só se soma ao prompt-base fixo no código, nunca o substitui.
function DocumentosPersonalizadosSection() {
  const [documentos, setDocumentos] = useState<AdminDocumentoPersonalizado[]>([]);
  const [loading, setLoading] = useState(true);
  const [mostrarModal, setMostrarModal] = useState(false);
  const [editando, setEditando] = useState<AdminDocumentoPersonalizado | null>(null);
  const [form, setForm] = useState(DOCUMENTO_FORM_VAZIO);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = () => api.adminListDocumentosPersonalizados().then((res) => setDocumentos(res.documentos));

  useEffect(() => {
    carregar().finally(() => setLoading(false));
  }, []);

  function novo() {
    setErro(null);
    setEditando(null);
    setForm(DOCUMENTO_FORM_VAZIO);
    setMostrarModal(true);
  }

  function editar(d: AdminDocumentoPersonalizado) {
    setErro(null);
    setEditando(d);
    setForm({
      nome: d.nome,
      descricao: d.descricao ?? "",
      promptInstrucoes: d.promptInstrucoes ?? "",
      campos: d.campos.map((c) => ({ id: c.id, descricao: c.descricao, obrigatorio: c.obrigatorio })),
    });
    setMostrarModal(true);
  }

  function adicionarCampo() {
    setForm((f) => ({ ...f, campos: [...f.campos, { descricao: "", obrigatorio: false }] }));
  }

  function atualizarCampo(index: number, patch: Partial<CampoForm>) {
    setForm((f) => ({ ...f, campos: f.campos.map((c, i) => (i === index ? { ...c, ...patch } : c)) }));
  }

  function removerCampoDoForm(index: number) {
    setForm((f) => ({ ...f, campos: f.campos.filter((_, i) => i !== index) }));
  }

  async function salvar() {
    setErro(null);
    if (!form.nome.trim()) {
      setErro("Dê um nome ao documento.");
      return;
    }
    setSalvando(true);
    try {
      if (editando) {
        await api.adminUpdateDocumentoPersonalizado(editando.id, {
          nome: form.nome,
          descricao: form.descricao.trim() || null,
          promptInstrucoes: form.promptInstrucoes.trim() || null,
        });
        for (const campo of form.campos) {
          if (campo.id) {
            await api.adminUpdateCampoDocumentoPersonalizado(editando.id, campo.id, {
              descricao: campo.descricao,
              obrigatorio: campo.obrigatorio,
            });
          } else if (campo.descricao.trim()) {
            await api.adminAddCampoDocumentoPersonalizado(editando.id, {
              descricao: campo.descricao,
              obrigatorio: campo.obrigatorio,
            });
          }
        }
      } else {
        await api.adminCreateDocumentoPersonalizado({
          nome: form.nome,
          descricao: form.descricao.trim() || null,
          promptInstrucoes: form.promptInstrucoes.trim() || null,
          campos: form.campos.filter((c) => c.descricao.trim()).map((c) => ({ descricao: c.descricao, obrigatorio: c.obrigatorio })),
        });
      }
      setMostrarModal(false);
      setEditando(null);
      setForm(DOCUMENTO_FORM_VAZIO);
      await carregar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao salvar documento personalizado.");
    } finally {
      setSalvando(false);
    }
  }

  async function removerCampoSalvo(index: number) {
    if (!editando) {
      removerCampoDoForm(index);
      return;
    }
    const campo = form.campos[index];
    if (!campo.id) {
      removerCampoDoForm(index);
      return;
    }
    setErro(null);
    try {
      await api.adminRemoveCampoDocumentoPersonalizado(editando.id, campo.id);
      removerCampoDoForm(index);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao remover campo.");
    }
  }

  async function alternarAtivo(d: AdminDocumentoPersonalizado) {
    setErro(null);
    try {
      await api.adminUpdateDocumentoPersonalizado(d.id, { ativo: !d.ativo });
      await carregar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao alterar status.");
    }
  }

  async function excluir(d: AdminDocumentoPersonalizado) {
    const confirmado = window.confirm(
      `Excluir "${d.nome}"? Publicações já feitas pelos RPPS somem do Portal público. Esta ação não pode ser desfeita.`,
    );
    if (!confirmado) return;
    setErro(null);
    try {
      await api.adminDeleteDocumentoPersonalizado(d.id);
      await carregar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao excluir.");
    }
  }

  return (
    <section className="mb-10">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold text-ink">Personalizados</h2>
          <p className="text-sm text-ink-muted">
            Nomeie o documento (ex.: DPIN) e, se quiser, dê um comentário de apoio pra IA — ele se soma ao prompt
            padrão já definido no código, nunca o substitui. É esta lista que aparece pro RPPS escolher no
            Construtor de Documentos: lá a IA identifica sozinha os indicadores mais importantes de cada PDF
            enviado, sem precisar de nenhum campo pré-cadastrado.
          </p>
        </div>
        <Button onClick={novo}>Novo documento personalizado</Button>
      </div>

      {erro && <p className="mb-3 text-sm text-crit">{erro}</p>}

      {loading ? (
        <p className="text-sm text-ink-muted">Carregando…</p>
      ) : (
        <div className="flex flex-col gap-3">
          {documentos.map((d) => (
            <Card key={d.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-ink">{d.nome}</p>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    {d.campos.length} campo{d.campos.length === 1 ? "" : "s"}
                    {d.descricao ? ` — ${d.descricao}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {d.promptInstrucoes && <Badge tone="neutral">também no Construtor</Badge>}
                  <Badge tone={d.ativo ? "ok" : "neutral"}>{d.ativo ? "Ativo" : "Inativo"}</Badge>
                  <Button variant="ghost" onClick={() => alternarAtivo(d)}>
                    {d.ativo ? "Desativar" : "Ativar"}
                  </Button>
                  <Button variant="ghost" onClick={() => editar(d)}>
                    Editar
                  </Button>
                  <button onClick={() => excluir(d)} className="text-xs font-medium text-crit hover:underline">
                    excluir
                  </button>
                </div>
              </div>
            </Card>
          ))}
          {documentos.length === 0 && <p className="text-sm text-ink-muted">Nenhum documento personalizado cadastrado ainda.</p>}
        </div>
      )}

      <Modal
        open={mostrarModal}
        onClose={() => setMostrarModal(false)}
        title={editando ? "Editar documento personalizado" : "Novo documento personalizado"}
        icon={<FileStack size={16} />}
        footer={
          <>
            <Button variant="ghost" onClick={() => setMostrarModal(false)}>
              Cancelar
            </Button>
            <Button onClick={salvar} disabled={salvando}>
              {salvando ? "Salvando…" : "Salvar"}
            </Button>
          </>
        }
      >
        {erro && <p className="mb-3 text-sm text-crit">{erro}</p>}
        <div className="flex flex-col gap-3">
          <Campo label="Nome do documento" value={form.nome} onChange={(v) => setForm({ ...form, nome: v })} />
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-ink">Descrição (opcional)</span>
            <textarea
              rows={2}
              value={form.descricao}
              onChange={(e) => setForm({ ...form, descricao: e.target.value })}
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-petrol"
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-ink">Comentário de apoio pra IA (opcional)</span>
            <textarea
              rows={4}
              value={form.promptInstrucoes}
              onChange={(e) => setForm({ ...form, promptInstrucoes: e.target.value })}
              placeholder="Deixe em branco pra IA seguir só o prompt padrão do código. Preencha pra dar uma orientação extra sobre o que procurar neste documento específico…"
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-petrol"
            />
            <span className="mt-1 block text-xs text-ink-muted">
              Some ao prompt padrão já definido no código — nunca o substitui. A IA decide sozinha quais
              indicadores extrair, sem precisar de nenhum campo pré-cadastrado aqui.
            </span>
          </label>

          <div className="mt-2 flex items-center justify-between">
            <span className="text-sm font-medium text-ink">Campos de preenchimento manual (opcional)</span>
            <Button variant="ghost" onClick={adicionarCampo}>
              <Plus size={14} /> Adicionar campo
            </Button>
          </div>
          <div className="flex flex-col gap-2">
            {form.campos.map((campo, i) => (
              <div key={campo.id ?? `novo-${i}`} className="flex items-center gap-2 rounded-lg border border-border p-2">
                <input
                  value={campo.descricao}
                  onChange={(e) => atualizarCampo(i, { descricao: e.target.value })}
                  placeholder="Descrição do campo (ex.: Valor total arrecadado no mês)"
                  className="flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-petrol"
                />
                <label className="flex shrink-0 items-center gap-1.5 text-xs text-ink-muted">
                  <input
                    type="checkbox"
                    checked={campo.obrigatorio}
                    onChange={(e) => atualizarCampo(i, { obrigatorio: e.target.checked })}
                  />
                  Obrigatório
                </label>
                <button onClick={() => removerCampoSalvo(i)} className="shrink-0 text-crit hover:text-crit/80" title="Remover campo">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            {form.campos.length === 0 && <p className="text-xs text-ink-muted">Nenhum campo ainda.</p>}
          </div>
        </div>
      </Modal>
    </section>
  );
}

export function AdminParametrizacoesPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold text-ink">Parametrizações globais</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Cadastros cross-tenant, válidos para todos os RPPS clientes da plataforma.
        </p>
      </header>

      <DocumentosPersonalizadosSection />
    </div>
  );
}

function Campo({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-ink">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-petrol"
      />
    </label>
  );
}
