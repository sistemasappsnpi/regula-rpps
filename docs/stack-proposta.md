# Proposta de stack técnica — módulos de compliance (Pró-Gestão + CRP)

**Este documento é uma proposta para validação. Nenhum código de aplicação foi escrito com
base nele ainda — ver a etapa seguinte no plano combinado.**

## 1. Princípio geral: estender, não recomeçar

O repositório `regula-rpps` já existe e já tem um módulo CRP funcionando de ponta a ponta
(backend Node/Express/Prisma/MySQL multi-tenant, frontend React/Vite/Tailwind, autenticação
JWT própria, isolamento de tenant testado). Os módulos descritos nos dois prompts (motor de
preenchimento, motor de dependências, painel administrativo, portal de transparência, trilha de
auditoria) são módulos **dentro** desse mesmo sistema, não um sistema novo. A proposta abaixo é
deliberadamente conservadora: reaproveitar a stack existente e só introduzir peça nova onde a
atual realmente não cobre a necessidade.

| Camada | Já existe no repo | Proposta |
|---|---|---|
| Backend | Node.js + TypeScript + Express + Prisma (MySQL) | Manter. Novos módulos como novas pastas em `src/modules/` (padrão já usado por `crp/`, `auth/`, `tenants/`). |
| Frontend | React + Vite + TypeScript + Tailwind | Manter. |
| Autenticação/isolamento multi-tenant | JWT próprio + `tenantId` obrigatório em toda query de repositório | Manter — é a fronteira de segurança mais crítica do produto (dados previdenciários), não deve ser tocada por essa entrega. |
| Testes | Vitest | Manter, estendendo para os novos módulos (o teste de isolamento de tenant já existente é o padrão a replicar para qualquer tabela nova). |

## 2. O que é genuinamente novo e precisa de decisão

### 2.1 Base de conhecimento (os dois JSONs) → banco

Os arquivos `/knowledge-base/*.json` são a fonte da verdade normativa, mas a aplicação precisa
consultá-los de forma relacional (join com dados do tenant, filtro por nível, etc.). Proposta:
um script de seed (mesmo padrão de `apps/api/prisma/seed.ts`, que já popula o catálogo de
critérios do CRP a partir de `crp.catalog.ts`) lê os JSONs e popula tabelas Prisma
(`CriterioCRP`, `AcaoProGestao`, `CampoExigencia`, `DependenciaDocumental` — ver
`/docs/modelo-de-dados.md`). **O JSON nunca é editado manualmentente por código de aplicação**:
para atualizar uma regra normativa, edita-se o JSON e roda-se o seed de novo. Isso preserva a
exigência de "nunca codificar requisito direto na lógica da aplicação".

### 2.2 Armazenamento de PDFs enviados pelo usuário

MVP: disco local do servidor (diretório fora do webroot, path indexado no banco por tenant).
Suficiente para o subconjunto inicial e para ambiente de desenvolvimento. Ponto de decisão para
quando sair do MVP: trocar por armazenamento compatível com S3 (MinIO on-prem, já que o cliente
tem infraestrutura própria de servidor conforme mencionado no README, ou S3 real se migrar para
nuvem) — a interface do repositório de arquivos deve ser abstraída desde já (uma classe
`ArmazenamentoDeArquivos` com método `salvar`/`obter`) para que essa troca não exija tocar em
lógica de negócio depois.

### 2.3 Extração de PDF assistida por IA — o ponto que mais precisa de validação do usuário

O pedido é: extrair campos de um PDF já existente, pré-preencher o formulário, e mostrar **de
onde no PDF o valor veio** para cada campo, sempre que possível, com aprovação campo a campo
(nunca um botão único de "aprovar tudo").

Isso decompõe em duas sub-decisões:

