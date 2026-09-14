import Anthropic from "@anthropic-ai/sdk";
import { env } from "../../config/env";
import { HttpError } from "../../middleware/errorHandler";

const MODEL = "claude-sonnet-5";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!env.anthropicApiKey) {
    throw new HttpError(500, "ANTHROPIC_API_KEY não configurada.");
  }
  if (!client) {
    client = new Anthropic({ apiKey: env.anthropicApiKey });
  }
  return client;
}

export function isAiConfigured(): boolean {
  return Boolean(env.anthropicApiKey);
}

/**
 * Toda chamada à API da Anthropic passa por aqui — sem isso, um erro do SDK (rate limit,
 * indisponibilidade, prompt rejeitado etc.) propagava como Error comum, e o error handler global
 * troca qualquer Error comum por "Erro interno inesperado.", sem pista nenhuma do que houve de
 * verdade. Converte pra HttpError sempre, citando a mensagem original da Anthropic quando tem.
 */
async function criarMensagem(anthropic: Anthropic, params: Anthropic.MessageCreateParamsNonStreaming) {
  try {
    return await anthropic.messages.create(params);
  } catch (err) {
    const detalhe = err instanceof Error ? err.message : String(err);
    throw new HttpError(502, `Erro ao chamar a IA: ${detalhe}`);
  }
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

  const message = await criarMensagem(anthropic, {
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort: "medium" },
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
    throw new HttpError(502, "A IA não retornou um resultado estruturado de extração.");
  }

  const parsed = toolUse.input as { resultados?: CampoExtraidoResultado[] };
  return Array.isArray(parsed.resultados) ? parsed.resultados : [];
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

  const message = await criarMensagem(anthropic, {
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort: "medium" },
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
    throw new HttpError(502, "A IA não retornou um resultado estruturado de extração de indicadores.");
  }

  const parsed = toolUse.input as { resultados?: IndicadorExtraidoResultado[] };
  return Array.isArray(parsed.resultados) ? parsed.resultados : [];
}

export interface IndicadorAutonomoResultado {
  // Preenchido com o `indicadorId` exato da lista de checklist quando o resultado corresponde a
  // um desses campos; null quando é uma descoberta livre da IA (só acontece em modo COMENTARIO_APENAS
  // ou AMBOS — em CHECKLIST_APENAS todo resultado tem que vir daqui).
  indicadorChecklistId: string | null;
  nome: string;
  tipo: "NUMERICO" | "MOEDA" | "TEXTO" | "DATA";
  unidade: string | null;
  competencia: string | null; // "YYYY-MM", inferida do próprio documento
  // false só ocorre pra campo do checklist que a IA não achou no PDF — nesse caso valor é null.
  encontrado: boolean;
  valor: string | null;
  pagina: number | null;
  trecho: string | null;
}

// Uma ocorrência de um campo do checklist COM subcampos (ex.: um membro de comitê) — ver
// SubcampoParaExtrair/IndicadorChecklist abaixo.
export interface OcorrenciaGrupoResultado {
  indicadorChecklistId: string;
  competencia: string | null;
  subcampos: { subcampoId: string; valor: string }[];
  pagina: number | null;
  trecho: string | null;
}

export interface SubcampoParaExtrair {
  subcampoId: string;
  nome: string;
  tipo: "NUMERICO" | "MOEDA" | "TEXTO" | "DATA";
  unidade: string | null;
}

// Um campo do checklist configurado pelo admin (ver PortalIndicador/PortalIndicadorSubcampo) —
// sem subcampos é um campo escalar comum; com 1+ subcampos, pode ter várias ocorrências por
// competência (ex.: "Membro do Comitê" → nome/cargo/portaria, uma ocorrência por pessoa).
export interface IndicadorChecklist {
  indicadorId: string;
  nome: string;
  tipo: "NUMERICO" | "MOEDA" | "TEXTO" | "DATA";
  unidade: string | null;
  subcampos: SubcampoParaExtrair[];
}

export type ModoExtracaoIA = "COMENTARIO_APENAS" | "CHECKLIST_APENAS" | "AMBOS";

