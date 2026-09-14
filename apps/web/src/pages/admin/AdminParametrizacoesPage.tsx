import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, FileStack, Plus, Trash2 } from "lucide-react";
import { api, type AdminDocumentoPersonalizado, type AdminPortalIndicador, type ModoExtracaoIA, type PortalIndicadorTipo } from "../../lib/api";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Modal";
import { useConfirm } from "../../components/ui/confirm-context";

const TIPOS: { valor: PortalIndicadorTipo; rotulo: string }[] = [
  { valor: "TEXTO", rotulo: "Texto" },
  { valor: "NUMERICO", rotulo: "Número" },
  { valor: "MOEDA", rotulo: "Moeda" },
  { valor: "DATA", rotulo: "Data" },
];

const MODOS: { valor: ModoExtracaoIA; rotulo: string; descricao: string }[] = [
  { valor: "COMENTARIO_APENAS", rotulo: "Só comentário", descricao: "A IA decide sozinha quais indicadores extrair (comportamento de sempre)." },
  { valor: "CHECKLIST_APENAS", rotulo: "Só checklist", descricao: "A IA extrai SOMENTE os campos do checklist abaixo, nada além." },
  { valor: "AMBOS", rotulo: "Checklist + descoberta livre", descricao: "A IA tenta preencher o checklist inteiro E pode achar campos extras." },
];

const DOCUMENTO_FORM_VAZIO = {
  nome: "",
  descricao: "",
  promptInstrucoes: "",
  modoExtracaoIA: "COMENTARIO_APENAS" as ModoExtracaoIA,
};

// Personalizados: único ponto de cadastro de documento hoje — o Super Admin nomeia o documento
// (ex.: DPIN), escolhe o modo de extração e, opcionalmente, monta um checklist de campos
// esperados (com subcampos pra campos que se repetem, ex. "Membro do Comitê" → nome/cargo/
// portaria) e/ou dá um comentário de apoio livre pra IA. Tudo isso guia
// extrairIndicadoresAutonomamente no Construtor de Documentos — não existe mais preenchimento
// manual sem IA.
function DocumentosPersonalizadosSection() {
  const confirmar = useConfirm();
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

  // Depois de mexer no checklist (campo/subcampo), recarrega a lista e resincroniza `editando`
  // com o que voltou do servidor, sem fechar o modal.
  async function recarregarEditando(id: string) {
    const res = await api.adminListDocumentosPersonalizados();
    setDocumentos(res.documentos);
    const atualizado = res.documentos.find((d) => d.id === id);
    if (atualizado) setEditando(atualizado);
  }

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
      modoExtracaoIA: d.modoExtracaoIA,
    });
    setMostrarModal(true);
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
        const atualizado = await api.adminUpdateDocumentoPersonalizado(editando.id, {
          nome: form.nome,
          descricao: form.descricao.trim() || null,
          promptInstrucoes: form.promptInstrucoes.trim() || null,
          modoExtracaoIA: form.modoExtracaoIA,
        });
        setEditando(atualizado);
        await carregar();
      } else {
        const criado = await api.adminCreateDocumentoPersonalizado({
          nome: form.nome,
          descricao: form.descricao.trim() || null,
          promptInstrucoes: form.promptInstrucoes.trim() || null,
          modoExtracaoIA: form.modoExtracaoIA,
        });
        // Mantém o modal aberto, já em modo edição, pra poder montar o checklist na hora sem
        // precisar fechar e reabrir — o checklist só existe depois que o documento (e o espelho
        // do Portal Previdenciário que o guarda) já foi criado.
        setEditando(criado);
        await carregar();
      }
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao salvar documento personalizado.");
    } finally {
      setSalvando(false);
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
    const confirmado = await confirmar({
      message: `Excluir "${d.nome}"? Esta ação não pode ser desfeita.`,
      tone: "danger",
      confirmLabel: "Excluir",
    });
    if (!confirmado) return;
    setErro(null);
    try {
      await api.adminDeleteDocumentoPersonalizado(d.id);
      await carregar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao excluir.");
    }
  }

  const campos = editando?.portalDocumento?.indicadores ?? [];

  return (
    <section className="mb-10">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold text-ink">Personalizados</h2>
          <p className="text-sm text-ink-muted">
            Nomeie o documento (ex.: DPIN), escolha como a IA deve extrair os dados e, se quiser, monte um
            checklist de campos esperados. É esta lista que aparece pro RPPS escolher no Construtor de Documentos.
          </p>
        </div>
        <Button onClick={novo}>Novo documento personalizado</Button>
      </div>

      {erro && !mostrarModal && <p className="mb-3 text-sm text-crit">{erro}</p>}

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
                    {d.portalDocumento?.indicadores.length ?? 0} campo{(d.portalDocumento?.indicadores.length ?? 0) === 1 ? "" : "s"} no
                    checklist
                    {d.descricao ? ` — ${d.descricao}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone="neutral">{MODOS.find((m) => m.valor === d.modoExtracaoIA)?.rotulo ?? d.modoExtracaoIA}</Badge>
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
              Fechar
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
            <span className="mt-1 block text-xs text-ink-muted">
              Só aparece nesta lista de cadastro, pra você mesmo se lembrar do que é este documento —{" "}
              <strong>nunca é enviada pra IA</strong>.
            </span>
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-ink">Modo de extração</span>
            <div className="flex flex-col gap-1.5">
              {MODOS.map((m) => (
                <label
                  key={m.valor}
                  className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-sm ${
                    form.modoExtracaoIA === m.valor ? "border-petrol bg-petrol/5" : "border-border"
                  }`}
                >
                  <input
                    type="radio"
                    className="mt-0.5"
                    checked={form.modoExtracaoIA === m.valor}
                    onChange={() => setForm({ ...form, modoExtracaoIA: m.valor })}
                  />
                  <span>
                    <span className="block font-medium text-ink">{m.rotulo}</span>
                    <span className="block text-xs text-ink-muted">{m.descricao}</span>
                  </span>
                </label>
              ))}
            </div>
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
            <span className="mt-1 block text-xs text-ink-muted">Some ao prompt padrão já definido no código — nunca o substitui.</span>
          </label>

          {editando ? (
            <ChecklistEditor documentoId={editando.id} campos={campos} onChange={() => recarregarEditando(editando.id)} />
          ) : (
            <p className="mt-2 rounded-lg bg-ink/5 p-3 text-xs text-ink-muted">
              Salve o documento primeiro pra poder montar o checklist de campos.
            </p>
          )}
        </div>
      </Modal>
    </section>
  );
}

