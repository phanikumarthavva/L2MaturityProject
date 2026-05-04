# Monorepo context: repository root (see docker-compose.yml).
FROM node:22-bookworm-slim AS build
WORKDIR /app
ARG VITE_API_URL=
ENV VITE_API_URL=${VITE_API_URL}
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci
COPY frontend ./frontend
RUN npm run build -w frontend

FROM nginx:1.27-alpine AS runner
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- http://127.0.0.1/health || exit 1
