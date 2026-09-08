# Regula RPPS

SaaS multi-tenant de controle de compliance previdenciário (CRP + Pró-Gestão RPPS) e transparência ativa para Regimes Próprios de Previdência Social.

Ver o descritivo funcional completo do produto em `../Descritivo da Ferramenta - Controle e Transparencia RPPS.md`. Este repositório é a implementação real (não low-code) do produto ali descrito.

## Stack

- **Backend**: Node.js + TypeScript + Express + Prisma ORM, banco **MySQL** (conforme infraestrutura de servidor já existente).
- **Frontend**: React + Vite + TypeScript + Tailwind CSS.
- **Autenticação**: JWT próprio (sem dependência de provedor externo), senhas com bcrypt.
- **Testes**: Vitest.

## Por que MySQL muda a arquitetura de multi-tenant

Diferente de um backend em Postgres/Supabase (que usaria Row Level Security nativo), o MySQL não tem RLS. O isolamento entre tenants (cada RPPS) é garantido **na camada de aplicação**, não no banco:

- Toda tabela de dado de negócio tem `tenantId`.
- Todo acesso a dado passa por um **repositório** que recebe o `tenantId` do usuário autenticado e o inclui obrigatoriamente em toda query (`WHERE tenantId = ?`) — nunca uma query "livre" sem esse filtro.
- O middleware de autenticação (`src/middleware/auth.ts`) resolve o `tenantId` a partir do token JWT e o injeta no `req`; os controllers nunca aceitam `tenantId` vindo do corpo da requisição.
- Existe um teste automatizado dedicado (`tests/tenantIsolation.test.ts`) que prova que um usuário do tenant A nunca consegue ler/escrever dados do tenant B, mesmo manipulando o payload da requisição.

Essa é a fronteira de segurança mais crítica do produto (dados previdenciários de servidores públicos de entes diferentes) e deve ser tratada como tal em qualquer PR futuro.

## Estrutura

```
apps/
  api/     # backend Express + Prisma (MySQL)
  web/     # frontend React + Vite
```

## Rodando localmente

### Pré-requisitos
- Node.js 20+
- Um servidor MySQL 8+ acessível. Para desenvolvimento local sem depender do servidor da empresa, use `docker compose up -d` na raiz do repositório (sobe um MySQL em `localhost:3306`, usuário/senha `regula`/`regula`, banco `regula_rpps`).

### Backend

```bash
cd apps/api
cp .env.example .env   # ajuste DATABASE_URL e JWT_SECRET
npm install
npx prisma generate
npx prisma migrate deploy   # aplica a migration em prisma/migrations/
npm run seed                # cria o tenant de demonstração "Prefeitura de Vale Verde" (SEED_DEMO_DATA=true no .env.example)
npm run dev                 # http://localhost:3333
```

### Frontend

```bash
cd apps/web
npm install
npm run dev                 # http://localhost:5173
```

Login de demonstração (após rodar o seed): `admin@valeverde.rpps.gov.br` / `demo1234`.
Login do Super Admin (após rodar o seed): `superadmin@regularpps.com.br` / `superadmin123`.

## Deploy em produção (Docker)

`docker-compose.prod.yml` sobe os 3 serviços (MySQL + API + Web) buildados a partir do próprio
código-fonte, com nginx servindo o frontend e fazendo proxy de `/api/*` pra API — não precisa de
Node instalado no servidor, só Docker.

```bash
cp .env.production.example .env.production
# preencha MYSQL_PASSWORD, MYSQL_ROOT_PASSWORD, JWT_SECRET e SUPER_ADMIN_PASSWORD —
# o compose recusa subir sem eles (ver comentários no próprio arquivo)

docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

No primeiro boot, o container da API aplica as migrations do Prisma, projeta o catálogo
normativo (22 critérios do CRP + 24 ações do Pró-Gestão) e cria o Super Admin automaticamente —
tudo idempotente, seguro rodar de novo em todo redeploy/restart. **`SEED_DEMO_DATA` fica `false`
por padrão no `.env.production.example`** — nunca ligue em produção com dado real de cliente, ele
cria um tenant fictício ("Prefeitura de Vale Verde") com CRP/Pró-Gestão preenchidos de exemplo.

Acesse `http://<host>` (ou a porta definida em `WEB_PORT`) e entre com o e-mail/senha do Super
Admin definidos no `.env.production` — primeiro passo depois de logar é cadastrar o primeiro RPPS
real em Admin → RPPS clientes.

