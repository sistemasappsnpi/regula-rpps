import { useEffect, useState } from "react";
import { api, type AdminUsuario, type UserPermissao } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { PermissoesEditor, type PermissaoItem } from "../../components/admin/PermissoesEditor";

// Cadastro exclusivo das contas Super Admin (acesso ao painel Admin Global) — usuários de cada
// RPPS são geridos em RPPS clientes → editar → Usuários, escopados ao próprio cliente.
export function AdminUsuariosPage() {
  const { user: usuarioLogado } = useAuth();
  const [usuarios, setUsuarios] = useState<AdminUsuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const [mostrarNovoForm, setMostrarNovoForm] = useState(false);
  const [formSuperAdmin, setFormSuperAdmin] = useState({ name: "", email: "", password: "" });

  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [formEdicao, setFormEdicao] = useState({ name: "", email: "", telefone: "", cpf: "", ativo: true, password: "" });

  const [permissoesAbertoId, setPermissoesAbertoId] = useState<string | null>(null);

  const carregar = () => api.adminListUsuarios().then((res) => setUsuarios(res.usuarios.filter((u) => u.isSuperAdmin)));

  useEffect(() => {
    carregar().finally(() => setLoading(false));
  }, []);

  async function criarSuperAdmin() {
    setErro(null);
    try {
      await api.adminCreateSuperAdmin(formSuperAdmin);
      setFormSuperAdmin({ name: "", email: "", password: "" });
      setMostrarNovoForm(false);
      await carregar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao criar Super Admin.");
    }
  }

  async function removerSuperAdmin(userId: string) {
    setErro(null);
    try {
      await api.adminSetSuperAdmin(userId, false);
      await carregar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao remover acesso de Super Admin.");
    }
  }

  function iniciarEdicao(u: AdminUsuario) {
    setErro(null);
    setEditandoId(u.id);
    setFormEdicao({ name: u.name, email: u.email, telefone: u.telefone ?? "", cpf: u.cpf ?? "", ativo: u.ativo, password: "" });
  }

  async function salvarEdicao(id: string) {
    setErro(null);
    setSalvando(true);
    try {
      const patch: {
        name?: string;
        email?: string;
        password?: string;
        telefone?: string | null;
        cpf?: string | null;
        ativo?: boolean;
      } = {
        name: formEdicao.name,
        email: formEdicao.email,
        telefone: formEdicao.telefone.trim() || null,
        cpf: formEdicao.cpf.trim() || null,
        ativo: formEdicao.ativo,
      };
      if (formEdicao.password) patch.password = formEdicao.password;
      await api.adminUpdateUsuario(id, patch);
      setEditandoId(null);
      await carregar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao salvar alterações.");
    } finally {
      setSalvando(false);
    }
  }

  async function excluirUsuario(u: AdminUsuario) {
    const confirmado = window.confirm(`Excluir "${u.name}" (${u.email})? Esta ação não pode ser desfeita.`);
    if (!confirmado) return;

    setErro(null);
    try {
      await api.adminDeleteUsuario(u.id);
      await carregar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao excluir usuário.");
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Usuários</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Contas com acesso ao painel Admin Global. Usuários de cada RPPS ficam em RPPS clientes → editar →
            Usuários.
          </p>
        </div>
        <Button onClick={() => setMostrarNovoForm((v) => !v)}>{mostrarNovoForm ? "Cancelar" : "Novo Super Admin"}</Button>
      </header>

      {erro && <p className="mb-4 text-sm text-crit">{erro}</p>}

      {mostrarNovoForm && (
        <Card className="mb-6 p-5">
          <p className="mb-3 text-sm font-medium text-ink">Novo Super Admin da plataforma</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Campo label="Nome" value={formSuperAdmin.name} onChange={(v) => setFormSuperAdmin({ ...formSuperAdmin, name: v })} />
            <Campo
              label="E-mail"
              type="email"
              value={formSuperAdmin.email}
              onChange={(v) => setFormSuperAdmin({ ...formSuperAdmin, email: v })}
            />
            <Campo
              label="Senha"
              type="password"
              value={formSuperAdmin.password}
              onChange={(v) => setFormSuperAdmin({ ...formSuperAdmin, password: v })}
            />
          </div>
          <div className="mt-4 flex justify-end">
            <Button onClick={criarSuperAdmin}>Criar Super Admin</Button>
          </div>
        </Card>
      )}

      {loading && <p className="text-sm text-ink-muted">Carregando…</p>}

      <div className="flex flex-col gap-3">
        {usuarios.map((u) =>
          editandoId === u.id ? (
            <Card key={u.id} className="p-5">
              <p className="mb-3 text-sm font-medium text-ink">Editando {u.name}</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Campo label="Nome" value={formEdicao.name} onChange={(v) => setFormEdicao({ ...formEdicao, name: v })} />
                <Campo
                  label="E-mail"
                  type="email"
                  value={formEdicao.email}
                  onChange={(v) => setFormEdicao({ ...formEdicao, email: v })}
                />
                <Campo
                  label="Telefone"
                  value={formEdicao.telefone}
                  onChange={(v) => setFormEdicao({ ...formEdicao, telefone: v })}
                />
                <Campo label="CPF" value={formEdicao.cpf} onChange={(v) => setFormEdicao({ ...formEdicao, cpf: v })} />
                <Campo
                  label="Nova senha (opcional)"
                  type="password"
                  value={formEdicao.password}
                  onChange={(v) => setFormEdicao({ ...formEdicao, password: v })}
                />
                <label className="flex items-center gap-2 pt-6 text-sm text-ink">
                  <input
                    type="checkbox"
                    checked={formEdicao.ativo}
                    onChange={(e) => setFormEdicao({ ...formEdicao, ativo: e.target.checked })}
                  />
                  Usuário ativo
                </label>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setEditandoId(null)}>
                  Cancelar
                </Button>
                <Button onClick={() => salvarEdicao(u.id)} disabled={salvando}>
                  {salvando ? "Salvando…" : "Salvar"}
                </Button>
              </div>
            </Card>
          ) : (
            <Card key={u.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-medium text-ink">{u.name}</h3>
                  <p className="text-sm text-ink-muted">
                    {u.email}
                    {u.telefone ? ` · ${u.telefone}` : ""}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    {u.lastLoginAt ? `Último acesso: ${new Date(u.lastLoginAt).toLocaleString("pt-BR")}` : "Nunca acessou"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={u.ativo ? "ok" : "neutral"}>{u.ativo ? "Ativo" : "Inativo"}</Badge>
                  <Button
                    variant="ghost"
                    onClick={() => setPermissoesAbertoId(permissoesAbertoId === u.id ? null : u.id)}
                  >
                    Permissões
                  </Button>
                  <Button variant="ghost" onClick={() => iniciarEdicao(u)}>
                    Editar
                  </Button>
                  <button
                    onClick={() => removerSuperAdmin(u.id)}
                    disabled={u.id === usuarioLogado?.id}
                    className="text-xs font-medium text-ink-muted hover:underline disabled:cursor-not-allowed disabled:opacity-40"
                    title={u.id === usuarioLogado?.id ? "Você não pode remover seu próprio acesso." : undefined}
                  >
                    remover Super Admin
                  </button>
                  <button
                    onClick={() => excluirUsuario(u)}
                    disabled={u.id === usuarioLogado?.id}
                    className="text-xs font-medium text-crit hover:underline disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:no-underline"
                    title={u.id === usuarioLogado?.id ? "Você não pode excluir seu próprio usuário." : undefined}
                  >
                    excluir
                  </button>
                </div>
              </div>

              {permissoesAbertoId === u.id && (
                <div className="mt-4 border-t border-border pt-4">
                  <PermissoesDoUsuario userId={u.id} />
                </div>
              )}
            </Card>
          ),
        )}
        {!loading && usuarios.length === 0 && <p className="text-sm text-ink-muted">Nenhum Super Admin cadastrado ainda.</p>}
      </div>
    </div>
  );
}

function paraItemPermissao(p: UserPermissao): PermissaoItem {
  return {
    key: p.key,
    nome: p.nome,
    descricao: p.descricao,
    grupo: p.grupo,
    heranca: p.herdado,
    legendaHeranca: p.herdado ? "Liberado por padrão" : "Bloqueado por padrão",
    override: p.override,
    efetivo: p.efetivo,
  };
}

function PermissoesDoUsuario({ userId }: { userId: string }) {
  const [permissoes, setPermissoes] = useState<PermissaoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [erroLocal, setErroLocal] = useState<string | null>(null);

  const carregar = () => api.adminGetUserPermissoes(userId).then((res) => setPermissoes(res.permissoes.map(paraItemPermissao)));

  useEffect(() => {
    setLoading(true);
    carregar().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function alternar(featureKey: string, efetivoAtual: boolean) {
    setErroLocal(null);
    try {
      const res = await api.adminSetUserPermissao(userId, featureKey, !efetivoAtual);
      setPermissoes(res.permissoes.map(paraItemPermissao));
    } catch (err) {
      setErroLocal(err instanceof Error ? err.message : "Erro ao alterar permissão.");
    }
  }

  async function restaurarPadrao(featureKey: string) {
    setErroLocal(null);
    try {
      const res = await api.adminSetUserPermissao(userId, featureKey, null);
      setPermissoes(res.permissoes.map(paraItemPermissao));
    } catch (err) {
      setErroLocal(err instanceof Error ? err.message : "Erro ao restaurar o padrão.");
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
        introducao="Por padrão todo Super Admin enxerga todas as seções do Admin Global. Desligue aqui o que esta conta específica não deve acessar."
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
