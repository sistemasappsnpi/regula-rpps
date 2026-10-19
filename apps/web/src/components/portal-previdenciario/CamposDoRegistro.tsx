import { ExternalLink } from "lucide-react";
import type { RegistroTransparenciaApi } from "../../lib/api";
import { formatarDataIso, formatarMoeda, lerValor, rotuloDoCampo, textoPuro } from "../../lib/textos";

// Painel "todos os campos" de um registro: tudo o que a API entrega, na ordem em que veio, com cada valor
// formatado conforme o que é (data, valor em reais, link, imagem, HTML). Campo vazio aparece como "—": a
// intenção é a pessoa conferir o dado completo, sem nada escondido.

const EXT_IMAGEM = /\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i;

function ehUrl(v: string): boolean {
  return /^(https?:\/\/|\/api\/)/i.test(v.trim());
}

function Valor({ campo, valor }: { campo: string; valor: unknown }) {
  if (valor === null || valor === undefined) return <span className="text-ink-muted">—</span>;
  const texto = String(valor).trim();
  if (!texto) return <span className="text-ink-muted">—</span>;

  if (ehUrl(texto)) {
    if (EXT_IMAGEM.test(texto)) {
      return (
        <a href={texto} target="_blank" rel="noreferrer" className="inline-block">
          <img src={texto} alt={rotuloDoCampo(campo)} loading="lazy" className="max-h-28 rounded-lg border border-border object-contain" />
        </a>
      );
    }
    return (
      <a href={texto} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-medium text-petrol hover:underline">
        <ExternalLink size={13} />
        Abrir
      </a>
    );
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(texto)) return <>{formatarDataIso(texto)}</>;
  if (/valor/i.test(campo)) {
    const n = lerValor(texto);
    if (n !== null) return <span className="tabular">{formatarMoeda(n)}</span>;
  }
  if (/<[a-z][\s\S]*>/i.test(texto)) return <>{textoPuro(texto)}</>;
  return <>{texto}</>;
}

export function CamposDoRegistro({ dados }: { dados: RegistroTransparenciaApi }) {
  const campos = Object.entries(dados).filter(([k]) => !k.startsWith("_"));
  return (
    <dl className="grid gap-x-6 gap-y-2.5 rounded-xl border border-border bg-bg p-4 text-sm sm:grid-cols-2">
      {campos.map(([campo, valor]) => (
        <div key={campo} className="min-w-0">
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{rotuloDoCampo(campo)}</dt>
          <dd className="mt-0.5 break-words text-ink">
            <Valor campo={campo} valor={valor} />
          </dd>
        </div>
      ))}
    </dl>
  );
}
