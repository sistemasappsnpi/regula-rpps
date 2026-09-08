import { useEffect, useState } from "react";
import { api, type AdminTenant, type Nivel, type Tenant, type TenantPermissao } from "../../lib/api";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Modal, ModalTab } from "../../components/ui/Modal";
import { PermissoesEditor, type PermissaoItem } from "../../components/admin/PermissoesEditor";
import { Building2, Copy, RefreshCw, Check } from "lucide-react";

const PLANOS: Tenant["plan"][] = ["ESSENCIAL", "GESTAO", "PERFORMANCE"];
const NIVEIS_PRO_GESTAO: Nivel[] = ["I", "II", "III", "IV"];

export function AdminTenantsPage() {
  const [tenants, setTenants] = useState<AdminTenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const [form, setForm] = useState({
    tenantName: "",
    federatedEntity: "",
    seguradosCount: 0,
    plan: "ESSENCIAL" as Tenant["plan"],
    adminName: "",
    adminEmail: "",
    adminPassword: "",
  });

  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [aba, setAba] = useState<"dados" | "usuarios" | "permissoes">("dados");
  const [formEdicao, setFormEdicao] = useState({
    name: "",
    federatedEntity: "",
    cnpj: "",
    site: "",
    logoUrl: "",
    enderecoPublico: "",
    telefonePublico: "",
    emailPublico: "",
    seguradosCount: 0,
    plan: "ESSENCIAL" as Tenant["plan"],
    nivelProGestaoAlvo: "" as Nivel | "",
    observacao: "",
  });

  const editando = tenants.find((t) => t.id === editandoId) ?? null;

  const carregar = () => api.adminListTenants().then((res) => setTenants(res.tenants));

  useEffect(() => {
    carregar().finally(() => setLoading(false));
  }, []);

  async function criar() {
    setErro(null);
    setSalvando(true);
    try {
      await api.adminCreateTenant(form);
      setForm({ tenantName: "", federatedEntity: "", seguradosCount: 0, plan: "ESSENCIAL", adminName: "", adminEmail: "", adminPassword: "" });
      setMostrarForm(false);
      await carregar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao criar RPPS.");
    } finally {
      setSalvando(false);
    }
  }

  function abrirEdicao(t: AdminTenant) {
    setErro(null);
    setAba("dados");
    setEditandoId(t.id);
    setFormEdicao({
      name: t.name,
      federatedEntity: t.federatedEntity,
      cnpj: t.cnpj ?? "",
      site: t.site ?? "",
      logoUrl: t.logoUrl ?? "",
      enderecoPublico: t.enderecoPublico ?? "",
      telefonePublico: t.telefonePublico ?? "",
      emailPublico: t.emailPublico ?? "",
      seguradosCount: t.seguradosCount,
      plan: t.plan,
      nivelProGestaoAlvo: t.nivelProGestaoAlvo ?? "",
      observacao: t.observacao ?? "",
    });
  }

  async function salvarEdicao() {
    if (!editandoId) return;
    setErro(null);
    setSalvando(true);
    try {
      await api.adminUpdateTenant(editandoId, {
        name: formEdicao.name,
        federatedEntity: formEdicao.federatedEntity,
        cnpj: formEdicao.cnpj.trim() || null,
        site: formEdicao.site.trim() || null,
        logoUrl: formEdicao.logoUrl.trim() || null,
        enderecoPublico: formEdicao.enderecoPublico.trim() || null,
        telefonePublico: formEdicao.telefonePublico.trim() || null,
        emailPublico: formEdicao.emailPublico.trim() || null,
        observacao: formEdicao.observacao.trim() || null,
        seguradosCount: formEdicao.seguradosCount,
        plan: formEdicao.plan,
        nivelProGestaoAlvo: formEdicao.nivelProGestaoAlvo || null,
      });
      await carregar();
      setEditandoId(null);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao salvar alterações.");
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(t: AdminTenant) {
    const confirmado = window.confirm(
      `Excluir "${t.name}"? Isso apaga permanentemente todo o histórico de CRP, Pró-Gestão, uploads e documentos ` +
        "deste RPPS. Os usuários vinculados continuam cadastrados, só perdem o acesso a este RPPS. Esta ação não pode ser desfeita.",
    );
    if (!confirmado) return;

    setErro(null);
    try {
      await api.adminDeleteTenant(t.id);
      await carregar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao excluir RPPS.");
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">RPPS clientes</h1>
          <p className="mt-1 text-sm text-ink-muted">Todos os Regimes Próprios de Previdência Social atendidos pela plataforma.</p>
        </div>
        <Button onClick={() => setMostrarForm((v) => !v)}>{mostrarForm ? "Cancelar" : "Novo RPPS"}</Button>
      </header>

      {erro && !editando && <p className="mb-4 text-sm text-crit">{erro}</p>}

      {mostrarForm && (
        <Card className="mb-6 p-5">
          <p className="mb-3 text-sm font-medium text-ink">Cadastrar novo RPPS</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo label="Nome do RPPS" value={form.tenantName} onChange={(v) => setForm({ ...form, tenantName: v })} />
            <Campo label="Ente federativo" value={form.federatedEntity} onChange={(v) => setForm({ ...form, federatedEntity: v })} />
            <Campo
              label="Nº de segurados"
              type="number"
              value={String(form.seguradosCount)}
              onChange={(v) => setForm({ ...form, seguradosCount: Number(v) || 0 })}
            />
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-ink">Plano</span>
              <select
                className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm"
                value={form.plan}
                onChange={(e) => setForm({ ...form, plan: e.target.value as Tenant["plan"] })}
              >
                {PLANOS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <Campo label="Nome do admin do RPPS" value={form.adminName} onChange={(v) => setForm({ ...form, adminName: v })} />
            <Campo label="E-mail do admin" type="email" value={form.adminEmail} onChange={(v) => setForm({ ...form, adminEmail: v })} />
            <Campo
              label="Senha inicial"
              type="password"
              value={form.adminPassword}
              onChange={(v) => setForm({ ...form, adminPassword: v })}
            />
          </div>
          <div className="mt-4 flex justify-end">
            <Button onClick={criar} disabled={salvando}>
              {salvando ? "Salvando…" : "Criar RPPS"}
            </Button>
          </div>
        </Card>
      )}

      {loading && <p className="text-sm text-ink-muted">Carregando…</p>}

      <div className="flex flex-col gap-3">
        {tenants.map((t) => (
          <Card key={t.id} className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-mono text-xs text-ink-muted">{t.slug}</p>
                <h3 className="mt-0.5 font-medium text-ink">{t.name}</h3>
                <p className="mt-1 text-sm text-ink-muted">
                  {t.federatedEntity} · {t.seguradosCount.toLocaleString("pt-BR")} segurados
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={t.crpRegular === t.crpTotal ? "ok" : "warn"}>
                  CRP {t.crpRegular}/{t.crpTotal}
                </Badge>
                <Badge tone="neutral">{t.plan}</Badge>
                <Button variant="ghost" onClick={() => abrirEdicao(t)}>
                  Editar
                </Button>
                <button onClick={() => excluir(t)} className="text-xs font-medium text-crit hover:underline">
                  excluir
                </button>
              </div>
            </div>
            <div className="mt-3 border-t border-border pt-3">
              <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Membros</p>
              <div className="mt-1 flex flex-wrap gap-2">
                {t.membros.map((m) => (
                  <span key={m.membershipId} className="rounded-full border border-border px-2 py-0.5 text-xs text-ink-muted">
                    {m.name}
                  </span>
                ))}
                {t.membros.length === 0 && <span className="text-xs text-ink-muted">Nenhum membro.</span>}
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Modal
        open={!!editando}
        onClose={() => setEditandoId(null)}
        title="Editar Cliente"
        icon={<Building2 size={16} />}
        tabs={
          <>
            <ModalTab label="Dados Básicos" active={aba === "dados"} onClick={() => setAba("dados")} />
            <ModalTab label="Usuários" active={aba === "usuarios"} onClick={() => setAba("usuarios")} />
            <ModalTab label="Permissões" active={aba === "permissoes"} onClick={() => setAba("permissoes")} />
          </>
        }
        footer={
          aba === "dados" ? (
            <>
              <Button variant="ghost" onClick={() => setEditandoId(null)}>
                Cancelar
              </Button>
              <Button onClick={salvarEdicao} disabled={salvando}>
                {salvando ? "Salvando…" : "Salvar Alterações"}
              </Button>
            </>
          ) : undefined
        }
      >
        {editando && erro && <p className="mb-4 text-sm text-crit">{erro}</p>}

        {editando && aba === "dados" && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo label="Razão social / nome do RPPS" value={formEdicao.name} onChange={(v) => setFormEdicao({ ...formEdicao, name: v })} />
            <Campo
              label="Ente federativo"
              value={formEdicao.federatedEntity}
              onChange={(v) => setFormEdicao({ ...formEdicao, federatedEntity: v })}
            />
            <Campo label="CNPJ" value={formEdicao.cnpj} onChange={(v) => setFormEdicao({ ...formEdicao, cnpj: v })} />
            <Campo label="Site" value={formEdicao.site} onChange={(v) => setFormEdicao({ ...formEdicao, site: v })} />
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block font-medium text-ink">URL do logo</span>
              <div className="flex items-center gap-3">
                {formEdicao.logoUrl && (
                  <img
                    src={formEdicao.logoUrl}
                    alt="Prévia do logo"
                    className="h-10 w-10 shrink-0 rounded-lg border border-border object-contain"
                    onError={(e) => (e.currentTarget.style.visibility = "hidden")}
                  />
                )}
                <input
                  value={formEdicao.logoUrl}
                  onChange={(e) => setFormEdicao({ ...formEdicao, logoUrl: e.target.value })}
                  placeholder="https://…/logo.png"
                  className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-petrol"
                />
              </div>
              <span className="mt-1 block text-xs text-ink-muted">
                Mostrado no topo da sidebar deste cliente, no lugar do logo padrão da plataforma — ajuda quem loga a
                reconhecer de cara em qual instituto está.
              </span>
            </label>
            <Campo
              label="Nº de segurados"
              type="number"
              value={String(formEdicao.seguradosCount)}
              onChange={(v) => setFormEdicao({ ...formEdicao, seguradosCount: Number(v) || 0 })}
            />
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-ink">Plano</span>
              <select
                className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm"
                value={formEdicao.plan}
                onChange={(e) => setFormEdicao({ ...formEdicao, plan: e.target.value as Tenant["plan"] })}
              >
                {PLANOS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-ink">Nível do Pró-Gestão (alvo)</span>
              <select
                className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm"
                value={formEdicao.nivelProGestaoAlvo}
                onChange={(e) => setFormEdicao({ ...formEdicao, nivelProGestaoAlvo: e.target.value as Nivel | "" })}
              >
                <option value="">Não definido</option>
                {NIVEIS_PRO_GESTAO.map((n) => (
                  <option key={n} value={n}>
                    Nível {n}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-ink-muted">
                Decide quais campos/documentos aparecem na aba "Documentos" deste RPPS.
              </span>
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block font-medium text-ink">Observação</span>
              <textarea
                rows={3}
                value={formEdicao.observacao}
                onChange={(e) => setFormEdicao({ ...formEdicao, observacao: e.target.value })}
                className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-petrol"
              />
            </label>

            <div className="sm:col-span-2">
              <p className="mb-1 mt-2 text-sm font-medium text-ink">Contato público (rodapé do Portal de Transparência)</p>
              <p className="mb-3 text-xs text-ink-muted">
                Aparece no rodapé das páginas públicas deste RPPS (transparência e documentos personalizados). Deixe
                em branco o que este RPPS ainda não tiver.
              </p>
            </div>
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block font-medium text-ink">Endereço</span>
              <input
                value={formEdicao.enderecoPublico}
                onChange={(e) => setFormEdicao({ ...formEdicao, enderecoPublico: e.target.value })}
                className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-petrol"
              />
            </label>
            <Campo
              label="Telefone público"
              value={formEdicao.telefonePublico}
              onChange={(v) => setFormEdicao({ ...formEdicao, telefonePublico: v })}
            />
            <Campo
              label="E-mail público"
              type="email"
              value={formEdicao.emailPublico}
              onChange={(v) => setFormEdicao({ ...formEdicao, emailPublico: v })}
            />
          </div>
        )}

        {editando && aba === "usuarios" && (
          <AbaUsuarios tenant={editando} onChange={carregar} onErro={setErro} />
        )}

        {editando && aba === "permissoes" && <AbaPermissoes tenantId={editando.id} />}
      </Modal>
    </div>
  );
}

function AbaUsuarios({
  tenant,
  onChange,
  onErro,
}: {
  tenant: AdminTenant;
  onChange: () => Promise<void>;
  onErro: (msg: string | null) => void;
}) {
  const [link, setLink] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [regenerando, setRegenerando] = useState(false);

  const [mostrarNovoForm, setMostrarNovoForm] = useState(false);
  const [novoForm, setNovoForm] = useState({ name: "", email: "", telefone: "", password: "" });
  const [salvandoNovo, setSalvandoNovo] = useState(false);

  const [editandoMembershipId, setEditandoMembershipId] = useState<string | null>(null);
  const [formEdicaoMembro, setFormEdicaoMembro] = useState({ name: "", email: "", telefone: "", cpf: "", ativo: true, password: "" });
  const [salvandoMembro, setSalvandoMembro] = useState(false);

  useEffect(() => {
    setLink(null);
    api
      .adminGetPrimeiroAcessoLink(tenant.id)
      .then((res) => setLink(`${window.location.origin}/primeiro-acesso/${res.token}`))
      .catch(() => {});
  }, [tenant.id]);

  function copiarLink() {
    if (!link) return;
    navigator.clipboard.writeText(link).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    });
  }

  async function regenerarLink() {
    setRegenerando(true);
    onErro(null);
    try {
      const res = await api.adminRegenerarPrimeiroAcessoLink(tenant.id);
      setLink(`${window.location.origin}/primeiro-acesso/${res.token}`);
    } catch (err) {
      onErro(err instanceof Error ? err.message : "Erro ao gerar novo link.");
    } finally {
      setRegenerando(false);
    }
  }

  async function criarUsuario() {
    onErro(null);
    setSalvandoNovo(true);
    try {
      await api.adminCreateMembership({
        tenantId: tenant.id,
        name: novoForm.name,
        email: novoForm.email,
        telefone: novoForm.telefone || undefined,
        password: novoForm.password || undefined,
      });
      setNovoForm({ name: "", email: "", telefone: "", password: "" });
      setMostrarNovoForm(false);
      await onChange();
    } catch (err) {
      onErro(err instanceof Error ? err.message : "Erro ao adicionar usuário.");
    } finally {
      setSalvandoNovo(false);
    }
  }

  function iniciarEdicaoMembro(m: AdminTenant["membros"][number]) {
    onErro(null);
    setEditandoMembershipId(m.membershipId);
    setFormEdicaoMembro({ name: m.name, email: m.email, telefone: m.telefone ?? "", cpf: "", ativo: m.ativo, password: "" });
  }

  async function salvarEdicaoMembro(m: AdminTenant["membros"][number]) {
    onErro(null);
    setSalvandoMembro(true);
    try {
      const patch: { name?: string; email?: string; password?: string; telefone?: string | null; cpf?: string | null; ativo?: boolean } = {
        name: formEdicaoMembro.name,
        email: formEdicaoMembro.email,
        telefone: formEdicaoMembro.telefone.trim() || null,
        ativo: formEdicaoMembro.ativo,
      };
      if (formEdicaoMembro.cpf.trim()) patch.cpf = formEdicaoMembro.cpf.trim();
      if (formEdicaoMembro.password) patch.password = formEdicaoMembro.password;
      await api.adminUpdateUsuario(m.userId, patch);
      setEditandoMembershipId(null);
      await onChange();
    } catch (err) {
      onErro(err instanceof Error ? err.message : "Erro ao salvar usuário.");
    } finally {
      setSalvandoMembro(false);
    }
  }

  async function removerVinculo(m: AdminTenant["membros"][number]) {
    const confirmado = window.confirm(`Remover "${m.name}" deste RPPS? O usuário continua cadastrado na plataforma.`);
    if (!confirmado) return;

    onErro(null);
    try {
      await api.adminRemoveMembership(m.membershipId);
      await onChange();
    } catch (err) {
      onErro(err instanceof Error ? err.message : "Erro ao remover vínculo.");
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-xl border border-border bg-bg p-4">
        <p className="flex items-center gap-1.5 text-sm font-medium text-ink">🔗 Link de primeiro acesso</p>
        <p className="mt-1 text-xs text-ink-muted">
          Mande este link para o cliente. Qualquer usuário já cadastrado abaixo com o e-mail dele consegue completar o
          próprio cadastro (telefone + senha) por lá.
        </p>
        <div className="mt-3 flex gap-2">
          <input
            readOnly
            value={link ?? "Gerando…"}
            className="flex-1 truncate rounded-lg border border-border bg-surface px-3 py-2 text-xs text-ink-muted"
          />
          <Button variant="ghost" onClick={copiarLink} disabled={!link} title="Copiar link">
            {copiado ? <Check size={15} /> : <Copy size={15} />}
          </Button>
          <Button variant="ghost" onClick={regenerarLink} disabled={regenerando}>
            <RefreshCw size={15} className={regenerando ? "animate-spin" : ""} /> Gerar novo link
          </Button>
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-medium text-ink">Usuários vinculados</p>
          <Button onClick={() => setMostrarNovoForm((v) => !v)}>{mostrarNovoForm ? "Cancelar" : "+ Novo Usuário"}</Button>
        </div>

        {mostrarNovoForm && (
          <Card className="mb-3 p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Campo label="Nome" value={novoForm.name} onChange={(v) => setNovoForm({ ...novoForm, name: v })} />
              <Campo label="E-mail" type="email" value={novoForm.email} onChange={(v) => setNovoForm({ ...novoForm, email: v })} />
              <Campo label="Telefone" value={novoForm.telefone} onChange={(v) => setNovoForm({ ...novoForm, telefone: v })} />
              <Campo
                label="Senha provisória (opcional)"
                type="password"
                value={novoForm.password}
                onChange={(v) => setNovoForm({ ...novoForm, password: v })}
              />
            </div>
            <p className="mt-2 text-xs text-ink-muted">
              Sem senha provisória, o usuário completa o próprio cadastro pelo link de primeiro acesso acima.
            </p>
            <div className="mt-3 flex justify-end">
              <Button onClick={criarUsuario} disabled={salvandoNovo}>
                {salvandoNovo ? "Salvando…" : "Salvar Usuário"}
              </Button>
            </div>
          </Card>
        )}

        <div className="flex flex-col gap-2">
          {tenant.membros.map((m) =>
            editandoMembershipId === m.membershipId ? (
              <Card key={m.membershipId} className="p-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Campo label="Nome" value={formEdicaoMembro.name} onChange={(v) => setFormEdicaoMembro({ ...formEdicaoMembro, name: v })} />
                  <Campo
                    label="E-mail"
                    type="email"
                    value={formEdicaoMembro.email}
                    onChange={(v) => setFormEdicaoMembro({ ...formEdicaoMembro, email: v })}
                  />
                  <Campo
                    label="Telefone"
                    value={formEdicaoMembro.telefone}
                    onChange={(v) => setFormEdicaoMembro({ ...formEdicaoMembro, telefone: v })}
                  />
                  <Campo label="CPF" value={formEdicaoMembro.cpf} onChange={(v) => setFormEdicaoMembro({ ...formEdicaoMembro, cpf: v })} />
                  <Campo
                    label="Nova senha (opcional)"
                    type="password"
                    value={formEdicaoMembro.password}
                    onChange={(v) => setFormEdicaoMembro({ ...formEdicaoMembro, password: v })}
                  />
                  <label className="flex items-center gap-2 pt-6 text-sm text-ink">
                    <input
                      type="checkbox"
                      checked={formEdicaoMembro.ativo}
                      onChange={(e) => setFormEdicaoMembro({ ...formEdicaoMembro, ativo: e.target.checked })}
                    />
                    Usuário ativo
                  </label>
                </div>
                <div className="mt-3 flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setEditandoMembershipId(null)}>
                    Cancelar
                  </Button>
                  <Button onClick={() => salvarEdicaoMembro(m)} disabled={salvandoMembro}>
                    {salvandoMembro ? "Salvando…" : "Salvar"}
                  </Button>
                </div>
              </Card>
            ) : (
              <div key={m.membershipId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3">
                <div>
                  <p className="text-sm font-medium text-ink">{m.name}</p>
                  <p className="text-xs text-ink-muted">
                    {m.email}
                    {m.telefone ? ` · ${m.telefone}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge tone={m.ativo ? "ok" : "neutral"}>{m.ativo ? "Ativo" : "Inativo"}</Badge>
                  <span className="text-xs text-ink-muted">
                    {m.lastLoginAt ? new Date(m.lastLoginAt).toLocaleString("pt-BR") : "Nunca acessou"}
                  </span>
                  <Button variant="ghost" onClick={() => iniciarEdicaoMembro(m)}>
                    Editar
                  </Button>
                  <button onClick={() => removerVinculo(m)} className="text-xs font-medium text-crit hover:underline">
                    remover
                  </button>
                </div>
              </div>
            ),
          )}
          {tenant.membros.length === 0 && <p className="text-sm text-ink-muted">Nenhum usuário vinculado ainda.</p>}
        </div>
      </div>
    </div>
  );
}

function paraItemPermissao(p: TenantPermissao): PermissaoItem {
  return {
    key: p.key,
    nome: p.nome,
    descricao: p.descricao,
    grupo: p.grupo,
    heranca: p.padraoDoPlano,
    legendaHeranca: `Padrão do plano: ${p.padraoDoPlano ? "ativo" : "inativo"}`,
    override: p.override,
    efetivo: p.efetivo,
  };
}

function AbaPermissoes({ tenantId }: { tenantId: string }) {
  const [permissoes, setPermissoes] = useState<PermissaoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [erroLocal, setErroLocal] = useState<string | null>(null);

  const carregar = () =>
    api.adminGetTenantPermissoes(tenantId).then((res) => setPermissoes(res.permissoes.map(paraItemPermissao)));

  useEffect(() => {
    setLoading(true);
    carregar().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  async function alternar(featureKey: string, efetivoAtual: boolean) {
    setErroLocal(null);
    try {
      const res = await api.adminSetTenantPermissao(tenantId, featureKey, !efetivoAtual);
      setPermissoes(res.permissoes.map(paraItemPermissao));
    } catch (err) {
      setErroLocal(err instanceof Error ? err.message : "Erro ao alterar permissão.");
    }
  }

  async function restaurarPadrao(featureKey: string) {
    setErroLocal(null);
    try {
      const res = await api.adminSetTenantPermissao(tenantId, featureKey, null);
      setPermissoes(res.permissoes.map(paraItemPermissao));
    } catch (err) {
      setErroLocal(err instanceof Error ? err.message : "Erro ao restaurar o padrão do plano.");
    }
  }

  if (loading) return <p className="text-sm text-ink-muted">Carregando…</p>;

  return (
    <div className="flex flex-col gap-3">
      {erroLocal && <p className="text-sm text-crit">{erroLocal}</p>}
      <PermissoesEditor
        permissoes={permissoes}
        onToggle={alternar}
        onRestaurar={restaurarPadrao}
        introducao="O padrão vem do plano contratado, mas cada aba e cada funcionalidade abaixo pode ser ligada ou desligada só para este RPPS — o plano nunca trava o que este cliente específico pode acessar."
      />
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