// Checklist de campos pra IA — cada campo pode ter subcampos (nome/tipo/unidade), e quando tem
// vira um grupo que se repete quantas vezes precisar (ex.: um membro de comitê por ocorrência).
function ChecklistEditor({
  documentoId,
  campos,
  onChange,
}: {
  documentoId: string;
  campos: AdminPortalIndicador[];
  onChange: () => void;
}) {
  const [novoCampo, setNovoCampo] = useState<{ nome: string; tipo: PortalIndicadorTipo; unidade: string }>({
    nome: "",
    tipo: "TEXTO",
    unidade: "",
  });
  const [expandido, setExpandido] = useState<Set<string>>(new Set());
  const [erro, setErro] = useState<string | null>(null);

  function alternarExpandido(id: string) {
    setExpandido((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  async function adicionarCampo() {
    if (!novoCampo.nome.trim()) return;
    setErro(null);
    try {
      await api.adminAddCampoChecklist(documentoId, { nome: novoCampo.nome, tipo: novoCampo.tipo, unidade: novoCampo.unidade.trim() || null });
      setNovoCampo({ nome: "", tipo: "TEXTO", unidade: "" });
      onChange();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao adicionar campo.");
    }
  }

  async function removerCampo(campoId: string) {
    setErro(null);
    try {
      await api.adminRemoveCampoChecklist(documentoId, campoId);
      onChange();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao remover campo.");
    }
  }

  return (
    <div className="mt-2">
      <span className="mb-1 block text-sm font-medium text-ink">Checklist de campos pra IA (opcional)</span>
      <p className="mb-2 text-xs text-ink-muted">
        A IA vai tentar achar cada campo abaixo no PDF e sinalizar no Construtor quando não achar, pra revisão
        manual. Campo sem subcampo é simples; adicione subcampos (ex.: nome/cargo/portaria) quando o campo se
        repete várias vezes no documento (ex.: "Membro do Comitê").
      </p>

      {erro && <p className="mb-2 text-xs text-crit">{erro}</p>}

      <div className="flex flex-col gap-2">
        {campos.map((campo) => (
          <div key={campo.id} className="rounded-lg border border-border">
            <div className="flex items-center gap-2 p-2.5">
              <button type="button" onClick={() => alternarExpandido(campo.id)} className="shrink-0 text-ink-muted hover:text-ink">
                {expandido.has(campo.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{campo.nome}</p>
                <p className="text-xs text-ink-muted">
                  {TIPOS.find((t) => t.valor === campo.tipo)?.rotulo}
                  {campo.unidade ? ` · ${campo.unidade}` : ""}
                  {(campo.subcampos?.length ?? 0) > 0 ? ` · ${campo.subcampos!.length} subcampo(s) — se repete` : ""}
                </p>
              </div>
              <button onClick={() => removerCampo(campo.id)} className="shrink-0 text-crit hover:text-crit/80" title="Remover campo">
                <Trash2 size={14} />
              </button>
            </div>
            {expandido.has(campo.id) && (
              <div className="border-t border-border p-2.5">
                <SubcamposEditor documentoId={documentoId} campo={campo} onChange={onChange} />
              </div>
            )}
          </div>
        ))}
        {campos.length === 0 && <p className="text-xs text-ink-muted">Nenhum campo no checklist ainda.</p>}
      </div>

      <div className="mt-2 flex items-center gap-2 rounded-lg border border-border p-2">
        <input
          value={novoCampo.nome}
          onChange={(e) => setNovoCampo({ ...novoCampo, nome: e.target.value })}
          placeholder="Nome do campo (ex.: Membro do Comitê)"
          className="flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-petrol"
        />
        <select
          value={novoCampo.tipo}
          onChange={(e) => setNovoCampo({ ...novoCampo, tipo: e.target.value as PortalIndicadorTipo })}
          className="rounded-lg border border-border bg-bg px-2 py-2 text-sm outline-none focus:border-petrol"
        >
          {TIPOS.map((t) => (
            <option key={t.valor} value={t.valor}>
              {t.rotulo}
            </option>
          ))}
        </select>
        <input
          value={novoCampo.unidade}
          onChange={(e) => setNovoCampo({ ...novoCampo, unidade: e.target.value })}
          placeholder="Unidade (opcional)"
          className="w-28 rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-petrol"
        />
        <Button variant="ghost" onClick={adicionarCampo}>
          <Plus size={14} /> Campo
        </Button>
      </div>
    </div>
  );
}

function SubcamposEditor({
  documentoId,
  campo,
  onChange,
}: {
  documentoId: string;
  campo: AdminPortalIndicador;
  onChange: () => void;
}) {
  const [novoSubcampo, setNovoSubcampo] = useState<{ nome: string; tipo: PortalIndicadorTipo; unidade: string }>({
    nome: "",
    tipo: "TEXTO",
    unidade: "",
  });
  const [erro, setErro] = useState<string | null>(null);

  async function adicionarSubcampo() {
    if (!novoSubcampo.nome.trim()) return;
    setErro(null);
    try {
      await api.adminAddSubcampoChecklist(documentoId, campo.id, {
        nome: novoSubcampo.nome,
        tipo: novoSubcampo.tipo,
        unidade: novoSubcampo.unidade.trim() || null,
      });
      setNovoSubcampo({ nome: "", tipo: "TEXTO", unidade: "" });
      onChange();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao adicionar subcampo.");
    }
  }

  async function removerSubcampo(subcampoId: string) {
    setErro(null);
    try {
      await api.adminRemoveSubcampoChecklist(documentoId, campo.id, subcampoId);
      onChange();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao remover subcampo.");
    }
  }

  return (
    <div>
      <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-ink-muted">Subcampos</p>
      {erro && <p className="mb-1.5 text-xs text-crit">{erro}</p>}
      <div className="flex flex-col gap-1.5">
        {(campo.subcampos ?? []).map((s) => (
          <div key={s.id} className="flex items-center gap-2 rounded-lg bg-ink/5 px-2.5 py-1.5">
            <span className="min-w-0 flex-1 truncate text-xs text-ink">
              {s.nome} <span className="text-ink-muted">({TIPOS.find((t) => t.valor === s.tipo)?.rotulo}{s.unidade ? `, ${s.unidade}` : ""})</span>
            </span>
            <button onClick={() => removerSubcampo(s.id)} className="shrink-0 text-crit hover:text-crit/80" title="Remover subcampo">
              <Trash2 size={13} />
            </button>
          </div>
        ))}
        {(campo.subcampos ?? []).length === 0 && <p className="text-xs text-ink-muted">Nenhum subcampo — campo simples.</p>}
      </div>
      <div className="mt-1.5 flex items-center gap-1.5">
        <input
          value={novoSubcampo.nome}
          onChange={(e) => setNovoSubcampo({ ...novoSubcampo, nome: e.target.value })}
          placeholder="Nome do subcampo (ex.: Cargo)"
          className="flex-1 rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs outline-none focus:border-petrol"
        />
        <select
          value={novoSubcampo.tipo}
          onChange={(e) => setNovoSubcampo({ ...novoSubcampo, tipo: e.target.value as PortalIndicadorTipo })}
          className="rounded-lg border border-border bg-bg px-1.5 py-1.5 text-xs outline-none focus:border-petrol"
        >
          {TIPOS.map((t) => (
            <option key={t.valor} value={t.valor}>
              {t.rotulo}
            </option>
          ))}
        </select>
        <Button variant="ghost" onClick={adicionarSubcampo}>
          <Plus size={12} /> Subcampo
        </Button>
      </div>
    </div>
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
