# Modelo de dados — motor de compliance previdenciário

Este documento propõe como representar, de forma neutra e extensível, o conhecimento
extraído para `/knowledge-base/crp-criterios.json` e `/knowledge-base/pro-gestao-acoes.json`,
de modo que a aplicação nunca codifique um requisito regulatório diretamente em lógica de
negócio — toda regra vem desses JSONs (ou de tabelas derivadas deles no banco).

## 1. Separação entre "campo canônico" e "mapeamento de exigência por padrão"

O erro mais fácil de cometer aqui é modelar os campos de um documento (ex.: "quantidade de
membros do Comitê de Investimentos") como se pertencessem ao Pró-Gestão. Eles não pertencem:
o **dado em si** (quantos membros o Comitê de Investimentos tem, hoje, neste RPPS) é um fato
sobre o mundo, independente de qual padrão de certificação está perguntando por ele. O que
varia entre padrões (Pró-Gestão hoje, Avalia/Atricon amanhã) é **quem exige esse dado, em que
nível, com que periodicidade e com que forma de verificação** — isso é o mapeamento de
exigência.

Proposta de duas tabelas (ou coleções) separadas:

```
CampoCanonico
  id                  (ex.: "comite_investimentos.quantidade_membros")
  entidade            (ex.: "ComiteDeInvestimentos")
  tipo_dado           (inteiro | texto | data | documento | booleano | lista | moeda)
  descricao_neutra    ("Número de membros titulares do Comitê de Investimentos")

ExigenciaDeCampo
  id
  campo_canonico_id      -> CampoCanonico
  padrao                 ("pro-gestao-4.1" | "avalia-atricon-x" | "crp")
  acao_ou_criterio_id    (id da ação do Pró-Gestão ou do critério do CRP)
  nivel_minimo           (I | II | III | IV | null — CRP não tem níveis)
  quantidade_minima      (nullable — ex.: 3, 5, "50%")
  periodicidade          (nullable — ex.: "mensal", "anual")
  substitui_exigencia_id (nullable — ver seção 4)
```

Concretamente, o campo canônico `comite_investimentos.quantidade_membros` é referenciado por
**três** linhas de `ExigenciaDeCampo` no padrão `pro-gestao-4.1` (ação `comite-investimentos`):
uma para nível I/II (mínimo 3), uma para nível III (mínimo 5) e uma para nível IV (mínimo 5 +
maioria efetivos). O dado que o usuário preenche — a lista real de membros do comitê — é
armazenado uma única vez, ligado ao campo canônico, não replicado por nível. Quando o RPPS
mudar de padrão de certificação (ou quando o Avalia/Atricon for suportado), basta inserir novas
linhas de `ExigenciaDeCampo` apontando para os mesmos campos canônicos já existentes — nenhuma
tabela de dado muda.

Os dois arquivos JSON já foram estruturados pensando nessa separação: cada `campo` de uma ação
do Pró-Gestão tem um `id` que é o nome do requisito **dentro daquele padrão**, mas o objetivo é
que, na migração para o banco, cada `campo` vire uma `ExigenciaDeCampo` apontando para um
`CampoCanonico` compartilhável. Nesta primeira extração isso ainda não foi feito (os campos
estão nomeados no vocabulário do Pró-Gestão) porque não há ainda um segundo padrão real para
forçar a generalização certa — fazê-lo prematuramente seria adivinhar a forma do Avalia/Atricon
sem tê-lo em mãos. Ver ambiguidade final sobre isso.

## 2. Grafo de dependências entre documentos

Encontramos, na extração, **três tipos distintos** de relação entre documentos/critérios, que
não devem ser todos representados pelo mesmo campo `depende_de`:

1. **Cascata de regularidade** (a irregularidade de B torna A irregular automaticamente).
   Único exemplo textualmente explícito: `dipr-consistencia` depende de `dipr-encaminhamento`
   no CRP. Aqui `depende_de` é apropriado tal como usado no JSON.

2. **Gatilho de aplicabilidade** (B só existe/é exigido se uma condição declarada em A for
   verdadeira). Exemplo: `rpc-aprovacao-convenio-adesao` só é aplicável se o ente declarou, no
   DIPR, servidor com remuneração acima do teto do RGPS. Modelamos isso com um campo separado,
   `aplicavel_apenas_se`, para não confundir com cascata de regularidade — a lógica de avaliação
   é diferente (uma é "se B falha, A falha"; a outra é "se a condição não se aplica, A nem
   existe para este tenant").

3. **Composição documental** (A é redigido citando dados que já existem em B, C, D — o caso
   que o motor de dependências do MVP precisa resolver). Exemplo mais forte e **explícito** no
   texto: a ação `transparencia` do Pró-Gestão lista nominalmente o Relatório de Governança
   Corporativa, o Código de Ética, o Planejamento e a Política de Investimentos como itens a
   publicar. Exemplo mais fraco e **inferido por sobreposição temática** (não citado
   literalmente): `relatorio-governanca-corporativa` reaproveita conteúdo de
   `relatorio-gestao-atuarial` e de `politica-investimentos`.

Proposta de tabela para o grafo (tipo 3, que é o que o motor de composição precisa percorrer):

```
DependenciaDocumental
  id
  documento_composto_id     -> Acao ou CriterioCRP
  documento_fonte_id        -> Acao ou CriterioCRP
  campo_composto_id         (qual campo do composto é preenchido a partir da fonte)
  campo_fonte_id            (qual campo da fonte é a origem do dado)
  tipo_relacao              ("citacao_explicita_no_manual" | "inferida_por_sobreposicao_tematica")
  confianca                 (para as inferidas: permite à IA/ao humano saber que deve confirmar)
```

Guardar `tipo_relacao` é importante: uma dependência "citação explícita" pode disparar geração
automática de rascunho com alta confiança; uma "inferida" deveria, no mínimo, ser exibida ao
usuário como sugestão a confirmar antes de entrar no motor de geração de rascunhos — não deveria
silenciosamente virar uma regra de negócio equivalente às explícitas. O motor percorre esse grafo
para (a) saber quando os documentos-fonte de um composto já estão preenchidos o suficiente para
sugerir o rascunho, e (b) saber quais campos do composto marcar como desatualizados quando uma
fonte for alterada depois da geração — isso é uma consulta simples de "quais
`DependenciaDocumental` têm este `documento_fonte_id`, e destas, quais compostos já têm rascunho
gerado com timestamp anterior à última alteração da fonte".

## 3. Nível mínimo por campo

Já implementado nos JSONs: cada `campo` de uma ação do Pró-Gestão carrega `nivel_minimo` (I a
IV). A regra de exibição da UI decorre diretamente disso — não precisa de tabela adicional:

> Para um nível de aderência N selecionado, exibir todo `campo` cujo `nivel_minimo` seja ≤ N
> (usando a ordem I < II < III < IV), nunca ocultando um campo cujo `nivel_minimo` seja inferior
> ao já alcançado anteriormente pelo tenant.

O CRP não tem níveis (é binário: regular/irregular/pendente por critério), então
`nivel_minimo` simplesmente não se aplica a `crp-criterios.json` — cada critério tem exatamente
um conjunto de campos, sem variação por nível.

## 4. Superação de campo (o caso que não é puramente aditivo)

A maior surpresa da extração: nem todo crescimento de nível é uma soma de novos campos. Em
vários casos, um requisito de nível superior **substitui um número por outro** no mesmo
requisito conceitual — por exemplo, a ação `comite-investimentos` exige "mínimo 3 membros" no
Nível I/II e "mínimo 5 membros" no Nível III/IV: não são dois requisitos independentes, são o
mesmo requisito com um limiar mais alto. Nos JSONs isso foi marcado com um campo `substitui`
apontando para o `id` do campo de nível inferior que ele torna obsoleto.

Isso importa diretamente para o requisito do produto de "nunca esconder dado já preenchido em
nível anterior": quando um RPPS já certificado no Nível I sobe para o Nível III e o Comitê de
Investimentos passa a exigir 5 membros, o dado histórico (quem eram os 3 membros quando a
exigência era essa) **não deve ser apagado nem escondido** — ele continua sendo um fato
histórico verdadeiro sobre o RPPS naquele momento. O que muda é apenas qual `ExigenciaDeCampo`
está ativa "para fins de certificação atual". Proposta: o dado do usuário nunca é sobrescrito,
apenas versionado (nova entrada com timestamp); a UI mostra o valor vigente e, ao lado, um
histórico consultável. A trilha de auditoria (item 5 do segundo prompt do usuário) e este
mecanismo de versionamento são, na prática, a mesma estrutura de dados.

## 5. Resumo de convenções usadas nos JSONs desta entrega

| Campo | Significa |
|---|---|
| `depende_de` (CRP) | Cascata de regularidade — se a fonte é irregular, o dependente também é. |
| `depende_de` (Pró-Gestão) | Composição documental (tipo 3 acima) — pode ser explícita ou inferida; ver `observacoes` de cada ação para saber qual. |
| `aplicavel_apenas_se` | Gatilho de aplicabilidade (tipo 2 acima). |
| `nivel_minimo` | Nível de aderência (I–IV) a partir do qual aquele campo passa a ser exigido. |
| `substitui` | Este campo torna obsoleto (mas não apaga) o campo de nível inferior referenciado. |
| `observacoes` | Sempre que a extração exigiu inferência, presunção ou simplificação — nunca é conteúdo normativo, é nota de proveniência da extração. |

## 6. O que fica para quando o Avalia/Atricon entrar

Propositalmente não foi criada ainda a tabela `CampoCanonico` / `ExigenciaDeCampo` separada no
JSON desta entrega — os JSONs atuais são "mapeamento de exigência" já com nomes no vocabulário
do padrão a que pertencem (Pró-Gestão, CRP). A generalização para campo canônico compartilhável
deve acontecer no momento da migração desses JSONs para o banco (schema Prisma), quando for
possível desenhar a tabela `CampoCanonico` olhando para os dois padrões (CRP e Pró-Gestão) ao
mesmo tempo e escolher nomes de campo que sirvam a ambos — e é exatamente esse desenho de schema
que a Etapa de implementação (stack proposta em `/docs/stack-proposta.md`) deve validar antes de
codar.