**(a) Extração de texto do PDF.** Nesta sessão de extração manual, usei Python (PyMuPDF) porque
o ambiente Windows não tinha `poppler-utils` instalado. Para a aplicação Node.js, a alternativa
nativa ao ecossistema é uma biblioteca de extração de texto em JS/TS (ex.: `pdf-parse` ou
`unpdf`), evitando depender de um binário externo instalado no servidor de produção. Proposta:
usar uma lib Node pura para extrair texto por página, guardando o número de página de origem de
cada trecho.

**(b) Extração estruturada + proveniência.** Duas abordagens possíveis, com trade-offs
diferentes — **esta é a decisão que mais quero validar com você antes de implementar**:

1. **Texto → LLM com citação de página.** Extrai todo o texto do PDF (com marcação de página),
   envia ao modelo (Claude, via Anthropic API) pedindo extração estruturada campo a campo, com
   instrução explícita de citar a página e um trecho literal do texto de onde cada valor veio.
   Mais barato e rápido. Limitação: a "prova visual" mostrada ao usuário é "página X, trecho:
   ..." — não é um destaque visual exato sobre a posição do texto na página renderizada.
2. **Imagem da página → LLM com visão.** Renderiza cada página do PDF como imagem e usa o
   modelo com capacidade de visão para localizar o valor e, potencialmente, retornar uma
   caixa delimitadora aproximada, permitindo destacar visualmente a região na página exibida ao
   usuário. Mais fiel à experiência desejada ("mostrando de onde no PDF o valor veio"), porém
   mais caro (mais tokens por página) e mais lento.

Proposta de MVP: começar pela abordagem (1) — página + trecho citado — por ser suficiente para
o requisito central ("mostrar de onde veio", que não exige necessariamente um destaque
pixel-perfect) e mais barata para o subconjunto pequeno de critérios/ações do MVP. Reavaliar a
abordagem (2) depois de validar com usuários reais se "página + trecho" é suficiente como
evidência ou se o destaque visual é realmente necessário para a confiança no fluxo de aprovação.

**Modelo de IA**: Claude (Anthropic API), usando extração estruturada via tool use / schema
JSON (não geração de texto livre a ser reinterpretada) — isso reduz a chance de a IA "inventar"
valores fora do que está no PDF, e a resposta já vem no formato que o formulário espera.

### 2.4 Geração de rascunho de documento composto (motor de dependências)

Mesmo modelo (Claude via Anthropic API), mas sem extração de PDF: a entrada é o conjunto de
campos já preenchidos dos documentos-fonte (do próprio banco, não de PDF), e a saída é o
rascunho do documento composto com citação explícita de qual documento-fonte originou cada
trecho/campo. Reaproveita a mesma trilha de auditoria e o mesmo modelo de aprovação humana
campo a campo do item 2.3 — do ponto de vista de dados, "campo extraído de PDF" e "campo gerado
a partir de documento-fonte" são o mesmo tipo de registro (`OrigemDoValor`), variando apenas o
tipo de origem (`upload_pdf` vs `documento_fonte_sistema`).

### 2.5 Processamento assíncrono

Chamadas a LLM (extração de PDF, geração de rascunho) levam alguns segundos e não devem
bloquear a requisição HTTP. MVP: endpoint dispara o processamento e o cliente faz polling de
status (sem necessidade de fila/worker dedicado, dado o volume baixo do subconjunto piloto).
Se o volume crescer nas próximas fases (todos os 22 critérios + 24 ações, múltiplos tenants),
reavaliar para uma fila real (BullMQ sobre Redis, por exemplo) — não implementar isso agora
seria over-engineering para o escopo combinado.

## 3. Resumo das decisões que dependem da sua validação

1. Confirmar que a abordagem "texto + citação de página/trecho" (2.3, opção 1) é aceitável para
   o MVP, versus já exigir destaque visual sobre a página renderizada (opção 2, mais cara).
2. Confirmar `Claude via Anthropic API` como modelo de IA para extração e geração de rascunho
   (ou indicar outro provedor, o que mudaria a forma de integração mas não a arquitetura).
3. Confirmar armazenamento em disco local para os PDFs no MVP (aceitável para ambiente de
   desenvolvimento e para o subconjunto piloto).
