import { useEffect, useState } from "react";
import { Sparkles, FileStack, Plus, Trash2 } from "lucide-react";
import { api, type AdminConstrutorTipo, type AdminDocumentoPersonalizado } from "../../lib/api";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Modal";

const REFERENCIA_LABEL: Record<AdminConstrutorTipo["referenciaTipo"], string> = {
  PRO_GESTAO: "Ação do Pró-Gestão",
  CRP: "Critério do CRP",
  LIVRE: "Sem referência normativa",
};

const CONSTRUTOR_FORM_VAZIO = {
  nome: "",
  referenciaTipo: "PRO_GESTAO" as AdminConstrutorTipo["referenciaTipo"],
  acaoCodigo: "",
  criterionCode: "",
  promptInstrucoes: "",
  ativo: true,
};

function ConstrutorDocumentosSection() {
  const [tipos, setTipos] = useState<AdminConstrutorTipo[]>([]);
  const [acoes, setAcoes] = useState<{ codigo: string; numero: string; nome: string }[]>([]);
  const [criterios, setCriterios] = useState<{ code: string; title: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [mostrarModal, setMostrarModal] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [form, setForm] = useState(CONSTRUTOR_FORM_VAZIO);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = () =>
    Promise.all([
      api.adminListConstrutorTipos(),
      api.adminListConstrutorCatalogoAcoes(),
      api.adminListConstrutorCatalogoCriterios(),
    ]).then(([t, a, c]) => {
      setTipos(t.tipos);
      setAcoes(a.acoes);
      setCriterios(c.criterios);
    });

  useEffect(() => {
    carregar().finally(() => setLoading(false));
  }, []);

  function novo() {
    setErro(null);
    setEditandoId(null);
    setForm(CONSTRUTOR_FORM_VAZIO);
    setMostrarModal(true);
  }

  function editar(t: AdminConstrutorTipo) {
    setErro(null);
    setEditandoId(t.id);
    setForm({
      nome: t.nome,
      referenciaTipo: t.referenciaTipo,
      acaoCodigo: t.acaoCodigo ?? "",
      criterionCode: t.criterionCode ?? "",
      promptInstrucoes: t.promptInstrucoes,
      ativo: t.ativo,
    });
    setMostrarModal(true);
  }

  async function salvar() {
    setErro(null);
    setSalvando(true);
    const payload = {
      nome: form.nome,
      referenciaTipo: form.referenciaTipo,
      acaoCodigo: form.referenciaTipo === "PRO_GESTAO" ? form.acaoCodigo || null : null,
      criterionCode: form.referenciaTipo === "CRP" ? form.criterionCode || null : null,
      promptInstrucoes: form.promptInstrucoes,
      ativo: form.ativo,
    };
    try {
      if (editandoId) {
        await api.adminUpdateConstrutorTipo(editandoId, payload);
      } else {
        await api.adminCreateConstrutorTipo(payload);
      }
      setMostrarModal(false);
      setEditandoId(null);
      setForm(CONSTRUTOR_FORM_VAZIO);
      await carregar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao salvar tipo de documento.");
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(id: string) {
    const confirmado = window.confirm("Excluir este tipo de documento? Execuções já geradas continuam no histórico dos tenants.");
    if (!confirmado) return;
    setErro(null);
    try {
      await api.adminDeleteConstrutorTipo(id);
      await carregar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao excluir.");
    }
  }

  async function sincronizar() {
    setErro(null);
    try {
      const res = await api.adminSincronizarConstrutorTipos();
      await carregar();
      if (res.criados === 0) {
        setErro("Nenhuma ação nova para trazer — todas as ações do Pró-Gestão já têm um tipo de documento.");
      }
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao sincronizar com o catálogo do Pró-Gestão.");
    }
  }

  return (
    <section className="mb-10">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold text-ink">Construtor de Documentos — Prompts de IA</h2>
          <p className="text-sm text-ink-muted">
            Cada tipo de documento tem seu próprio prompt: o que a IA deve entender e fazer ao montar aquele
            documento a partir dos relatórios enviados pelo usuário. Ligar a uma ação do Pró-Gestão ou a um
            critério do CRP dá à IA o contexto normativo (objetivo, campos, base legal) do que aquele documento
            significa — e o RPPS só vê aquele tipo se o nível de aderência configurado para ele alcançar essa
            ação.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="ghost" onClick={sincronizar}>
            Trazer ações do Pró-Gestão
          </Button>
          <Button onClick={novo}>Novo tipo de documento</Button>
        </div>
      </div>

      {erro && <p className="mb-3 text-sm text-crit">{erro}</p>}

      {loading ? (
        <p className="text-sm text-ink-muted">Carregando…</p>
      ) : (
        <div className="flex flex-col gap-3">
          {tipos.map((t) => (
            <Card key={t.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-ink">{t.nome}</p>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    {REFERENCIA_LABEL[t.referenciaTipo]}
                    {t.acao ? ` — ${t.acao.nome}` : ""}
                    {t.criterion ? ` — ${t.criterion.title}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={t.ativo ? "ok" : "neutral"}>{t.ativo ? "Ativo" : "Inativo"}</Badge>
                  <Button variant="ghost" onClick={() => editar(t)}>
                    Editar
                  </Button>
                  <button onClick={() => excluir(t.id)} className="text-xs font-medium text-crit hover:underline">
                    excluir
                  </button>
                </div>
              </div>
            </Card>
          ))}
          {tipos.length === 0 && <p className="text-sm text-ink-muted">Nenhum tipo de documento cadastrado ainda.</p>}
        </div>
      )}

      <Modal
        open={mostrarModal}
        onClose={() => setMostrarModal(false)}
        title={editandoId ? "Editar tipo de documento" : "Novo tipo de documento"}
        icon={<Sparkles size={16} />}
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
            <span className="mb-1 block font-medium text-ink">Referência normativa</span>
            <select
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm"
              value={form.referenciaTipo}
              onChange={(e) => setForm({ ...form, referenciaTipo: e.target.value as AdminConstrutorTipo["referenciaTipo"] })}
            >
              <option value="PRO_GESTAO">Ação do Pró-Gestão</option>
              <option value="CRP">Critério do CRP</option>
              <option value="LIVRE">Sem referência normativa</option>
            </select>
          </label>

          {form.referenciaTipo === "PRO_GESTAO" && (
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-ink">Ação do Pró-Gestão</span>
              <select
                className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm"
                value={form.acaoCodigo}
                onChange={(e) => setForm({ ...form, acaoCodigo: e.target.value })}
              >
                <option value="">Selecione…</option>
                {acoes.map((a) => (
                  <option key={a.codigo} value={a.codigo}>
                    {a.numero} — {a.nome}
                  </option>
                ))}
              </select>
            </label>
          )}

          {form.referenciaTipo === "CRP" && (
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-ink">Critério do CRP</span>
              <select
                className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm"
                value={form.criterionCode}
                onChange={(e) => setForm({ ...form, criterionCode: e.target.value })}
              >
                <option value="">Selecione…</option>
                {criterios.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.title}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-ink">Instruções para a IA</span>
            <textarea
              rows={6}
              value={form.promptInstrucoes}
              onChange={(e) => setForm({ ...form, promptInstrucoes: e.target.value })}
              placeholder="O que a IA deve identificar em cada relatório e como organizar o documento final…"
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-petrol"
            />
          </label>

          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={form.ativo} onChange={(e) => setForm({ ...form, ativo: e.target.checked })} />
            Disponível para os RPPS com o plano que inclui o Construtor
          </label>
        </div>
      </Modal>
    </section>
  );
}

type CampoForm = { id?: string; descricao: string; obrigatorio: boolean };

const DOCUMENTO_FORM_VAZIO = { nome: "", descricao: "", promptInstrucoes: "", campos: [] as CampoForm[] };

// Documentos Personalizados: ao contrário do Construtor (que monta documentos por IA a partir
// de fontes já existentes), aqui o Super Admin cria do zero um tipo documental livre (ex.: DIPR)
// com os campos que quiser — o preenchimento e a publicação ficam por conta do tenant (ver
// DocumentosPage.tsx, seção "Personalizados").
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
          <h2 className="font-display text-lg font-bold text-ink">Documentos Personalizados</h2>
          <p className="text-sm text-ink-muted">
            Tipos de documento livres, fora do catálogo oficial do Pró-Gestão/CRP (ex.: DIPR). Crie o nome e os
            campos aqui — cada RPPS preenche e publica na própria aba "Documentos", em "Personalizados".
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
            <span className="mb-1 block font-medium text-ink">Instruções para a IA (opcional)</span>
            <textarea
              rows={4}
              value={form.promptInstrucoes}
              onChange={(e) => setForm({ ...form, promptInstrucoes: e.target.value })}
              placeholder="Deixe em branco para este documento existir só no preenchimento manual. Preencha e ele também aparece pro RPPS montar por IA no Construtor de Documentos, a partir de relatórios enviados…"
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-petrol"
            />
            <span className="mt-1 block text-xs text-ink-muted">
              Sem referência normativa própria — a IA segue só este texto (mesmo comportamento de um tipo "sem
              referência" no Construtor).
            </span>
          </label>

          <div className="mt-2 flex items-center justify-between">
            <span className="text-sm font-medium text-ink">Campos de preenchimento</span>
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
            {form.campos.length === 0 && <p className="text-xs text-ink-muted">Nenhum campo ainda — adicione ao menos um.</p>}
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

      <ConstrutorDocumentosSection />
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
