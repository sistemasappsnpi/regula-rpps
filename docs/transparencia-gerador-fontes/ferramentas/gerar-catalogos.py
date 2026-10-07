# Gera os catálogos de sugestões de botões (presets/sugestoes/*.json).
#
#   atricon.json    <- cartilha.pdf, lendo o CORPO dos critérios (não o sumário).
#                      Cada sugestão carrega a fundamentação legal, a classificação
#                      (essencial/obrigatória/recomendada) e o "Aplicável a:" da própria cartilha.
#   progestao.json  <- presets/sugestoes/fontes/mesquitaprev.json (portal da MesquitaPrev, RPPS
#                      preparado para auditoria do Pró-Gestão) + as 18 alíneas do item 3.2.8
#                      em presets/sugestoes/fontes/progestao-3.2.8.json, que dão a base legal.
#
# Rodar:
#   pip install pymupdf
#   python ferramentas/gerar-catalogos.py                  # regera os dois catálogos
#   python ferramentas/gerar-catalogos.py --baixar         # rebaixa a API da MesquitaPrev antes
#   python ferramentas/gerar-catalogos.py --so=atricon     # só um dos catálogos
#
# O manual do Pró-Gestão não é mais lido: o parâmetro de botões é o portal da MesquitaPrev, e a
# fundamentação vem das alíneas congeladas em fontes/progestao-3.2.8.json. Saiu manual novo?
# Confira aquele arquivo à mão — são 18 itens.

import json, os, re, sys, unicodedata, urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEST = os.path.join(RAIZ, "presets", "sugestoes")
FONTES = os.path.join(DEST, "fontes")
API_MESQUITA = ("https://portal.mesquitaprev.rj.gov.br/dadosabertosexportar"
                "?d=transparencia&a=&f=json&itens_por_pagina=1000000")
SETA = "➢"


