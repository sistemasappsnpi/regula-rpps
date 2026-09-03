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
npm run seed                # cria o tenant de demonstração "Prefeitura de Vale Verde"
npm run dev                 # http://localhost:3333
```

### Frontend

```bash
cd apps/web
npm install
npm run dev                 # http://localhost:5173
```

Login de demonstração (após rodar o seed): `admin@valeverde.rpps.gov.br` / `demo1234`.

## Módulos implementados nesta primeira entrega

- [x] Autenticação (registro/login com JWT) e modelo de tenants/usuários/memberships (papéis: Super Admin, Admin do RPPS, Servidor, Auditor).
- [x] Isolamento multi-tenant testado automaticamente.
- [x] Módulo **Central de Compliance CRP**: catálogo oficial dos 22 critérios do CRP (seed), status por tenant (regular/irregular/pendente), responsável, próximo vencimento, com API completa e tela de dashboard.
- [x] Dashboard com shell de navegação (sidebar) e identidade visual própria (paleta, tipografia) — ver `apps/web/src/index.css`.

## Estado da verificação nesta entrega

Neste ambiente de desenvolvimento não havia um servidor MySQL disponível para validação ponta a ponta. O que foi verificado antes do push:

- `apps/api`: typecheck limpo (`tsc --noEmit`) e suíte de testes passando (`npm test`), incluindo os testes que provam o isolamento entre tenants (`tests/tenantIsolation.test.ts`, com um Prisma Client falso em memória).
- `apps/web`: typecheck limpo e `vite build` gerando o bundle de produção sem erros.
- **Não verificado**: o fluxo real de login/dashboard contra um MySQL rodando (migration `prisma migrate deploy` + `npm run seed` + navegação no navegador). Antes de considerar este módulo pronto para uso, rode localmente com `docker compose up -d` (ver abaixo) e confirme o fluxo de login manualmente.

## Próximos módulos

Ver `ROADMAP.md` para o que ainda falta (Pró-Gestão RPPS, Portal de Transparência público, Documentos/Evidências, Planos/feature gating, integrações federais).
