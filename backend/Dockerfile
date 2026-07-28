# ── Estágio base ──────────────────────────────────────────────
# Compartilhado entre dev e production para aproveitar cache de layers
FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./

# ── Estágio dev (hot-reload com nodemon) ──────────────────────
# Usado pelo docker-compose.yml local (target: dev)
FROM base AS dev
RUN npm ci
COPY . .
EXPOSE 3001
CMD ["node_modules/.bin/nodemon", "index.js"]

# ── Estágio production (imagem mínima, sem devDependencies) ───
# Usado pelo CI/CD para gerar a imagem publicada no GHCR
FROM base AS production
ENV NODE_ENV=production
# --omit=dev exclui nodemon e outros devDependencies da imagem final
RUN npm ci --omit=dev
COPY . .
EXPOSE 3001
CMD ["node", "index.js"]
