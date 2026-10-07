import type { CSSProperties } from "react";
import { contrasteBranco, mix } from "../../lib/transparencia-gerador";

// Pré-visualização lateral (mock estático) — as cores são derivadas exatamente como no modelo.
export function PreviewMock({
  nome,
  nomeCompleto,
  logoUrl,
  menuItens,
  titulo,
  grupos,
  infoRodape,
  primaria,
  destaque,
  rodape,
}: {
  nome: string;
  nomeCompleto: string;
  logoUrl: string;
  menuItens: string[] | null;
  titulo: string;
  grupos: string[];
  infoRodape: string;
  primaria: string;
  destaque: string;
  rodape: string;
}) {
  const nav = menuItens && menuItens.length ? menuItens : ["Início", "Institucional", "Transparência", "Contato"];
  const lateral = grupos.length ? grupos.slice(0, 7) : ["Informações Institucionais", "Receita", "Despesa", "Licitações", "Contratos"];
  const nomeMostrado = nome || "Nome do cliente";
  const c = contrasteBranco(primaria);
  const vars = {
    "--p": primaria,
    "--p-dark": mix(primaria, -0.32),
    "--p-soft": mix(primaria, 0.86),
    "--side": mix(primaria, 0.92),
    "--side-item": mix(primaria, 0.86),
    "--a": destaque,
    "--a-strong": mix(destaque, -0.44),
    "--foot": rodape,
  } as CSSProperties;

  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">Pré-visualização</h3>
      <div
        aria-hidden="true"
        style={{ ...vars, fontSize: 11, background: "#f4f6f9", color: "#33425c" }}
        className="overflow-hidden rounded-xl border border-border shadow-soft"
      >
        <div className="flex min-h-[52px] items-center border-b px-3.5 py-2.5" style={{ background: "#fff", borderColor: "#dde3ec" }}>
          {logoUrl ? (
            <img src={logoUrl} alt="" style={{ height: 36, maxWidth: 200, objectFit: "contain" }} />
          ) : (
            <span style={{ fontWeight: 700, fontSize: 15, color: "var(--p)" }}>{nomeMostrado}</span>
          )}
        </div>
        <div className="flex gap-0.5 overflow-hidden px-2.5 py-1.5" style={{ background: "var(--p)" }}>
          {nav.slice(0, 7).map((n, i) => (
            <span
              key={`${n}-${i}`}
              style={{
                color: "#fff",
                fontWeight: 600,
                textTransform: "uppercase",
                fontSize: 8.5,
                padding: "5px 7px",
                borderRadius: 4,
                whiteSpace: "nowrap",
                background: /transparen/i.test(n) ? "var(--p-dark)" : undefined,
              }}
            >
              {n}
            </span>
          ))}
        </div>
        <div style={{ margin: 10, background: "var(--p-soft)", borderRadius: 8, padding: 12, textAlign: "center" }}>
          <b style={{ fontSize: 13, display: "block", marginBottom: 6 }}>{titulo || "Acesso à Informação"}</b>
          <div className="flex justify-center gap-1">
            <i style={{ display: "block", background: "#fff", border: "1px solid #c7cfdc", borderRadius: 4, height: 18, flex: "0 1 180px" }} />
            <em style={{ display: "block", background: "var(--p)", borderRadius: 4, height: 18, width: 44 }} />
          </div>
        </div>
        <div className="grid gap-2 px-2.5 pb-2.5" style={{ gridTemplateColumns: "110px 1fr" }}>
          <div className="flex flex-col gap-[3px] rounded-lg p-[5px]" style={{ background: "var(--side)" }}>
            {lateral.map((g, i) => (
              <span
                key={`${g}-${i}`}
                style={{
                  background: i ? "var(--side-item)" : "#fff",
                  color: i ? "#33425c" : "var(--p)",
                  fontWeight: i ? 400 : 700,
                  borderRadius: 5,
                  padding: "5px 6px",
                  fontSize: 8.5,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  borderLeft: `3px solid ${i ? "transparent" : "var(--a)"}`,
                }}
              >
                {g}
              </span>
            ))}
          </div>
          <div>
            <h4 style={{ margin: "0 0 2px", fontSize: 12, fontWeight: 700 }}>{lateral[0]}</h4>
            <small style={{ color: "var(--a-strong)", fontWeight: 600, fontSize: 8 }}>Lei Nº 12.527/2011</small>
            <div className="mt-1.5 grid grid-cols-2 gap-[5px]">
              {["Estrutura", "Competências", "Contatos", "Atos normativos"].map((t) => (
                <div
                  key={t}
                  style={{ background: "#fff", border: "1px solid #dde3ec", borderRadius: 6, padding: "7px 5px", textAlign: "center", fontSize: 8, fontWeight: 600 }}
                >
                  <i style={{ display: "block", width: 16, height: 16, borderRadius: "50%", background: "var(--p-soft)", margin: "0 auto 4px" }} />
                  {t}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div style={{ background: "var(--foot)", color: "#e6e6e6", padding: "10px 14px", fontSize: 8.5, lineHeight: 1.5 }}>
          <b style={{ color: "#fff", display: "block", fontSize: 9.5 }}>
            {nomeCompleto && nomeCompleto !== nomeMostrado ? `${nomeMostrado} - ${nomeCompleto}` : nomeMostrado}
          </b>
          <span>{infoRodape || "CNPJ · Endereço · Telefone · E-mail"}</span>
        </div>
      </div>
      <p className="mt-2 text-xs text-ink-muted">
        Contraste do texto branco no menu:{" "}
        <b className={c >= 4.5 ? "text-ok" : "text-crit"}>{c.toFixed(1)}:1</b>{" "}
        {c >= 4.5 ? "(bom para leitura)" : "(baixo: escolha uma cor mais escura)"}
      </p>
    </div>
  );
}
