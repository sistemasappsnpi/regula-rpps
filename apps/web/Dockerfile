# Build de produção do frontend (React + Vite). Mesmo raciocínio de contexto do apps/api/Dockerfile:
# build a partir da raiz do monorepo, pelo package-lock.json compartilhado dos workspaces.

FROM node:20-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/api/package.json apps/api/package.json
RUN npm ci

COPY apps/web apps/web
WORKDIR /app/apps/web
RUN npm run build

# Servido como arquivo estático via nginx — não precisa de Node em produção pra rodar o
# frontend, só pra montar o build. /api/* é redirecionado pro container da API (ver nginx.conf).
FROM nginx:1.27-alpine
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
