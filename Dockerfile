# Learning Center · imagem única (API + front-end estático)
# Build:  docker build -t learning-center .
# Run:    docker run -p 3000:3000 -v lc-data:/data learning-center

# ---- 1) dependências e build do front-end
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --no-audit --no-fund
COPY apps ./apps
RUN npm run build

# ---- 2) dependências só de produção
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --omit=dev --workspace @learning-center/api --include-workspace-root --no-audit --no-fund

# ---- 3) runtime
FROM node:22-alpine
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    TZ=America/Sao_Paulo \
    DATABASE_FILE=/data/learning-center.db \
    WEB_DIST=/app/apps/web/dist \
    NODE_NO_WARNINGS=1
RUN apk add --no-cache tzdata && mkdir -p /data && chown node:node /data
WORKDIR /app
COPY --from=deps  --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/apps/api ./apps/api
COPY --from=build --chown=node:node /app/apps/web/dist ./apps/web/dist
USER node
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/api/src/server.js"]
