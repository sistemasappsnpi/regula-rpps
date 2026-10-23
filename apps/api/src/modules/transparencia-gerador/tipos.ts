// Tipos de portal além do RPPS (hoje: Câmara e Prefeitura). Cada tipo é um preset em assets/transparencia-gerador/presets/<tipo>
// com um tipo.json (textos, cores, perfis, temas, sinônimos, glossário, descrições e ordem dos grupos), o catálogo
// local de botões e, para a demonstração, o config de um portal fictício (exemplo.json).

import { prisma } from "../../db/prisma";
import { HttpError } from "../../middleware/errorHandler";
import { importarPortal, lerArquivoPreset, slug } from "./gerador.service";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Cfg = Record<string, any>;

export const TIPOS_PORTAL = ["camara", "prefeitura"] as const;
export type TipoPortal = (typeof TIPOS_PORTAL)[number];

export const ehTipoPortal = (v: unknown): v is TipoPortal => typeof v === "string" && (TIPOS_PORTAL as readonly string[]).includes(v);
export const pastaExemplo = (tipo: TipoPortal) => `${tipo}-exemplo`;
// compatibilidade: o exemplo da Câmara já existia com este nome
export const PASTA_EXEMPLO_CAMARA = pastaExemplo("camara");

function json(preset: string, arquivo: string): Cfg | null {
  const texto = lerArquivoPreset(preset, arquivo);
  if (!texto) return null;
  try {
    return JSON.parse(texto);
  } catch {
    return null;
  }
}

/** O que o formulário precisa para começar um portal do tipo: rótulo, descrição, textos e cores padrão e o nome do preset. */
export function listarTipos() {
  return TIPOS_PORTAL.flatMap((id) => {
    const t = json(id, "tipo.json");
    if (!t) return [];
    return [{
      id, preset: id, rotulo: String(t.rotulo ?? id), abaRotulo: String(t.abaRotulo ?? t.rotulo ?? id),
      descricao: String(t.descricao ?? ""), exemploNome: String(t.exemploNome ?? ""),
      textos: t.textos ?? {}, cores: t.cores ?? {},
      itens: (json(id, "transparencia.local.json") as unknown as unknown[] | null)?.length ?? 0,
    }];
  });
}

/** Na subida da API: se o portal de exemplo do tipo ainda não existe, cria (nunca refaz um que já existe). */
export async function garantirExemplo(tipo: TipoPortal): Promise<boolean> {
  try {
    const existe = await prisma.transparenciaPortal.findUnique({ where: { pasta: slug(pastaExemplo(tipo)) }, select: { id: true } });
    if (existe) return false;
    await criarExemplo(tipo);
    console.log(`[gerador] portal de exemplo (${tipo}) criado`);
    return true;
  } catch (err) {
    console.error(`[gerador] exemplo (${tipo}):`, err instanceof Error ? err.message : err);
    return false;
  }
}

export async function garantirExemplos(): Promise<void> {
  for (const t of TIPOS_PORTAL) await garantirExemplo(t);
}

/** Cria (ou refaz) o portal fictício do tipo (ex.: "Câmara Municipal de Vila Modelo"), para mostrar o resultado a quem decide. */
export async function criarExemplo(tipo: TipoPortal) {
  const config = json(tipo, "exemplo.json");
  const itens = lerArquivoPreset(tipo, "transparencia.local.json");
  const menu = lerArquivoPreset(tipo, "menu.local.json");
  const svg = lerArquivoPreset(tipo, "exemplo-logo.svg");
  if (!config || !itens || !menu || !svg) throw new HttpError(500, `Arquivos do pacote ${tipo} não encontrados no servidor.`);
  config.tipo = tipo;
  config.exemplo = true;
  const pasta = slug(pastaExemplo(tipo));
  const r = await importarPortal({
    pasta, config,
    logo: { nome: "logo.svg", buffer: Buffer.from(svg, "utf8") },
    cacheTransparencia: itens, cacheMenu: menu,
  });
  return { ...r, pasta };
}

// nomes antigos (testes e rotas que só conheciam a Câmara)
export const criarExemploCamara = () => criarExemplo("camara");
export const garantirExemploCamara = () => garantirExemplo("camara");