// Regras de competência — mesmas pra qualquer modo de extração (checklist ou autônoma).
const PROMPT_COMPETENCIA =
  "Extraia SOMENTE o que está literalmente escrito no documento — nunca infira ou invente um valor ou nome de " +
  "indicador que não esteja no texto.\n\n" +
  "Antes de extrair, entenda que tipo de documento é este e o que ele representa — isso decide como você " +
  "preenche a competência de cada indicador:\n" +
  "- Se o documento reporta uma SÉRIE ao longo do tempo (ex.: uma tabela com uma linha por mês), use o " +
  "mês/ano de cada linha como a competência daquele valor — um mesmo indicador aparece várias vezes, uma por " +
  "competência encontrada (ex.: uma série de 12 meses vira 12 resultados com o mesmo nome de indicador).\n" +
  "- Se o documento é um RETRATO PONTUAL (ex.: uma política, um plano, um demonstrativo aprovado uma vez, sem " +
  "série mensal) — existe UMA ÚNICA competência para o documento inteiro, e ela vale para TODOS os " +
  "indicadores, sem exceção. Escolha essa competência UMA vez, olhando pro documento como um todo, nesta " +
  "ordem de preferência: (1) uma data de posição/referência explícita do relatório (ex.: \"Posição da Carteira " +
  "de Investimentos em: DD/MM/AAAA\", \"Data-base\", \"Competência\"); (2) a data de aprovação ou elaboração " +
  "do documento; (3) a data de publicação. Depois de escolher essa competência, aplique-a a TODO indicador " +
  "que você extrair — inclusive tabelas sem coluna de data (composição de carteira, estratégia de alocação, " +
  "membros de conselho, instituições credenciadas etc.).\n" +
  "- ARMADILHA COMUM: um indicador retrato-pontual pode ter, dentro do seu PRÓPRIO valor, uma data " +
  "completamente diferente da competência do documento — ex.: a data de assinatura digital de quem assina o " +
  "relatório, a data de uma reunião de conselho citada numa ata, a data de um contrato, a data de um evento " +
  "(\"Cisão\", nomeação, credenciamento). Essa data faz parte do VALOR do indicador (ex.: \"CATIA DA SILVA " +
  "FERRAZ — assinado digitalmente em 05/08/2026\" ou \"26/11/2025 — Política de Investimento 2026\") e NUNCA " +
  "deve virar a competência desse indicador. A competência de CADA indicador de um documento retrato-pontual é " +
  "sempre a mesma data única do documento inteiro, escolhida uma vez no início — nunca uma data lida dentro do " +
  "texto/trecho específico daquele indicador.\n" +
  "- Só deixe a competência como null se o documento genuinamente não tiver NENHUMA data em lugar nenhum do " +
  "texto (nem de série, nem de posição/aprovação/elaboração/publicação) — isso deve ser raro.\n" +
  "Nunca invente uma data que não esteja escrita no documento, mas também não descarte um dado só porque ele " +
  "não está numa tabela com coluna de mês — procure a data de referência do documento antes de desistir.";

function listaChecklistTexto(checklist: IndicadorChecklist[]): string {
  return checklist
    .map((c) => {
      const base = `- ${c.indicadorId}: ${c.nome} (tipo: ${c.tipo}${c.unidade ? `, unidade: ${c.unidade}` : ""})`;
      if (c.subcampos.length === 0) return base;
      const sub = c.subcampos
        .map((s) => `${s.subcampoId} (${s.nome}, tipo: ${s.tipo}${s.unidade ? `, unidade: ${s.unidade}` : ""})`)
        .join("; ");
      return `${base} — TEM SUBCAMPOS, pode se repetir várias vezes (registre cada ocorrência em ` +
        `\`resultadosGrupo\`, nunca em \`resultados\`): ${sub}`;
    })
    .join("\n");
}

