// Tipos de portal além do RPPS (hoje: Câmara). Cada tipo é um preset em assets/transparencia-gerador/presets/<tipo>
// com um tipo.json (textos, cores, perfis, temas, sinônimos, glossário, descrições e ordem dos grupos), o catálogo
// local de botões e, para a demonstração, o config de um portal fictício (exemplo.json).

import { HttpError } from "../../middleware/errorHandler";
import { importarPortal, lerArquivoPreset, slug } from "./gerador.service";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Cfg = Record<string, any>;

const TIPOS = ["camara"] as const;
export const PASTA_EXEMPLO_CAMARA = "camara-exemplo";

function json(preset: string, arquivo: string): Cfg | null {
  const texto = lerArquivoPreset(preset, arquivo);
  if (!texto) return null;
  try {
    return JSON.parse(texto);
  } catch {
    return null;
  }
}

/** O que o formulário precisa para começar um portal do tipo: rótulo, textos e cores padrão e o nome do preset. */
export function listarTipos() {
  return TIPOS.flatMap((id) => {
    const t = json(id, "tipo.json");
    return t ? [{ id, preset: id, rotulo: String(t.rotulo ?? id), textos: t.textos ?? {}, cores: t.cores ?? {}, itens: (json(id, "transparencia.local.json") as unknown as unknown[] | null)?.length ?? 0 }] : [];
  });
}

/** Cria (ou refaz) o portal fictício "Câmara Municipal de Vila Modelo", para mostrar o resultado a quem decide. */
export async function criarExemploCamara() {
  const config = json("camara", "exemplo.json");
  const itens = lerArquivoPreset("camara", "transparencia.local.json");
  const menu = lerArquivoPreset("camara", "menu.local.json");
  const svg = lerArquivoPreset("camara", "exemplo-logo.svg");
  if (!config || !itens || !menu || !svg) throw new HttpError(500, "Arquivos do pacote Câmara não encontrados no servidor.");
  config.tipo = "camara";
  config.exemplo = true;
  const r = await importarPortal({
    pasta: slug(PASTA_EXEMPLO_CAMARA), config,
    logo: { nome: "logo.svg", buffer: Buffer.from(svg, "utf8") },
    cacheTransparencia: itens, cacheMenu: menu,
  });
  return { ...r, pasta: slug(PASTA_EXEMPLO_CAMARA) };
}
