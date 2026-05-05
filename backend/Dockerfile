# Build from monorepo root: `docker build -f backend/Dockerfile .`
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci
COPY backend ./backend
COPY frontend ./frontend
RUN npm run build -w backend && npm prune --omit=dev

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends curl \
  && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/backend/package.json ./backend/
COPY --from=build /app/frontend/package.json ./frontend/
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/backend/dist ./backend/dist
COPY backend/global-bundle.pem ./global-bundle.pem
RUN groupadd -r app && useradd -r -g app app && chown -R app:app /app
USER app
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -fsS http://127.0.0.1:4000/health || exit 1
CMD ["node", "backend/dist/server.js"]
