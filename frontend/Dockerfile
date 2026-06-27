# ── BoardyBoo Frontend — Cloud Run Container ─────────────────────────────────
# Multi-stage build: install → build → serve.

# Stage 1 — Install dependencies
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# Stage 2 — Build the Next.js application
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# .env.local provides Firebase config; API/WS URLs are written here at deploy time
RUN npm run build

# Stage 3 — Production image
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Copy only what's needed to run
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Cloud Run sets PORT (default 3000)
ENV PORT=3000
EXPOSE ${PORT}

CMD ["node", "server.js"]
