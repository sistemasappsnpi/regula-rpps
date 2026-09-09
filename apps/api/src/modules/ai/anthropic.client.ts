import Anthropic from "@anthropic-ai/sdk";
import { env } from "../../config/env";

const MODEL = "claude-sonnet-4-5";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!env.anthropicApiKey) {
    throw new Error("ANTHROPIC_API_KEY não configurada.");
  }
  if (!client) {
    client = new Anthropic({ apiKey: env.anthropicApiKey });
  }
  return client;
}

export function isAiConfigured(): boolean {
  return Boolean(env.anthropicApiKey);
}

export interface CampoParaExtrair {
  campoId: string;
  descricao: string;
}

export interface CampoExtraidoResultado {
  campoId: string;
  encontrado: boolean;
  valor: string | null;
  pagina: number | null;
  trecho: string | null;
}

/**
 * Pede ao modelo para extrair, de um PDF já convertido em texto por página, o valor de
 * cada campo pedido — sempre citando página e trecho literal de origem (decisão registrada
 * em /docs/stack-proposta.md: "texto + citação de página/trecho", não destaque visual).
 * Usa tool use com schema fixo para reduzir o risco de a IA inventar valor fora do PDF.
 */
export async function extrairCamposDoPdf(
  paginas: { pagina: number; texto: string }[],
  campos: CampoParaExtrair[],
): Promise<CampoExtraidoResultado[]> {
  const anthropic = getClient();

  const documentoComPaginas = paginas.map((p) => `--- PÁGINA ${p.pagina} ---\n${p.texto}`).join("\n\n");

  const tool: Anthropic.Tool = {
    name: "registrar_extracao",
    description: "Registra o resultado da extração de cada campo solicitado a partir do documento.",
    input_schema: {
      type: "object",
      properties: {
        resultados: {
          type: "array",
          items: {
            type: "object",
            properties: {
              campoId: { type: "string" },
              encontrado: { type: "boolean" },
              valor: { type: ["string", "null"], description: "Valor extraído, ou null se não encontrado." },
              pagina: { type: ["integer", "null"], description: "Número da página onde o valor foi encontrado." },
              trecho: { type: ["string", "null"], description: "Trecho literal do documento de onde o valor veio." },
            },
            required: ["campoId", "encontrado", "valor", "pagina", "trecho"],
          },
        },
      },
      required: ["resultados"],
    },
  };

  const listaCampos = campos.map((c) => `- ${c.campoId}: ${c.descricao}`).join("\n");

  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4096,
    tools: [tool],
    tool_choice: { type: "tool", name: "registrar_extracao" },
    messages: [
      {
        role: "user",
        content:
          "Você está extraindo dados de um documento de um Regime Próprio de Previdência Social (RPPS) " +
          "brasileiro para pré-preencher um formulário. Extraia SOMENTE o que está literalmente escrito no " +
          "documento abaixo — nunca infira ou invente um valor que não esteja no texto. Se um campo não for " +
          "encontrado, marque encontrado=false e valor=null. Para todo campo encontrado, cite a página exata e " +
          "um trecho literal (até ~300 caracteres) de onde o valor veio.\n\n" +
          `Campos a extrair:\n${listaCampos}\n\n` +
          `Documento (marcado por página):\n\n${documentoComPaginas}`,
      },
    ],
  });

  const toolUse = message.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
  );
  if (!toolUse) {
    throw new Error("A IA não retornou um resultado estruturado de extração.");
  }

  const parsed = toolUse.input as { resultados: CampoExtraidoResultado[] };
  return parsed.resultados;
}

export interface IndicadorParaExtrair {
  indicadorId: string;
  nome: string;
  tipo: string; // NUMERICO | MOEDA | TEXTO | DATA (PortalIndicadorTipo)
  unidade: string | null;
}

export interface IndicadorExtraidoResultado {
  indicadorId: string;
  competencia: string | null; // "YYYY-MM", inferida do próprio documento
  encontrado: boolean;
  valor: string | null;
  pagina: number | null;
  trecho: string | null;
}

/**
 * Extração estruturada pro Portal Previdenciário: igual em espírito a extrairCamposDoPdf, mas
 * cada indicador pode aparecer VÁRIAS vezes no resultado — uma por competência (mês/ano) — já
 * que um único PDF costuma trazer uma série temporal (ex.: tabela mensal). A IA precisa inferir
 * a competência do próprio documento (cabeçalho de tabela, período do relatório); nunca inventar
 * uma competência que não esteja implícita no texto.
 */
