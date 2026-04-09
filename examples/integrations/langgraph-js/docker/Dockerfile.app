# Dockerfile for the LangGraph JS Next.js frontend.
# Builds from the monorepo root so pnpm workspaces resolve correctly.
FROM node:22-alpine AS base

FROM base AS deps
RUN apk add --no-cache libc6-compat

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy monorepo package files
COPY package.json pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/
COPY apps/agent/package.json ./apps/agent/
COPY turbo.json ./

# Install dependencies
RUN pnpm install --no-frozen-lockfile

# Build stage
FROM base AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/apps/agent/node_modules ./apps/agent/node_modules

COPY . .

# Next.js 16 uses Turbopack by default; set root so it resolves `next` from monorepo
RUN node -e "\
const fs=require('fs'); const f='apps/web/next.config.ts'; \
let c=fs.readFileSync(f,'utf8'); \
if(!c.includes('turbopack')){c=c.replace('};','  turbopack: { root: \"../..\" },\n};');} \
fs.writeFileSync(f,c);"

ENV NODE_OPTIONS="--max-old-space-size=4096"
RUN pnpm --filter web build

# Production stage
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Copy Next.js build artifacts and dependencies for non-standalone mode
COPY --from=builder /app/apps/web/.next ./apps/web/.next
COPY --from=builder /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=builder /app/apps/web/package.json ./apps/web/

EXPOSE 3000

WORKDIR /app/apps/web
CMD ["npx", "next", "start", "-H", "0.0.0.0"]
