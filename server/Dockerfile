# ReviewLens API (Express + SQLite). Build from the repository root:
#   docker build -f server/Dockerfile -t reviewlens-server .
# The API listens on 4000 inside the container; in docker-compose it is only
# reachable by the client (nginx) container, never published directly.

# ---- 1. Production dependencies (better-sqlite3 ships prebuilt binaries for glibc) ----
FROM node:22-bookworm-slim AS deps
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ---- 2. Runtime ------------------------------------------------------------
FROM node:22-bookworm-slim
ENV NODE_ENV=production \
    PORT=4000 \
    DATABASE_PATH=/data/reviewlens.db
WORKDIR /app
COPY --from=deps --chown=node:node /app/server/node_modules ./server/node_modules
COPY --chown=node:node server/package.json ./server/
COPY --chown=node:node server/src ./server/src
# The sample CSV is served by GET /api/sample-csv (the server looks for it one level above server/).
COPY --chown=node:node reviews.csv ./
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Exec form: node is PID 1's child under `init: true` and receives SIGTERM for the graceful shutdown.
CMD ["node", "server/src/server.js"]
