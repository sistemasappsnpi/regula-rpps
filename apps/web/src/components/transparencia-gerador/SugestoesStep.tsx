import { useMemo, useState } from "react";
import { chave, type Catalogo, type ItemExtra, type SugestaoItem } from "../../lib/transparencia-gerador";
import { Check, INPUT, Status } from "./ui";

export function chaveSug(s: SugestaoItem): string {
  return chave(`${s.criterio}|${s.rotulo}`);
}

const CLASSIF: Record<string, string> = { essencial: "essencial", obrigatoria: "obrigatória", recomendada: "recomendada" };

function Tag({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <span title={title} className="whitespace-nowrap rounded bg-ink-muted/10 px-1.5 py-0.5 text-[11px] font-bold text-ink-muted">
      {children}
    </span>
  );
}

function Pill({ tom, children }: { tom: "ok" | "warn"; children: React.ReactNode }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${tom === "ok" ? "bg-ok/10 text-ok" : "bg-warn/10 text-warn"}`}>
      {children}
    </span>
  );
}

// Cada sugestão marcada vira um item extra no config (itensExtras), exibido no portal junto com os da API.
export function SugestoesStep({
  catalogos,
  gruposDoPortal,
  extras,
  onExtras,
}: {
  catalogos: Catalogo[];
  gruposDoPortal: string[];
  extras: Record<string, ItemExtra>;
  onExtras: (e: Record<string, ItemExtra>) => void;
}) {
  const [ativoId, setAtivoId] = useState<string | null>(null);
  const [soFalta, setSoFalta] = useState(true);
  const [soObrig, setSoObrig] = useState(false);
  const [outras, setOutras] = useState(false);
  const [busca, setBusca] = useState("");

  const cat = catalogos.find((c) => c.id === (ativoId ?? catalogos[0]?.id)) ?? null;
  const doPortal = useMemo(() => new Set(gruposDoPortal.map(chave)), [gruposDoPortal]);

  if (!catalogos.length || !cat) {
    return (
      <div className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-ink-muted">
        Teste a API da Transparência (passo 1) para comparar com as exigências.
      </div>
    );
  }

  const termo = chave(busca);
  const forasteiras: Record<string, number> = {};
  const itens = cat.itens.filter((s) => {
    const k = chaveSug(s);
    if (soFalta && s.atendido && !extras[k]) return false;
    if (soObrig && s.classificacao !== "obrigatoria" && s.classificacao !== "essencial" && !extras[k]) return false;
    if (!doPortal.has(chave(s.grupo)) && !extras[k]) {
      forasteiras[s.grupo] = (forasteiras[s.grupo] ?? 0) + 1;
      if (!outras) return false;
    }
    if (termo && !chave(`${s.rotulo} ${s.exigencia} ${s.grupo}`).includes(termo)) return false;
    return true;
  });

  const nomesFora = Object.keys(forasteiras);
  const qtdFora = nomesFora.reduce((t, n) => t + forasteiras[n], 0);
  const listaExtras = Object.entries(extras);

  function marcar(s: SugestaoItem, on: boolean) {
    const k = chaveSug(s);
    const prox = { ...extras };
    if (on) {
      prox[k] = {
        Ref: k,
        Grupo: s.grupo,
        Descricao: s.rotulo,
        Link: "",
        MaisInformacoes: s.descricao || "",
        NomeImagem: s.icone || "",
        Amparo: `${cat!.sigla} ${s.criterio}`,
        Fonte: `${cat!.sigla} ${s.criterio}`,
      };
    } else delete prox[k];
    onExtras(prox);
  }

  function editar(k: string, patch: Partial<ItemExtra>) {
    if (!extras[k]) return;
    onExtras({ ...extras, [k]: { ...extras[k], ...patch } });
  }

  let grupoAtual: string | null = null;

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        {catalogos.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setAtivoId(c.id)}
            className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold ${
              c.id === cat.id ? "border-petrol bg-petrol text-on-petrol" : "border-border bg-surface text-ink hover:border-petrol"
            }`}
          >
            {c.sigla} <small className="font-normal opacity-80">{c.atendidos} de {c.total} já no portal</small>
          </button>
        ))}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border pb-3">
        <Check checked={soFalta} onChange={setSoFalta}>Só o que está faltando</Check>
        <Check checked={soObrig} onChange={setSoObrig}>Só obrigatórias/essenciais</Check>
        <Check checked={outras} onChange={setOutras}>Incluir categorias que o portal não tem</Check>
        <input
          type="search"
          className={`${INPUT} max-w-[230px]`}
          placeholder="Filtrar por palavra..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </div>

      {listaExtras.length > 0 && (
        <>
          <div className="mb-1.5 mt-2 text-xs font-bold uppercase tracking-wide text-ink-muted">
            Botões acrescentados por você ({listaExtras.length})
          </div>
          {listaExtras.map(([k, e]) => (
            <div key={k} className="mb-1.5 flex gap-2.5 rounded-xl border border-petrol bg-petrol/5 p-2.5">
              <input
                type="checkbox"
                checked
                className="mt-1 h-4 w-4 accent-[rgb(var(--color-petrol))]"
                aria-label={`Remover ${e.Descricao}`}
                onChange={() => {
                  const prox = { ...extras };
                  delete prox[k];
                  onExtras(prox);
                }}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-1.5">
                  <b className="text-sm">{e.Descricao}</b>
                  <Tag>{e.Grupo}</Tag>
                  {e.Fonte && <Tag>{e.Fonte}</Tag>}
                  {!e.Link && <Pill tom="warn">sem link</Pill>}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <input type="text" className={`${INPUT} flex-[1_1_200px]`} value={e.Descricao} onChange={(ev) => editar(k, { Descricao: ev.target.value })} />
                  <input
                    type="url"
                    className={`${INPUT} flex-[2_1_260px] ${e.Link ? "" : "!border-crit"}`}
                    value={e.Link}
                    placeholder="Link para onde o botão leva"
                    onChange={(ev) => editar(k, { Link: ev.target.value.trim() })}
                  />
                </div>
              </div>
            </div>
          ))}
        </>
      )}

      {!outras && nomesFora.length > 0 && (
        <Status tipo="load">
          {qtdFora} sugestões escondidas, de categorias que este portal não tem: {nomesFora.slice(0, 6).join(", ")}
          {nomesFora.length > 6 ? "…" : ""}. Marque “Incluir categorias que o portal não tem” para vê-las.
        </Status>
      )}

      {!itens.length && (
        <div className="mt-2 rounded-xl border border-dashed border-border p-4 text-center text-sm text-ink-muted">
          Nada mais a mostrar com esses filtros.
        </div>
      )}

      {itens.map((s) => {
        const k = chaveSug(s);
        const sel = extras[k];
        const cabecalho = s.grupo !== grupoAtual;
        grupoAtual = s.grupo;
        const opcoes = gruposDoPortal.slice();
        if (!doPortal.has(chave(s.grupo))) opcoes.unshift(s.grupo);
        const escolhido = sel ? sel.Grupo : s.grupo;
        if (!opcoes.some((c) => chave(c) === chave(escolhido))) opcoes.unshift(escolhido);
        const classif = CLASSIF[s.classificacao] ?? "";
        return (
          <div key={k}>
            {cabecalho && (
              <div className="mb-1.5 mt-4 text-xs font-bold uppercase tracking-wide text-ink-muted">
                {s.grupo}
                {doPortal.has(chave(s.grupo)) ? "" : " — categoria nova"}
              </div>
            )}
            <div
              className={`mb-1.5 flex gap-2.5 rounded-xl border p-2.5 ${sel ? "border-petrol bg-petrol/5" : "border-border"} ${
                s.atendido && !sel ? "bg-bg" : ""
              }`}
            >
              <input
                type="checkbox"
                checked={!!sel}
                className="mt-1 h-4 w-4 accent-[rgb(var(--color-petrol))]"
                aria-label={`Acrescentar ${s.rotulo}`}
                onChange={(e) => marcar(s, e.target.checked)}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-1.5">
                  <b className="text-sm">{s.rotulo}</b>
                  <Tag title={s.fundamentacao}>{`${cat.sigla} ${s.criterio}`}</Tag>
                  {classif && <Pill tom={classif === "recomendada" ? "warn" : "ok"}>{classif}</Pill>}
                  {s.atendido ? (
                    <Pill tom="ok">no portal: {s.parecido}</Pill>
                  ) : (
                    s.parecido && <Pill tom="warn">parecido: {s.parecido}</Pill>
                  )}
                </div>
                {s.exigencia && (
                  <div className="mt-0.5 line-clamp-2 text-xs text-ink-muted" title={s.exigencia}>
                    {s.exigencia}
                  </div>
                )}
                {sel && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <input
                      type="text"
                      className={`${INPUT} flex-[1_1_200px]`}
                      value={sel.Descricao}
                      placeholder="Nome do botão"
                      onChange={(e) => editar(k, { Descricao: e.target.value })}
                    />
                    <select className={`${INPUT} flex-[1_1_180px]`} value={sel.Grupo} onChange={(e) => editar(k, { Grupo: e.target.value })}>
                      {opcoes.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                    <input
                      type="url"
                      autoFocus={!sel.Link && sel.Descricao === s.rotulo}
                      className={`${INPUT} flex-[2_1_260px] ${sel.Link ? "" : "!border-crit"}`}
                      value={sel.Link}
                      placeholder="Link para onde o botão leva (obrigatório)"
                      onChange={(e) => editar(k, { Link: e.target.value.trim() })}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
