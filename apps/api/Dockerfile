# Build de produção da API (Express + Prisma). Contexto de build = raiz do repositório (não
# apps/api sozinho) porque este é um monorepo com npm workspaces — o package-lock.json e o
# knowledge-base/*.json (fonte da verdade dos critérios do CRP e ações do Pró-Gestão, lidos pelo
# seed em runtime) vivem na raiz. Ver docker-compose.prod.yml para o "build: context: .".

FROM node:20-bookworm-slim AS build
WORKDIR /app

# Sem isso o Prisma não detecta a versão do OpenSSL corretamente e baixa o engine binary
# errado (aviso real visto no build: "Prisma failed to detect the libssl/openssl version").
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# O package-lock.json foi gerado com os dois workspaces (api + web) — precisa dos dois
# package.json presentes pro `npm ci` bater com o lockfile, mesmo que este build só use o da api.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci

COPY apps/api apps/api
COPY knowledge-base knowledge-base

WORKDIR /app/apps/api
RUN npx prisma generate
RUN npm run build

FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/apps/api/dist /app/apps/api/dist
COPY --from=build /app/apps/api/prisma /app/apps/api/prisma
COPY --from=build /app/apps/api/package.json /app/apps/api/package.json
COPY --from=build /app/knowledge-base /app/knowledge-base

WORKDIR /app/apps/api
EXPOSE 3333

# Aplica migrations pendentes e garante o catálogo normativo (CRP/Pró-Gestão) + o Super Admin
# antes de subir — sempre idempotente (upsert), seguro rodar em todo restart do container. Usa
# o seed já compilado (dist/prisma/seed.js), não o .ts via tsx — a imagem final só carrega
# dist/, não src/, e o seed.ts importa de "../src/utils/password" por caminho relativo (só
# resolve contra o dist espelhado, não contra o .ts puro sem o src/ do lado). SEED_DEMO_DATA=true
# (não definida por padrão aqui) também criaria um tenant fictício — nunca ligar em produção real.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/prisma/seed.js && node dist/src/server.js"]
