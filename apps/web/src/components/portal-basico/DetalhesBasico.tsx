import type { RegistroTransparenciaApi } from "../../lib/api";
import { formatarDataIso, formatarMoeda, lerValor, rotuloDoCampo, textoPuro } from "../../lib/textos";

// Todos os campos de um registro (o que a API entrega), no visual da página básica
function valorDoCampo(campo: string, valor: unknown): { texto: string; url?: string; imagem?: boolean } {
  if (valor === null || valor === undefined) return { texto: "—" };
  const t = String(valor).trim();
  if (!t) return { texto: "—" };
  if (/^(https?:\/\/|\/api\/)/i.test(t)) return { texto: /\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i.test(t) ? "Ver imagem" : "Abrir", url: t, imagem: /\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i.test(t) };
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return { texto: formatarDataIso(t) };
  if (/valor/i.test(campo)) {
    const n = lerValor(t);
    if (n !== null) return { texto: formatarMoeda(n) };
  }
  if (/<[a-z][\s\S]*>/i.test(t)) return { texto: textoPuro(t) };
  return { texto: t };
}

export function DetalhesBasico({ dados }: { dados: RegistroTransparenciaApi }) {
  const campos = Object.entries(dados).filter(([k]) => !k.startsWith("_"));
  return (
    <dl className="pb-detalhes">
      {campos.map(([campo, valor]) => {
        const v = valorDoCampo(campo, valor);
        return (
          <div key={campo} className="pb-detalhe">
            <dt>{rotuloDoCampo(campo)}</dt>
            <dd>
              {v.url ? (
                <a href={v.url} target="_blank" rel="noreferrer" className="pb-detalhe-link">
                  {v.texto} →
                </a>
              ) : (
                v.texto
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