function montarPromptExtracao(
  modo: ModoExtracaoIA,
  checklist: IndicadorChecklist[],
  comentarioAdmin: string | null,
): string {
  const comentario = comentarioAdmin?.trim()
    ? `\n\nOrientação adicional definida pelo administrador da plataforma para este documento:\n${comentarioAdmin.trim()}`
    : "";

  if (modo === "COMENTARIO_APENAS" || checklist.length === 0) {
    return (
      "Você está analisando um documento de um Regime Próprio de Previdência Social (RPPS) brasileiro para " +
      "montar, de forma autônoma, um catálogo de indicadores estruturados por competência (mês/ano). Não existe " +
      "uma lista pré-definida de campos — você decide sozinho quais são os indicadores mais importantes deste " +
      "documento (ex.: valores financeiros e de repasse, número de segurados/beneficiários, alíquotas e " +
      "percentuais, reservas técnicas, datas-chave, prazos e outros números que um gestor de RPPS acompanharia). " +
      `${PROMPT_COMPETENCIA}\n\n` +
      "Dê a cada indicador um nome curto e claro (ex.: \"Valor total de repasses\", \"Número de segurados " +
      "ativos\"), classifique seu tipo (NUMERICO, MOEDA, TEXTO ou DATA) e, quando fizer sentido, uma unidade " +
      "(ex.: \"R$\", \"%\", \"pessoas\"). Para todo valor encontrado, cite a página exata e um trecho literal " +
      `(até ~300 caracteres) de onde ele veio. Deixe \`indicadorChecklistId\` como null (não existe checklist ` +
      `pra este documento) e \`encontrado\` sempre true.${comentario}`
    );
  }

  const listaChecklist = listaChecklistTexto(checklist);
  const baseChecklist =
    "Você está extraindo dados estruturados de um documento de um Regime Próprio de Previdência Social " +
    "(RPPS) brasileiro pra popular um checklist fixo de campos — NÃO decida livremente quais indicadores " +
    `extrair, extraia SOMENTE os campos listados abaixo.\n\n${PROMPT_COMPETENCIA}\n\n` +
    "Pra cada campo abaixo, tente achar o valor no documento — cite a página exata e um trecho literal " +
    "(até ~300 caracteres) de onde ele veio. Se não encontrar, registre um resultado com `encontrado=false` e " +
    "`valor=null` mesmo assim, usando `indicadorChecklistId` igual ao da lista — NÃO pule nenhum campo, cada " +
    "um precisa aparecer no resultado final, achado ou não.\n" +
    "Campos marcados como \"TEM SUBCAMPOS\" se repetem: podem ter 0, 1 ou várias ocorrências no documento " +
    "(ex.: vários membros de um comitê, várias contas correntes) — registre CADA ocorrência separadamente em " +
    "`resultadosGrupo` (nunca em `resultados`), com um valor por subcampo listado; nunca junte várias " +
    "ocorrências numa string só, e nunca deixe de registrar uma ocorrência que exista no documento.\n\n" +
    `Campos a extrair:\n${listaChecklist}`;

  if (modo === "CHECKLIST_APENAS") return `${baseChecklist}${comentario}`;

  return (
    `${baseChecklist}\n\n` +
    "Além dos campos acima, você TAMBÉM pode registrar outros indicadores relevantes que encontrar no " +
    "documento e que não estejam nessa lista — mesmo critério de nome/tipo/unidade de sempre, com " +
    "`indicadorChecklistId=null` pra esses. Nunca deixe de tentar TODOS os campos do checklist só porque achou " +
    `outros indicadores.${comentario}`
  );
}

/**
 * Extração estruturada pro Portal Previdenciário. Combina dois modos numa função só: campos de um
 * checklist pré-declarado pelo admin (`checklist`, ver PortalIndicador/PortalIndicadorSubcampo) —
 * onde a IA precisa tentar TODOS e sinalizar `encontrado=false` quando não achar — e/ou descoberta
 * autônoma livre, conforme `modo` (ver DocumentoPersonalizado.modoExtracaoIA). `comentarioAdmin`
 * (promptInstrucoes) sempre soma ao prompt-base, nunca o substitui.
 */
