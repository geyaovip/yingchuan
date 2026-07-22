# syntax=docker/dockerfile:1.7

FROM node:22.16.0-alpine AS build
WORKDIR /app
COPY . .
RUN npm ci --prefer-offline --no-audit --no-fund && npm run build

FROM build AS production-dependencies
RUN npm prune --omit=dev

FROM build AS migrate
ENV NODE_ENV=production
RUN chmod 0555 /app/deploy/docker/run-migrations.sh
USER node
CMD ["/app/deploy/docker/run-migrations.sh"]

FROM node:22.16.0-alpine AS api
WORKDIR /app
ENV NODE_ENV=production
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/packages/observability/package.json ./packages/observability/package.json
COPY --from=build /app/packages/observability/dist ./packages/observability/dist
COPY --from=build /app/packages/database/package.json ./packages/database/package.json
COPY --from=build /app/packages/database/dist ./packages/database/dist
COPY --from=build /app/packages/data-lifecycle/package.json ./packages/data-lifecycle/package.json
COPY --from=build /app/packages/data-lifecycle/dist ./packages/data-lifecycle/dist
COPY --from=build /app/packages/runtime-config/package.json ./packages/runtime-config/package.json
COPY --from=build /app/packages/runtime-config/dist ./packages/runtime-config/dist
COPY --from=build /app/packages/shared-types/package.json ./packages/shared-types/package.json
COPY --from=build /app/packages/analysis/package.json ./packages/analysis/package.json
COPY --from=build /app/packages/analysis/dist ./packages/analysis/dist
COPY --from=build /app/packages/model-gateway/package.json ./packages/model-gateway/package.json
COPY --from=build /app/packages/model-gateway/dist ./packages/model-gateway/dist
COPY --from=build /app/packages/notifications/package.json ./packages/notifications/package.json
COPY --from=build /app/packages/notifications/dist ./packages/notifications/dist
COPY --from=build /app/packages/projects/package.json ./packages/projects/package.json
COPY --from=build /app/packages/projects/dist ./packages/projects/dist
COPY --from=build /app/packages/prompts/package.json ./packages/prompts/package.json
COPY --from=build /app/packages/prompts/dist ./packages/prompts/dist
COPY --from=build /app/packages/reports/package.json ./packages/reports/package.json
COPY --from=build /app/packages/reports/dist ./packages/reports/dist
COPY --from=build /app/packages/scoring/package.json ./packages/scoring/package.json
COPY --from=build /app/packages/scoring/dist ./packages/scoring/dist
COPY --from=build /app/packages/shared-types/dist ./packages/shared-types/dist
USER node
CMD ["node", "apps/api/dist/main.js"]

FROM node:22.16.0-alpine AS worker
WORKDIR /app
ENV NODE_ENV=production
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/apps/worker/package.json ./apps/worker/package.json
COPY --from=build /app/apps/worker/dist ./apps/worker/dist
COPY --from=build /app/packages/observability/package.json ./packages/observability/package.json
COPY --from=build /app/packages/observability/dist ./packages/observability/dist
COPY --from=build /app/packages/database/package.json ./packages/database/package.json
COPY --from=build /app/packages/database/dist ./packages/database/dist
COPY --from=build /app/packages/data-lifecycle/package.json ./packages/data-lifecycle/package.json
COPY --from=build /app/packages/data-lifecycle/dist ./packages/data-lifecycle/dist
COPY --from=build /app/packages/outbox/package.json ./packages/outbox/package.json
COPY --from=build /app/packages/outbox/dist ./packages/outbox/dist
COPY --from=build /app/packages/runtime-config/package.json ./packages/runtime-config/package.json
COPY --from=build /app/packages/runtime-config/dist ./packages/runtime-config/dist
COPY --from=build /app/packages/analysis/package.json ./packages/analysis/package.json
COPY --from=build /app/packages/analysis/dist ./packages/analysis/dist
COPY --from=build /app/packages/model-gateway/package.json ./packages/model-gateway/package.json
COPY --from=build /app/packages/model-gateway/dist ./packages/model-gateway/dist
COPY --from=build /app/packages/notifications/package.json ./packages/notifications/package.json
COPY --from=build /app/packages/notifications/dist ./packages/notifications/dist
COPY --from=build /app/packages/projects/package.json ./packages/projects/package.json
COPY --from=build /app/packages/projects/dist ./packages/projects/dist
COPY --from=build /app/packages/reports/package.json ./packages/reports/package.json
COPY --from=build /app/packages/reports/dist ./packages/reports/dist
COPY --from=build /app/packages/scoring/package.json ./packages/scoring/package.json
COPY --from=build /app/packages/scoring/dist ./packages/scoring/dist
USER node
CMD ["node", "apps/worker/dist/main.js"]
