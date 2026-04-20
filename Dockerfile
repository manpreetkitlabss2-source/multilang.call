# ──────────────────────────────────────────────
# Build Stage
# ──────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy manifests first for layer-cache efficiency
COPY package*.json turbo.json tsconfig.base.json ./
COPY packages/shared/package.json        packages/shared/package.json
COPY packages/server/package.json        packages/server/package.json
COPY packages/ai-pipeline/package.json   packages/ai-pipeline/package.json
COPY packages/client/package.json        packages/client/package.json

RUN npm ci

# Copy source
COPY packages/shared      packages/shared
COPY packages/server      packages/server
COPY packages/ai-pipeline packages/ai-pipeline
COPY packages/client      packages/client

# Build all packages in dependency order via Turborepo
RUN npm run build

# ──────────────────────────────────────────────
# Server Runtime Image
# ──────────────────────────────────────────────
FROM node:20-alpine AS server

WORKDIR /app

COPY --from=builder /app/node_modules                          ./node_modules
COPY --from=builder /app/packages/server/dist                  ./packages/server/dist
COPY --from=builder /app/packages/server/package.json          ./packages/server/package.json
COPY --from=builder /app/packages/server/prisma                ./packages/server/prisma

ENV NODE_ENV=production
EXPOSE 4000

CMD ["node", "packages/server/dist/index.js"]