export async function extrairIndicadoresAutonomamente(
  documentoNome: string,
  comentarioAdmin: string | null,
  paginas: { pagina: number; texto: string }[],
  modo: ModoExtracaoIA,
  checklist: IndicadorChecklist[],
): Promise<{ resultados: IndicadorAutonomoResultado[]; resultadosGrupo: OcorrenciaGrupoResultado[] }> {
  const anthropic = getClient();

  const documentoComPaginas = paginas.map((p) => `--- PÁGINA ${p.pagina} ---\n${p.texto}`).join("\n\n");

  const tool: Anthropic.Tool = {
    name: "registrar_extracao_autonoma",
    description: "Registra cada indicador encontrado no documento, um por competência (ou uma por ocorrência, pra campos com subcampos).",
    input_schema: {
      type: "object",
      properties: {
        resultados: {
          type: "array",
          description: "Campos escalares (sem subcampos) — do checklist ou descobertos livremente.",
          items: {
            type: "object",
            properties: {
              indicadorChecklistId: {
                type: ["string", "null"],
                description: "id exato da lista de campos, ou null se for uma descoberta livre.",
              },
              nome: { type: "string", description: "Nome curto e claro do indicador." },
              tipo: { type: "string", enum: ["NUMERICO", "MOEDA", "TEXTO", "DATA"] },
              unidade: { type: ["string", "null"], description: "Ex.: \"R$\", \"%\", \"pessoas\", ou null." },
              competencia: {
                type: ["string", "null"],
                description: "Mês/ano de referência do valor, no formato \"YYYY-MM\", ou null se não encontrado.",
              },
              encontrado: { type: "boolean" },
              valor: { type: ["string", "null"], description: "Valor extraído, ou null se encontrado=false." },
              pagina: { type: ["integer", "null"], description: "Número da página onde o valor foi encontrado." },
              trecho: { type: ["string", "null"], description: "Trecho literal do documento de onde o valor veio." },
            },
            required: ["indicadorChecklistId", "nome", "tipo", "unidade", "competencia", "encontrado", "valor", "pagina", "trecho"],
          },
        },
        resultadosGrupo: {
          type: "array",
          description: "Uma entrada por OCORRÊNCIA de um campo do checklist com subcampos (ex.: uma por pessoa).",
          items: {
            type: "object",
            properties: {
              indicadorChecklistId: { type: "string", description: "id de um campo do checklist que tem subcampos." },
              competencia: { type: ["string", "null"] },
              subcampos: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    subcampoId: { type: "string" },
                    valor: { type: "string" },
                  },
                  required: ["subcampoId", "valor"],
                },
              },
              pagina: { type: ["integer", "null"] },
              trecho: { type: ["string", "null"] },
            },
            required: ["indicadorChecklistId", "competencia", "subcampos", "pagina", "trecho"],
          },
        },
      },
      required: ["resultados", "resultadosGrupo"],
    },
  };

  const message = await criarMensagem(anthropic, {
    model: MODEL,
    // Checklists grandes (ex.: documentos com 80+ campos, alguns com dezenas de ocorrências de
    // subcampos) geram uma resposta estruturada MUITO maior do que os outros usos de IA deste
    // arquivo — 16000 truncava no meio do JSON pra esses casos, derrubando a extração inteira com
    // um erro genérico. O teto aqui precisa acompanhar o tamanho do checklist, não um documento
    // específico (nunca hardcoded por tipo documental).
    max_tokens: 32000,
    output_config: { effort: "medium" },
    tools: [tool],
    tool_choice: { type: "tool", name: "registrar_extracao_autonoma" },
    messages: [
      {
        role: "user",
        content:
          `${montarPromptExtracao(modo, checklist, comentarioAdmin)}\n\n` +
          `Documento: "${documentoNome}"\n\n` +
          `Documento (marcado por página):\n\n${documentoComPaginas}`,
      },
    ],
  });

  if (message.stop_reason === "max_tokens") {
    throw new HttpError(
      502,
      "A IA não conseguiu terminar a extração porque a resposta ficou grande demais pra esse documento " +
        "(checklist com muitos campos e/ou muitas ocorrências de subcampos). Tente novamente — se persistir, " +
        "considere revisar o checklist deste tipo documental em Parametrizações, dividindo campos muito " +
        "repetitivos em grupos menores.",
    );
  }

  const toolUse = message.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
  );
  if (!toolUse) {
    throw new HttpError(502, "A IA não retornou um resultado estruturado de extração.");
  }

  const parsed = toolUse.input as {
    resultados?: IndicadorAutonomoResultado[];
    resultadosGrupo?: OcorrenciaGrupoResultado[];
  };
  return {
    resultados: Array.isArray(parsed.resultados) ? parsed.resultados : [],
    resultadosGrupo: Array.isArray(parsed.resultadosGrupo) ? parsed.resultadosGrupo : [],
  };
}

export interface SubcampoSugerido {
  nome: string;
  tipo: "NUMERICO" | "MOEDA" | "TEXTO" | "DATA";
  unidade: string | null;
}

export interface CampoChecklistSugerido {
  nome: string;
  tipo: "NUMERICO" | "MOEDA" | "TEXTO" | "DATA";
  unidade: string | null;
  subcampos: SubcampoSugerido[];
}

/**
 * Propõe a ESTRUTURA de um checklist de campos (não os valores) a partir de um PDF de exemplo —
 * usado em Parametrizações → Personalizados pra montar o checklist sem o admin ter que digitar
 * cada campo de cabeça. Diferente de extrairIndicadoresAutonomamente (que extrai valores de UM
 * documento pontual), aqui o pedido é generalizar: um campo que se repete no exemplo (ex.: vários
 * membros de comitê) precisa virar UM campo com subcampos, nunca um campo por pessoa/instituição.
 */
