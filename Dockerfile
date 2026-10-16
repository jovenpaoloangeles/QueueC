FROM oven/bun:1-alpine AS build-client
WORKDIR /app
COPY client/package.json client/bun.lock ./client/
RUN cd client && bun install --frozen-lockfile
COPY client ./client
RUN cd client && bun run build

FROM oven/bun:1-alpine
WORKDIR /app
COPY server/package.json server/bun.lock ./server/
RUN cd server && bun install --frozen-lockfile --production
COPY server ./server
COPY --from=build-client /app/client/dist ./public
# sample roster; mount a real players.json over /data/players.json in compose
COPY players.example.json ./players.json

ENV NODE_ENV=production
ENV PORT=3001
ENV DB_PATH=/data/queuec.db

# non-root runtime user. uid 1000 = the default first user on most distros, so
# plain host mounts work unchowned; override at runtime with --user if yours
# differs (the app only needs write access to $DB_PATH's directory).
# the base image's `bun` user is uid 1000 = default first user on most distros,
# so plain host mounts work unchowned; override at runtime with --user if yours
# differs (the app only needs write access to $DB_PATH's directory).
RUN mkdir -p /data && chown -R bun:bun /data /app
USER bun

# the API answers when the app is up; a dead server takes the container down with it
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/sessions/active" || exit 1

EXPOSE 3001
CMD ["bun", "server/index.js"]
