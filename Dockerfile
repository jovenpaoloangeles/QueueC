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

EXPOSE 3001
CMD ["bun", "server/index.js"]
