FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json yarn.lock* package-lock.json* pnpm-lock.yaml* ./

RUN set -ex; \
    if [ -f yarn.lock ]; then yarn install --frozen-lockfile; \
    elif [ -f package-lock.json ]; then npm ci; \
    elif [ -f pnpm-lock.yaml ]; then npm install --frozen-lockfile; \
    else npm install; fi

COPY . .

ARG NEXT_PUBLIC_BASE_API_URL
ARG NEXT_PUBLIC_NETWORK
# Make NEXT_PUBLIC_* available during build time
ENV NEXT_PUBLIC_BASE_API_URL=$NEXT_PUBLIC_BASE_API_URL
ENV NEXT_PUBLIC_NETWORK=$NEXT_PUBLIC_NETWORK
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
# Tắt Turbopack telemetry nếu cần
ENV NEXT_TELEMETRY_DISABLED 1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Bước quan trọng: Copy thư mục public (chứa charting_library của bạn)
COPY --from=builder /app/public ./public

# Copy kết quả build từ chế độ standalone
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3001
ENV PORT 3001

# Ở chế độ standalone, ta chạy file server.js thay vì npm start
CMD ["node", "server.js"]