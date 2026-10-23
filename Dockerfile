# ─────────────────────────────────────────────────────────────
# Backend ICGC — Node 22 Alpine, multi-stage
# El target "development" se usa con BUILD_TARGET=development
# ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS base
WORKDIR /app
# sharp y Prisma necesitan estas libs en Alpine
RUN apk add --no-cache openssl libc6-compat
COPY package*.json ./

# ---------- deps ----------
FROM base AS deps
RUN npm ci

# ---------- development ----------
FROM base AS development
ENV NODE_ENV=development
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
EXPOSE 4000
CMD ["npm", "run", "dev"]

# ---------- build ----------
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npx tsc -p tsconfig.json

# ---------- production ----------
FROM base AS production
ENV NODE_ENV=production
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
# La CLI de Prisma es devDependency: se copia para poder migrar al arrancar
# sin descargarla de internet en cada inicio (en un servidor de 512 MB eso falla)
COPY --from=build /app/node_modules/prisma ./node_modules/prisma
COPY prisma ./prisma
COPY scripts ./scripts

RUN mkdir -p /app/uploads/images /app/uploads/videos /app/uploads/logo \
    && chown -R node:node /app/uploads
USER node
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:4000/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

# Aplica migraciones pendientes y arranca
CMD ["sh", "-c", "node node_modules/prisma/build/index.js migrate deploy && node dist/src/server.js"]