## Base de conhecimento normativo

`knowledge-base/crp-criterios.json` (22 critérios do CRP) e `knowledge-base/pro-gestao-acoes.json`
(24 ações do Pró-Gestão RPPS, 13 essenciais) são a **única fonte da verdade** para os requisitos
regulatórios usados pela aplicação — extraídos na íntegra dos manuais oficiais do MPS. Nenhum
requisito é hardcoded em código: o `prisma/seed.ts` lê esses JSONs e projeta o catálogo no banco.
Ver `/docs/modelo-de-dados.md` para o modelo de dados (campo canônico vs. exigência por padrão,
grafo de dependências, nível mínimo por campo) e `/docs/stack-proposta.md` para as decisões de
stack (extração de PDF, IA, armazenamento).

## Módulos implementados

- [x] Autenticação (registro/login com JWT) e modelo de tenants/usuários/memberships (papéis: Super Admin, Admin do RPPS, Servidor, Auditor).
- [x] Isolamento multi-tenant testado automaticamente.
- [x] **Central de Compliance CRP**: os 22 critérios oficiais, status por tenant (regular/irregular/pendente) com edição, cascata de dependência entre critérios (ex.: DIPR-Consistência fica irregular automaticamente se DIPR-Encaminhamento não estiver regular, e o sistema bloqueia marcar o dependente como regular nesse caso), forma de verificação e sistema de origem exibidos por critério.
- [x] **Pró-Gestão RPPS**: as 24 ações / 3 dimensões, com:
  - Motor de preenchimento: formulário dinâmico por nível de aderência (I–IV), cumulativo (nunca esconde campo já preenchido em nível anterior); preenchimento manual ou por upload de PDF com extração assistida por IA (Claude via Anthropic API — funciona também sem chave configurada, em modo apenas-extração-de-texto), aprovação campo a campo citando a página/trecho de origem no PDF.
  - Motor de dependências entre documentos: detecta quando os documentos-fonte de uma ação composta (ex.: Transparência, que cita Relatório de Governança Corporativa, Código de Ética, Planejamento, Política de Investimentos e Estrutura de Controle Interno) estão prontos, gera rascunho citando a fonte de cada dado, exige aprovação humana explícita e marca o documento como desatualizado se uma fonte for alterada depois de aprovado.
  - Painel com progresso por dimensão e quantas ações faltam para cada nível de certificação.
  - Trilha de auditoria: todo valor de campo é versionado (nunca sobrescrito), registrando quem, quando e a origem (manual, extraído de PDF ou gerado por IA a partir de outro documento).
- [x] **Portal de Transparência público** (`/transparencia/:slug`, sem login): gerado a partir do documento composto aprovado da ação Transparência — nunca de PDF anexado.
- [x] Calendário de obrigações (próximos vencimentos do CRP) no painel geral.
- [x] Dashboard com shell de navegação (sidebar) e identidade visual própria (paleta, tipografia) — ver `apps/web/src/index.css`.

## Estado da verificação

Ambiente local validado de ponta a ponta com MySQL real (`docker compose up -d`): login, os três
módulos de compliance, upload de PDF com extração de texto, geração/aprovação de rascunho de
documento composto, cascata de dependência do CRP e publicação/despublicação automática da
página pública de transparência foram todos exercitados via API antes desta entrega. `apps/api`
e `apps/web` typecham limpos e buildam sem erros; a suíte de testes (`npm test`) passa, incluindo
o teste de isolamento entre tenants.

**Não verificado**: a extração de PDF por IA de verdade (sem chave `ANTHROPIC_API_KEY`
configurada neste ambiente, apenas o caminho de fallback foi exercitado) e a navegação manual
pela interface em um navegador real (validação feita via API/build, não visualmente).

## Próximos módulos

Ver `ROADMAP.md` para o que ainda falta (feature gating por plano, integrações federais automáticas, auditor virtual contínuo, painel Super Admin).
