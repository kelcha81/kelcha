# Next.js web app — multi-stage build producing a slim standalone runtime.
#
# NEXT_PUBLIC_ENGINE_URL is inlined at BUILD time (it's a client-side var), so
# it must be passed as a build-arg, not just a runtime env:
#   docker build --build-arg NEXT_PUBLIC_ENGINE_URL=https://engine-xxxx.run.app -t web .
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG NEXT_PUBLIC_ENGINE_URL
ENV NEXT_PUBLIC_ENGINE_URL=$NEXT_PUBLIC_ENGINE_URL
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build
# The data pipeline is spawned as a child `node` process at runtime, so Next
# does not trace its deps into the standalone bundle — install them standalone.
RUN cd data-pipeline && npm install --omit=dev --no-audit --no-fund

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001
# Standalone output: server.js + minimal node_modules; static assets copied alongside.
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# Data pipeline (scripts + its node_modules), spawned by /api/symbols/package.
# chown so the non-root user can write its scratch ./data dir at runtime.
COPY --from=builder --chown=nextjs:nodejs /app/data-pipeline ./data-pipeline
USER nextjs
# Cloud Run sets PORT (default 8080); Next's standalone server honours PORT + HOSTNAME.
ENV PORT=8080
ENV HOSTNAME=0.0.0.0
EXPOSE 8080
CMD ["node", "server.js"]
