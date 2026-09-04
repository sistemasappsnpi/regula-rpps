import { PDFParse } from "pdf-parse";

export interface PaginaTexto {
  pagina: number;
  texto: string;
}

/**
 * Extrai o texto de um PDF por página (não só o texto corrido inteiro), para que a extração
 * assistida por IA possa citar a página exata de onde cada campo veio — decisão registrada em
 * /docs/stack-proposta.md ("texto + citação de página/trecho", sem depender de poppler/binário
 * externo instalado no servidor).
 */
export async function extrairTextoPorPagina(buffer: Buffer): Promise<PaginaTexto[]> {
  const parser = new PDFParse({ data: buffer });
  try {
    const resultado = await parser.getText();
    return resultado.pages.map((pagina) => ({ pagina: pagina.num, texto: pagina.text }));
  } finally {
    await parser.destroy();
  }
}
