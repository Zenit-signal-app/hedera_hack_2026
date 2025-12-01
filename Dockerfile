FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json yarn.lock* package-lock.json* pnpm-lock.yaml* ./

RUN set -ex; \
    if [ -f yarn.lock ]; then yarn install --frozen-lockfile; \
    elif [ -f package-lock.json ]; then npm ci; \
    elif [ -f pnpm-lock.yaml ]; then npm install --frozen-lockfile; \
    else npm install; fi

COPY . .

RUN NEXT_TELEMETRY_DISABLED=1 npm run build

FROM node:20-alpine AS runner

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs && \
    mkdir -p /app && \
    chown -R nextjs:nodejs /app

USER nextjs

WORKDIR /app

COPY --from=builder --chown=nextjs:nodejs /app/public ./public

COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json

COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next


ENV PORT 3005

EXPOSE 3005

CMD ["npm", "start"]