# ReviewLens web client: the React app built with Vite, served by nginx.
# nginx also forwards /api/* to the API container, so the browser talks to one
# origin (no CORS) and never sees the LLM key. Build from the repository root:
#   docker build -f client/Dockerfile -t reviewlens-client .

# ---- 1. Build the static app -------------------------------------------------
FROM node:22-bookworm-slim AS build
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# ---- 2. Serve with nginx ---------------------------------------------------
FROM nginx:1.27-alpine
# API container address (service name in docker-compose); override with -e API_UPSTREAM=host:port.
ENV API_UPSTREAM=server:4000
# The official image renders /etc/nginx/templates/*.template with envsubst at start-up.
COPY client/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/client/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=15s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1
