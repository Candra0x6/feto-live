# ── Feto Backend API — Dockerfile ──────────────
# Multi-stage build for production deployment

# ── Stage 1: Install dependencies ──
FROM node:22-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
RUN npm install tsx --no-save

# ── Stage 2: Production image ──
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001

# Copy node_modules and dependencies
COPY --from=deps /app/node_modules ./node_modules

# Copy app source
COPY src/ ./src/
COPY package.json tsconfig.json ./
COPY prisma/ ./prisma/

# Generate Prisma client
RUN npx prisma generate

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

CMD ["node", "--import", "tsx", "src/index.ts"]