export async function sugerirChecklistDePdf(
  documentoNome: string,
  comentarioAdmin: string | null,
  paginas: { pagina: number; texto: string }[],
): Promise<CampoChecklistSugerido[]> {
  const anthropic = getClient();

  const documentoComPaginas = paginas.map((p) => `--- PÁGINA ${p.pagina} ---\n${p.texto}`).join("\n\n");

  const tool: Anthropic.Tool = {
    name: "propor_checklist",
    description: "Propõe os campos que um checklist de extração pra este tipo de documento deveria ter.",
    input_schema: {
      type: "object",
      properties: {
        campos: {
          type: "array",
          items: {
            type: "object",
            properties: {
              nome: {
                type: "string",
                description: "Nome curto e GENÉRICO do campo (nunca o nome de uma pessoa/instituição específica).",
              },
              tipo: { type: "string", enum: ["NUMERICO", "MOEDA", "TEXTO", "DATA"] },
              unidade: { type: ["string", "null"], description: "Ex.: \"R$\", \"%\", \"pessoas\", ou null." },
              subcampos: {
                type: "array",
                description: "Só quando este campo se repete várias vezes no documento com a mesma estrutura interna.",
                items: {
                  type: "object",
                  properties: {
                    nome: { type: "string" },
                    tipo: { type: "string", enum: ["NUMERICO", "MOEDA", "TEXTO", "DATA"] },
                    unidade: { type: ["string", "null"] },
                  },
                  required: ["nome", "tipo", "unidade"],
                },
              },
            },
            required: ["nome", "tipo", "unidade", "subcampos"],
          },
        },
      },
      required: ["campos"],
    },
  };

  const message = await criarMensagem(anthropic, {
    model: MODEL,
    max_tokens: 8000,
    output_config: { effort: "medium" },
    tools: [tool],
    tool_choice: { type: "tool", name: "propor_checklist" },
    messages: [
      {
        role: "user",
        content:
          "Você está analisando um documento de exemplo de um Regime Próprio de Previdência Social (RPPS) " +
          "brasileiro pra propor o CHECKLIST de campos que a extração automática por IA deste TIPO de " +
          "documento deveria sempre tentar preencher — não são os valores deste documento específico, são os " +
          "nomes/tipos dos campos, reutilizáveis pra qualquer outro PDF do mesmo tipo (ex.: todo mês um RPPS " +
          "diferente vai mandar um documento parecido com este).\n\n" +
          "Pra cada informação relevante que aparecer no documento:\n" +
          "- Se ela aparece UMA vez (ex.: \"Ano de vigência da política\", \"Índice de referência\"), proponha " +
          "um campo simples: nome curto, tipo, e unidade quando fizer sentido.\n" +
          "- Se ela é um tipo de registro que SE REPETE várias vezes com a MESMA estrutura interna (ex.: vários " +
          "membros de um comitê/conselho, cada um com nome e cargo; várias instituições credenciadas, cada uma " +
          "com razão social e CNPJ), proponha **UM ÚNICO campo** (ex.: \"Membro do Comitê\", \"Instituição " +
          "Credenciada\") com subcampos descrevendo cada pedaço dessa estrutura (ex.: subcampos \"Nome\", " +
          "\"Cargo\"). **NUNCA** proponha um campo separado por pessoa/instituição/ocorrência — o nome de uma " +
          "pessoa ou instituição específica NUNCA pode aparecer no nome de um campo, porque o checklist precisa " +
          "servir pra qualquer documento desse tipo, não só este exemplo.\n" +
          "Ignore números de página, cabeçalhos/rodapés e metadados irrelevantes pro conteúdo em si.\n\n" +
          (comentarioAdmin?.trim()
            ? `Orientação adicional definida pelo administrador da plataforma para este documento:\n${comentarioAdmin.trim()}\n\n`
            : "") +
          `Documento: "${documentoNome}"\n\n` +
          `Documento de exemplo (marcado por página):\n\n${documentoComPaginas}`,
      },
    ],
  });

  const toolUse = message.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
  );
  if (!toolUse) {
    throw new HttpError(502, "A IA não retornou uma proposta estruturada de checklist.");
  }

  const parsed = toolUse.input as { campos?: CampoChecklistSugerido[] };
  return Array.isArray(parsed.campos) ? parsed.campos : [];
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

  const message = await criarMensagem(anthropic, {
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort: "medium" },
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
    throw new HttpError(502, "A IA não retornou um rascunho estruturado.");
  }

  const parsed = toolUse.input as { itens?: ItemComposto[] };
  return Array.isArray(parsed.itens) ? parsed.itens : [];
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

  const message = await criarMensagem(anthropic, {
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
    throw new HttpError(502, "A IA não retornou um documento estruturado.");
  }

  const parsed = toolUse.input as Partial<DocumentoConstruido>;
  return { conteudo: parsed.conteudo ?? "", citacoes: Array.isArray(parsed.citacoes) ? parsed.citacoes : [] };
}
