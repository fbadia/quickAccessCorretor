# ── Estágio base ──────────────────────────────────────────────
FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./

# ── Estágio dev (Vite dev server com hot-reload) ──────────────
# Usado pelo docker-compose.yml local (target: dev)
FROM base AS dev
RUN npm ci
COPY . .
EXPOSE 5173
# --host 0.0.0.0 expõe o servidor para fora do container
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

# ── Estágio builder (compila o bundle de produção) ────────────
# As variáveis VITE_* são embutidas no bundle pelo Vite durante o build.
# Precisam ser passadas como --build-arg no `docker build`, não em runtime.
FROM base AS builder
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_BACKEND_URL
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
ENV VITE_BACKEND_URL=$VITE_BACKEND_URL
RUN npm ci
COPY . .
RUN npm run build

# ── Estágio production (Nginx serve o bundle estático) ────────
# Imagem final mínima: sem Node.js, apenas Nginx + arquivos HTML/JS/CSS
FROM nginx:alpine AS production
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