export async function extrairIndicadoresDoPdf(
  documentoNome: string,
  paginas: { pagina: number; texto: string }[],
  indicadores: IndicadorParaExtrair[],
): Promise<IndicadorExtraidoResultado[]> {
  const anthropic = getClient();

  const documentoComPaginas = paginas.map((p) => `--- PÁGINA ${p.pagina} ---\n${p.texto}`).join("\n\n");

  const tool: Anthropic.Tool = {
    name: "registrar_extracao_indicadores",
    description: "Registra cada valor de indicador encontrado no documento, um por competência.",
    input_schema: {
      type: "object",
      properties: {
        resultados: {
          type: "array",
          items: {
            type: "object",
            properties: {
              indicadorId: { type: "string" },
              competencia: {
                type: ["string", "null"],
                description: "Mês/ano de referência do valor, no formato \"YYYY-MM\", ou null se não encontrado.",
              },
              encontrado: { type: "boolean" },
              valor: { type: ["string", "null"], description: "Valor extraído, ou null se não encontrado." },
              pagina: { type: ["integer", "null"], description: "Número da página onde o valor foi encontrado." },
              trecho: { type: ["string", "null"], description: "Trecho literal do documento de onde o valor veio." },
            },
            required: ["indicadorId", "competencia", "encontrado", "valor", "pagina", "trecho"],
          },
        },
      },
      required: ["resultados"],
    },
  };

  const listaIndicadores = indicadores
    .map((i) => `- ${i.indicadorId}: ${i.nome} (tipo: ${i.tipo}${i.unidade ? `, unidade: ${i.unidade}` : ""})`)
    .join("\n");

  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4096,
    tools: [tool],
    tool_choice: { type: "tool", name: "registrar_extracao_indicadores" },
    messages: [
      {
        role: "user",
        content:
          "Você está extraindo dados estruturados de um documento de um Regime Próprio de Previdência Social " +
          "(RPPS) brasileiro para popular um catálogo de indicadores por competência (mês/ano). Extraia SOMENTE " +
          "o que está literalmente escrito no documento abaixo — nunca infira ou invente um valor ou uma " +
          "competência que não esteja implícita no texto (ex.: cabeçalho de tabela mensal, período do relatório " +
          "declarado no próprio documento). Um mesmo indicador pode aparecer várias vezes, uma para cada " +
          "competência encontrada (ex.: uma série de 12 meses vira 12 resultados para o mesmo indicadorId). Se um " +
          "indicador não for encontrado em nenhuma competência, retorne um único resultado com encontrado=false, " +
          "valor=null e competencia=null. Para todo valor encontrado, cite a página exata e um trecho literal " +
          "(até ~300 caracteres) de onde ele veio.\n\n" +
          `Documento: "${documentoNome}"\n\n` +
          `Indicadores a extrair:\n${listaIndicadores}\n\n` +
          `Documento (marcado por página):\n\n${documentoComPaginas}`,
      },
    ],
  });

  const toolUse = message.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
  );
  if (!toolUse) {
    throw new Error("A IA não retornou um resultado estruturado de extração de indicadores.");
  }

  const parsed = toolUse.input as { resultados: IndicadorExtraidoResultado[] };
  return parsed.resultados;
}

export interface FonteParaComposicao {
  acaoNome: string;
  acaoCodigo: string;
  campos: { campoId: string; descricao: string; valor: string }[];
}

export interface ItemComposto {
  descricao: string;
  valor: string;
  fonteAcaoCodigo: string;
  fonteCampoId: string;
}

/**
 * Monta um rascunho de documento composto (ex.: Transparência) citando, para cada item,
 * de qual ação-fonte e campo o dado veio. Nunca é publicado sozinho — sempre volta como
 * TenantDocumentoComposto com status RASCUNHO, exigindo aprovação humana explícita.
 */
export async function comporRascunho(
  acaoCompostaNome: string,
  fontes: FonteParaComposicao[],
): Promise<ItemComposto[]> {
  const anthropic = getClient();

  const tool: Anthropic.Tool = {
    name: "registrar_rascunho",
    description: "Registra os itens do rascunho do documento composto, cada um citando sua fonte.",
    input_schema: {
      type: "object",
      properties: {
        itens: {
          type: "array",
          items: {
            type: "object",
            properties: {
              descricao: { type: "string", description: "O que este item representa no documento composto." },
              valor: { type: "string", description: "O valor/texto a incluir, reaproveitando o dado da fonte." },
              fonteAcaoCodigo: { type: "string" },
              fonteCampoId: { type: "string" },
            },
            required: ["descricao", "valor", "fonteAcaoCodigo", "fonteCampoId"],
          },
        },
      },
      required: ["itens"],
    },
  };

  const fontesTexto = fontes
    .map(
      (f) =>
        `Ação-fonte "${f.acaoNome}" (${f.acaoCodigo}):\n` +
        f.campos.map((c) => `  - ${c.campoId} (${c.descricao}): ${c.valor}`).join("\n"),
    )
    .join("\n\n");

  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4096,
    tools: [tool],
    tool_choice: { type: "tool", name: "registrar_rascunho" },
    messages: [
      {
        role: "user",
        content:
          `Monte um rascunho do documento composto "${acaoCompostaNome}" de um RPPS brasileiro, reaproveitando ` +
          "APENAS os dados já preenchidos abaixo, sem inventar informação nova. Cada item do rascunho deve citar " +
          "explicitamente de qual ação-fonte e campo o dado veio, para que um humano possa conferir antes de " +
          `aprovar.\n\nDados-fonte disponíveis:\n\n${fontesTexto}`,
      },
    ],
  });

  const toolUse = message.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
  );
  if (!toolUse) {
    throw new Error("A IA não retornou um rascunho estruturado.");
  }

  const parsed = toolUse.input as { itens: ItemComposto[] };
  return parsed.itens;
}

