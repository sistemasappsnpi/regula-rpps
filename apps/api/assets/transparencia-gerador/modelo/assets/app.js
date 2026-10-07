/* Portal de Acesso à Informação — código comum a todos os clientes.
   Tudo que é específico de um cliente vem de window.PORTAL_CONFIG (config.json, injetado pelo index.php). */
(function(){
  "use strict";

  var C = window.PORTAL_CONFIG || {};
  function obj(x){ return x && typeof x === "object" && !Array.isArray(x) ? x : {}; }
  function merge(a, b){ var o = {}, k; for (k in a) o[k] = a[k]; for (k in b) o[k] = b[k]; return o; }

  var API = obj(C.api);
  var TRANSPARENCIA_URLS = ["proxy.php?d=transparencia", "dados/cache_transparencia.json", "dados/transparencia.local.json"];
  var MENU_URLS = ["proxy.php?d=menu", "dados/cache_menu.json", "dados/menu.local.json"];
  var REFRESH_MS = (+API.atualizarMinutos || 5) * 60 * 1000;

  /* ---------- padrões genéricos (o config.json pode completar ou sobrescrever) ---------- */

  // ícone do cadastro da API (Bootstrap Icons / Font Awesome) -> ícone do sprite
  var ICON_MAP = merge({
    "bi bi-info-circle-fill":"i-info","bi bi-chat-dots-fill":"i-message","fa fa-envelope":"i-message",
    "bi bi-file-earmark-text-fill":"i-document","bi bi-file-text-fill":"i-document","fa fa-file-pdf-o":"i-document",
    "bi bi-file-earmark-pdf-fill":"i-document","bi bi-file-earmark-medical-fill":"i-document","bi bi-eye-fill":"i-document",
    "bi bi-book-half":"i-book","bi bi-journal-text":"i-book","bi bi-journal-bookmark-fill":"i-book",
    "bi bi-file-earmark-bar-graph":"i-chart","bi bi-clipboard-data-fill":"i-chart","bi bi-graph-up-arrow":"i-chart",
    "bi bi-graph-down-arrow":"i-chart","bi bi-calculator-fill":"i-chart","bi bi-bar-chart-steps":"i-chart",
    "bi bi-currency-dollar":"i-coins","bi bi-pc-display-horizontal":"i-document","bi bi-bank":"i-landmark",
    "bi bi-archive-fill":"i-folder","bi bi-building-lock":"i-shield","bi bi-shield-lock-fill":"i-lock",
    "bi bi-heart-pulse-fill":"i-shield","bi bi-calendar-week":"i-calendar","bi bi-calendar-check":"i-calendar",
    "bi bi-people-fill":"i-users","bi bi-people":"i-users","fa fa-users":"i-users","bi bi-person-check-fill":"i-users",
    "bi bi-person-hearts":"i-users","bi bi-person-gear":"i-users","bi bi-file-earmark-person":"i-users",
    "bi bi-database-fill-gear":"i-database","bi bi-file-earmark-code-fill":"i-database",
    "bi bi-diagram-3-fill":"i-sitemap","bi bi-map-fill":"i-sitemap","bi bi-briefcase-fill":"i-briefcase",
    "bi bi-hammer":"i-scale","bi bi-unlock-fill":"i-lock","bi bi-question-circle-fill":"i-question",
    "bi bi-award-fill":"i-award","bi bi-mortarboard":"i-graduation","bi bi-telephone":"i-phone",
    // nomes sem o prefixo "bi " / FontAwesome 4, como aparecem em alguns cadastros
    "fa fa-info-circle":"i-info","fa fa-comments":"i-message","bi-file-earmark-text-fill":"i-document",
    "fa fa-newspaper-o":"i-document","bi-file-earmark-ruled-fill":"i-document","bi-journal-richtext":"i-document",
    "bi-journal-bookmark-fill":"i-document","bi-file-earmark-bar-graph-fill":"i-chart","bi-clipboard-data-fill":"i-chart",
    "bi-file-earmark-check-fill":"i-doc-check","bi-clipboard-check-fill":"i-doc-check","bi-cash-stack":"i-coins",
    "bi-cash-coin":"i-coins","fa fa-money":"i-coins","bi-piggy-bank-fill":"i-piggy","bi-graph-up":"i-chart",
    "bi-graph-up-arrow":"i-chart","bi-bar-chart-fill":"i-chart","fa fa-plane":"i-plane","fa fa-certificate":"i-award",
    "bi-award-fill":"i-award","fa fa-folder-open":"i-folder","fa fa-handshake-o":"i-link2","fa fa-balance-scale":"i-scale",
    "fa fa-gavel":"i-scale","fa fa-book":"i-book","fa fa-calendar":"i-calendar","fa fa-sitemap":"i-sitemap",
    "fa fa-database":"i-database","fa fa-shield":"i-shield","fa fa-lock":"i-lock",
    "bi-person-workspace":"i-users","bi-person-badge-fill":"i-users","bi-person-vcard-fill":"i-users",
    "bi-mortarboard-fill":"i-graduation","bi-easel2-fill":"i-graduation","fa fa-bullseye":"i-target",
    "fa fa-bullhorn":"i-megaphone","fa fa-star":"i-star","fa fa-university":"i-landmark",
    "fa fa-external-link":"i-external","fa fa-question-circle":"i-question","fa fa-briefcase":"i-briefcase"
  }, obj(C.icones));

  // ícone de grupos comuns em portais de RPPS (o config.json em grupos.icones tem prioridade)
  var GROUP_ICON_DEFAULT = {
    "Canais de Atendimento":"i-message", "Institucional":"i-landmark", "Contas Públicas":"i-coins",
    "Compras e Convênios":"i-briefcase", "Recursos Humanos":"i-users", "Controles Internos":"i-shield",
    "Governança Corporativa":"i-scale", "LRF e Prestação de Contas":"i-chart", "Educação Previdenciária":"i-graduation",
    "Comitê de Investimentos":"i-target", "Conselho de Administração":"i-sitemap", "Conselho Fiscal":"i-doc-check",
    "Diretoria Executiva":"i-award", "Comitê de Ética":"i-star", "Regulamentações":"i-book"
  };

  // descrição de grupos comuns (o config.json em grupos.descricoes tem prioridade)
  var GROUP_DESC_DEFAULT = {
    "Canais de Atendimento": "Formas de contato direto com o órgão — ouvidoria, atendimento ao cidadão e pesquisa de satisfação.",
    "Institucional": "Informações gerais sobre o órgão, sua estrutura, legislação, dados abertos e canais de transparência.",
    "Contas Públicas": "Receitas, despesas e execução orçamentária, conforme a Lei de Acesso à Informação.",
    "Compras e Convênios": "Licitações, contratos, convênios e o plano anual de contratações firmados pelo órgão.",
    "Recursos Humanos": "Folha de pagamento, diárias, passagens e portarias relacionadas aos servidores do órgão.",
    "Controles Internos": "Estrutura, manuais e certificações da área responsável por fiscalizar a conformidade da gestão.",
    "Governança Corporativa": "Atas, documentos, legislação e demonstrativos dos órgãos colegiados e da gestão de investimentos.",
    "LRF e Prestação de Contas": "Relatórios fiscais e orçamentários exigidos pela Lei de Responsabilidade Fiscal — RGF, RREO, LDO, LOA e PPA.",
    "Educação Previdenciária": "Materiais, audiências públicas e ações voltadas à orientação previdenciária dos segurados e servidores.",
    "Comitê de Investimentos": "Atas, atos e documentos das reuniões do comitê responsável por acompanhar a carteira de investimentos.",
    "Conselho de Administração": "Atas, atos, legislação e documentos das deliberações do órgão máximo de administração.",
    "Conselho Fiscal": "Atas, atos e documentos das reuniões do órgão responsável por fiscalizar as contas.",
    "Diretoria Executiva": "Atas, diplomas e relatórios mensais da diretoria responsável pela gestão executiva.",
    "Comitê de Ética": "Notas públicas, portarias e regimento do comitê responsável por zelar pela conduta ética.",
    "Regulamentações": "Leis, diárias e a Lei de Acesso à Informação que regulam o funcionamento do órgão."
  };

  // descrição de itens comuns (o config.json em descricoesItens tem prioridade)
  var ITEM_DESC_DEFAULT = {
    "Acompanhamento dos Programas de Governo": "Avaliação do cumprimento das metas físicas do Plano Plurianual (PPA).",
    "Atividades Previdenciárias": "Publicações sobre as atividades previdenciárias desenvolvidas pelo órgão.",
    "Análises de Investimentos": "Estudos técnicos que embasam as decisões de aplicação dos recursos previdenciários.",
    "Atas": "Registros das reuniões e deliberações do órgão.",
    "Atos": "Atos administrativos formalizados pelo órgão colegiado.",
    "Atos Normativos": "Resoluções, portarias e demais normas internas publicadas pelo órgão.",
    "Audiências Públicas": "Publicações e materiais das audiências públicas realizadas pelo órgão.",
    "Audiências Públicas – Vídeos": "Gravações em vídeo das audiências públicas realizadas pelo órgão.",
    "Autorização de Aplicação e Resgate (APR)": "Documentos que formalizam movimentações na carteira de investimentos.",
    "Avaliação Atuarial": "Estudo técnico que calcula o equilíbrio financeiro e atuarial do regime próprio de previdência.",
    "Avaliação do Passivo Judicial": "Levantamento das obrigações decorrentes de processos judiciais em curso.",
    "Ações de Diálogo": "Iniciativas de comunicação e diálogo do órgão com segurados e servidores.",
    "Benefícios Concedidos": "Relação dos benefícios previdenciários já concedidos pelo órgão.",
    "Capacitação de Gestores e Servidores": "Ações de capacitação voltadas a gestores e servidores do órgão.",
    "Certificado Pró Gestão": "Certificado que atesta a adesão do órgão às boas práticas do Pró-Gestão RPPS.",
    "CRP": "Certificado de Regularidade Previdenciária vigente do órgão.",
    "CRP – CadPrev": "Consulta ao Certificado de Regularidade Previdenciária no sistema CadPrev do Governo Federal.",
    "Calendário Anual de Pagamentos": "Datas previstas para pagamento de benefícios e salários ao longo do ano.",
    "Carteira de Investimentos": "Composição e valores dos recursos aplicados pelo regime próprio de previdência.",
    "Cartilha Previdenciária": "Material explicativo sobre regras e direitos previdenciários dos segurados.",
    "Censo Previdenciário": "Levantamento cadastral dos segurados vinculados ao regime próprio de previdência.",
    "Certidões": "Certidões emitidas pelo órgão para comprovação de situação regular.",
    "Certificações": "Certificações obtidas pelo órgão relacionadas à gestão previdenciária.",
    "Comparativo de Despesa": "Comparativo entre despesas previstas e realizadas pelo órgão.",
    "Contratos e Aditivos": "Contratos administrativos firmados pelo órgão e seus respectivos aditivos.",
    "Convênios": "Convênios e parcerias celebrados pelo órgão com outras entidades.",
    "Cronograma – Política de Investimentos": "Calendário das etapas de definição e revisão da política de investimentos.",
    "Código de Ética": "Diretrizes de conduta ética aplicáveis a gestores, servidores e conselheiros.",
    "Dados Abertos": "Base de dados públicos do órgão disponibilizada em formato aberto.",
    "Decretos": "Decretos relacionados ao funcionamento do órgão.",
    "Demonstrativo Anual de Despesa": "Consolidado anual das despesas realizadas pelo órgão.",
    "Despesas": "Registro detalhado das despesas executadas pelo órgão.",
    "Diplomas": "Diplomas de posse dos membros dos órgãos colegiados.",
    "Diárias": "Valores pagos a título de diárias a servidores e conselheiros em viagens a serviço.",
    "Diárias e Passagens": "Gastos com diárias e passagens de servidores e conselheiros em viagens a serviço.",
    "Documentos": "Documentos diversos publicados pelo órgão colegiado.",
    "E-sic": "Sistema Eletrônico do Serviço de Informação ao Cidadão para solicitar informações ao órgão.",
    "Estrutura de Controle Interno": "Descrição da estrutura responsável pelo controle interno.",
    "Entidades Credenciadas": "Instituições financeiras credenciadas para operar com os recursos do órgão.",
    "Estagiários": "Relação de estagiários vinculados ao órgão.",
    "Estrutura Administrativa": "Organização e divisão das áreas administrativas do órgão.",
    "Estudo de ALM": "Estudo de Asset Liability Management sobre o casamento entre ativos e obrigações do plano.",
    "Execução Orçamentária de Despesa": "Acompanhamento da execução orçamentária das despesas.",
    "Execução Orçamentária de Receita": "Acompanhamento da execução orçamentária das receitas.",
    "Folha de Pagamento e Pessoal": "Detalhamento da folha de pagamento e do quadro de pessoal.",
    "Gestor de Recursos": "Identificação do responsável pela gestão dos recursos previdenciários investidos.",
    "Gestão de Pessoas": "Políticas e práticas de gestão de pessoas adotadas pelo órgão.",
    "Gestão e Controle de Bases Cadastrais": "Procedimentos de atualização e controle das bases cadastrais dos segurados.",
    "Glossário": "Explicação de termos técnicos usados na área previdenciária.",
    "Informações sobre Benefícios": "Regras e informações gerais sobre os benefícios previdenciários oferecidos.",
    "Investimentos": "Política de investimentos adotada pelo órgão para aplicação dos recursos previdenciários.",
    "LAI": "Regulamentação da Lei de Acesso à Informação no âmbito do órgão.",
    "Lei de Diretrizes Orçamentárias (LDO)": "Lei que define as prioridades e metas para o orçamento do exercício seguinte.",
    "Lei Orçamentária Anual (LOA)": "Lei que estima as receitas e fixa as despesas para o exercício.",
    "LGPD": "Regulamentação interna sobre proteção de dados pessoais conforme a Lei Geral de Proteção de Dados.",
    "Legislação": "Normas e legislação aplicáveis ao funcionamento do órgão.",
    "Leis": "Leis que regem o funcionamento do órgão.",
    "Licitações": "Processos licitatórios realizados pelo órgão para aquisição de bens e serviços.",
    "Limite de alçadas": "Valores e competências de decisão delegadas a cada nível de gestão.",
    "Mandato, Representação e Recondução": "Regras sobre mandato, representação e recondução dos membros dos órgãos colegiados.",
    "Manuais e Mapeamentos": "Manuais de procedimentos e mapeamento dos processos internos do órgão.",
    "Notas Públicas": "Comunicados oficiais emitidos pelo comitê de ética.",
    "Organograma": "Estrutura hierárquica e organizacional do órgão.",
    "Orçamento Anual de Despesas": "Previsão das despesas do órgão para o exercício orçamentário.",
    "Orçamento Anual de Receitas": "Previsão das receitas do órgão para o exercício orçamentário.",
    "Ouvidoria": "Canal para registrar manifestações, dúvidas, elogios ou reclamações.",
    "Plano Plurianual (PPA)": "Planejamento das metas e prioridades da administração para um período de quatro anos.",
    "Política de Segurança da Informação": "Diretrizes adotadas para proteger as informações e sistemas do órgão.",
    "Perguntas Frequentes": "Respostas às dúvidas mais comuns sobre os serviços do órgão.",
    "Pesquisa de Satisfação": "Avaliação da satisfação dos usuários com os serviços prestados.",
    "Planejamento Estratégico": "Diretrizes e metas de longo prazo definidas pelo órgão.",
    "Plano Anual de Contratações": "Planejamento das contratações previstas pelo órgão para o exercício.",
    "Plano de Ação e Capacitação de Servidores": "Cronograma de ações de capacitação voltadas aos servidores.",
    "Portarias": "Portarias administrativas expedidas pelo órgão.",
    "Prestação de Contas": "Demonstrativos de prestação de contas da gestão do órgão.",
    "Prestação de contas Anual TCE": "Prestação de contas anual encaminhada ao Tribunal de Contas.",
    "Publicações": "Repositório geral de publicações oficiais do órgão.",
    "Relatório de Gestão Atuarial": "Relatório com os resultados da avaliação atuarial do regime próprio de previdência.",
    "Relatório de Gestão Fiscal (RGF)": "Demonstrativo quadrimestral de limites de despesa exigido pela Lei de Responsabilidade Fiscal.",
    "Relatório de Governança": "Relatório sobre as práticas de governança corporativa adotadas pelo órgão.",
    "Relatório Resumido da Execução Orçamentária – RREO": "Demonstrativo bimestral da execução orçamentária exigido pela Lei de Responsabilidade Fiscal.",
    "Recadastramento Anual": "Procedimento anual de atualização cadastral obrigatório para aposentados e pensionistas.",
    "Receitas": "Registro detalhado das receitas arrecadadas pelo órgão.",
    "Regimento Interno": "Normas internas que organizam o funcionamento do órgão colegiado.",
    "Relatório Anual de Investimentos": "Consolidado anual dos resultados da carteira de investimentos.",
    "Relatório Mensal": "Relatório mensal de atividades da diretoria executiva.",
    "Relatório Mensal de Investimentos": "Acompanhamento mensal dos resultados da carteira de investimentos.",
    "Relatório de Controle Interno": "Relatório produzido pela área de controle interno do órgão.",
    "Relatório semestral de diligências": "Relatório semestral sobre as diligências realizadas na gestão dos investimentos.",
    "Segregação das Atividades": "Documento que define a separação de funções na gestão dos investimentos.",
    "Tabela de Valores de Diárias": "Valores de referência pagos a título de diárias.",
    "Transparência do Ministério da Previdência": "Acesso ao portal da transparência do Ministério da Previdência Social."
  };

  // temas: palavras que costumam andar juntas na transparência; ligam itens por assunto, não só por texto
  // (config.json: "temas": ["palavra palavra ...", ...] substitui esta lista)
  var CLUSTERS_DEFAULT = [
    "licitacao contrato aditivo compra dispensa inexigibilidade pregao convenio fornecedor empenho contratacao terceirizado ata registro preco edital",
    "folha pagamento salario remuneracao servidor cargo concurso quadro diaria terceirizado estagiario aposentadoria pensao beneficio calendario",
    "orcamento receita despesa ldo loa ppa balanco balancete rreo rgf lrf empenho prestacao conta fiscal execucao tribunal",
    "investimento aplicacao apr alm carteira comite politica credenciamento rentabilidade",
    "atuarial avaliacao draa calculo reserva passivo",
    "ouvidoria sic atendimento satisfacao lai lgpd informacao carta servico manifestacao",
    "governanca conselho comite reuniao etica controle interno risco compliance certificado crp",
    "ato resolucao portaria lei decreto normativo legislacao"
  ];

  // ícone do grupo quando o config não define: adivinha pelo nome
  var GROUP_ICON_GUESS = [
    [/ouvidoria|atendimento|cidadao|sic\b/, "i-message"], [/receita|financ|orcament|contas/, "i-coins"],
    [/despesa|fiscal|lrf|demonstrativ/, "i-chart"], [/licitac|compra/, "i-scale"], [/contrato/, "i-folder"],
    [/obra/, "i-briefcase"], [/pessoal|recursos humanos|servidor|pessoas/, "i-users"], [/diaria|viage/, "i-plane"],
    [/conselho|comite|colegiad/, "i-sitemap"], [/diretoria|gestao administrativa|institucion/, "i-landmark"],
    [/controle|seguranca|auditor/, "i-shield"], [/governanca|legisla|normas/, "i-scale"], [/educacao|capacita/, "i-graduation"],
    [/lgpd|dados pessoais|privacidade/, "i-lock"], [/investiment|previd|rpps/, "i-piggy"], [/convenio|transferenc/, "i-link2"],
    [/planejamento|prestacao/, "i-doc-check"], [/saude/, "i-shield"], [/acessibilidade/, "i-contrast"]
  ];

  var AMPARO_LABELS = merge({
    "Lei Nº 12.527 (Acesso a Informação) - Lei Complementar Nº 131 (Transparência)": "Lei Nº 12.527/2011 – Lei Complementar Nº 131/2009 (Transparência)",
    "Lei Nº 12.527 (Acesso a Informação)": "Lei Nº 12.527/2011 (Acesso à Informação)",
    "Lei complementar Nº 101 (Transparência)": "Lei Complementar Nº 101/2000 (LRF)",
    "Lei Nº 12.527/2011 (Acesso a Informação)": "Lei Nº 12.527/2011 (Acesso à Informação)",
    "Lei Nº 12.527/2011 (Acesso a Informação)–Lei Complementar Nº 131/2009 (Transparência)": "Lei Nº 12.527/2011 – Lei Complementar Nº 131/2009 (Transparência)",
    "Lei complementar Nº 101/2000 (Transparência)": "Lei Complementar Nº 101/2000 (LRF)"
  }, obj(C.amparos));

  // sinônimos: termo digitado -> termos que também devem ser procurados (config.json: "sinonimos" soma/sobrescreve)
  var SYNONYMS = merge({
    "lrf": "lei de responsabilidade fiscal",
    "lai": "lei de acesso a informacao",
    "lgpd": "lei geral de protecao de dados regulamentacao do governo digital",
    "sic": "e-sic",
    "faq": "perguntas frequentes faq",
    "licitacao": "licitacoes portal de compras",
    "folha": "folha de pagamento quadro de pessoal",
    "crp": "certificado de regularidade previdenciaria",
    "draa": "avaliacao atuarial relatorio de gestao atuarial",
    "13": "decimo terceiro calendario anual de pagamentos",
    "decimo terceiro": "calendario anual de pagamentos",
    "13o salario": "calendario anual de pagamentos",
    "rgf": "relatorio de gestao fiscal",
    "rreo": "relatorio resumido da execucao orcamentaria",
    "ppa": "plano plurianual",
    "ldo": "lei de diretrizes orcamentarias",
    "loa": "lei orcamentaria anual",
    "alm": "estudo de alm",
    "pca": "plano anual de contratacoes",
    "apr": "autorizacao de aplicacao e resgate",
    "aposentadoria": "beneficios concedidos informacoes sobre beneficios calendario anual de pagamentos",
    "pensao": "beneficios concedidos informacoes sobre beneficios",
    "balancete": "prestacao de contas execucao orcamentaria",
    "balanco": "prestacao de contas demonstrativo anual",
    "salario": "folha de pagamento e pessoal",
    "remuneracao": "folha de pagamento e pessoal",
    "contrato": "contratos e aditivos",
    "pregao": "licitacoes",
    "edital": "licitacoes",
    "compras": "licitacoes contratos e aditivos plano anual de contratacoes",
    "concurso": "gestao de pessoas quadro de pessoal",
    "ouvidor": "ouvidoria",
    "reclamacao": "ouvidoria pesquisa de satisfacao",
    "denuncia": "ouvidoria",
    "privacidade": "lei geral de protecao de dados",
    "investimentos": "carteira de investimentos politica de investimentos",
    "rentabilidade": "relatorio mensal de investimentos relatorio anual de investimentos",
    "carteira": "carteira de investimentos",
    "conselho": "conselho de administracao conselho fiscal",
    "reuniao": "atas",
    "ata": "atas",
    "lei": "atos normativos legislacao",
    "portaria": "atos normativos portarias",
    "dados": "dados abertos"
  }, obj(C.sinonimos));

  var GLOSSARY = merge({
    "LRF": "Lei de Responsabilidade Fiscal (Lei Complementar nº 101/2000).",
    "LAI": "Lei de Acesso à Informação (Lei nº 12.527/2011).",
    "LGPD": "Lei Geral de Proteção de Dados (Lei nº 13.709/2018).",
    "CRP": "Certificado de Regularidade Previdenciária — comprova que o regime está em dia com as obrigações previdenciárias.",
    "RREO": "Relatório Resumido da Execução Orçamentária — demonstrativo bimestral exigido pela LRF.",
    "RGF": "Relatório de Gestão Fiscal — demonstrativo quadrimestral de limites de despesa exigido pela LRF.",
    "PPA": "Plano Plurianual — planejamento das metas e prioridades da administração para 4 anos.",
    "LDO": "Lei de Diretrizes Orçamentárias — define prioridades e metas para o orçamento do ano seguinte.",
    "LOA": "Lei Orçamentária Anual — estima receitas e fixa despesas do exercício.",
    "APR": "Autorização de Aplicação e Resgate — formaliza movimentações na carteira de investimentos.",
    "ALM": "Asset Liability Management — estudo de casamento entre ativos e obrigações do plano previdenciário.",
    "PCA": "Plano Anual de Contratações."
  }, obj(C.glossario));

  // atalhos por perfil: "match" = itens do perfil (lista curada); "words" = palavras que ligam a busca ao perfil
  // (config.json: "perfis": [...] no mesmo formato substitui esta lista; o perfil só aparece se algum item combinar)
  var PROFILES = Array.isArray(C.perfis) ? C.perfis : [
    { id:"segurado", label:"Sou segurado/aposentado", icon:"i-piggy", match:[
      "calendario anual de pagamentos","informacoes sobre beneficios","beneficios concedidos","cartilha previdenciaria",
      "glossario","perguntas frequentes","censo previdenciario","recadastramento anual","acoes de dialogo"
    ], words:"segurado aposentado aposentadoria pensionista pensao beneficiario beneficio previdencia recadastramento" },
    { id:"fornecedor", label:"Sou fornecedor/interessado em licitar", icon:"i-briefcase", match:[
      "licitacoes","contratos","convenios","terceirizados","portal de compras","plano anual de contratacoes"
    ], words:"fornecedor licitar licitante licitacao empresa contratar contrato compra pregao edital convenio prestador" },
    { id:"fiscalizador", label:"Sou jornalista/pesquisador/fiscalizador", icon:"i-database", match:[
      "dados abertos","atas","prestacao de contas","demonstrativos","relatorio","receitas","despesas","execucao orcamentaria",
      "avaliacao atuarial","estudo de alm","carteira de investimentos"
    ], words:"jornalista pesquisador fiscalizador fiscalizar auditoria auditor controle social dados abertos relatorio imprensa" },
    { id:"servidor", label:"Sou servidor do órgão", icon:"i-landmark", match:[
      "portarias","estrutura administrativa","organograma","codigo de etica","gestao de pessoas",
      "segregacao das atividades","limite de alcadas"
    ], words:"servidor funcionario colaborador interno portaria organograma etica" },
    { id:"cidadao", label:"Quero falar com o órgão", icon:"i-message", match:[
      "ouvidoria","e-sic","contatos","perguntas frequentes","carta de servicos"
    ], words:"ouvidoria contato atendimento reclamacao denuncia duvida pergunta" }
  ];

  var ICON_COLORS = {
    "i-shield":{fg:"#0d2b52",bg:"#e4ebf3"}, "i-landmark":{fg:"#0d2b52",bg:"#e4ebf3"}, "i-award":{fg:"#a67d24",bg:"#f6ecd3"},
    "i-star":{fg:"#a67d24",bg:"#f6ecd3"}, "i-coins":{fg:"#b8860b",bg:"#f8efd6"}, "i-piggy":{fg:"#a5407a",bg:"#f5e0ee"},
    "i-sitemap":{fg:"#6a4a9e",bg:"#ece4f7"}, "i-chart":{fg:"#4a3a8f",bg:"#e6e1f5"}, "i-database":{fg:"#7a6a2e",bg:"#efecd8"},
    "i-book":{fg:"#5a3a66",bg:"#ece1ef"}, "i-document":{fg:"#52627a",bg:"#e6eaf0"}, "i-doc-check":{fg:"#2f7a3d",bg:"#e1f0e3"},
    "i-folder":{fg:"#b4552f",bg:"#f7e3d8"}, "i-calendar":{fg:"#c2691e",bg:"#f9e6d3"}, "i-megaphone":{fg:"#c2691e",bg:"#f9e6d3"},
    "i-scale":{fg:"#8a2f4a",bg:"#f3e0e6"}, "i-lock":{fg:"#3a4356",bg:"#e3e5ea"}, "i-users":{fg:"#b4552f",bg:"#f7e3d8"},
    "i-graduation":{fg:"#1f8a5f",bg:"#dcf2e7"}, "i-target":{fg:"#b5342f",bg:"#f7e0de"}, "i-plane":{fg:"#2f6690",bg:"#dfeaf3"},
    "i-info":{fg:"#2f6690",bg:"#dfeaf3"}, "i-message":{fg:"#0f766e",bg:"#dcf0ee"}, "i-link2":{fg:"#0e7c8a",bg:"#dcf1f3"},
    "i-question":{fg:"#0e7c8a",bg:"#dcf1f3"}, "i-external":{fg:"#52627a",bg:"#e6eaf0"}, "i-contrast":{fg:"#3a4356",bg:"#e3e5ea"}
  };

  /* ---------- utilitários ---------- */
  function norm(s){ return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }
  function key(s){ return norm(s).replace(/\s+/g, " ").trim(); }
  // dicionário do config com chave "sem acento / sem caixa": "CONSELHO FISCAL" acha "Conselho Fiscal"
  function lookup(dict){
    var m = {};
    Object.keys(obj(dict)).forEach(function(k){ m[key(k)] = dict[k]; });
    return function(k){ return m[key(k)]; };
  }
  function esc(s){
    return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){
      return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c];
    });
  }
  function safeHref(u){ return /^\s*javascript:/i.test(u || "") ? "#" : esc(u || "#"); }
  function stemWord(w){
    if (w.length > 4){
      if (/coes$/.test(w)) return w.slice(0, -4) + "cao";
      if (/soes$/.test(w)) return w.slice(0, -4) + "sao";
      if (/oes$/.test(w)) return w.slice(0, -3) + "ao";
      if (/ais$/.test(w)) return w.slice(0, -3) + "al";
      if (/eis$/.test(w)) return w.slice(0, -3) + "el";
    }
    if (w.length > 5 && /ns$/.test(w)) return w.slice(0, -2) + "m";
    if (w.length > 3 && /s$/.test(w)) return w.slice(0, -1);
    return w;
  }
  function canon(s){
    return norm(s).split(/([^a-z0-9]+)/).map(function(part){
      return /[a-z0-9]/.test(part) ? stemWord(part) : part;
    }).join("");
  }
  function pad(n){ return (n < 10 ? "0" : "") + n; }
  function timeNow(){ var d = new Date(); return pad(d.getHours()) + ":" + pad(d.getMinutes()); }
  function slugify(s){ return norm(s).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""); }

  var GRUPOS = obj(C.grupos);
  var groupIconOf = lookup(merge(GROUP_ICON_DEFAULT, obj(GRUPOS.icones)));
  var groupDescOf = lookup(merge(GROUP_DESC_DEFAULT, obj(GRUPOS.descricoes)));
  var itemDescOf = lookup(merge(ITEM_DESC_DEFAULT, obj(C.descricoesItens)));
  var HIDDEN_GROUPS = (Array.isArray(GRUPOS.ocultar) ? GRUPOS.ocultar : []).map(key);

  /* Ordem de exibição. A API de dados abertos não tem campo de ordem, então o proxy lê a ordem oficial
     da página de acesso à informação do cliente (proxy.php?d=ordem) e ela é aplicada aos grupos e aos itens.
     O config guarda a última ordem conhecida, usada enquanto essa leitura não chega (ou se estiver desligada). */
  var ORDEM_AUTO = GRUPOS.ordemAutomatica !== false;
  var ORDEM_URLS = ["proxy.php?d=ordem", "dados/cache_ordem.json"];
  var GROUP_ORDER = (Array.isArray(GRUPOS.ordem) ? GRUPOS.ordem : []).map(key);
  var ITEM_ORDER = {};
  function setItemOrder(mapa){
    ITEM_ORDER = {};
    Object.keys(obj(mapa)).forEach(function(g){
      ITEM_ORDER[key(g)] = (mapa[g] || []).map(key);
    });
  }
  setItemOrder(GRUPOS.ordemItens);
  function aplicarOrdemOficial(lista){
    if (!Array.isArray(lista) || !lista.length) return false;
    GROUP_ORDER = lista.map(function(g){ return key(g.nome); });
    var mapa = {};
    lista.forEach(function(g){ mapa[g.nome] = g.itens || []; });
    setItemOrder(mapa);
    return true;
  }

  function groupIcon(g){
    var icon = groupIconOf(g);
    if (icon) return icon;
    var n = norm(g);
    for (var i = 0; i < GROUP_ICON_GUESS.length; i++) if (GROUP_ICON_GUESS[i][0].test(n)) return GROUP_ICON_GUESS[i][1];
    return "i-document";
  }
  function itemIcon(nomeImagem){
    if (/^i-[a-z0-9-]+$/.test(nomeImagem || "") && document.getElementById(nomeImagem)) return nomeImagem;
    return ICON_MAP[nomeImagem] || "i-document";
  }

  var GLOSSARY_KEYS = Object.keys(GLOSSARY);
  var GLOSSARY_RE = GLOSSARY_KEYS.length ? new RegExp("\\b(" + GLOSSARY_KEYS.join("|") + ")\\b", "gi") : null;
  function wrapGlossary(text){
    text = esc(text);
    if (!GLOSSARY_RE) return text;
    return text.replace(GLOSSARY_RE, function(m){
      var def = GLOSSARY[m.toUpperCase()];
      return def ? '<abbr class="gloss" title="' + esc(def) + '">' + m + '</abbr>' : m;
    });
  }

  // Links da API às vezes vêm com o domínio duplicado ("https://x.gov.br/https://outro...") ou barras dobradas,
  // e às vezes vêm relativos ("portalcompras"). Resolve tudo contra o domínio dos links do cliente.
  var LINK_BASE = (API.dominioLinks || API.base || ((API.urlTransparencia || "").match(/^https?:\/\/[^\/?#]+/i) || [""])[0]).replace(/\/+$/, "");
  function fixLink(raw){
    if (!raw) return "#";
    raw = String(raw).trim();
    if (/^(mailto:|tel:|#)/i.test(raw)) return raw;
    if (/^https?:\/\//i.test(raw)){
      var nested = raw.slice(8).search(/https?:\/\//i);
      if (nested !== -1) return raw.slice(8 + nested);
      return raw.replace(/([^:])\/{2,}/g, "$1/");
    }
    if (!LINK_BASE) return raw;
    return (LINK_BASE + "/" + raw).replace(/([^:])\/{2,}/g, "$1/");
  }

  /* ---------- motor de busca por similaridade ----------
     Reindexado a cada sincronização com a API (todos os itens, grupos, descrições, palavras do link e perfis).
     Tolera erro de digitação (distância de edição + fonética), prefixos, sinônimos, termos relacionados
     montados automaticamente e aprende com os cliques do próprio usuário. Resultado vem ordenado por relevância. */
  var SearchEngine = (function(){
    var STOP = { "de":1, "da":1, "do":1, "e":1, "a":1, "o":1, "as":1, "os":1, "em":1, "para":1, "por":1, "com":1, "no":1, "na":1, "um":1, "uma":1, "ao":1, "que":1, "sou":1 };
    var FIELDS = ["title", "group", "desc", "extra", "link"];
    var FIELD_W = { title: 6, group: 2.5, desc: 2, extra: 1.5, link: 1 };
    var LINK_NOISE = { "http":1, "https":1, "www":1, "com":1, "br":1, "gov":1, "pdf":1, "php":1, "html":1, "htm":1, "index":1, "publicacoe":1, "publicacao":1, "arquivo":1, "upload":1, "download":1 };
    // pedaços do endereço do próprio portal não dizem nada sobre o item
    [LINK_BASE, location.hostname].forEach(function(u){
      String(u || "").replace(/^https?:\/\//i, "").split(/[^a-z0-9]+/i).forEach(function(p){ if (p) LINK_NOISE[canon(p)] = 1; });
    });
    var LEARN_KEY = "search_learn_v1";
    var docs = [], vocab = {}, vocabList = [], disp = {}, related = {}, idf = {}, synKeys = [];
    var learned = {};
    var CLUSTERS = (Array.isArray(C.temas) && C.temas.length ? C.temas : CLUSTERS_DEFAULT).map(function(c){
      return String(c).split(" ").filter(Boolean).map(canon);
    });
    try { learned = JSON.parse(localStorage.getItem(LEARN_KEY) || "{}") || {}; } catch (e) { learned = {}; }

    function wordsOf(s){
      return (s || "").toLowerCase().split(/[^a-z0-9à-ÿ]+/).filter(Boolean).map(function(w){
        return { raw: w, tok: canon(w) };
      }).filter(function(w){ return w.tok && !STOP[w.tok]; });
    }
    function phon(t){
      return t.replace(/ph/g, "f").replace(/ch/g, "x").replace(/h/g, "").replace(/qu/g, "k")
        .replace(/c(?=[ei])/g, "s").replace(/c/g, "k").replace(/ss/g, "s").replace(/[zx]/g, "s")
        .replace(/y/g, "i").replace(/w/g, "v").replace(/g(?=[ei])/g, "j").replace(/(.)\1+/g, "$1");
    }
    /* distância de Damerau-Levenshtein com corte em "max" */
    function dist(a, b, max){
      var la = a.length, lb = b.length, i, j;
      if (Math.abs(la - lb) > max) return max + 1;
      var prev2 = null, prev = [], cur;
      for (j = 0; j <= lb; j++) prev[j] = j;
      for (i = 1; i <= la; i++){
        cur = [i];
        var rowMin = i;
        for (j = 1; j <= lb; j++){
          var c = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
          var v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + c);
          if (prev2 && i > 1 && j > 1 && a.charCodeAt(i - 1) === b.charCodeAt(j - 2) && a.charCodeAt(i - 2) === b.charCodeAt(j - 1)) v = Math.min(v, prev2[j - 2] + 1);
          cur[j] = v;
          if (v < rowMin) rowMin = v;
        }
        if (rowMin > max) return max + 1;
        prev2 = prev; prev = cur;
      }
      return prev[lb];
    }
    function grams(s){
      var t = "  " + s.replace(/[^a-z0-9]/g, "") + " ", g = {}, n = 0;
      for (var i = 0; i < t.length - 2; i++){ var k = t.substr(i, 3); if (!g[k]){ g[k] = 1; n++; } }
      return { set: g, n: n };
    }
    function unique(arr){ var seen = {}; return arr.filter(function(x){ return seen[x] ? false : (seen[x] = true); }); }

    /* pertencimento de um item a um perfil: lista curada + palavras do perfil em título/descrição/link (itens novos entram sozinhos) */
    function profileScore(p, item, titFlat, f){
      var s = 0;
      (p.match || []).forEach(function(term){
        var c = canon(term);
        if (titFlat.indexOf(c) !== -1) s = Math.max(s, 3);
        else if (item._search.indexOf(c) !== -1) s = Math.max(s, 1.5);
      });
      wordsOf(p.words || "").forEach(function(w){
        if (f.title.indexOf(w.tok) !== -1) s += 1.5;
        else if (f.desc.indexOf(w.tok) !== -1 || f.link.indexOf(w.tok) !== -1 || f.group.indexOf(w.tok) !== -1) s += 0.5;
      });
      return s;
    }
    function profileItems(id){
      var arr = [];
      docs.forEach(function(doc, idx){ var s = doc.prof[id] || 0; if (s >= 1.5) arr.push({ item: doc.item, score: s, idx: idx }); });
      arr.sort(function(a, b){ return b.score - a.score || a.idx - b.idx; });
      return { items: arr.map(function(a){ return a.item; }), related: relatedTo(arr, arr, []) };
    }
    function profilesFor(qc){
      var hit = {};
      qc.forEach(function(list){ list.forEach(function(c){ if (c.qual >= 0.75) hit[c.t] = c.qual; }); });
      return PROFILES.filter(function(p){
        return wordsOf(p.words || "").some(function(w){ return hit[w.tok]; });
      }).map(function(p){ return p.id; });
    }

    function build(items){
      docs = []; vocab = {}; disp = {}; related = {}; idf = {};
      items.forEach(function(item){
        var f = { title: [], group: [], desc: [], extra: [], link: [] };
        function add(field, text, keepDisp){
          wordsOf(text).forEach(function(w){
            f[field].push(w.tok);
            if (keepDisp && !disp[w.tok]) disp[w.tok] = w.raw;
          });
        }
        add("title", item.Descricao, true);
        add("group", item.Grupo, true);
        add("desc", (item.MaisInformacoes || "") + " " + (itemDescOf(item.Descricao) || ""), true);
        var titFlat = f.title.join(" "), prof = {};
        PROFILES.forEach(function(p){
          var sc = profileScore(p, item, titFlat, f);
          prof[p.id] = sc;
          if (sc >= 1.5) add("extra", (p.label || "") + " " + (p.words || ""), false);
        });
        var ln = item.Link || "";
        try { ln = decodeURIComponent(ln); } catch (e) {}
        wordsOf(ln.replace(/^https?:\/\/[^\/]+/i, "")).forEach(function(w){
          if (w.tok.length < 3 || w.tok.length > 20 || LINK_NOISE[w.tok] || (w.tok.length > 8 && /\d/.test(w.tok))) return;
          f.link.push(w.tok);
        });
        var sets = {};
        FIELDS.forEach(function(k){ var s = {}; f[k].forEach(function(t){ s[t] = 1; }); sets[k] = s; });
        var tit = unique(f.title);
        tit.forEach(function(t){
          related[t] = related[t] || {};
          tit.forEach(function(u){ if (u !== t) related[t][u] = (related[t][u] || 0) + 1; });
        });
        var all = {};
        FIELDS.forEach(function(k){ Object.keys(sets[k]).forEach(function(t){ all[t] = 1; }); });
        Object.keys(all).forEach(function(t){
          if (!vocab[t]) vocab[t] = { df: 0, p: phon(t) };
          vocab[t].df++;
        });
        docs.push({ item: item, prof: prof, sets: sets, titleFlat: f.title.join(" "), grams: grams(f.title.join(" ")) });
      });
      vocabList = Object.keys(vocab);
      vocabList.forEach(function(t){ idf[t] = Math.log(1 + docs.length / vocab[t].df); });
      synKeys = Object.keys(SYNONYMS).map(function(k){ return { key: canon(k), terms: wordsOf(SYNONYMS[k]).map(function(w){ return w.tok; }) }; });
    }

    /* variações possíveis de uma palavra digitada: exata, prefixo, parte da palavra, erro de digitação, fonética */
    function candidates(q){
      var seen = {}, L = q.length, pq = phon(q), max = L <= 3 ? 0 : (L <= 5 ? 1 : 2);
      var exact = !!vocab[q], fuzzyBest = null, fuzzyQual = 0;
      if (exact) seen[q] = 1;
      vocabList.forEach(function(t){
        if (t === q) return;
        var v = vocab[t], qual = 0, fuzzy = false;
        if (L >= 2 && t.indexOf(q) === 0) qual = L >= 3 ? 0.85 : 0.5;
        else if (L >= 4 && t.indexOf(q) > 0) qual = 0.55;
        if (!qual && L >= 3 && pq === v.p){ qual = 0.8; fuzzy = true; }
        if (!qual && max){
          var d = dist(q, t, max);
          if (d <= max){ qual = d === 1 ? 0.75 : 0.6; fuzzy = true; }
          else if (L >= 6 && dist(pq, v.p, 1) <= 1){ qual = 0.65; fuzzy = true; }
          else if (L >= 4 && t.length > L && dist(q, t.slice(0, L), 1) <= 1){ qual = 0.6; fuzzy = true; }
        }
        if (qual){
          if (!seen[t] || seen[t] < qual) seen[t] = qual;
          if (fuzzy && (qual > fuzzyQual || (qual === fuzzyQual && vocab[t].df > (vocab[fuzzyBest] || {}).df))){ fuzzyQual = qual; fuzzyBest = t; }
        }
      });
      return {
        list: Object.keys(seen).map(function(t){ return { t: t, qual: seen[t] }; }),
        corr: (!exact && fuzzyBest) ? (disp[fuzzyBest] || fuzzyBest) : null
      };
    }
    function synonymTerms(qw, full){
      var out = [];
      synKeys.forEach(function(s){
        var k = s.key, tol = k.length >= 7 ? 2 : 1, hit = false;
        if (full === k) hit = true;
        else if (k.length >= 4 && dist(full, k, tol) <= tol) hit = true;
        else if (k.indexOf(" ") < 0 && qw.some(function(w){ return w.tok === k || (k.length >= 4 && dist(w.tok, k, 1) <= 1); })) hit = true;
        if (hit) out = out.concat(s.terms);
      });
      return unique(out);
    }
    function tokenScore(doc, cands){
      var sum = 0, best = 0;
      FIELDS.forEach(function(field){
        var s = 0;
        cands.forEach(function(c){
          if (doc.sets[field][c.t]) s = Math.max(s, FIELD_W[field] * c.qual * (idf[c.t] || 1));
        });
        sum += s; if (s > best) best = s;
      });
      return best + 0.25 * (sum - best);
    }

    function search(query){
      var qw = wordsOf(query);
      if (!qw.length || !docs.length) return { items: [], related: [], profiles: [], corrected: null, similar: false };
      var full = qw.map(function(w){ return w.tok; }).join(" ");
      var corrected = [], anyCorr = false;
      var qc = qw.map(function(w){
        var c = candidates(w.tok);
        if (c.corr){ anyCorr = true; corrected.push(c.corr); } else corrected.push(w.raw);
        return c.list;
      });
      var extras = synonymTerms(qw, full).map(function(t){ return { t: t, qual: 0.8 }; });
      var rel = {};
      qw.forEach(function(w){
        var r = related[w.tok];
        if (!r) return;
        Object.keys(r).sort(function(a, b){ return r[b] - r[a]; }).slice(0, 4).forEach(function(u){
          if (vocab[u] && vocab[u].df <= docs.length / 3) rel[u] = 1;
        });
      });
      var relCands = Object.keys(rel).map(function(t){ return { t: t, qual: 0.2 }; });
      var qg = grams(full);

      var scored = docs.map(function(doc, idx){
        var main = 0, hit = 0;
        qc.forEach(function(c){ var s = tokenScore(doc, c); if (s > 0){ main += s; hit++; } });
        var cov = hit / qw.length;
        var extra = 0;
        extras.forEach(function(c){ extra += tokenScore(doc, [c]) * 0.8; });
        relCands.forEach(function(c){ extra += tokenScore(doc, [c]); });
        var phrase = 0;
        if (full.length >= 3 && doc.titleFlat.indexOf(full) !== -1) phrase = doc.titleFlat.indexOf(full) === 0 ? 6 : 4;
        var inter = 0;
        if (qg.n >= 3) Object.keys(qg.set).forEach(function(k){ if (doc.grams.set[k]) inter++; });
        var triCov = qg.n >= 3 ? inter / qg.n : 0;
        var tri = triCov >= 0.5 ? 5 * triCov * triCov : 0;
        var learn = 0;
        qw.forEach(function(w){ var l = learned[w.tok]; if (l && l[doc.item.Descricao]) learn += Math.min(2, l[doc.item.Descricao] * 0.7); });
        learn = Math.min(3, learn);
        var total = main * (0.4 + 0.6 * cov) + extra + phrase + tri + (main + extra + phrase + tri > 0 ? learn : 0);
        return { item: doc.item, score: total, triCov: triCov, idx: idx };
      });
      scored.sort(function(a, b){ return b.score - a.score || a.idx - b.idx; });
      var top = scored[0].score, items, similar = false;
      if (top > 0){
        var cut = Math.max(0.8, top * 0.18);
        items = scored.filter(function(s){ return s.score >= cut; });
      } else {
        items = scored.filter(function(s){ return s.triCov >= 0.4 && qg.n >= 4; }).sort(function(a, b){ return b.triCov - a.triCov || a.idx - b.idx; }).slice(0, 5);
        similar = items.length > 0;
      }
      var relatedItems = similar ? [] : relatedTo(scored, items, qc);
      return { items: items.map(function(s){ return s.item; }), related: relatedItems, profiles: profilesFor(qc), corrected: (anyCorr && !(extras.length && qw.length > 1)) ? corrected.join(" ") : null, similar: similar };
    }

    /* itens fora do resultado, mas do mesmo assunto: temas em comum, mesma categoria e termos que andam juntos */
    function relatedTo(scored, hits, qc){
      if (!hits.length) return [];
      var inHits = {};
      hits.forEach(function(s){ inHits[s.idx] = 1; });
      var seeds = hits.slice(0, 3);
      var qTok = {};
      qc.forEach(function(list){ list.forEach(function(c){ if (c.qual >= 0.75) qTok[c.t] = 1; }); });
      var tTok = {};
      seeds.forEach(function(s){ Object.keys(docs[s.idx].sets.title).forEach(function(t){ if (vocab[t].df <= docs.length / 8) tTok[t] = (tTok[t] || 0) + 1; }); });
      var groups = {};
      seeds.forEach(function(s){ groups[docs[s.idx].item.Grupo] = 1; });
      var weights = CLUSTERS.map(function(c){
        var w = 0;
        c.forEach(function(k){ if (qTok[k]) w += 2; if (tTok[k]) w += 1; });
        return w;
      });
      var out = [];
      docs.forEach(function(doc, idx){
        if (inHits[idx]) return;
        var s = 0;
        CLUSTERS.forEach(function(c, ci){
          if (!weights[ci]) return;
          var h = 0;
          c.forEach(function(k){ if (doc.sets.title[k]) h += 2; else if (doc.sets.desc[k] || doc.sets.group[k] || doc.sets.link[k]) h += 1; });
          s += Math.min(h, 4) * Math.min(weights[ci], 4) / 4;
        });
        Object.keys(tTok).forEach(function(t){
          if (doc.sets.title[t]) s += 0.6 * (idf[t] || 1) / 2;
        });
        if (groups[doc.item.Grupo]) s += 0.8;
        if (s >= 1.8) out.push({ item: doc.item, score: s, idx: idx });
      });
      if (out.length < 4){
        var have = {};
        out.forEach(function(o){ have[o.idx] = 1; });
        docs.forEach(function(doc, idx){
          if (inHits[idx] || have[idx]) return;
          var s = 0;
          if (groups[doc.item.Grupo]) s += 1;
          Object.keys(tTok).forEach(function(t){ if (doc.sets.title[t] || doc.sets.desc[t]) s += 0.5; });
          Object.keys(qTok).forEach(function(t){ if (doc.sets.desc[t] || doc.sets.group[t] || doc.sets.link[t]) s += 0.5; });
          if (s > 0) out.push({ item: doc.item, score: s * 0.5, idx: idx });
        });
      }
      out.sort(function(a, b){ return b.score - a.score || a.idx - b.idx; });
      var seenT = {}, res = [];
      out.forEach(function(o){ if (!seenT[o.item.Descricao] && res.length < 6){ seenT[o.item.Descricao] = 1; res.push(o.item); } });
      return res;
    }

    /* aprendizado local: associa as palavras buscadas ao item que a pessoa abriu */
    function record(query, item){
      if (!item) return;
      wordsOf(query).forEach(function(w){
        learned[w.tok] = learned[w.tok] || {};
        learned[w.tok][item.Descricao] = (learned[w.tok][item.Descricao] || 0) + 1;
      });
      try { localStorage.setItem(LEARN_KEY, JSON.stringify(learned)); } catch (e) {}
    }
    return { build: build, search: search, record: record, profile: profileItems };
  })();

  /* ---------- estado ---------- */
  var groupsOrder = [], groupsMap = {}, allItems = [];
  var uiState = { query: "", profile: null };
  var dataState = { live: false, lastSync: null };

  /* ---------- transparência: parse + render ---------- */
  // botões acrescentados pelo gerador (sugestões da Atricon / Pró-Gestão que a API do cliente não traz)
  var EXTRAS = (Array.isArray(C.itensExtras) ? C.itensExtras : []).filter(function(it){ return it && it.Grupo && it.Descricao; });

  function parseTransparencia(raw){
    groupsOrder = []; groupsMap = {};
    allItems = (Array.isArray(raw) ? raw : []).concat(EXTRAS).filter(function(item){
      return item && item.Grupo && HIDDEN_GROUPS.indexOf(key(item.Grupo)) === -1;
    });
    allItems.forEach(function(item){
      var g = item.Grupo;
      if (!groupsMap[g]){ groupsMap[g] = []; groupsOrder.push(g); }
      item._icon = itemIcon(item.NomeImagem);
      item._href = fixLink(item.Link);
      item._search = canon(item.Descricao + " " + g + " " + (item.MaisInformacoes || ""));
      groupsMap[g].push(item);
    });
    // grupos da ordem oficial vêm primeiro, na ordem dada; os demais seguem na ordem em que a API mandou
    var apiPos = {};
    groupsOrder.forEach(function(g, i){ apiPos[g] = i; });
    groupsOrder.sort(function(a, b){
      var ia = GROUP_ORDER.indexOf(key(a)); if (ia === -1) ia = GROUP_ORDER.length;
      var ib = GROUP_ORDER.indexOf(key(b)); if (ib === -1) ib = GROUP_ORDER.length;
      return ia - ib || apiPos[a] - apiPos[b];
    });
    // mesma ideia para os itens (os "botões") dentro de cada categoria
    groupsOrder.forEach(function(g){
      var ordem = ITEM_ORDER[key(g)];
      if (!ordem || !ordem.length) return;
      groupsMap[g].forEach(function(item, i){ item._pos = i; });
      groupsMap[g].sort(function(a, b){
        var ia = ordem.indexOf(key(a.Descricao)); if (ia === -1) ia = ordem.length;
        var ib = ordem.indexOf(key(b.Descricao)); if (ib === -1) ib = ordem.length;
        return ia - ib || a._pos - b._pos;
      });
    });
    // a busca desempata pela ordem de exibição (a mesma que o visitante vê na página)
    var ordenados = [];
    groupsOrder.forEach(function(g){ ordenados = ordenados.concat(groupsMap[g]); });
    SearchEngine.build(ordenados);
  }

  var sidebarEl = document.getElementById("sidebar");
  var allGroupsEl = document.getElementById("allGroups");
  var resultsViewEl = document.getElementById("resultsView");
  var searchInput = document.getElementById("searchInput");
  var clearBtn = document.getElementById("clearSearch");

  function renderSidebar(){
    sidebarEl.innerHTML = groupsOrder.map(function(g){
      return '<button class="side-item" data-target="grupo-' + slugify(g) + '">' +
        '<svg class="icon" aria-hidden="true"><use href="#' + groupIcon(g) + '"/></svg>' +
        '<span>' + esc(g) + '</span></button>';
    }).join("");
  }
  sidebarEl.addEventListener("click", function(e){
    var btn = e.target.closest(".side-item");
    if (!btn) return;
    uiState.query = "";
    uiState.profile = null;
    searchInput.value = "";
    clearBtn.style.display = "none";
    renderProfileRow(); updateViewMode();
    var target = document.getElementById(btn.getAttribute("data-target"));
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  var titleEl = document.getElementById("contentTitle");
  var basisEl = document.getElementById("contentBasis");
  var subEl = document.getElementById("contentSub");
  var gridEl = document.getElementById("cardGrid");
  var emptyEl = document.getElementById("emptyState");
  var feedbackRowEl = document.getElementById("feedbackRow");
  var relatedBlockEl = document.getElementById("relatedBlock");
  var profileHintEl = document.getElementById("profileHint");
  var relatedGridEl = document.getElementById("relatedGrid");
  var relatedSub = document.getElementById("relatedSub");
  var FEEDBACK_ON = !(C.recursos && C.recursos.feedback === false);
  var FEEDBACK_URL = "feedback.php";
  var votedNow = {}; /* voto vale só até recarregar a página */

  /* cor vinda da própria API (campo "Cor"); ICON_COLORS só entra como reserva se o item não tiver cor */
  function hexToRgb(hex){
    var h = hex.replace("#", "");
    if (h.length === 3) h = h.split("").map(function(c){ return c + c; }).join("");
    var n = parseInt(h, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  function rgbToHex(rgb){
    function h(v){ return ("0" + Math.max(0, Math.min(255, Math.round(v))).toString(16)).slice(-2); }
    return "#" + h(rgb.r) + h(rgb.g) + h(rgb.b);
  }
  function apiColorPair(hex){
    if (!hex || !/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(hex)) return null;
    var rgb = hexToRgb(hex);
    var bg = rgbToHex({ r: rgb.r + (255 - rgb.r) * 0.85, g: rgb.g + (255 - rgb.g) * 0.85, b: rgb.b + (255 - rgb.b) * 0.85 });
    return { fg: hex, bg: bg };
  }

  function cardHTML(item, showCat){
    var col = apiColorPair(item.Cor) || ICON_COLORS[item._icon] || { fg:"#0d2b52", bg:"#e4ebf3" };
    var desc = item.MaisInformacoes || itemDescOf(item.Descricao);
    var external = /^https?:\/\//i.test(item._href) && item._href.indexOf(location.host) === -1;
    return '<a class="card" href="' + safeHref(item._href) + '"' + (external && C.recursos && C.recursos.linksNovaAba ? ' target="_blank" rel="noopener"' : '') + '>' +
      '<span class="card-icon" style="--icon-fg:' + col.fg + ';--icon-bg:' + col.bg + '"><svg class="icon" aria-hidden="true"><use href="#' + item._icon + '"/></svg></span>' +
      (showCat ? '<span class="card-cat">' + esc(item.Grupo) + '</span>' : '') +
      '<span class="card-label">' + wrapGlossary(item.Descricao) + '</span>' +
      (desc ? '<span class="card-desc">' + esc(desc) + '</span>' : '') +
      '<span class="card-go"><svg class="icon" aria-hidden="true"><use href="#i-arrow"/></svg></span>' +
      '</a>';
  }

  /* ---------- feedback: "essa informação foi útil?" por categoria ---------- */
  function feedbackHTML(group){
    var voted = votedNow[group] || null;
    if (voted) return '<span class="feedback-thanks">Obrigado pelo retorno sobre “' + esc(group) + '”.</span>';
    return '<span>Essa informação foi útil?</span>' +
      '<button type="button" class="feedback-btn" data-vote="up"><svg class="icon" aria-hidden="true"><use href="#i-thumb-up"/></svg>Sim</button>' +
      '<button type="button" class="feedback-btn" data-vote="down"><svg class="icon" aria-hidden="true"><use href="#i-thumb-down"/></svg>Não</button>';
  }

  /* ---------- corrido: uma seção por grupo, todas visíveis ---------- */
  function groupBlockHTML(g){
    var items = groupsMap[g] || [];
    var amparo = items[0] && items[0].Amparo;
    var basis = AMPARO_LABELS[amparo] || amparo || "";
    return '<section class="group-block" id="grupo-' + slugify(g) + '">' +
      '<div class="content-head"><h2>' + esc(g) + '</h2><span class="content-basis">' + esc(basis) + '</span></div>' +
      '<p class="content-sub">' + esc(groupDescOf(g) || "") + '</p>' +
      (FEEDBACK_ON ? '<div class="feedback-row" data-group="' + esc(g) + '">' + feedbackHTML(g) + '</div>' : '') +
      '<div class="card-grid">' + items.map(function(item){ return cardHTML(item, false); }).join("") + '</div>' +
      '</section>';
  }
  function renderAllGroups(){
    allGroupsEl.innerHTML = groupsOrder.map(groupBlockHTML).join("");
  }
  allGroupsEl.addEventListener("click", function(e){
    var btn = e.target.closest(".feedback-btn");
    if (!btn) return;
    var row = btn.closest(".feedback-row");
    var group = row.getAttribute("data-group");
    var vote = btn.getAttribute("data-vote");
    votedNow[group] = vote;
    fetch(FEEDBACK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grupo: group, voto: vote })
    }).catch(function(){});
    row.innerHTML = feedbackHTML(group);
  });

  /* ---------- busca e perfis: resultado único, some com a listagem corrida ---------- */
  function activeProfiles(){
    return PROFILES.filter(function(p){ return SearchEngine.profile(p.id).items.length > 0; });
  }
  function renderResults(){
    feedbackRowEl.hidden = true; feedbackRowEl.innerHTML = "";
    relatedBlockEl.hidden = true; relatedGridEl.innerHTML = "";
    profileHintEl.hidden = true; profileHintEl.innerHTML = "";
    var q = canon(uiState.query.trim());
    if (q){
      var res = SearchEngine.search(uiState.query);
      var matches = res.items;
      titleEl.textContent = "Resultados da busca";
      basisEl.textContent = "";
      var msg = matches.length + (matches.length === 1 ? " item" : " itens") + " para “" + uiState.query.trim() + "”";
      if (res.corrected) msg += " — mostrando resultados para “" + res.corrected + "”";
      msg += res.similar ? " — nenhum resultado exato, estes são os mais parecidos." : (matches.length > 1 ? " — ordenados do mais ao menos parecido." : ".");
      subEl.textContent = msg;
      if (res.profiles && res.profiles.length){
        var hints = res.profiles.map(function(id){
          var p = PROFILES.filter(function(x){ return x.id === id; })[0];
          return p && SearchEngine.profile(id).items.length ? '<button type="button" class="profile-pill" data-hint="' + esc(id) + '"><svg class="icon" aria-hidden="true"><use href="#' + esc(p.icon || "i-users") + '"/></svg>' + esc(p.label) + '</button>' : "";
        }).join("");
        if (hints){
          profileHintEl.innerHTML = "<span>Perfis que combinam com a busca:</span>" + hints;
          profileHintEl.hidden = false;
        }
      }
      if (res.related && res.related.length){
        relatedSub.textContent = "Outros itens do mesmo assunto da sua busca.";
        relatedGridEl.innerHTML = res.related.map(function(item){ return cardHTML(item, true); }).join("");
        relatedBlockEl.hidden = false;
      }
      gridEl.innerHTML = matches.map(function(item){ return cardHTML(item, true); }).join("");
      emptyEl.style.display = matches.length === 0 ? "block" : "none";
    } else if (uiState.profile){
      var profile = PROFILES.filter(function(p){ return p.id === uiState.profile; })[0];
      var pres = profile ? SearchEngine.profile(profile.id) : { items: [], related: [] };
      var pmatches = pres.items;
      titleEl.textContent = profile ? profile.label : "";
      basisEl.textContent = "";
      subEl.textContent = "Itens mais relevantes para esse perfil, do mais ao menos importante — o índice completo continua disponível ao lado.";
      if (pres.related.length){
        relatedSub.textContent = "Outros itens do mesmo assunto que podem interessar a esse perfil.";
        relatedGridEl.innerHTML = pres.related.map(function(item){ return cardHTML(item, true); }).join("");
        relatedBlockEl.hidden = false;
      }
      gridEl.innerHTML = pmatches.map(function(item){ return cardHTML(item, true); }).join("");
      emptyEl.style.display = pmatches.length === 0 ? "block" : "none";
    }
  }  function updateViewMode(){
    syncDock();
    var active = !!(uiState.query || uiState.profile);
    resultsViewEl.hidden = !active;
    allGroupsEl.style.display = active ? "none" : "";
    if (active) renderResults();
  }

  /* ---------- índice: destaca a seção visível ao rolar (scrollspy) ---------- */
  var scrollSpyObserver = null;
  function setupScrollSpy(){
    if (scrollSpyObserver) scrollSpyObserver.disconnect();
    if (!("IntersectionObserver" in window)) return;
    scrollSpyObserver = new IntersectionObserver(function(entries){
      entries.forEach(function(entry){
        if (!entry.isIntersecting) return;
        var link = sidebarEl.querySelector('.side-item[data-target="' + entry.target.id + '"]');
        if (!link) return;
        Array.prototype.forEach.call(sidebarEl.querySelectorAll(".side-item.active"), function(el){ el.classList.remove("active"); });
        link.classList.add("active");
        if (window.matchMedia("(max-width: 820px)").matches) {
          // mobile: o índice é uma faixa horizontal — rola só a faixa, nunca a página
          sidebarEl.scrollTo({ left: link.offsetLeft - (sidebarEl.clientWidth - link.clientWidth) / 2, behavior: "smooth" });
        } else {
          link.scrollIntoView({ block: "nearest" });
        }
      });
    }, { rootMargin: "-45% 0px -50% 0px", threshold: 0 });
    Array.prototype.forEach.call(allGroupsEl.querySelectorAll(".group-block"), function(b){ scrollSpyObserver.observe(b); });
  }

  /* ---------- atalhos por perfil ---------- */
  var profileRowEl = document.getElementById("profileRow");
  function renderProfileRow(){
    profileRowEl.innerHTML = activeProfiles().map(function(p){
      var active = uiState.profile === p.id;
      return '<button type="button" class="profile-pill' + (active ? ' active' : '') + '" data-profile="' + esc(p.id) + '">' +
        '<svg class="icon" aria-hidden="true"><use href="#' + esc(p.icon || "i-users") + '"/></svg>' + esc(p.label) + '</button>';
    }).join("");
  }
  profileRowEl.addEventListener("click", function(e){
    var btn = e.target.closest(".profile-pill");
    if (!btn) return;
    var id = btn.getAttribute("data-profile");
    uiState.profile = uiState.profile === id ? null : id;
    uiState.query = "";
    searchInput.value = "";
    clearBtn.style.display = "none";
    renderProfileRow(); updateViewMode();
    document.getElementById("transparencia").scrollIntoView({ behavior: "smooth", block: "start" });
  });

  document.getElementById("searchForm").addEventListener("submit", function(e){ e.preventDefault(); });
  searchInput.addEventListener("input", function(){
    uiState.query = searchInput.value;
    uiState.profile = null;
    clearBtn.style.display = uiState.query ? "inline-flex" : "none";
    renderProfileRow(); updateViewMode();
  });

  /* ---------- busca fixa: acompanha a rolagem para pesquisar de qualquer ponto da página ---------- */
  var dockEl = document.getElementById("dockSearch");
  var dockInput = document.getElementById("dockInput");
  var dockClear = document.getElementById("dockClear");
  var dockTick = false;
  function updateDock(){
    dockTick = false;
    var nav = document.getElementById("navbar");
    var navH = nav ? nav.offsetHeight : 0;
    document.documentElement.style.setProperty("--nav-h", navH + "px");
    var show = document.getElementById("searchForm").getBoundingClientRect().bottom < navH || document.activeElement === dockInput;
    dockEl.classList.toggle("show", show);
    dockEl.setAttribute("aria-hidden", show ? "false" : "true");
  }
  function syncDock(){
    if (dockInput.value !== searchInput.value) dockInput.value = searchInput.value;
    dockClear.style.display = searchInput.value ? "inline-flex" : "none";
  }
  window.addEventListener("scroll", function(){ if (!dockTick){ dockTick = true; requestAnimationFrame(updateDock); } }, { passive: true });
  window.addEventListener("resize", updateDock);
  dockInput.addEventListener("input", function(){
    var had = !!uiState.query;
    searchInput.value = dockInput.value;
    searchInput.dispatchEvent(new Event("input", { bubbles: true }));
    if (!had && dockInput.value) resultsViewEl.scrollIntoView({ block: "start" });
  });
  dockInput.addEventListener("blur", function(){ setTimeout(updateDock, 0); });
  dockClear.addEventListener("click", function(){
    searchInput.value = "";
    searchInput.dispatchEvent(new Event("input", { bubbles: true }));
    dockInput.focus();
  });
  document.addEventListener("keydown", function(e){
    if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
    var tag = (e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select" || e.target.isContentEditable) return;
    e.preventDefault();
    (dockEl.classList.contains("show") ? dockInput : searchInput).focus();
  });

  /* ---------- celular: acessibilidade recolhida num botão e placeholder curto ---------- */
  var a11yToggle = document.getElementById("a11yToggle");
  var a11yTools = document.getElementById("a11yTools");
  if (a11yToggle && a11yTools){
    a11yToggle.addEventListener("click", function(e){
      e.stopPropagation();
      var open = a11yTools.classList.toggle("open");
      a11yToggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    document.addEventListener("click", function(e){
      if (!a11yTools.classList.contains("open") || e.target.closest("#a11yTools")) return;
      a11yTools.classList.remove("open");
      a11yToggle.setAttribute("aria-expanded", "false");
    });
  }
  var phLong = searchInput.getAttribute("placeholder");
  var phShort = searchInput.getAttribute("data-placeholder-curto") || phLong;
  var phMq = window.matchMedia("(max-width: 520px)");
  function applyPlaceholder(){ searchInput.setAttribute("placeholder", phMq.matches ? phShort : phLong); }
  applyPlaceholder();
  if (phMq.addEventListener) phMq.addEventListener("change", applyPlaceholder);
  updateDock();

  /* aprendizado local da busca: o item aberto depois de uma busca sobe nas próximas buscas parecidas */
  function learnClick(e){
    var a = e.target.closest("a.card");
    if (!a || !uiState.query) return;
    var href = a.getAttribute("href");
    SearchEngine.record(uiState.query, allItems.filter(function(i){ return safeHrefRaw(i._href) === href; })[0]);
  }
  function safeHrefRaw(u){ return /^\s*javascript:/i.test(u || "") ? "#" : (u || "#"); }
  profileHintEl.addEventListener("click", function(e){
    var b = e.target.closest("[data-hint]");
    var pill = b && profileRowEl.querySelector('[data-profile="' + b.getAttribute("data-hint") + '"]');
    if (pill) pill.click();
  });
  gridEl.addEventListener("click", learnClick);
  relatedGridEl.addEventListener("click", learnClick);
  clearBtn.addEventListener("click", function(){
    searchInput.value = ""; uiState.query = "";
    clearBtn.style.display = "none";
    updateViewMode(); searchInput.focus();
  });

  /* ---------- menu: parse + render ---------- */
  var MENU = obj(C.menu);
  var CURRENT_MATCH = norm(MENU.itemAtual || "transparen");
  function buildMenuTree(raw){
    raw = Array.isArray(raw) ? raw : [];
    var byId = {};
    raw.forEach(function(m){ byId[m.Id] = m; m._children = []; });
    var roots = [];
    raw.forEach(function(m){
      if (m.NMenu && byId[m.NMenu]) byId[m.NMenu]._children.push(m);
      else if (!m.NMenu) roots.push(m);
    });
    function byOrder(a, b){ return (+a.Ordem || 0) - (+b.Ordem || 0); }
    roots.sort(byOrder);
    roots.forEach(function(r){ r._children.sort(byOrder); });
    return roots;
  }

  function targetAttr(m){ return m.NovaPag === "_blank" ? ' target="_blank" rel="noopener"' : ""; }
  var navListEl = document.getElementById("navList");
  function renderNav(tree){
    navListEl.innerHTML = tree.map(function(item){
      var isCurrent = norm(item.Nome).indexOf(CURRENT_MATCH) !== -1;
      var isHome = norm(item.Nome).indexOf("inicio") !== -1;
      var homeIcon = isHome ? '<svg class="icon" aria-hidden="true"><use href="#i-home"/></svg>' : "";
      var hasChildren = item._children.length > 0;
      var caret = hasChildren ? '<svg class="icon caret" aria-hidden="true"><use href="#i-chevron-down"/></svg>' : "";
      var trigger;
      if (isCurrent){
        trigger = '<a class="nav-link" href="#transparencia">' + esc(item.Nome) + '</a>';
      } else if (hasChildren){
        trigger = '<button type="button" class="nav-btn">' + homeIcon + esc(item.Nome) + caret + '</button>';
      } else {
        trigger = '<a class="nav-link" href="' + safeHref(item.Pagina) + '"' + targetAttr(item) + '>' + homeIcon + esc(item.Nome) + '</a>';
      }
      var dropdown = hasChildren ? '<div class="dropdown">' + item._children.map(function(c){
        return '<a href="' + safeHref(c.Pagina) + '"' + targetAttr(c) + '>' + esc(c.Nome) + '</a>';
      }).join("") + '</div>' : "";
      return '<li class="nav-item' + (hasChildren ? " has-dropdown" : "") + (isCurrent ? " current" : "") + '">' + trigger + dropdown + '</li>';
    }).join("");
  }

  navListEl.addEventListener("click", function(e){
    if (e.target.closest(".nav-link")) document.getElementById("navbar").classList.remove("mobile-open");
    var btn = e.target.closest(".nav-btn");
    if (!btn) return;
    var item = btn.closest(".nav-item");
    var wasOpen = item.classList.contains("open");
    Array.prototype.forEach.call(navListEl.querySelectorAll(".nav-item.open"), function(i){ i.classList.remove("open"); });
    if (!wasOpen) item.classList.add("open");
  });
  document.addEventListener("click", function(e){
    if (!e.target.closest(".nav-item")) {
      Array.prototype.forEach.call(navListEl.querySelectorAll(".nav-item.open"), function(i){ i.classList.remove("open"); });
    }
  });
  document.getElementById("navToggle").addEventListener("click", function(){
    document.getElementById("navbar").classList.toggle("mobile-open");
  });

  document.getElementById("footerYear").textContent = new Date().getFullYear();

  /* ---------- carga dos dados: proxy -> cópia estática (sem PHP) -> arquivo local ---------- */
  var footerSync = document.getElementById("footerSync");
  function updateStatus(){
    if (!dataState.lastSync) { footerSync.textContent = "Sincronizando…"; return; }
    footerSync.textContent = dataState.live
      ? "Sincronizado com a API às " + timeNow() + "."
      : "Exibindo cópia local (última tentativa às " + timeNow() + ").";
  }

  function fetchFirst(urls){
    var i = 0;
    function next(){
      if (i >= urls.length) return Promise.reject(new Error("sem dados"));
      var url = urls[i++];
      return fetch(url, { cache: "no-store" }).then(function(r){
        if (!r.ok) throw new Error("http " + r.status);
        var source = r.headers.get("X-Data-Source");
        return r.json().then(function(data){
          if (!Array.isArray(data)) throw new Error("formato inesperado");
          return { data: data, live: i === 1 && (source === "api" || source === "cache-recente") };
        });
      }).catch(next);
    }
    return next();
  }

  var firstPaint = true;
  function load(){
    Promise.all([
      fetchFirst(TRANSPARENCIA_URLS),
      fetchFirst(MENU_URLS).catch(function(){ return { data: [], live: false }; }),
      ORDEM_AUTO ? fetchFirst(ORDEM_URLS).catch(function(){ return { data: [] }; }) : Promise.resolve({ data: [] })
    ]).then(function(res){
      aplicarOrdemOficial(res[2].data);
      parseTransparencia(res[0].data);
      renderNav(buildMenuTree(res[1].data));
      dataState.live = res[0].live;
    }).catch(function(){
      dataState.live = false;
      if (firstPaint) allGroupsEl.innerHTML = '<p class="content-sub">Não foi possível carregar os dados de transparência agora. Tente novamente em instantes.</p>';
    }).then(function(){
      dataState.lastSync = new Date();
      if (allItems.length || !firstPaint) {
        renderSidebar(); renderProfileRow(); renderAllGroups(); setupScrollSpy(); updateViewMode();
      }
      firstPaint = false;
      updateStatus();
    });
  }
  load();
  setInterval(load, REFRESH_MS);

  /* ---------- barra de acessibilidade ---------- */
  var root = document.documentElement;
  var FONT_STEPS = [0.9, 1, 1.1, 1.2, 1.3];
  var fontIdx = 1;
  var contrastBtn = document.getElementById("a11yContrast");
  try {
    var savedIdx = parseInt(localStorage.getItem("a11yFontIdx"), 10);
    if (!isNaN(savedIdx) && FONT_STEPS[savedIdx]) fontIdx = savedIdx;
    if (localStorage.getItem("a11yContrast") === "1") {
      root.setAttribute("data-contrast", "high");
      contrastBtn.classList.add("active");
      contrastBtn.setAttribute("aria-pressed", "true");
    }
  } catch (e) {}
  function applyFontScale(){
    root.style.fontSize = (FONT_STEPS[fontIdx] * 100) + "%";
    try { localStorage.setItem("a11yFontIdx", fontIdx); } catch (e) {}
  }
  applyFontScale();
  document.getElementById("a11yFontUp").addEventListener("click", function(){
    fontIdx = Math.min(fontIdx + 1, FONT_STEPS.length - 1);
    applyFontScale();
  });
  document.getElementById("a11yFontDown").addEventListener("click", function(){
    fontIdx = Math.max(fontIdx - 1, 0);
    applyFontScale();
  });
  contrastBtn.addEventListener("click", function(){
    var on = root.getAttribute("data-contrast") === "high";
    if (on) { root.removeAttribute("data-contrast"); } else { root.setAttribute("data-contrast", "high"); }
    contrastBtn.classList.toggle("active", !on);
    contrastBtn.setAttribute("aria-pressed", String(!on));
    try { localStorage.setItem("a11yContrast", on ? "0" : "1"); } catch (e) {}
  });
  var readBtn = document.getElementById("a11yReadAloud");
  readBtn.addEventListener("click", function(){
    if (!("speechSynthesis" in window)) return;
    if (window.speechSynthesis.speaking){
      window.speechSynthesis.cancel();
      readBtn.classList.remove("active");
      readBtn.setAttribute("aria-pressed", "false");
      return;
    }
    // lê a seção visível (índice ativo) ou o resultado da busca
    var text;
    if (!resultsViewEl.hidden) {
      var labels = Array.prototype.map.call(gridEl.querySelectorAll(".card-label"), function(el){ return el.textContent; });
      text = titleEl.textContent + ". " + labels.join(", ") + ".";
    } else {
      var activeBtn = sidebarEl.querySelector(".side-item.active") || sidebarEl.querySelector(".side-item");
      var block = activeBtn && document.getElementById(activeBtn.getAttribute("data-target"));
      if (!block) return;
      var h = block.querySelector("h2").textContent;
      var items = Array.prototype.map.call(block.querySelectorAll(".card-label"), function(el){ return el.textContent; });
      text = h + ". " + items.join(", ") + ".";
    }
    var utter = new SpeechSynthesisUtterance(text);
    utter.lang = "pt-BR";
    utter.onend = function(){ readBtn.classList.remove("active"); readBtn.setAttribute("aria-pressed", "false"); };
    readBtn.classList.add("active");
    readBtn.setAttribute("aria-pressed", "true");
    window.speechSynthesis.speak(utter);
  });

  /* ---------- PWA ---------- */
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").catch(function () {});
    });
  }

  /* ---------- voltar ao topo ---------- */
  var topBtn = document.getElementById("topBtn");
  window.addEventListener("scroll", function(){ topBtn.classList.toggle("show", window.scrollY > 700); }, { passive: true });
  topBtn.addEventListener("click", function(){ window.scrollTo({ top: 0, behavior: "smooth" }); });
})();