def norm(s):
    s = unicodedata.normalize("NFD", (s or "").lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", " ", s)).strip()


def sp(s):
    return re.sub(r"\s+", " ", s or "").strip()


def ler_json(caminho):
    with open(caminho, encoding="utf-8-sig") as f:
        return json.load(f)


# ================================================================ cartilha Atricon

def texto_do_pdf(caminho):
    try:
        import fitz  # pymupdf
    except ImportError:
        sys.exit("Falta a biblioteca pymupdf. Rode: pip install pymupdf")
    if not os.path.isfile(caminho):
        sys.exit(f"Não encontrei {caminho}. Coloque o PDF na raiz do projeto.")
    doc = fitz.open(caminho)
    txt = "\n".join(p.get_text("text") for p in doc)
    # tira o rodapé de navegação que a cartilha repete em toda página
    return re.sub(r"\n *Acesso r[áa]pido *\n *Menu de crit[ée]rios *\n *\d{1,3} *\n", "\n", txt)


# Um critério no corpo da cartilha tem sempre esta forma:
#   2.1 Divulga a sua estrutura organizacional e a norma que a institui/altera?
#   ➢ Fundamentação: Art. 8º, § 3º, I, da Lei nº 12.527/2011 – LAI.
#   ➢ Classificação: Obrigatória.
#   ➢ Aplicável a: Executivo, Legislativo, ...
#   ➢ Item de verificação exigido: disponibilidade.
# O texto é justificado, então uma palavra pode vir sozinha numa linha: tudo é normalizado antes.
TITULO = re.compile(r"(?:(?<=\n)|(?<=\.\s))[ \t]*(\d{1,2})\.(\d{1,2})\.?\s+(?=[A-ZÀ-Ú(“\"])")

CAMPOS = (
    ("fundamentacao", r"Fundamenta[çc][ãa]o:"),
    ("classificacao", r"Classifica[çc][ãa]o:"),
    # a cartilha alterna entre "Aplicável a:" e "Aplicável ao:"
    ("aplicavel", r"Aplic[áa]ve(?:l|is)\s+a(?:o|os)?:"),
    ("verificacao", r"Ite(?:m|ns)\s+de\s+verifica[çc][ãa]o[^:]*:"),
)

# seção da cartilha -> a qual matriz ela pertence. As seções 1 a 15 formam a matriz geral;
# de 16 em diante são as "MATRIZ ESPECÍFICA" por tipo de órgão.
MATRIZ_DA_SECAO = {16: "executivo", 17: "executivo", 18: "executivo", 19: "executivo",
                   20: "legislativo", 21: "judiciario", 22: "tribunal-contas",
                   23: "ministerio-publico", 24: "defensoria", 25: "consorcios", 26: "estatais"}

# "Aplicável a: ..." -> tipos de órgão. Mais específico primeiro.
APLICAVEL = [
    (r"estatais\s+dependentes\s+e\s+independentes", ["estatais-dependentes", "estatais-independentes"]),
    (r"estatais\s+dependentes", ["estatais-dependentes"]),
    (r"estatais\s+independentes", ["estatais-independentes"]),
    (r"cons[óo]rcios?", ["consorcios"]),
    (r"tribuna(?:l|is)\s+de\s+contas", ["tribunal-contas"]),
    (r"minist[ée]rio\s+p[úu]blico", ["ministerio-publico"]),
    (r"defensoria", ["defensoria"]),
    (r"judici[áa]rio", ["judiciario"]),
    (r"legislativo", ["legislativo"]),
    (r"executivos?", ["executivo"]),
]


def aplicavel_a(texto):
    t = norm(texto)
    tipos = []
    for pat, slugs in APLICAVEL:
        if re.search(pat, t):
            tipos += [s for s in slugs if s not in tipos]
    esferas = [e for e, pat in (("municipal", "municipa"), ("estadual", "estadua"), ("distrital", "distrit"))
               if re.search(pat, t)]
    return tipos, esferas


def classificacao_de(texto):
    t = norm(texto)
    for prefixo, valor in (("essencial", "essencial"), ("obrigat", "obrigatoria"), ("recomend", "recomendada")):
        if t.startswith(prefixo):
            return valor
    return ""


def criterios_da_cartilha(txt):
    """Fatia o corpo da cartilha pelos títulos dos critérios e lê os campos de cada fatia."""
    # o corpo começa na ÚLTIMA ocorrência do cabeçalho: a primeira está no sumário
    corpo = txt[txt.rindex("ORIENTAÇÕES PRELIMINARES"):]

    # títulos em sequência crescente; o que sai da ordem é referência cruzada, não título
    fatias, atual = [], (0, 0)
    for m in TITULO.finditer(corpo):
        secao, sub = int(m.group(1)), int(m.group(2))
        if not (1 <= secao <= 26 and 1 <= sub <= 40):
            continue
        if (secao, sub) <= atual:                              # repetido ou para trás
            continue
        if secao == atual[0] and sub > atual[1] + 3:           # salto grande dentro da seção
            continue
        if secao > atual[0] + 1:                               # pula uma seção inteira
            continue
        fatias.append((m.end(), f"{secao}.{sub}", secao))
        atual = (secao, sub)

    crits = []
    for n, (ini, codigo, secao) in enumerate(fatias):
        fim = fatias[n + 1][0] if n + 1 < len(fatias) else len(corpo)
        bloco = corpo[ini:fim]
        q = bloco.find("?")
        pergunta = sp(bloco[:q + 1]) if 0 <= q < 700 else sp(bloco[:220])

        # a maioria das linhas de campo começa com ➢, mas a extração do PDF às vezes perde o símbolo
        # (quebra de página/fonte) — por isso ele é opcional, e o campo termina no próximo ➢ ou campo conhecido.
        proximo = "(?:" + SETA + "|" + "|".join(p for _, p in CAMPOS) + r"|\Z)"
        valores = {}
        for nome, pat in CAMPOS:
            m = re.search(r"(?:" + SETA + r"\s*)?" + pat + r"(.*?)(?=" + proximo + r")", bloco, re.S)
            valores[nome] = sp(m.group(1)) if m else ""
        tipos, esferas = aplicavel_a(valores["aplicavel"])
        crits.append({
            "codigo": codigo, "secao": secao, "pergunta": pergunta,
            "fundamentacao": valores["fundamentacao"].strip(" ."),
            "classificacao": classificacao_de(valores["classificacao"]),
            "aplicavelA": tipos, "esferas": esferas,
            # "Item de verificação exigido: disponibilidade, atualidade. Disponibilidade: ..." -> 1ª frase
            "verificacao": valores["verificacao"].split(".")[0].strip(),
            "matriz": MATRIZ_DA_SECAO.get(secao, "geral"),
        })
    return crits


VERBOS = r"^(Divulga|Publica|Possui|Apresenta|Disponibiliza|Identifica|Possibilita a consulta de|Permite|Contém|Inclui|Participa em|Mantém|Realiza|Utiliza|Adota|Informa|Dispõe de|Oferece|Fornece|Assegura|Garante|Há|Existe)\s+"
CORTES = [" contendo", " com indicação", ", com ", " conforme ", " evidenciando", " em ordem sequencial",
          " identificando", " informando", " que ", " com o ", " com a ", " com os ", " com as ", " bem como",
          " além de", " no mínimo", " e/ou ", " tais como", " incluindo", " relativas a", " referentes a", " ou seja"]
ARTIGOS = r"^(a|o|as|os|um|uma|sua|seu|suas|seus|do|da|de|dos|das)\s+"


def rotulo_do_criterio(p):
    s = re.sub(ARTIGOS, "", re.sub(VERBOS, "", p.strip().rstrip("?").strip(), flags=re.I), flags=re.I)
    corte = len(s)
    for c in CORTES:
        i = s.lower().find(c)
        if 12 < i < corte:
            corte = i
    s = s[:corte].strip(" ,;:.")
    if len(s) > 70:
        s = s[:70].rsplit(" ", 1)[0]
    return (s[:1].upper() + s[1:]) if s else p[:60]


# nome da seção da cartilha -> grupo do catálogo de referência (presets/atricon)
ALIAS = {"Informações Institucionais": 2, "Receita": 3, "Despesa": 4, "Convênios e Transferências": 5,
         "Recursos Humanos": 6, "Diárias": 7, "Licitações": 8, "Contratos": 9, "Obras": 10,
         "Planejamento e Prestação de Contas": 11, "Serviço de Informação ao Cidadão": 12,
         "Acessibilidade": 13, "Ouvidoria": 14, "LGPD e Governo Digital": 15, "Renúncias de Receitas": 16,
         "Emendas Parlamentares": 17, "Saúde": 18, "Educação e Assistência Social": 19,
         "Atividades Legislativas": 20}
SECAO_GRUPO = {v: k for k, v in ALIAS.items()}
SECAO_GRUPO.update({1: "Informações Prioritárias", 21: "Atividades do Judiciário",
                    22: "Atividades do Tribunal de Contas", 23: "Atividades do Ministério Público",
                    24: "Atividades da Defensoria", 25: "Atividades dos Consórcios",
                    26: "Atividades das Estatais"})

# critérios que o próprio modelo já entrega (recurso do site), não botão de conteúdo
RECURSOS = {"13.1", "13.2", "13.3", "13.4", "2.8", "2.9", "1.3", "1.4"}
# seção 1 é pré-requisito do portal (ter site, ter portal): não vira botão
SECOES_FORA = {1}

# Nomes que os portais de verdade usam e que a Atricon chama de outro jeito. Sem isso a comparação
# sugere o que já está publicado: o portal tem "Folha de Pagamento", a cartilha pede "Quadro de Pessoal".
APELIDOS = {
    "2.1": ["Organograma", "Estrutura Administrativa"],
    "2.3": ["Diretoria", "Gestores", "Quem é Quem", "Corpo Diretivo"],
    "2.4": ["Contato", "Fale Conosco", "Onde Estamos", "Endereço"],
    "2.6": ["Legislação", "Leis", "Normas", "Portarias", "Atos Oficiais", "Diário Oficial"],
    "2.7": ["FAQ", "Dúvidas Frequentes"],
    "3.1": ["Receitas"],
    "4.1": ["Despesas", "Execução Orçamentária"],
    "4.3": ["Empenhos", "Notas de Empenho"],
    "6.1": ["Folha de Pagamento", "Relação de Servidores", "Quadro Funcional", "Servidores"],
    "6.2": ["Remuneração dos Servidores", "Folha de Pagamento", "Vencimentos", "Salários"],
    "6.3": ["Plano de Cargos e Salários", "Tabela Salarial", "Estrutura Remuneratória"],
    "7.1": ["Diárias e Passagens", "Diárias"],
    "8.1": ["Licitações", "Portal de Licitações", "Compras", "Processos Licitatórios"],
    "8.2": ["Editais"],
    "8.6": ["PCA", "Plano Anual de Contratações"],
    "9.1": ["Contratos", "Contratos Administrativos"],
    "9.2": ["Contratos", "Termos Aditivos"],
    "11.1": ["Prestação de Contas", "Balanço Geral", "PCS", "Contas Anuais"],
    "11.2": ["Relatório de Atividades", "Relatório Anual"],
    "11.3": ["Acórdãos", "Decisões do Tribunal de Contas", "Parecer Prévio"],
    "11.5": ["RGF"],
    "11.6": ["RREO"],
    "11.7": ["Planejamento Estratégico", "Plano de Ação Anual"],
    "11.8": ["PPA"],
    "11.9": ["LDO"],
    "11.10": ["LOA"],
    "11.12": ["Demonstrativos Financeiros e Contábeis", "Balanços", "Balanço Patrimonial"],
    "12.1": ["e-SIC", "SIC", "Serviço de Informação ao Cidadão"],
    "12.3": ["e-SIC", "Pedido de Informação"],
    "13.5": ["Mapa do Site"],
    "14.1": ["Ouvidoria"],
    "14.2": ["Ouvidoria", "Manifestações"],
    "14.3": ["Carta de Serviços"],
    "15.1": ["Encarregado de Dados", "DPO", "LGPD"],
    "15.2": ["Política de Privacidade", "LGPD", "Proteção de Dados"],
    "15.4": ["Dados Abertos", "API", "Dados Abertos e API"],
    "15.6": ["Pesquisa de Satisfação"],
}


def catalogo_atricon(crits, preset):
    """Casa os critérios com os rótulos do catálogo de referência; o resto vira rótulo do próprio texto."""
    por_secao = {}
    for c in crits:
        por_secao.setdefault(c["secao"], []).append(c)

    grupos_preset = {}
    for it in preset:
        if not it.get("Grupo", "").startswith("Regime Próprio"):   # essa parte é do catálogo Pró-Gestão
            grupos_preset.setdefault(it["Grupo"], []).append(it)

    itens, usados = [], set()
    for grupo, lista in grupos_preset.items():
        candidatos = por_secao.get(ALIAS.get(grupo), [])
        if len(candidatos) == len(lista):
            casado = dict(enumerate(candidatos))
        else:                                                      # casamento guloso, sem repetir critério
            pares = sorted(((len(set(norm(it["Descricao"]).split()) & set(norm(c["pergunta"]).split())), i, c)
                            for i, it in enumerate(lista) for c in candidatos), key=lambda x: -x[0])
            casado, tomados = {}, set()
            for n, i, c in pares:
                if n == 0 or i in casado or c["codigo"] in tomados:
                    continue
                casado[i] = c
                tomados.add(c["codigo"])
        for i, it in enumerate(lista):
            c = casado.get(i)
            if not c:
                continue                                           # sem critério não há o que fundamentar
            usados.add(c["codigo"])
            itens.append(item_atricon(grupo, it["Descricao"], c,
                                      it.get("MaisInformacoes") or "", it.get("NomeImagem") or ""))

    for secao, candidatos in sorted(por_secao.items()):
        if secao in SECOES_FORA:
            continue
        grupo = SECAO_GRUPO.get(secao, f"Seção {secao}")
        for c in candidatos:
            if c["codigo"] not in usados:
                itens.append(item_atricon(grupo, rotulo_do_criterio(c["pergunta"]), c, "", ""))

    recursos = [i for i in itens if i["criterio"] in RECURSOS]
    itens = [i for i in itens if i["criterio"] not in RECURSOS]

    def ordem(it):
        m = re.match(r"(\d+)\.(\d+)", it["criterio"] or "")
        return (int(m.group(1)), int(m.group(2))) if m else (99, 99)

    vistos, unicos = set(), []
    for it in sorted(itens, key=ordem):
        k = (norm(it["grupo"]), norm(it["rotulo"]))
        if k in vistos:
            continue
        vistos.add(k)
        unicos.append(it)

    return {"fonte": "Cartilha do Programa Nacional de Transparência Pública (Atricon)",
            "sigla": "Atricon",
            "amparoPadrao": "Levantamento Nacional de Transparência Pública (Atricon)",
            "itens": unicos, "recursos": recursos}


def item_atricon(grupo, rotulo, c, descricao, icone):
    return {"grupo": grupo, "rotulo": rotulo, "descricao": descricao, "icone": icone,
            "criterio": c["codigo"], "exigencia": c["pergunta"],
            "fundamentacao": c["fundamentacao"], "classificacao": c["classificacao"],
            "aplicavelA": c["aplicavelA"], "esferas": c["esferas"], "matriz": c["matriz"],
            "verificacao": c["verificacao"], "apelidos": APELIDOS.get(c["codigo"], [])}


# ================================================================ Pró-Gestão (portal de referência)

# a MesquitaPrev usa Font Awesome / Bootstrap Icons; o modelo tem o seu próprio conjunto i-*
ICONES = {
    "fa fa-file-text": "i-document", "fa fa-file-text-o": "i-document", "fa fa-newspaper-o": "i-document",
    "bi-file-earmark-text": "i-document", "fa fa-book": "i-book", "bi-journal-richtext": "i-book",
    "fa fa-shield": "i-shield", "fa fa-lock": "i-lock", "fa fa-university": "i-landmark",
    "fa fa-building": "i-landmark", "fa fa-gavel": "i-scale", "fa fa-balance-scale": "i-scale",
    "fa fa-line-chart": "i-chart", "fa fa-area-chart": "i-chart", "fa fa-bar-chart": "i-chart",
    "fa fa-pie-chart": "i-chart", "fa fa-calculator": "i-chart", "bi-graph-up-arrow": "i-chart",
    "fa fa-sitemap": "i-sitemap", "fa fa-certificate": "i-award", "fa fa-id-card": "i-award",
    "fa fa-tasks": "i-doc-check", "bi-file-earmark-check": "i-doc-check", "bi-check-circle": "i-doc-check",
    "fa fa-exchange": "i-link2", "fa fa-money": "i-coins", "bi-cash-stack": "i-coins",
    "fa fa-calendar": "i-calendar", "fa fa-calendar-alt": "i-calendar", "fa fa-calendar-check-o": "i-calendar",
    "fa fa-video-camera": "i-megaphone", "fa fa-database": "i-database", "fa fa-question-circle": "i-question",
    "fa fa-users": "i-users", "bi-people-fill": "i-users", "fa fa-comments": "i-message",
    "fa fa-info-circle": "i-info", "fa fa-briefcase": "i-briefcase", "fa fa-plane": "i-plane",
}

# rótulo do portal de referência -> alínea do item 3.2.8 que ele cumpre. Curado à mão: é o que
# transforma "a MesquitaPrev tem esse botão" em "o Pró-Gestão exige esse documento".
ALINEA_DE = {
    "regimento interno dos orgaos colegiados": "a", "regimento interno": "a", "atas": "a",
    "orgaos colegiados": "a",
    "certidoes": "b", "cnd federal": "b", "crf": "b",
    "crp": "c", "crp cadprev": "c", "comprev": "c",
    "relatorio de governanca": "d",
    "cronograma de acoes de educacao previdenciaria": "e",
    "calendario de reunioes": "f",
    "codigo de etica": "g",
    "demonstrativos financeiros e contabeis": "h", "demonstracoes financeiras e contabeis": "h",
    "avaliacao atuarial": "i",
    "relatorio de licitacoes e contratos": "j", "portal de licitacoes": "j", "contratos": "j",
    "plano de acao anual": "l",
    "politica de investimentos": "m",
    "relatorio de controle interno": "n",
    "entidades de investimentos credenciadas": "o",
    "relatorio mensais e anuais de investimentos": "p", "relatorio de investimentos": "p",
    "dair cadprev": "p", "autorizacao de aplicacao e resgate apr": "p",
    "acordaos tce": "q",
    "relatorios do rpc": "r",
}

# alíneas que o portal de referência não cobre: entram no catálogo pelo texto do manual,
# porque são publicação obrigatória de todo jeito
ROTULO_DA_ALINEA = {
    "k": ("Governança Corporativa", "Avaliação do Passivo Judicial", "i-scale"),
}


def limpar_link(url):
    """O exportador da MesquitaPrev repete o domínio no começo de vários links."""
    url = sp(url)
    m = re.search(r"https?://.*?(https?://.*)$", url)
    return m.group(1) if m else url


def baixar_referencia():
    print(f"baixando {API_MESQUITA}")
    with urllib.request.urlopen(API_MESQUITA, timeout=90) as r:
        dados = json.loads(r.read().decode("utf-8-sig"))
    if not isinstance(dados, list) or not dados:
        sys.exit("a API da MesquitaPrev não devolveu uma lista de itens")
    os.makedirs(FONTES, exist_ok=True)
    with open(os.path.join(FONTES, "mesquitaprev.json"), "w", encoding="utf-8") as f:
        json.dump(dados, f, ensure_ascii=False, indent=1)
    print(f"  {len(dados)} itens salvos em presets/sugestoes/fontes/mesquitaprev.json")
    return dados


def catalogo_progestao(referencia, alineas):
    texto_da_alinea = {a["letra"]: a["exigencia"] for a in alineas["alineas"]}

    # Junta o que é o mesmo botão em duas categorias (mesmo rótulo e mesmo link) e mantém separados
    # os que só têm o nome igual ("Atas" do Conselho Fiscal e do Comitê são botões diferentes).
    itens, por_chave = [], {}
    for it in referencia:
        rotulo, grupo = sp(it.get("Descricao")), sp(it.get("Grupo"))
        if not rotulo or not grupo:
            continue
        link = limpar_link(it.get("Link"))
        chave = (norm(rotulo), link)
        if chave in por_chave:
            anterior = por_chave[chave]
            if grupo not in anterior["tambemEm"] and grupo != anterior["grupo"]:
                anterior["tambemEm"].append(grupo)
            continue
        letra = ALINEA_DE.get(norm(rotulo), "")
        novo = {
            "grupo": grupo, "rotulo": rotulo,
            "descricao": sp(it.get("MaisInformacoes")),
            "icone": ICONES.get(sp(it.get("NomeImagem")), ""),
            "criterio": f"3.2.8 ({letra})" if letra else "",
            "exigencia": texto_da_alinea.get(letra, "") if letra else
                         "Publicado pelo portal de referência (boa prática observada, sem exigência expressa no item 3.2.8).",
            "fundamentacao": alineas["amparo"] if letra else "",
            "classificacao": "obrigatoria" if letra else "recomendada",
            "aplicavelA": ["rpps"], "esferas": [], "matriz": "rpps",
            "verificacao": "", "apelidos": [],
            "exemplo": link, "tambemEm": [],
        }
        por_chave[chave] = novo
        itens.append(novo)

    # alíneas obrigatórias que a referência não cobre
    cobertas = {i["criterio"][-2] for i in itens if i["criterio"]}
    for letra, (grupo, rotulo, icone) in ROTULO_DA_ALINEA.items():
        if letra in cobertas:
            continue
        itens.append({"grupo": grupo, "rotulo": rotulo, "descricao": "", "icone": icone,
                      "criterio": f"3.2.8 ({letra})", "exigencia": texto_da_alinea.get(letra, ""),
                      "fundamentacao": alineas["amparo"], "classificacao": "obrigatoria",
                      "aplicavelA": ["rpps"], "esferas": [], "matriz": "rpps",
                      "verificacao": "", "apelidos": [], "exemplo": "", "tambemEm": []})

    # o painel mostra um cabeçalho de categoria só quando o grupo muda de uma sugestão pra outra,
    # então a lista precisa vir agrupada; dentro de cada grupo, obrigatórias primeiro
    itens.sort(key=lambda i: (norm(i["grupo"]), i["classificacao"] != "obrigatoria", i["criterio"] or "zz"))
    faltando = sorted(set(texto_da_alinea) - {i["criterio"][-2] for i in itens if i["criterio"]})
    return {"fonte": "Portal da MesquitaPrev (RPPS preparado para auditoria do Pró-Gestão)",
            "sigla": "Pró-Gestão",
            "amparoPadrao": alineas["amparo"],
            "referencia": {"nome": "MesquitaPrev", "portal": "https://mesquitaprev.rj.gov.br/transparencia/",
                           "api": API_MESQUITA},
            "itens": itens, "recursos": []}, faltando


# ================================================================

def main():
    args = sys.argv[1:]
    so = next((a.split("=", 1)[1] for a in args if a.startswith("--so=")), "")
    os.makedirs(DEST, exist_ok=True)
    saida = {}

    if so in ("", "atricon"):
        preset = ler_json(os.path.join(RAIZ, "presets", "atricon", "transparencia.local.json"))
        crits = criterios_da_cartilha(texto_do_pdf(os.path.join(RAIZ, "cartilha.pdf")))
        faltam = [c["codigo"] for c in crits if not c["classificacao"] or not c["aplicavelA"]]
        print(f"cartilha: {len(crits)} critérios lidos" + (f"; sem classificação/aplicabilidade: {faltam}" if faltam else ""))
        saida["atricon"] = catalogo_atricon(crits, preset)

    if so in ("", "progestao"):
        caminho = os.path.join(FONTES, "mesquitaprev.json")
        if "--baixar" in args or not os.path.isfile(caminho):
            referencia = baixar_referencia()
        else:
            referencia = ler_json(caminho)
            print(f"referência: {len(referencia)} itens de fontes/mesquitaprev.json (use --baixar para atualizar)")
        cat, faltando = ler_json(os.path.join(FONTES, "progestao-3.2.8.json")), None
        saida["progestao"], faltando = catalogo_progestao(referencia, cat)
        if faltando:
            print(f"  [!] alíneas do 3.2.8 sem cobertura: {faltando} — acrescente em ROTULO_DA_ALINEA")

    for nome, dados in saida.items():
        with open(os.path.join(DEST, nome + ".json"), "w", encoding="utf-8") as f:
            json.dump(dados, f, ensure_ascii=False, indent=1)
        obrig = sum(1 for i in dados["itens"] if i["classificacao"] in ("essencial", "obrigatoria"))
        print(f"{nome}: {len(dados['itens'])} sugestões ({obrig} essenciais/obrigatórias)"
              f" -> presets/sugestoes/{nome}.json")


if __name__ == "__main__":
    main()
