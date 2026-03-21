FROM node:20-alpine AS builder
WORKDIR /app
COPY apps/web/package*.json ./apps/web/
RUN cd apps/web && npm ci

COPY apps/web ./apps/web
RUN cd apps/web && npm run build

FROM node:20-alpine
WORKDIR /app/apps/web
ENV NODE_ENV=production
COPY --from=builder /app/apps/web/.next ./.next
COPY --from=builder /app/apps/web/public ./public
COPY --from=builder /app/apps/web/package.json ./
COPY --from=builder /app/apps/web/node_modules ./node_modules
COPY --from=builder /app/apps/web/next.config.js ./
EXPOSE 3000
CMD ["npx", "next", "start", "-p", "3000"]