export interface DocumentoFonteConstrutor {
  nome: string;
  paginas: { pagina: number; texto: string }[];
}

export interface CitacaoConstrutor {
  trecho: string;
  documentoNome: string;
  paginaOrigem: number | null;
}

export interface DocumentoConstruido {
  conteudo: string;
  citacoes: CitacaoConstrutor[];
}

/**
 * Motor do "Construtor de Documentos": monta um documento final a partir dos documentos-
 * fonte enviados pelo usuário, seguindo um prompt específico configurado pelo Admin Global para
 * este tipo de documento (ConstrutorTipoDocumento.promptInstrucoes) e, quando o tipo está ligado
 * a uma ação do Pró-Gestão ou a um critério do CRP, o contexto normativo (objetivo/campos ou
 * descrição/base legal) que explica o que aquele documento exige. Igual às outras funções deste
 * client, força tool use e proíbe inventar dado fora dos documentos-fonte — sempre citando de
 * qual documento (e página, quando aplicável) cada trecho veio, para revisão humana antes de
 * aprovar (ver TenantConstrutorExecucao, nasce sempre RASCUNHO).
 */
export async function montarDocumentoConstrutor(input: {
  nomeDocumento: string;
  contextoManual: string;
  promptInstrucoes: string;
  documentosFonte: DocumentoFonteConstrutor[];
}): Promise<DocumentoConstruido> {
  const anthropic = getClient();

  const tool: Anthropic.Tool = {
    name: "registrar_documento_construido",
    description: "Registra o documento final montado, com as citações de origem de cada trecho.",
    input_schema: {
      type: "object",
      properties: {
        conteudo: {
          type: "string",
          description: "O documento final montado, em texto/markdown simples, pronto para revisão humana.",
        },
        citacoes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              trecho: { type: "string", description: "Trecho do documento final que esta citação embasa." },
              documentoNome: { type: "string", description: "Nome do documento-fonte de onde a informação veio." },
              paginaOrigem: { type: ["integer", "null"], description: "Página do documento-fonte, se aplicável." },
            },
            required: ["trecho", "documentoNome", "paginaOrigem"],
          },
        },
      },
      required: ["conteudo", "citacoes"],
    },
  };

  const documentosTexto = input.documentosFonte
    .map(
      (d) =>
        `### Documento-fonte: "${d.nome}"\n` +
        d.paginas.map((p) => `--- PÁGINA ${p.pagina} ---\n${p.texto}`).join("\n\n"),
    )
    .join("\n\n");

  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 8192,
    tools: [tool],
    tool_choice: { type: "tool", name: "registrar_documento_construido" },
    messages: [
      {
        role: "user",
        content:
          "Você ajuda um Regime Próprio de Previdência Social (RPPS) brasileiro a montar um documento a partir " +
          "de relatórios que ele já produziu, seguindo instruções definidas pelo administrador da plataforma.\n\n" +
          `Documento a montar: "${input.nomeDocumento}"\n\n` +
          (input.contextoManual
            ? `O que este documento significa e o que ele exige (contexto normativo):\n${input.contextoManual}\n\n`
            : "Este tipo de documento não está ligado a nenhuma referência normativa específica do Pró-Gestão ou do CRP — siga apenas as instruções abaixo.\n\n") +
          `Instruções específicas definidas pelo administrador para montar este documento:\n${input.promptInstrucoes}\n\n` +
          "Extraia e organize SOMENTE informação que está literalmente presente nos documentos-fonte abaixo — " +
          "nunca invente ou infira dado que não esteja no texto. Identifique o que cada documento contribui para " +
          "o documento final pedido. Sempre que usar uma informação, registre uma citação apontando de qual " +
          "documento-fonte (e página, se aplicável) ela veio.\n\n" +
          `Documentos-fonte enviados (${input.documentosFonte.length}):\n\n${documentosTexto}`,
      },
    ],
  });

  const toolUse = message.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
  );
  if (!toolUse) {
    throw new Error("A IA não retornou um documento estruturado.");
  }

  return toolUse.input as DocumentoConstruido;
}
